"use client";

/**
 * Live-A/V signaling muxer — Phase 4a.
 *
 * Pure-JS bridge between the encrypted whiteboard sync-client
 * (Pillar 6: all WebRTC signaling rides the existing AES-GCM
 * Socket.IO channel) and the peer-mesh state machine that owns the
 * `RTCPeerConnection` per remote peer.
 *
 * Layering rule (do not collapse):
 *
 *   1. sync-client validates the wire schema (kind discriminator +
 *      payload shape). Malformed bytes are dropped before reaching
 *      this layer. sync-client also suppresses own echoes via the
 *      envelope `peerId` field.
 *
 *   2. signaling.ts (this module) demuxes by `targetPeerId ===
 *      localPeerId`. Every non-self signal that sync-client
 *      observes is delivered to us; we forward only the ones
 *      addressed to our local peer to the peer-mesh handler. Other
 *      participants' SDP/ICE flows past us (we see it on the wire,
 *      but the handler never fires).
 *
 *   3. peer-mesh.ts owns the `Map<peerId, RTCPeerConnection>` and
 *      consumes `(fromPeerId, payload)` to apply remote SDP,
 *      add ICE candidates, or clean up on `leave`. peer-mesh tells
 *      signaling.ts to `sendOffer / sendAnswer / sendIce /
 *      sendLeave` — never touches sync-client directly.
 *
 * Per-session ID logging contract (mandatory; see AGENTS.md):
 *
 *   [signaling] avx=<sessionId> peer=<localPeerId> send/recv
 *               kind=<offer|answer|ice|leave> target=<remotePeerId>
 *               from=<remotePeerId>
 *
 * `avx` is the live-A/V session-level prefix (NEW in Phase 4a). The
 * per-peer subkey `peer=<remotePeerId>` is added inside peer-mesh
 * for events scoped to a specific connection.
 *
 * Tests: `src/__tests__/av/signaling.test.ts` — Jest only, no DOM,
 * no real socket.io.
 */

import type {
  WhiteboardSyncClient,
  WhiteboardWireSignalPayload,
} from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Public types
// -----------------------------------------------------------------

export type SignalingLogger = {
  log: (msg: string, ...rest: unknown[]) => void;
  warn: (msg: string, ...rest: unknown[]) => void;
  error: (msg: string, ...rest: unknown[]) => void;
};

/**
 * The narrow slice of `WhiteboardSyncClient` we depend on. Tests
 * mock this directly — there's no point dragging the full sync-
 * client surface into a unit test that never opens a socket.
 */
export type SignalingSyncDependency = Pick<
  WhiteboardSyncClient,
  "broadcastSignal" | "onRemoteSignal"
>;

export type SignalingOptions = {
  syncClient: SignalingSyncDependency;
  /**
   * Stable peer id for THIS client. Must be the same value the
   * sync-client uses for its own envelope `peerId` — without that,
   * `targetPeerId === localPeerId` will never match and signals
   * addressed to us would be dropped.
   */
  localPeerId: string;
  /**
   * Optional. Threaded into log lines as `avx=<id>` so a debug
   * session spanning the tutor + N students can be grepped across
   * tabs. If omitted the prefix becomes `avx=?`.
   */
  sessionId?: string;
  /** Optional logger override; defaults to console.* with the avx prefix. */
  log?: SignalingLogger;
};

/**
 * Inbound signal handler — fires once per matching `targetPeerId`
 * signal. `payload` has already been schema-validated by the sync-
 * client; consumers can switch on `payload.type` exhaustively.
 */
export type SignalHandler = (
  fromPeerId: string,
  payload: WhiteboardWireSignalPayload
) => void;

export type Signaling = {
  /** Subscribe to inbound signals addressed to our local peer. */
  onSignal: (cb: SignalHandler) => () => void;
  /** Send an SDP offer to `remotePeerId`. */
  sendOffer: (remotePeerId: string, sdp: string) => void;
  /** Send an SDP answer to `remotePeerId`. */
  sendAnswer: (remotePeerId: string, sdp: string) => void;
  /**
   * Trickle a single ICE candidate to `remotePeerId`. Pass `null` to
   * signal end-of-candidates per the WebRTC spec.
   */
  sendIce: (
    remotePeerId: string,
    candidate: RTCIceCandidateInit | null
  ) => void;
  /** Tell `remotePeerId` we are leaving the mesh. */
  sendLeave: (remotePeerId: string) => void;
  /** True iff `dispose()` has been called. */
  isDisposed: () => boolean;
  /** Tear down — unsubscribe from sync-client, drop subscribers, idempotent. */
  dispose: () => void;
};

// -----------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------

export function createSignaling(opts: SignalingOptions): Signaling {
  if (typeof opts.localPeerId !== "string" || opts.localPeerId.length === 0) {
    throw new Error("[signaling] localPeerId must be a non-empty string");
  }
  const { syncClient, localPeerId } = opts;
  const sid = opts.sessionId ?? "?";
  const log: SignalingLogger =
    opts.log ?? {
      log: (msg: string, ...rest: unknown[]) =>
        console.log(`[signaling] avx=${sid} peer=${localPeerId} ${msg}`, ...rest),
      warn: (msg: string, ...rest: unknown[]) =>
        console.warn(`[signaling] avx=${sid} peer=${localPeerId} ${msg}`, ...rest),
      error: (msg: string, ...rest: unknown[]) =>
        console.error(`[signaling] avx=${sid} peer=${localPeerId} ${msg}`, ...rest),
    };

  const subs = new Set<SignalHandler>();
  let disposed = false;

  const unsubscribe = syncClient.onRemoteSignal((fromPeerId, targetPeerId, payload) => {
    if (disposed) return;
    // Demux: only signals addressed to us. Without this filter, a
    // 3-peer mesh would deliver peerC's signals to peerA's handler
    // when only peerB should see them. The sync-client cannot do
    // this filter — it doesn't know whose handler is whose.
    if (targetPeerId !== localPeerId) return;

    if (typeof fromPeerId !== "string" || fromPeerId.length === 0) {
      log.warn(`drop signal: empty fromPeerId`);
      return;
    }
    if (fromPeerId === localPeerId) {
      // Defense-in-depth: sync-client already suppresses own echoes
      // via envelope peerId, but if a future relay/test setup
      // bypasses that, dropping here protects peer-mesh from
      // applying its own SDP back to itself.
      log.warn(`drop self-signal echo`);
      return;
    }

    log.log(
      `recv kind=${payload.type} from=${fromPeerId}` +
        (payload.type === "ice" ? ` endOfCandidates=${payload.candidate === null}` : "")
    );
    // Iterate over a snapshot so a handler that unsubscribes itself
    // mid-fan doesn't disturb the loop.
    for (const cb of Array.from(subs)) {
      try {
        cb(fromPeerId, payload);
      } catch (err) {
        log.warn(`signal handler threw:`, (err as Error)?.message ?? String(err));
      }
    }
  });

  function validTarget(remotePeerId: string, opName: string): boolean {
    if (disposed) {
      log.warn(`${opName}: ignored (disposed)`);
      return false;
    }
    if (typeof remotePeerId !== "string" || remotePeerId.length === 0) {
      log.warn(`${opName}: bad remotePeerId`);
      return false;
    }
    if (remotePeerId === localPeerId) {
      log.warn(`${opName}: cannot send signal to self`);
      return false;
    }
    return true;
  }

  return {
    onSignal: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    sendOffer: (remotePeerId, sdp) => {
      if (!validTarget(remotePeerId, "sendOffer")) return;
      if (typeof sdp !== "string" || sdp.length === 0) {
        log.warn(`sendOffer: bad sdp`);
        return;
      }
      log.log(`send kind=offer target=${remotePeerId}`);
      syncClient.broadcastSignal(remotePeerId, { type: "offer", sdp });
    },
    sendAnswer: (remotePeerId, sdp) => {
      if (!validTarget(remotePeerId, "sendAnswer")) return;
      if (typeof sdp !== "string" || sdp.length === 0) {
        log.warn(`sendAnswer: bad sdp`);
        return;
      }
      log.log(`send kind=answer target=${remotePeerId}`);
      syncClient.broadcastSignal(remotePeerId, { type: "answer", sdp });
    },
    sendIce: (remotePeerId, candidate) => {
      if (!validTarget(remotePeerId, "sendIce")) return;
      log.log(
        `send kind=ice target=${remotePeerId} endOfCandidates=${candidate === null}`
      );
      syncClient.broadcastSignal(remotePeerId, { type: "ice", candidate });
    },
    sendLeave: (remotePeerId) => {
      if (!validTarget(remotePeerId, "sendLeave")) return;
      log.log(`send kind=leave target=${remotePeerId}`);
      syncClient.broadcastSignal(remotePeerId, { type: "leave" });
    },
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribe();
      } catch (err) {
        log.warn(`dispose: unsubscribe threw:`, (err as Error)?.message ?? String(err));
      }
      subs.clear();
      log.log(`disposed`);
    },
  };
}
