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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeSegmentIndexRef = useRef(0);
  const isAtEndRef = useRef(false);
  const globalSegmentOffsetMsRef = useRef(0);
  const segmentSwappingRef = useRef(false);
  const hasEverPlayedRef = useRef(false);
  const scrubWasPlayingRef = useRef(false);
  const scrubberMaxRef = useRef(1);
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
    setPaintReady(false);
    hasEverPlayedRef.current = false;
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

  const loadSegmentAt = useCallback(
    (segmentIndex: number, localMs: number, autoplay: boolean) => {
      const el = audioRef.current;
      const seg = effectiveSegments[segmentIndex];
      if (!el || !seg) return;

      const needsSrcSwap =
        activeSegmentIndexRef.current !== segmentIndex ||
        el.getAttribute("src") !== seg.url;

      activeSegmentIndexRef.current = segmentIndex;
      setActiveSegmentIndex(segmentIndex);
      setAudioReady(false);

      const seekSec = Math.max(0, localMs / 1000);
      const applySeek = () => {
        try {
          el.currentTime = seekSec;
        } catch {
          // metadata may not be ready
        }
        if (autoplay) void el.play();
      };

      if (needsSrcSwap) {
        segmentSwappingRef.current = true;
        el.src = seg.url;
        const onMeta = () => {
          el.removeEventListener("loadedmetadata", onMeta);
          segmentSwappingRef.current = false;
          applySeek();
        };
        el.addEventListener("loadedmetadata", onMeta);
        el.load();
      } else {
        applySeek();
      }
    },
    [effectiveSegments]
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

      if (hasAudio) {
        const { segmentIndex, localMs } = globalMsToSegmentLocal(
          clamped,
          audioTimeline
        );
        globalSegmentOffsetMsRef.current = clamped - localMs;
        setGlobalMs(clamped);
        setPlaying(autoplay);
        applySceneAtRef.current(clamped);
        if (shouldPaint) setPaintReady(true);
        loadSegmentAt(segmentIndex, localMs, autoplay);
      } else {
        setGlobalMs(clamped);
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
    [applySceneAtRef, audioTimeline, hasAudio, loadSegmentAt, totalMs]
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

  const pause = useCallback(() => {
    if (hasAudio) {
      segmentSwappingRef.current = false;
      setPlaying(false);
      audioRef.current?.pause();
    } else {
      stopSynth();
    }
  }, [hasAudio, stopSynth]);

  const play = useCallback(() => {
    if (isAtEndRef.current) {
      hasEverPlayedRef.current = true;
      seek(0, { play: true, paint: false });
      return;
    }
    if (!hasEverPlayedRef.current) {
      hasEverPlayedRef.current = true;
      if (globalMs === 0) {
        seek(0, { play: true, paint: false });
        return;
      }
    }
    if (hasAudio) {
      const { segmentIndex, localMs } = globalMsToSegmentLocal(
        globalMs,
        audioTimeline
      );
      loadSegmentAt(segmentIndex, localMs, true);
      setPlaying(true);
      return;
    }
    const startFrom = globalMs >= noAudioMaxMs ? 0 : globalMs;
    if (startFrom === 0) {
      setGlobalMs(0);
      applySceneAtRef.current(0);
    }
    startSynthFrom(startFrom);
  }, [
    applySceneAtRef,
    audioTimeline,
    globalMs,
    hasAudio,
    loadSegmentAt,
    noAudioMaxMs,
    seek,
    startSynthFrom,
  ]);

  const togglePlay = useCallback(() => {
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  // Reset on segment list change
  useEffect(() => {
    activeSegmentIndexRef.current = 0;
    setActiveSegmentIndex(0);
    globalSegmentOffsetMsRef.current = 0;
    segmentSwappingRef.current = false;
    isAtEndRef.current = false;
    hasEverPlayedRef.current = false;
    setPlaying(false);
    setGlobalMs(0);
    setPaintReady(false);
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
    if (el.getAttribute("src") !== first.url) {
      el.src = first.url;
      setAudioReady(false);
    }
  }, [
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
    const detach = attachWebmDurationFix(el, replayAudioMime, {
      onMetadataLoaded: () => {
        setAudioReady(true);
        if (Number.isFinite(el.duration) && el.duration > 0) {
          const knownEnd =
            globalSegmentOffsetMsRef.current + Math.round(el.duration * 1000);
          setResolvedMaxMs((prev) => Math.max(prev, knownEnd));
        }
      },
    });
    return detach;
  }, [hasAudio, replayAudioMime, replayExcaliRestoreReady]);

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
      const localMs = Math.floor(el.currentTime * 1000);
      return globalSegmentOffsetMsRef.current + localMs;
    };

    const loop = createThrottledPlayLoop({
      getTimeMs: getGlobalTimeMs,
      apply: (ms) => {
        const cap = scrubberMaxRef.current;
        if (ms >= cap) {
          const endMs = cap;
          setGlobalMs(endMs);
          applySceneAtRef.current(endMs);
          isAtEndRef.current = true;
          setPlaying(false);
          el.pause();
          loop.pause();
          return;
        }
        setGlobalMs(ms);
        applySceneAtRef.current(ms);
      },
    });

    const onPlay = () => {
      setPlaying(true);
      loop.play();
    };
    const onPause = () => {
      if (segmentSwappingRef.current) return;
      setPlaying(false);
      loop.pause();
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

    return () => {
      loop.dispose();
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [
    applySceneAtRef,
    audioTimeline,
    effectiveSegments,
    hasAudio,
    loadSegmentAt,
    loadState,
    replayExcaliRestoreReady,
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
    scrubWasPlayingRef.current = playing;
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
  }, [hasAudio, playing]);

  const handleScrubChange = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(ms, scrubberMaxRef.current));
      if (hasAudio) {
        if (clamped >= scrubberMaxRef.current) {
          isAtEndRef.current = true;
          seek(clamped, { play: false, paint: false });
          audioRef.current?.pause();
          setPlaying(false);
          return;
        }
        isAtEndRef.current = false;
        seek(clamped, { play: false, paint: false });
      } else {
        if (synthAnimFrameRef.current !== 0) {
          cancelAnimationFrame(synthAnimFrameRef.current);
          synthAnimFrameRef.current = 0;
        }
        synthStartElapsedMsRef.current = clamped;
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
        if (playing) setPlaying(false);
        if (clamped >= scrubberMaxRef.current) {
          isAtEndRef.current = true;
        }
      }
    },
    [applySceneAtRef, hasAudio, playing, seek]
  );

  const handleScrubPointerUp = useCallback(
    (ms: number) => {
      hasEverPlayedRef.current = true;
      const clamped = Math.max(0, Math.min(ms, scrubberMaxRef.current));
      if (clamped >= scrubberMaxRef.current) {
        isAtEndRef.current = true;
      } else {
        isAtEndRef.current = false;
      }
      if (hasAudio) {
        seek(clamped, { play: scrubWasPlayingRef.current, paint: false });
      } else {
        synthStartElapsedMsRef.current = clamped;
        setGlobalMs(clamped);
        applySceneAtRef.current(clamped);
      }
    },
    [applySceneAtRef, hasAudio, seek]
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
    hasEverPlayed: hasEverPlayedRef.current,
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
  };
}

export type { ReplayAudioSegment };
