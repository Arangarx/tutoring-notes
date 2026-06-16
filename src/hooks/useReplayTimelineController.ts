"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";
import { parseEventLogBySchema } from "@/lib/whiteboard/replay-parse";
import { globalMsToSegmentLocal } from "@/lib/whiteboard/replay-audio-timeline";
import { attachWebmDurationFix } from "@/lib/audio/webm-duration-fix";
import { createThrottledPlayLoop } from "@/lib/whiteboard/scene-paint";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import { preloadReplayRestoreElements } from "@/lib/whiteboard/replay-restore-elements";
import {
  buildAudioTimelineFromSegments,
  collectReplayAssetUrls,
  computeNoAudioMaxMs,
  computeReplayTotalMs,
  computeScrubberMax,
  credentialsForReplayFetch,
  readReplayJsonError,
  resolveEffectiveSegments,
  type ReplayAudioSegment,
  type ReplayLoadState,
  type ReplayTimelineControllerInput,
} from "@/lib/whiteboard/replay-helpers";

export type ReplayTimelineState = {
  globalMs: number;
  totalMs: number;
  playing: boolean;
  activeSegmentIndex: number;
  loadState: ReplayLoadState["kind"];
  paintReady: boolean;
};

export type UseReplayTimelineControllerOptions = ReplayTimelineControllerInput & {
  /** Ref populated by ReplayCanvasSurface / WhiteboardReplay scene painter. */
  applySceneAtRef: React.MutableRefObject<(timeMs: number) => void>;
};

export function useReplayTimelineController(
  options: UseReplayTimelineControllerOptions
) {
  const {
    eventsBlobUrl,
    audioSegments,
    audioBlobUrl,
    audioMimeType,
    whiteboardSessionId,
    applySceneAtRef,
  } = options;

  const effectiveSegments = useMemo(
    () =>
      resolveEffectiveSegments({
        eventsBlobUrl,
        audioSegments,
        audioBlobUrl,
        audioMimeType,
      }),
    [eventsBlobUrl, audioSegments, audioBlobUrl, audioMimeType]
  );

  const hasAudio = effectiveSegments.length > 0;
  const audioTimeline = useMemo(
    () => buildAudioTimelineFromSegments(effectiveSegments),
    [effectiveSegments]
  );

  const resolveAssetUrl = useMemo(
    () =>
      whiteboardSessionId
        ? (raw: string) =>
            resolveWhiteboardAssetReadUrl(raw, {
              kind: "tutor",
              whiteboardSessionId,
            })
        : undefined,
    [whiteboardSessionId]
  );

  const [loadState, setLoadState] = useState<ReplayLoadState>({ kind: "loading" });
  const [globalMs, setGlobalMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [paintReady, setPaintReady] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [resolvedMaxMs, setResolvedMaxMs] = useState(audioTimeline.totalMs);
  const [replayExcaliRestoreReady, setReplayExcaliRestoreReady] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelWebmFixRef = useRef<(() => void) | null>(null);
  const activeSegmentIndexRef = useRef(0);
  const isAtEndRef = useRef(false);
  const globalMsRef = useRef(0);
  const globalSegmentOffsetMsRef = useRef(0);
  const segmentSwappingRef = useRef(false);
  const scrubWasPlayingRef = useRef(false);
  const scrubberMaxRef = useRef(1);
  /**
   * Single-source-of-truth play guard.
   *
   * Set to `true` immediately before `el.play()` is called; cleared in the
   * resolved/rejected promise handler.  While true, the `onPause` DOM-event
   * handler skips its `setPlaying(false)` + `loop.pause()` side-effects — the
   * element is transitioning from "scrub-paused" to "resumed-playing" and any
   * `pause` event that arrives during this window is stale (fired by the
   * scrub-pause, not by a new user action).  Without this guard the two code
   * paths fight each other, producing the AbortError and resetting currentTime.
   */
  const pendingPlayRef = useRef(false);
  const playLoopRef = useRef<ReturnType<typeof createThrottledPlayLoop> | null>(
    null
  );
  /**
   * Re-entrancy guard for the audio play-loop's `apply` callback.
   *
   * Root cause of FIX 1 (Maximum call stack size exceeded):
   *   apply(ms >= cap)
   *     → el.pause()              — fires "pause" event synchronously in Chrome
   *     → onPause()               — event listener
   *     → loop.pause()            — trailing applyOnce(force=true)
   *     → apply(ms)               — back into apply! → infinite recursion
   *
   * Additionally, apply itself calls loop.pause() directly, creating a second
   * cycle:  apply → loop.pause() → applyOnce(force=true) → apply → …
   *
   * The guard breaks BOTH cycles: if apply is already on the call stack, the
   * re-entrant call returns immediately.
   */
  const isApplyingRef = useRef(false);
  const synthAnimFrameRef = useRef(0);
  const synthStartElapsedMsRef = useRef(0);

  const log = loadState.kind === "ready" ? loadState.log : null;

  const totalMs = useMemo(
    () =>
      computeReplayTotalMs({
        log,
        hasAudio,
        measuredAudioTotalMs: resolvedMaxMs,
        storedAudioTotalMs: audioTimeline.totalMs,
      }),
    [log, hasAudio, resolvedMaxMs, audioTimeline.totalMs]
  );

  const noAudioMaxMs = log ? computeNoAudioMaxMs(log) : 1;
  const scrubberMax = computeScrubberMax({
    hasAudio,
    totalMs,
    log,
    noAudioMaxMs,
  });
  scrubberMaxRef.current = scrubberMax;
  globalMsRef.current = globalMs;
  // Ref-tracked so seek() reads the current measured duration without a
  // stale closure (avoids adding resolvedMaxMs to seek's dep array).
  const resolvedMaxMsRef = useRef(resolvedMaxMs);
  resolvedMaxMsRef.current = resolvedMaxMs;

  const activeSegment =
    effectiveSegments[activeSegmentIndex] ?? effectiveSegments[0] ?? null;
  const replayAudioMime = useMemo(
    () => activeSegment?.mimeType?.split(";")[0].trim().toLowerCase(),
    [activeSegment?.mimeType]
  );

  // Fetch + parse events
  useEffect(() => {
    let cancelled = false;
    setLoadState({ kind: "loading" });
    setGlobalMs(0);
    globalMsRef.current = 0;
    setPaintReady(false);
    isAtEndRef.current = false;
    globalSegmentOffsetMsRef.current = 0;
    (async () => {
      try {
        const res = await fetch(eventsBlobUrl, {
          credentials: credentialsForReplayFetch(eventsBlobUrl),
        });
        if (!res.ok) {
          const friendly = await readReplayJsonError(res);
          throw new Error(
            friendly ??
              `Could not load whiteboard events (status ${res.status}).`
          );
        }
        const text = await res.text();
        let raw: { schemaVersion?: unknown };
        try {
          raw = JSON.parse(text) as { schemaVersion?: unknown };
        } catch {
          throw new Error(
            "The recording file isn't a valid whiteboard event log. " +
              "It may have been deleted, or the storage backend is " +
              "misconfigured."
          );
        }
        if (typeof raw.schemaVersion !== "number") {
          throw new Error("Whiteboard events file is missing schemaVersion.");
        }
        const parsedLog = parseEventLogBySchema(raw);
        if (cancelled) return;
        setLoadState({ kind: "ready", log: parsedLog });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          kind: "error",
          message: (err as Error)?.message ?? "Could not load events.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventsBlobUrl]);

  // Pre-warm assets
  useEffect(() => {
    if (loadState.kind !== "ready") return;
    const rawUrls = collectReplayAssetUrls(loadState.log);
    if (rawUrls.length === 0) return;
    const urls = resolveAssetUrl ? rawUrls.map(resolveAssetUrl) : rawUrls;
    const cleanups: Array<() => void> = [];
    for (const url of urls) {
      const img = new window.Image();
      img.decoding = "async";
      img.src = url;
      img.onload = img.onerror = () => undefined;
      cleanups.push(() => {
        img.onload = null;
        img.onerror = null;
      });
    }
    return () => cleanups.forEach((c) => c());
  }, [loadState, resolveAssetUrl]);

  // Preload restoreElements
  useEffect(() => {
    if (loadState.kind !== "ready") {
      setReplayExcaliRestoreReady(false);
      return undefined;
    }
    const needsExcalCanvas =
      loadState.log.events.length > 0 || hasAudio;
    if (!needsExcalCanvas) {
      setReplayExcaliRestoreReady(false);
      return undefined;
    }
    let cancelled = false;
    void preloadReplayRestoreElements().then(() => {
      if (!cancelled) setReplayExcaliRestoreReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAudio, loadState]);

  const audioSrcMatches = useCallback(
    (el: HTMLAudioElement, url: string) => {
      if (!url) return false;
      if (el.getAttribute("src") === url) return true;
      try {
        const resolved = new URL(url, window.location.href).href;
        return el.src === resolved || el.src.endsWith(url);
      } catch {
        return el.src === url;
      }
    },
    []
  );

  /** Wrap el.play() with AbortError handling. All play calls go through here. */
  const startPlay = useCallback(
    (el: HTMLAudioElement, reason: string) => {
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} pre_play currentTime=${el.currentTime} reason=${reason}`
      );
      pendingPlayRef.current = true;
      const promise = el.play();
      if (promise !== undefined) {
        promise.then(() => {
          pendingPlayRef.current = false;
        }).catch((err: unknown) => {
          pendingPlayRef.current = false;
          if (err instanceof DOMException && err.name === "AbortError") {
            console.warn(
              `[avx] wbsid=${whiteboardSessionId ?? "?"} play_aborted reason=AbortError currentTime=${el.currentTime}`
            );
          } else {
            console.error(
              `[avx] wbsid=${whiteboardSessionId ?? "?"} play_error reason=${String(err)}`
            );
          }
        });
      }
    },
    [whiteboardSessionId]
  );

  const loadSegmentAt = useCallback(
    (segmentIndex: number, localMs: number, autoplay: boolean) => {
      const el = audioRef.current;
      const seg = effectiveSegments[segmentIndex];
      if (!el || !seg) return;

      const needsSrcSwap =
        activeSegmentIndexRef.current !== segmentIndex ||
        !audioSrcMatches(el, seg.url);

      activeSegmentIndexRef.current = segmentIndex;
      setActiveSegmentIndex(segmentIndex);

      const seekSec = Math.max(0, localMs / 1000);
      const applySeek = () => {
        // Cancel any pending WebM duration-fix reset so a durationchange
        // firing after this seek cannot clobber the intended position.
        cancelWebmFixRef.current?.();
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} seek_set_currentTime target=${seekSec} before=${el.currentTime}`
        );
        try {
          el.currentTime = seekSec;
        } catch {
          // Setter threw (readyState < HAVE_METADATA). Register a one-shot
          // canplay/loadedmetadata listener to re-apply the position for
          // BOTH autoplay=false (paused scrub) and autoplay=true.
          // The old code only registered a retry for autoplay=true, so a
          // paused scrub whose setter threw silently lost the position —
          // the audio-led rAF loop would then lock globalMs to 0.
          const onReady = () => {
            el.removeEventListener("canplay", onReady);
            el.removeEventListener("loadedmetadata", onReady);
            cancelWebmFixRef.current?.();
            try { el.currentTime = seekSec; } catch { /* best-effort */ }
            if (autoplay) startPlay(el, "applySeek_retry");
          };
          el.addEventListener("canplay", onReady);
          el.addEventListener("loadedmetadata", onReady);
          return;
        }
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} seek_after_currentTime value=${el.currentTime}`
        );
        playLoopRef.current?.seek();
        if (autoplay) startPlay(el, "applySeek");
      };

      if (needsSrcSwap) {
        segmentSwappingRef.current = true;
        setAudioReady(false);
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_src_set url=${seg.url}`
        );
        el.src = seg.url;
        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta);
          segmentSwappingRef.current = false;
          applySeek();
        };
        el.addEventListener("loadedmetadata", onMeta);
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_load reason=needsSrcSwap`
        );
        el.load();
      } else {
        applySeek();
      }
    },
    [audioSrcMatches, effectiveSegments, startPlay, whiteboardSessionId]
  );

  const seek = useCallback(
    (
      targetMs: number,
      opts?: { play?: boolean; paint?: boolean }
    ) => {
      const clamped = Math.max(0, Math.min(targetMs, totalMs));
      isAtEndRef.current = false;
      const autoplay = opts?.play ?? false;
      const shouldPaint = opts?.paint ?? false;

      globalMsRef.current = clamped;
      setGlobalMs(clamped);

      if (hasAudio) {
        const measured = resolvedMaxMsRef.current;
        const el = audioRef.current;
        // Secondary fallback: if resolvedMaxMs is still 0 but the audio element
        // already reports a finite duration (Chrome resolved it via progressive
        // buffering before onDurationResolved fired), use el.duration directly
        // and eagerly update resolvedMaxMs for the play-loop and future seeks.
        const elDurationMs =
          measured === 0 && el && Number.isFinite(el.duration) && el.duration > 0
            ? Math.round(el.duration * 1000)
            : 0;
        if (elDurationMs > 0) {
          setResolvedMaxMs((prev) => Math.max(prev, elDurationMs));
        }
        const effectiveMeasured = measured > 0 ? measured : elDurationMs;
        const { segmentIndex, localMs } = globalMsToSegmentLocal(
          clamped,
          audioTimeline,
          effectiveMeasured > 0 ? effectiveMeasured : undefined
        );
        // Log when both stored and measured durations are 0 so the passthrough
        // path in globalMsToSegmentLocal is visible in prod logs for diagnosis.
        if (effectiveMeasured === 0 && audioTimeline.totalMs === 0) {
          console.log(
            `[avx] wbsid=${whiteboardSessionId ?? "?"} seek_map_fallback elDuration=${el?.duration ?? "n/a"}`
          );
        }
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} seek_map globalMs=${clamped} storedTotal=${audioTimeline.totalMs} measuredTotal=${measured} -> segIdx=${segmentIndex} localMs=${localMs}`
        );
        globalSegmentOffsetMsRef.current = clamped - localMs;
        setPlaying(autoplay);
        applySceneAtRef.current(clamped);
        if (shouldPaint) setPaintReady(true);
        loadSegmentAt(segmentIndex, localMs, autoplay);
      } else {
        setPlaying(autoplay);
        applySceneAtRef.current(clamped);
        if (shouldPaint) setPaintReady(true);
        if (autoplay) {
          startSynthFromRef.current(clamped);
        } else if (synthAnimFrameRef.current !== 0) {
          cancelAnimationFrame(synthAnimFrameRef.current);
          synthAnimFrameRef.current = 0;
          synthStartElapsedMsRef.current = clamped;
        }
      }
    },
    [applySceneAtRef, audioTimeline, hasAudio, loadSegmentAt, totalMs, whiteboardSessionId]
  );

  const startSynthFromRef = useRef<(startMs: number) => void>(() => {});

  const startSynthFrom = useCallback(
    (startMs: number) => {
      if (synthAnimFrameRef.current !== 0) {
        cancelAnimationFrame(synthAnimFrameRef.current);
        synthAnimFrameRef.current = 0;
      }
      const clampedStart = Math.min(Math.max(0, startMs), noAudioMaxMs);
      synthStartElapsedMsRef.current = clampedStart;
      setPlaying(true);
      let firstTs: number | null = null;
      const tick = (now: DOMHighResTimeStamp) => {
        if (firstTs === null) firstTs = now;
        const elapsed = clampedStart + (now - firstTs);
        const clamped = Math.min(elapsed, noAudioMaxMs);
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
        if (clamped < noAudioMaxMs) {
          synthAnimFrameRef.current = requestAnimationFrame(tick);
        } else {
          synthAnimFrameRef.current = 0;
          setPlaying(false);
          isAtEndRef.current = true;
        }
      };
      synthAnimFrameRef.current = requestAnimationFrame(tick);
    },
    [applySceneAtRef, noAudioMaxMs]
  );

  startSynthFromRef.current = startSynthFrom;

  const stopSynth = useCallback(() => {
    if (synthAnimFrameRef.current !== 0) {
      cancelAnimationFrame(synthAnimFrameRef.current);
      synthAnimFrameRef.current = 0;
    }
    synthStartElapsedMsRef.current = globalMs;
    setPlaying(false);
  }, [globalMs]);

  // Sync volume + muted to the audio element whenever they change.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !hasAudio) return;
    el.volume = Math.max(0, Math.min(1, volume));
    el.muted = muted;
  }, [volume, muted, hasAudio]);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(Math.max(0, Math.min(1, v)));
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const pause = useCallback(() => {
    if (hasAudio) {
      segmentSwappingRef.current = false;
      pendingPlayRef.current = false;
      setPlaying(false);
      const el = audioRef.current;
      if (el) {
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=pause_callback currentTime=${el.currentTime}`
        );
        el.pause();
      }
    } else {
      stopSynth();
    }
  }, [hasAudio, stopSynth, whiteboardSessionId]);

  const play = useCallback(() => {
    const atMs = globalMsRef.current;
    if (isAtEndRef.current) {
      // Legacy pattern: restart whole session from t=0 when at end.
      seek(0, { play: true, paint: false });
      return;
    }
    if (hasAudio) {
      // Legacy pattern: trust the scrub-committed currentTime; do NOT
      // re-enter loadSegmentAt on an ordinary resume — that would reset
      // currentTime via applySeek and race with the WebM duration-fix.
      setPlaying(true);
      const el = audioRef.current;
      if (el) {
        // Position-sync: always verify el.currentTime matches the controller's
        // intended position before calling play().
        //
        // Two failure modes leave el.currentTime wrong:
        //   1. Infinity: el.currentTime = 1e101 while WebM scan still running.
        //   2. Finite-parked-at-end: Chrome fires durationchange while
        //      audio.seeking=true (our own 1e101 scan completing), which blocked
        //      the webm-fix reset-to-0 guard, leaving currentTime at the
        //      measured duration (e.g. 94.741). The previous Infinity-only guard
        //      missed this case because 94.741 is finite.
        //
        // We compute the intended local position from globalMsRef and use a
        // 50 ms tolerance to avoid spurious seeks on normal resume-after-pause
        // (where el.currentTime already matches up to floating-point drift).
        // We do NOT reload the segment src — only set currentTime within the
        // already-loaded segment.
        const measured = resolvedMaxMsRef.current;
        const { localMs } = globalMsToSegmentLocal(
          atMs,
          audioTimeline,
          measured > 0 ? measured : undefined
        );
        const intendedSec = Math.max(0, localMs / 1000);
        const delta = Number.isFinite(el.currentTime)
          ? Math.abs(el.currentTime - intendedSec)
          : Infinity;
        if (delta > 0.05) {
          cancelWebmFixRef.current?.();
          console.log(
            `[avx] wbsid=${whiteboardSessionId ?? "?"} pre_play_position_sync currentTime_was=${el.currentTime} setting_to=${intendedSec}`
          );
          try {
            el.currentTime = intendedSec;
          } catch {
            // best-effort; play() will still be called below
          }
        }
        startPlay(el, "play_button");
      }
      return;
    }
    const startFrom = atMs >= noAudioMaxMs ? 0 : atMs;
    if (startFrom === 0) {
      globalMsRef.current = 0;
      setGlobalMs(0);
      applySceneAtRef.current(0);
    }
    startSynthFrom(startFrom);
  }, [
    applySceneAtRef,
    audioTimeline,
    hasAudio,
    noAudioMaxMs,
    seek,
    startPlay,
    startSynthFrom,
    whiteboardSessionId,
  ]);

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  // Initialize audio element when segments or restore-ready state changes.
  // Mirrors legacy WhiteboardReplay segment-init effect: resets segment-tracking
  // refs but NEVER zeroes globalMs / paintReady (scrub position survives).
  useEffect(() => {
    activeSegmentIndexRef.current = 0;
    setActiveSegmentIndex(0);
    globalSegmentOffsetMsRef.current = 0;
    segmentSwappingRef.current = false;
    isAtEndRef.current = false;
    setPlaying(false);
    setResolvedMaxMs(audioTimeline.totalMs);
    if (synthAnimFrameRef.current !== 0) {
      cancelAnimationFrame(synthAnimFrameRef.current);
      synthAnimFrameRef.current = 0;
    }
    synthStartElapsedMsRef.current = 0;
    if (!hasAudio || !replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;
    const first = effectiveSegments[0];
    if (!first) return;
    if (!audioSrcMatches(el, first.url)) {
      el.src = first.url;
      setAudioReady(false);
    }
  }, [
    audioSrcMatches,
    effectiveSegments,
    hasAudio,
    replayExcaliRestoreReady,
    audioTimeline.totalMs,
  ]);

  // WebM duration fix
  useEffect(() => {
    if (!hasAudio || !replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;
    const { cleanup, cancelPendingFix } = attachWebmDurationFix(el, replayAudioMime, {
      onMetadataLoaded: () => {
        setAudioReady(true);
        if (Number.isFinite(el.duration) && el.duration > 0) {
          const knownEnd =
            globalSegmentOffsetMsRef.current + Math.round(el.duration * 1000);
          setResolvedMaxMs((prev) => Math.max(prev, knownEnd));
        }
      },
      // Called once when the WebM duration scan completes and the real
      // measured duration is known.  This is the moment resolvedMaxMs /
      // scrubberMax can be updated to reflect the actual audio length so
      // subsequent scrubs map proportionally rather than collapsing to 0.
      onDurationResolved: (durationSec: number) => {
        const knownEnd =
          globalSegmentOffsetMsRef.current + Math.round(durationSec * 1000);
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} duration_resolved measuredTotal=${knownEnd}`
        );
        setResolvedMaxMs((prev) => Math.max(prev, knownEnd));
      },
    });
    cancelWebmFixRef.current = cancelPendingFix;
    return () => {
      cleanup();
      cancelWebmFixRef.current = null;
    };
  }, [hasAudio, replayAudioMime, replayExcaliRestoreReady, whiteboardSessionId]);

  // Preload next segments
  useEffect(() => {
    if (!hasAudio || effectiveSegments.length <= 1) return;
    const preloads = effectiveSegments.slice(1).map((seg) => {
      const a = new Audio();
      a.preload = "auto";
      a.src = seg.url;
      return a;
    });
    return () => {
      for (const a of preloads) a.src = "";
    };
  }, [effectiveSegments, hasAudio]);

  // Audio-driven play loop
  useEffect(() => {
    if (loadState.kind !== "ready") return;
    if (!hasAudio || !replayExcaliRestoreReady) return;
    const el = audioRef.current;
    if (!el) return;

    const getGlobalTimeMs = () => {
      const ct = el.currentTime;
      // Guard: during the WebM fix scan Chrome reports currentTime=Infinity
      // after we set el.currentTime=1e101.  Don't advance the play clock
      // while the element is in that state — return the last known position.
      if (!Number.isFinite(ct)) return globalMsRef.current;
      const localMs = Math.floor(ct * 1000);
      return globalSegmentOffsetMsRef.current + localMs;
    };

    const loop = createThrottledPlayLoop({
      getTimeMs: getGlobalTimeMs,
      apply: (ms) => {
        // Re-entrancy guard — see isApplyingRef declaration above.
        if (isApplyingRef.current) return;
        isApplyingRef.current = true;
        try {
          const cap = scrubberMaxRef.current;
          // Guard: if the audio duration hasn't been resolved yet (stored
          // and measured durations both absent → resolvedMaxMs = 0),
          // scrubberMax collapses to the 1 ms minimum fallback. Firing
          // the end-cap in that state would snap playback to "end" after
          // just 1 ms. Skip until we have a real duration; onEnded handles
          // the actual end-of-stream independently.
          if (resolvedMaxMsRef.current > 0 && ms >= cap) {
            const endMs = cap;
            globalMsRef.current = endMs;
            setGlobalMs(endMs);
            applySceneAtRef.current(endMs);
            isAtEndRef.current = true;
            setPlaying(false);
            console.log(
              `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=play_loop_at_cap ms=${ms} cap=${cap}`
            );
            el.pause();
            loop.pause();
          } else {
            globalMsRef.current = ms;
            setGlobalMs(ms);
            applySceneAtRef.current(ms);
          }
        } finally {
          isApplyingRef.current = false;
        }
      },
    });
    playLoopRef.current = loop;

    const onPlay = () => {
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_play_event currentTime=${el.currentTime}`
      );
      pendingPlayRef.current = false;
      setPlaying(true);
      loop.play();
    };
    const onPause = () => {
      if (segmentSwappingRef.current) return;
      // Guard: a play() was called and hasn't resolved yet — this pause event
      // is stale (fired by the scrub-pause that preceded the play() call).
      // Responding here would fight the pending play and cause the AbortError.
      if (pendingPlayRef.current) {
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause suppressed_during_pending_play currentTime=${el.currentTime}`
        );
        return;
      }
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=onPause_handler currentTime=${el.currentTime}`
      );
      setPlaying(false);
      loop.pause();
    };
    const onSeeked = () => {
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_seeked_event currentTime=${el.currentTime}`
      );
    };

    const onEnded = () => {
      if (!el.ended) return;
      if (isAtEndRef.current) return;

      const actualDurationMs =
        Number.isFinite(el.duration) && el.duration > 0
          ? Math.round(el.duration * 1000)
          : (audioTimeline.segmentDurationsMs[activeSegmentIndexRef.current] ??
            0);
      globalSegmentOffsetMsRef.current += actualDurationMs;
      setResolvedMaxMs((prev) =>
        Math.max(prev, globalSegmentOffsetMsRef.current)
      );

      const next = activeSegmentIndexRef.current + 1;
      if (next < effectiveSegments.length) {
        loadSegmentAt(next, 0, true);
        loop.play();
        return;
      }

      isAtEndRef.current = true;
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=onEnded currentTime=${el.currentTime}`
      );
      el.pause();
      const endMs = globalSegmentOffsetMsRef.current;
      setPlaying(false);
      setGlobalMs(endMs);
      applySceneAtRef.current(endMs);
      loop.pause();
    };

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("seeked", onSeeked);

    return () => {
      playLoopRef.current = null;
      loop.dispose();
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("seeked", onSeeked);
    };
  }, [
    applySceneAtRef,
    audioTimeline,
    effectiveSegments,
    hasAudio,
    loadSegmentAt,
    loadState,
    replayExcaliRestoreReady,
    whiteboardSessionId,
  ]);

  // Synth cleanup
  useEffect(() => {
    if (hasAudio || loadState.kind !== "ready") return;
    return () => {
      if (synthAnimFrameRef.current !== 0) {
        cancelAnimationFrame(synthAnimFrameRef.current);
        synthAnimFrameRef.current = 0;
      }
    };
  }, [hasAudio, loadState]);

  const handleScrubPointerDown = useCallback(() => {
    if (!hasAudio) return;
    const el = audioRef.current;
    // Use el.paused as the ground truth — React `playing` state can be stale
    // (e.g. captured from a previous render), so every scrub would report
    // wasPlaying=true even on a fresh/paused session.
    scrubWasPlayingRef.current = !!el && !el.paused;
    console.log(
      `[avx] wbsid=${whiteboardSessionId ?? "?"} scrub_pointer_down wasPlaying=${scrubWasPlayingRef.current} el.paused=${el?.paused}`
    );
    if (el && !el.paused) {
      console.log(
        `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=scrub_pointer_down currentTime=${el.currentTime}`
      );
      el.pause();
    }
  }, [hasAudio, whiteboardSessionId]);

  const handleScrubChange = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, scrubberMaxRef.current));
      if (hasAudio) {
        if (clamped >= scrubberMaxRef.current) {
          isAtEndRef.current = true;
          // UI-only update during drag — no audio seek here.
          // (handleScrubPointerUp issues the single audio seek on release.)
          globalMsRef.current = clamped;
          setGlobalMs(clamped);
          applySceneAtRef.current(clamped);
          setPlaying(false);
          const el = audioRef.current;
          if (el && !el.paused) {
            console.log(
              `[avx] wbsid=${whiteboardSessionId ?? "?"} audio_pause reason=scrub_at_max currentTime=${el.currentTime}`
            );
            el.pause();
          }
          return;
        }
        isAtEndRef.current = false;
        // UI-only update: move scrubber + update scene preview during drag.
        // Audio currentTime is written exactly once on pointer-up
        // (handleScrubPointerUp → seek).  Writing it here on every onChange
        // storms the audio decoder and blocks reseeking until pointer-up.
        globalMsRef.current = clamped;
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
      } else {
        if (synthAnimFrameRef.current !== 0) {
          cancelAnimationFrame(synthAnimFrameRef.current);
          synthAnimFrameRef.current = 0;
        }
        synthStartElapsedMsRef.current = clamped;
        globalMsRef.current = clamped;
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
        if (playing) setPlaying(false);
        if (clamped >= scrubberMaxRef.current) {
          isAtEndRef.current = true;
        }
      }
    },
    [applySceneAtRef, hasAudio, playing, whiteboardSessionId]
  );

  const handleScrubPointerUp = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, scrubberMaxRef.current));
      if (clamped >= scrubberMaxRef.current) {
        isAtEndRef.current = true;
      } else {
        isAtEndRef.current = false;
      }
      if (hasAudio) {
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} action=replay_scrub_seek ms=${clamped} wasPlaying=${scrubWasPlayingRef.current}`
        );
        seek(clamped, { play: scrubWasPlayingRef.current, paint: false });
      } else {
        console.log(
          `[avx] wbsid=${whiteboardSessionId ?? "?"} action=replay_scrub_seek ms=${clamped} hasAudio=false`
        );
        synthStartElapsedMsRef.current = clamped;
        globalMsRef.current = clamped;
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
      }
    },
    [applySceneAtRef, hasAudio, seek, whiteboardSessionId]
  );

  const timelineState: ReplayTimelineState = {
    globalMs,
    totalMs,
    playing,
    activeSegmentIndex,
    loadState: loadState.kind,
    paintReady,
  };

  return {
    loadState,
    log,
    hasAudio,
    effectiveSegments,
    activeSegment,
    replayAudioMime,
    replayExcaliRestoreReady,
    audioReady,
    audioRef,
    globalMs,
    totalMs,
    scrubberMax,
    noAudioMaxMs,
    playing,
    paintReady,
    isAtEnd: isAtEndRef.current,
    activeSegmentIndex,
    resolveAssetUrl,
    seek,
    pause,
    play,
    togglePlay,
    handleScrubPointerDown,
    handleScrubChange,
    handleScrubPointerUp,
    timelineState,
    setPaintReady,
    volume,
    muted,
    handleVolumeChange,
    toggleMute,
  };
}

export type { ReplayAudioSegment };
