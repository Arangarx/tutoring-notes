/**
 * Audio-flow confirmation hook — Phase 4d Commit 6.
 *
 * Returns the set of peer ids whose remote audio track is currently
 * "flowing" — meaning the browser has confirmed audio frames are
 * arriving via `MediaStreamTrack.muted === false` AND has held that
 * state for a minimum confirm window (default 200ms). Used by the
 * tutor workspace to gate the recording lifecycle FSM's
 * `participantsWithFlowingAudio` input, fixing the
 * "recording-starts-2s-before-peer-audio-is-flowing" pilot bug:
 *
 *   Sarah clicks Start → student joins → FSM sees `participants.size >= 1`
 *   → MediaRecorder.start() fires → student's WebRTC track is still
 *   negotiating, no audio frames yet → student's first 200-2000ms of
 *   speech is captured as silence into the mixdown → lost on replay.
 *
 * Behaviour contract:
 *
 *   - On first observation of an audio track in `muted=false`,
 *     wait `confirmMs` then add the peer to the flowing set.
 *     Protects against transient unmute → remute flutters.
 *   - On any `mute` event OR track removal, remove the peer
 *     IMMEDIATELY. Better to pause capture promptly than to keep
 *     recording during a dropout (the FSM's `everHadAudioFlow`
 *     latch protects against record-stop/restart churn after the
 *     first successful transition).
 *   - When a participant leaves the `participants` array, the
 *     peer is removed from the set.
 *
 * The hook is purely additive. It does not mutate participants and
 * does not call any media APIs other than the event listeners on
 * the audio tracks the host already owns.
 */

import { useEffect, useState } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";

export type UseAudioFlowConfirmationOptions = {
  /**
   * Minimum debounce window between observing `muted=false` and
   * declaring the peer "flowing". Default 200ms. Sized to cover
   * typical WebRTC mute → unmute → mute flutters on slow networks
   * while staying well below the "tutor would notice the lag"
   * threshold (~500ms). Lower values risk false-positives on
   * cellular; higher values delay legitimate audio.
   */
  confirmMs?: number;
};

/**
 * @param participants — `useLiveAV().participants`. The hook
 *   subscribes to `mute`/`unmute` events on each peer's audio
 *   track + cleans up on participant changes / unmount.
 * @returns A ReadonlySet<string> of peer ids confirmed audio-flowing.
 *   Identity stability: returns the SAME Set across renders when
 *   the contents haven't changed (so referential-equality checks
 *   in callers' useMemo dep arrays don't churn).
 */
export function useAudioFlowConfirmation(
  participants: ReadonlyArray<AvParticipant>,
  opts: UseAudioFlowConfirmationOptions = {}
): ReadonlySet<string> {
  const confirmMs = opts.confirmMs ?? 200;
  const [flowing, setFlowing] = useState<ReadonlySet<string>>(EMPTY_SET);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const pendingAddTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const cancelPendingAdd = (peerId: string): void => {
      const existing = pendingAddTimers.get(peerId);
      if (existing) {
        clearTimeout(existing);
        pendingAddTimers.delete(peerId);
      }
    };

    const scheduleAdd = (peerId: string): void => {
      cancelPendingAdd(peerId);
      const t = setTimeout(() => {
        pendingAddTimers.delete(peerId);
        setFlowing((prev) => {
          if (prev.has(peerId)) return prev;
          const next = new Set(prev);
          next.add(peerId);
          return next;
        });
      }, confirmMs);
      pendingAddTimers.set(peerId, t);
    };

    const removeImmediately = (peerId: string): void => {
      cancelPendingAdd(peerId);
      setFlowing((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    };

    // Prune peers that left the snapshot. Reuse the same Set
    // identity if no changes happened so caller-side memoisation
    // stays stable.
    const presentIds = new Set(participants.map((p) => p.peerId));
    setFlowing((prev) => {
      if (prev.size === 0) return prev;
      let anyChanged = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (presentIds.has(id)) next.add(id);
        else anyChanged = true;
      }
      return anyChanged ? next : prev;
    });

    for (const p of participants) {
      if (!p.audioStream) {
        removeImmediately(p.peerId);
        continue;
      }
      const tracks = p.audioStream.getAudioTracks();
      if (tracks.length === 0) {
        removeImmediately(p.peerId);
        continue;
      }

      const recompute = (): void => {
        const anyFlowing = tracks.some(
          (t) => !t.muted && t.readyState === "live"
        );
        if (anyFlowing) {
          scheduleAdd(p.peerId);
        } else {
          removeImmediately(p.peerId);
        }
      };

      // Initial snapshot — if the track is already unmuted at
      // subscribe time (typical when the host re-renders after a
      // successful negotiation), schedule the add.
      recompute();

      for (const t of tracks) {
        const onMute = () => recompute();
        const onUnmute = () => recompute();
        const onEnded = () => recompute();
        try {
          t.addEventListener("mute", onMute);
          t.addEventListener("unmute", onUnmute);
          t.addEventListener("ended", onEnded);
          cleanups.push(() => {
            try {
              t.removeEventListener("mute", onMute);
              t.removeEventListener("unmute", onUnmute);
              t.removeEventListener("ended", onEnded);
            } catch {
              // ignore
            }
          });
        } catch {
          // Old browsers may only support the legacy property
          // assignment. Fall back to that.
          (t as MediaStreamTrack).onmute = onMute;
          (t as MediaStreamTrack).onunmute = onUnmute;
          (t as MediaStreamTrack).onended = onEnded;
          cleanups.push(() => {
            (t as MediaStreamTrack).onmute = null;
            (t as MediaStreamTrack).onunmute = null;
            (t as MediaStreamTrack).onended = null;
          });
        }
      }
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
      for (const t of pendingAddTimers.values()) clearTimeout(t);
      pendingAddTimers.clear();
    };
  }, [participants, confirmMs]);

  return flowing;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();
