"use client";

/**
 * Per-participant remote-mic recorder orchestrator — Phase 4c host
 * glue between `useLiveAV` and `remote-stream-recorder`.
 *
 * Architecture (deliberately layered):
 *
 *   useLiveAV (4b)            → participants[] with audioStream + peerConnectionState
 *           │
 *           ▼
 *   useRemoteMicRecorders     ← THIS HOOK
 *     - Creates one RemoteStreamRecorder per active participant
 *     - Watches `shouldCapture(streamId)` + per-peer moderation
 *       overrides, calls start() / stop() accordingly
 *     - On participant removal: stop() + dispose() and forget
 *           │
 *           ▼
 *   remote-stream-recorder (4b) → outbox row writes
 *           │
 *           ▼
 *   upload-outbox (1b)
 *
 * Why a separate hook (not inline in WhiteboardWorkspaceClient):
 *
 *   - The workspace already pushes >1700 lines; another 60 of
 *     recorder-bookkeeping noise hurts review.
 *   - Easier to test in isolation: hand the hook synthetic
 *     participants + a moving `shouldCapture` and assert that
 *     start/stop fire on the right transitions.
 *
 * What this hook is NOT responsible for:
 *
 *   - End-session drain: the workspace already awaits
 *     `drainOutboxOrTimeout`. Recorder `.stop()` resolves once its
 *     trailing `outbox.enqueue` lands, so a tear-down before drain
 *     is safe — the row exists in the outbox before drain reads.
 *   - Tutor-mic capture: the existing `useAudioRecorder` +
 *     `WhiteboardWorkspaceAudioBridge` path handles that. This hook
 *     ONLY touches remote-mic streams.
 *
 * Per-session ID logging: every transition logs with
 * `wbsid=<id> avx=<id> peer=<peerId>` so prod debugging can grep
 * the same scrollback as the existing 4a + 4b logs.
 */

import { useEffect, useRef } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";
import {
  createRemoteStreamRecorder,
  studentMicStreamId,
  type RemoteStreamRecorder,
} from "@/lib/recording/remote-stream-recorder";
import type { UploadOutbox } from "@/lib/recording/upload-outbox";

export type UseRemoteMicRecordersOptions = {
  /**
   * Participants from `useLiveAV().participants`. Sorted, stable
   * per-render; the hook iterates over `peerId`-keyed entries.
   */
  participants: ReadonlyArray<AvParticipant>;
  /**
   * Whiteboard session id (threaded into recorder + outbox rows).
   */
  sessionId: string;
  /**
   * Lifecycle FSM `shouldCapture(streamId)` predicate. The host
   * computes `evaluateLifecycle({...}).shouldCapture`; we read it
   * per-participant via `studentMicStreamId(peerId)`.
   */
  shouldCapture: (streamId: string) => boolean;
  /**
   * Host-side moderation overrides. Peer ids in this set are
   * EXCLUDED from recording even when `shouldCapture` would
   * otherwise return true. Used for the tutor "Don't record this
   * student" toggle. Wire-level mute is post-v1 and out of scope.
   */
  mutedPeerIdsInRecording: ReadonlySet<string>;
  /**
   * Shared upload outbox instance (Phase 1b). Same instance the
   * tutor mic uses; the recorder writes per-participant rows
   * keyed by `studentMicStreamId(peerId)`.
   */
  outbox: UploadOutbox;
  /**
   * Test-only factory override. Production omits.
   */
  _createRecorder?: typeof createRemoteStreamRecorder;
  /**
   * Optional logger override. Defaults to `console` with a
   * `[useRemoteMicRecorders] wbsid=… avx=…` prefix.
   */
  log?: Pick<Console, "log" | "warn" | "error">;
};

/**
 * Side-effect-only React hook. Maintains a `Map<peerId,
 * RemoteStreamRecorder>` in a ref and reconciles it against
 * `participants[]`. The recorder's `start()` / `stop()` calls are
 * fired from a separate effect that re-runs when the
 * shouldCapture-derived per-peer decision flips.
 *
 * The hook returns nothing — it's all internal lifecycle. Hosts
 * who need to observe whether a recorder is currently active for
 * a peer can read `participants[i].peerConnectionState` and apply
 * the same predicate themselves.
 */
export function useRemoteMicRecorders(
  opts: UseRemoteMicRecordersOptions
): void {
  const {
    participants,
    sessionId,
    shouldCapture,
    mutedPeerIdsInRecording,
    outbox,
    _createRecorder,
    log: logOpt,
  } = opts;

  const log =
    logOpt ?? {
      log: (msg: string, ...rest: unknown[]) =>
        console.log(
          `[useRemoteMicRecorders] avx=${sessionId} ${msg}`,
          ...rest
        ),
      warn: (msg: string, ...rest: unknown[]) =>
        console.warn(
          `[useRemoteMicRecorders] avx=${sessionId} ${msg}`,
          ...rest
        ),
      error: (msg: string, ...rest: unknown[]) =>
        console.error(
          `[useRemoteMicRecorders] avx=${sessionId} ${msg}`,
          ...rest
        ),
    };

  const recordersRef = useRef<Map<string, RemoteStreamRecorder>>(new Map());
  const factoryRef = useRef(_createRecorder ?? createRemoteStreamRecorder);
  factoryRef.current = _createRecorder ?? createRemoteStreamRecorder;

  // Effect 1: instantiate/dispose recorders as participants arrive/leave.
  // Re-keyed strictly on the participant set + audioStream identity so
  // a re-render with the same participant + same stream doesn't churn.
  useEffect(() => {
    const map = recordersRef.current;
    const currentIds = new Set<string>();
    for (const p of participants) {
      currentIds.add(p.peerId);
      const existing = map.get(p.peerId);
      if (existing) continue;
      if (!p.audioStream) {
        // Audio track hasn't landed yet — skip and try again on the
        // next render when participants[] updates.
        continue;
      }
      const streamId = studentMicStreamId(p.peerId);
      try {
        const rec = factoryRef.current({
          stream: p.audioStream,
          streamId,
          sessionId,
          outbox,
        });
        map.set(p.peerId, rec);
        log.log(
          `recorder created peer=${p.peerId} streamId=${streamId}`
        );
      } catch (err) {
        log.error(
          `recorder ctor threw peer=${p.peerId} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
      }
    }
    // Dispose recorders for peers that have left.
    for (const [peerId, rec] of [...map.entries()]) {
      if (currentIds.has(peerId)) continue;
      try {
        void rec.stop().catch((err) => {
          log.warn(
            `recorder.stop threw peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        });
      } finally {
        try {
          rec.dispose();
        } catch (err) {
          log.warn(
            `recorder.dispose threw peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
        map.delete(peerId);
        log.log(`recorder disposed peer=${peerId} (peer left)`);
      }
    }
  }, [participants, sessionId, outbox, log]);

  // Effect 2: gate each existing recorder by shouldCapture +
  // moderation overrides. Re-runs whenever shouldCapture or the
  // mute set or the participants update.
  useEffect(() => {
    const map = recordersRef.current;
    for (const p of participants) {
      const rec = map.get(p.peerId);
      if (!rec) continue;
      const streamId = studentMicStreamId(p.peerId);
      const allowed =
        shouldCapture(streamId) && !mutedPeerIdsInRecording.has(p.peerId);
      const recording = rec.isRecording();
      if (allowed && !recording) {
        try {
          rec.start();
          log.log(`recorder start peer=${p.peerId} streamId=${streamId}`);
        } catch (err) {
          log.error(
            `recorder.start threw peer=${p.peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
      } else if (!allowed && recording) {
        log.log(`recorder stop peer=${p.peerId} streamId=${streamId}`);
        void rec.stop().catch((err) => {
          log.warn(
            `recorder.stop threw peer=${p.peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        });
      }
    }
  }, [participants, shouldCapture, mutedPeerIdsInRecording, log]);

  // Effect 3: full teardown on hook unmount (workspace navigates
  // away mid-session, or HMR replaces the host). Synchronously
  // dispose every recorder so devices are freed; pending outbox
  // writes from the trailing dataavailable still complete in the
  // background.
  useEffect(() => {
    return () => {
      const map = recordersRef.current;
      for (const [peerId, rec] of map.entries()) {
        try {
          rec.dispose();
          log.log(`recorder disposed peer=${peerId} (unmount)`);
        } catch (err) {
          log.warn(
            `recorder.dispose threw peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
      }
      map.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
