"use client";

/**
 * Per-participant remote-mic recorder orchestrator — Phase 4c host
 * glue between `useLiveAV` and `remote-stream-recorder`.
 *
 * WS-A A3: taps each reconciled peer's RAW `audioStream` (tap-before-mix)
 * into a dedicated `transcriptionOnly` MediaRecorder lane. Replay audio
 * stays on the `tutor:mic` mixdown — these rows never reach
 * `assembleEndSessionSegments`.
 *
 * Architecture (deliberately layered):
 *
 *   useLiveAV (4b)            → participants[] with audioStream + peerConnectionState
 *           │
 *           ▼
 *   useRemoteMicRecorders     ← THIS HOOK
 *     - reconcileSpeakers() caps distinct identities (newest device wins)
 *     - Creates one RemoteStreamRecorder per active student peer
 *     - Watches `shouldCapture(streamId)` + per-peer moderation
 *       overrides, calls start() / stop() accordingly
 *     - On participant removal: stop() + dispose() and forget
 *           │
 *           ▼
 *   remote-stream-recorder (4b) → outbox row writes (transcriptionOnly)
 *           │
 *           ▼
 *   upload-outbox (1b) → onSegmentUploaded → enqueueChunkTranscriptionAction
 *
 * Per-session ID logging: every transition logs with
 * `[psc] psc=<streamId> action=<start|stop|segment|enqueue> wbsid=… peer=… speakerId=…`
 */

import { useEffect, useRef } from "react";

import type { AvParticipant } from "@/hooks/useLiveAV";
import { reconcileSpeakers } from "@/lib/recording/perspeaker-identity";
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
   * otherwise return true.
   */
  mutedPeerIdsInRecording: ReadonlySet<string>;
  /**
   * Shared upload outbox instance (Phase 1b). Same instance the
   * tutor mic uses; the recorder writes per-participant rows
   * keyed by `studentMicStreamId(peerId)`.
   */
  outbox: UploadOutbox | null;
  /**
   * Master enable — false when consent policy blocks student audio capture
   * (e.g. `audioCapturePolicy !== "full"`). Disposes all recorders when off.
   */
  enabled?: boolean;
  /**
   * Max distinct speaker identities (defensive cap). Default 4.
   */
  maxSpeakers?: number;
  /**
   * Resolve stable speaker id (LearnerProfile id) for a peer.
   * Return undefined to skip lane creation (unclaimed / anonymous).
   */
  resolveSpeakerIdForPeer?: (peer: AvParticipant) => string | undefined;
  /**
   * Monotonic p3-clock reader for `recordingTimeOffsetMs` on each segment.
   */
  getRecordingTimeOffsetMs?: () => number;
  /**
   * Test-only factory override. Production omits.
   */
  _createRecorder?: typeof createRemoteStreamRecorder;
  /**
   * Optional logger override. Defaults to `console` with a `[psc]` prefix.
   */
  log?: Pick<Console, "log" | "warn" | "error">;
};

function reconcileActiveParticipants(
  participants: ReadonlyArray<AvParticipant>,
  maxSpeakers: number
): AvParticipant[] {
  const students = participants.filter((p) => p.role === "student");
  if (students.length === 0) return [];
  const livePeers = students.map((p) => ({
    peerId: p.peerId,
    joinedAt: p.joinedAt,
  }));
  const { active } = reconcileSpeakers(livePeers, { maxSpeakers });
  const activeIds = new Set(active.map((p) => p.peerId));
  return students.filter((p) => activeIds.has(p.peerId));
}

/**
 * Side-effect-only React hook. Maintains a `Map<peerId,
 * RemoteStreamRecorder>` in a ref and reconciles it against
 * capped/reconciled `participants[]`.
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
    enabled = true,
    maxSpeakers = 4,
    resolveSpeakerIdForPeer,
    getRecordingTimeOffsetMs,
    _createRecorder,
    log: logOpt,
  } = opts;

  const log =
    logOpt ?? {
      log: (msg: string, ...rest: unknown[]) =>
        console.log(`[psc] wbsid=${sessionId} ${msg}`, ...rest),
      warn: (msg: string, ...rest: unknown[]) =>
        console.warn(`[psc] wbsid=${sessionId} ${msg}`, ...rest),
      error: (msg: string, ...rest: unknown[]) =>
        console.error(`[psc] wbsid=${sessionId} ${msg}`, ...rest),
    };

  const recordersRef = useRef<Map<string, RemoteStreamRecorder>>(new Map());
  const factoryRef = useRef(_createRecorder ?? createRemoteStreamRecorder);
  factoryRef.current = _createRecorder ?? createRemoteStreamRecorder;

  const activeParticipants = enabled
    ? reconcileActiveParticipants(participants, maxSpeakers)
    : [];

  // Effect 1: instantiate/dispose recorders as participants arrive/leave.
  useEffect(() => {
    const map = recordersRef.current;
    if (!enabled || !outbox) {
      for (const [peerId, rec] of [...map.entries()]) {
        try {
          void rec.stop().catch(() => undefined);
        } finally {
          try {
            rec.dispose();
          } catch {
            /* ignore */
          }
          map.delete(peerId);
          log.log(`action=dispose peer=${peerId} reason=disabled`);
        }
      }
      return;
    }

    const currentIds = new Set<string>();
    for (const p of activeParticipants) {
      currentIds.add(p.peerId);
      const existing = map.get(p.peerId);
      if (existing) continue;
      if (!p.audioStream) {
        continue;
      }
      const speakerId = resolveSpeakerIdForPeer?.(p);
      if (!speakerId) {
        log.log(
          `action=skip peer=${p.peerId} reason=no_speaker_id (unclaimed or unresolved)`
        );
        continue;
      }
      const streamId = studentMicStreamId(p.peerId);
      try {
        const rec = factoryRef.current({
          stream: p.audioStream,
          streamId,
          sessionId,
          outbox,
          transcriptionOnly: true,
          speakerId,
          getRecordingTimeOffsetMs,
          log: {
            log: (msg, ...rest) =>
              log.log(
                `psc=${streamId} peer=${p.peerId} speakerId=${speakerId} ${msg}`,
                ...rest
              ),
            warn: (msg, ...rest) =>
              log.warn(
                `psc=${streamId} peer=${p.peerId} speakerId=${speakerId} ${msg}`,
                ...rest
              ),
            error: (msg, ...rest) =>
              log.error(
                `psc=${streamId} peer=${p.peerId} speakerId=${speakerId} ${msg}`,
                ...rest
              ),
          },
        });
        map.set(p.peerId, rec);
        log.log(
          `psc=${streamId} action=create peer=${p.peerId} speakerId=${speakerId}`
        );
      } catch (err) {
        log.error(
          `psc=${streamId} action=create_failed peer=${p.peerId} err=${
            (err as Error)?.message ?? String(err)
          }`
        );
      }
    }
    for (const [peerId, rec] of [...map.entries()]) {
      if (currentIds.has(peerId)) continue;
      const streamId = studentMicStreamId(peerId);
      try {
        void rec.stop().catch((err) => {
          log.warn(
            `psc=${streamId} action=stop_failed peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        });
      } finally {
        try {
          rec.dispose();
        } catch (err) {
          log.warn(
            `psc=${streamId} action=dispose_failed peer=${peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
        map.delete(peerId);
        log.log(`psc=${streamId} action=dispose peer=${peerId} reason=peer_left`);
      }
    }
  }, [
    activeParticipants,
    sessionId,
    outbox,
    enabled,
    resolveSpeakerIdForPeer,
    getRecordingTimeOffsetMs,
    log,
  ]);

  // Effect 2: gate each existing recorder by shouldCapture + moderation.
  useEffect(() => {
    if (!enabled) return;
    const map = recordersRef.current;
    for (const p of activeParticipants) {
      const rec = map.get(p.peerId);
      if (!rec) continue;
      const streamId = studentMicStreamId(p.peerId);
      const allowed =
        shouldCapture(streamId) && !mutedPeerIdsInRecording.has(p.peerId);
      const recording = rec.isRecording();
      if (allowed && !recording) {
        try {
          rec.start();
          log.log(`psc=${streamId} action=start peer=${p.peerId}`);
        } catch (err) {
          log.error(
            `psc=${streamId} action=start_failed peer=${p.peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        }
      } else if (!allowed && recording) {
        log.log(`psc=${streamId} action=stop peer=${p.peerId}`);
        void rec.stop().catch((err) => {
          log.warn(
            `psc=${streamId} action=stop_failed peer=${p.peerId} err=${
              (err as Error)?.message ?? String(err)
            }`
          );
        });
      }
    }
  }, [activeParticipants, shouldCapture, mutedPeerIdsInRecording, enabled, log]);

  // Effect 3: full teardown on unmount.
  useEffect(() => {
    return () => {
      const map = recordersRef.current;
      for (const [peerId, rec] of map.entries()) {
        const streamId = studentMicStreamId(peerId);
        try {
          rec.dispose();
          log.log(`psc=${streamId} action=dispose peer=${peerId} reason=unmount`);
        } catch (err) {
          log.warn(
            `psc=${streamId} action=dispose_failed peer=${peerId} err=${
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
