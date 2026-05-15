"use client";

/**
 * WebRTC peer-mesh — Phase 4a.
 *
 * Owns a `Map<remotePeerId, RTCPeerConnection>` and the
 * perfect-negotiation state per pair. Pure-JS module: no DOM, no
 * `MediaStream` instantiation, no `getUserMedia` calls. Local
 * tracks are supplied by the host via `getLocalTracks(remotePeerId)`
 * so Phase 4b (the `useLiveAV` hook) can own all browser
 * media-capture concerns without touching this module.
 *
 * Pillar 1 invariant — peer-mesh is keyed on `peerId: string`, not
 * "us vs them" booleans. Tutor + N students works the same as
 * 1:1 from day one.
 *
 * Pillar 6 invariant — signaling rides the encrypted sync-client
 * envelope via the `signaling.ts` muxer; peer-mesh never touches
 * sync-client directly.
 *
 * Per-session ID logging contract (mandatory; AGENTS.md):
 *
 *   [peer-mesh] avx=<sessionId> peer=<remotePeerId>
 *               event=<negotiation|ice|state|restart|dispose|...>
 *               from=<state> to=<state> reason=<why>
 *
 * `avx` is the live-A/V session-level prefix. The per-peer subkey
 * `peer=<remotePeerId>` scopes every line so prod debugging of a
 * mesh with ≥3 peers can grep one peer's events out of the mix.
 *
 * Tests: `src/__tests__/av/peer-mesh.test.ts` — Jest with a typed
 * `RTCPeerConnection` test double. No native bindings.
 */

import type {
  Signaling,
  SignalingLogger,
  SignalHandler,
} from "@/lib/av/signaling";
import type { WhiteboardWireSignalPayload } from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Public types
// -----------------------------------------------------------------

export type PeerMeshLogger = SignalingLogger;

/**
 * Factory hook so tests inject a `FakePeerConnection`. Production
 * callers pass `(c) => new RTCPeerConnection(c)` (default).
 */
export type PeerConnectionFactory = (
  config: RTCConfiguration
) => RTCPeerConnection;

/**
 * Default ICE configuration — public STUN only. Per Pillar 6 +
 * Phase 4a scope: no TURN until field reports show NAT-traversal
 * failures in real Sarah sessions. Google's free STUN servers are
 * the same set Excalidraw and most reference WebRTC apps use.
 */
export const DEFAULT_ICE_SERVERS: ReadonlyArray<RTCIceServer> = Object.freeze([
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]);

export type PeerMeshOptions = {
  signaling: Signaling;
  /**
   * Stable peer id for THIS client. Used for perfect-negotiation
   * polite/impolite role assignment (lex comparison against
   * remotePeerId), NOT for envelope addressing — signaling.ts
   * handles that.
   */
  localPeerId: string;
  /**
   * STUN/TURN servers. Defaults to `DEFAULT_ICE_SERVERS` (public
   * STUN only). Pass `[]` for tests that want zero ICE chatter.
   */
  iceServers?: ReadonlyArray<RTCIceServer>;
  /**
   * Called whenever a peer's `RTCPeerConnection` is created (on
   * `addPeer` or on first inbound offer if implicit-add is enabled
   * in a later phase). Return the local tracks that should be
   * `addTrack`-ed to the PC. Default returns `[]` — peer-mesh
   * unit tests never attach real tracks.
   */
  getLocalTracks?: (remotePeerId: string) => MediaStreamTrack[];
  /**
   * Optional session id for logging. See module docblock.
   */
  sessionId?: string;
  log?: PeerMeshLogger;
  /**
   * Test-only — inject a fake `RTCPeerConnection` constructor.
   * Production leaves this undefined.
   */
  _pcFactory?: PeerConnectionFactory;
};

export type RemoteTrackHandler = (
  peerId: string,
  track: MediaStreamTrack,
  streams: ReadonlyArray<MediaStream>
) => void;

export type PeerConnectionStateHandler = (
  peerId: string,
  connectionState: RTCPeerConnectionState
) => void;

export type IceConnectionStateHandler = (
  peerId: string,
  iceConnectionState: RTCIceConnectionState
) => void;

export type PeerMesh = {
  /**
   * Create a `RTCPeerConnection` for `peerId` and attach local
   * tracks. Idempotent: a second `addPeer(p)` is a no-op.
   * The peer must not be the local peer (cannot self-connect).
   */
  addPeer: (peerId: string) => void;
  /**
   * Close the PC for `peerId`, drop callbacks, send a `leave`
   * signal to the remote side, and remove the entry. Idempotent.
   */
  removePeer: (peerId: string) => void;
  /** Current peer set (snapshot — does not auto-update). */
  peers: () => ReadonlySet<string>;
  /**
   * Manually trigger an ICE restart for `peerId`. Used by the
   * `iceConnectionState === "failed"` auto-restart for the polite
   * side, AND exposed publicly so a host can force-restart on a
   * higher-level signal (e.g. UI "Reconnect" button in 4c/4d).
   */
  restart: (peerId: string) => void;
  /**
   * Subscribe to remote `track` events. Multiple subscribers
   * allowed. Returns unsubscriber.
   */
  onRemoteTrack: (cb: RemoteTrackHandler) => () => void;
  /** Subscribe to per-peer `connectionState` changes. */
  onPeerConnectionStateChange: (cb: PeerConnectionStateHandler) => () => void;
  /**
   * Subscribe to per-peer `iceConnectionState` changes. Surfaced
   * separately because the lifecycle FSM in Phase 4b will care
   * about `iceConnectionState === "disconnected"` (peer paused
   * but not failed) distinctly from `connectionState`.
   */
  onIceConnectionStateChange: (cb: IceConnectionStateHandler) => () => void;
  /** True iff `dispose()` has been called. */
  isDisposed: () => boolean;
  /**
   * Tear down — close every PC, unsubscribe from signaling, fire
   * no further callbacks. Idempotent.
   */
  dispose: () => void;
};

// -----------------------------------------------------------------
// Internal per-peer state
// -----------------------------------------------------------------

type PeerEntry = {
  remotePeerId: string;
  pc: RTCPeerConnection;
  /**
   * Perfect-negotiation polite role. `localPeerId > remotePeerId`
   * (lex) is polite; the polite peer defers/rolls back on glare
   * AND drives the ICE restart on `iceConnectionState === "failed"`
   * (per the Phase 4a bootstrapper's spec). The impolite peer
   * waits.
   */
  polite: boolean;
  /** True while we're in the middle of sending an offer (between createOffer and setLocalDescription completing). */
  makingOffer: boolean;
  /** True while we've decided to ignore an incoming offer due to glare-impolite. */
  ignoreOffer: boolean;
  /** True after the remote description is set (offer or answer applied). */
  hasRemoteDescription: boolean;
  /** ICE candidates that arrived before the remote description was set; drained after. */
  pendingCandidates: RTCIceCandidateInit[];
  /** Marks the entry as closed; further callbacks are silently dropped. */
  closed: boolean;
};

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function decidePolite(localPeerId: string, remotePeerId: string): boolean {
  // Convention: polite = local id sorts AFTER remote id (lex). The
  // direction is arbitrary as long as it's deterministic and the
  // two peers compute opposite values for the same pair, which
  // lexicographic comparison guarantees.
  return localPeerId > remotePeerId;
}

function candidateToInit(
  candidate: RTCIceCandidate | null
): RTCIceCandidateInit | null {
  if (candidate === null) return null;
  // Some browsers emit `{ candidate: "" }` as the end-of-candidates
  // sentinel instead of a true `null`. Normalize at the wire boundary
  // so the receiver never has to special-case it (and so a peer on a
  // newer client speaking to a peer on an older one still works).
  if (typeof candidate.candidate === "string" && candidate.candidate.length === 0) {
    return null;
  }
  // Modern API exposes .toJSON(); we never assume it because the
  // test double does not implement it. Hand-extract instead.
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    usernameFragment: candidate.usernameFragment ?? null,
  };
}

// -----------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------

export function createPeerMesh(opts: PeerMeshOptions): PeerMesh {
  if (typeof opts.localPeerId !== "string" || opts.localPeerId.length === 0) {
    throw new Error("[peer-mesh] localPeerId must be a non-empty string");
  }
  const { signaling, localPeerId } = opts;
  const sid = opts.sessionId ?? "?";
  const iceServers = opts.iceServers ?? DEFAULT_ICE_SERVERS;
  const getLocalTracks = opts.getLocalTracks ?? (() => []);
  const pcFactory: PeerConnectionFactory =
    opts._pcFactory ??
    ((config) => new RTCPeerConnection(config));
  const log: PeerMeshLogger =
    opts.log ?? {
      log: (msg: string, ...rest: unknown[]) =>
        console.log(`[peer-mesh] avx=${sid} ${msg}`, ...rest),
      warn: (msg: string, ...rest: unknown[]) =>
        console.warn(`[peer-mesh] avx=${sid} ${msg}`, ...rest),
      error: (msg: string, ...rest: unknown[]) =>
        console.error(`[peer-mesh] avx=${sid} ${msg}`, ...rest),
    };

  const peers = new Map<string, PeerEntry>();
  const trackSubs = new Set<RemoteTrackHandler>();
  const connStateSubs = new Set<PeerConnectionStateHandler>();
  const iceStateSubs = new Set<IceConnectionStateHandler>();
  let disposed = false;

  // ---------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------

  function fan<Args extends unknown[]>(
    set: Set<(...a: Args) => void>,
    ...args: Args
  ): void {
    for (const cb of Array.from(set)) {
      try {
        cb(...args);
      } catch (err) {
        log.warn(
          `subscriber threw:`,
          (err as Error)?.message ?? String(err)
        );
      }
    }
  }

  function lifeOf(peerId: string): PeerEntry | null {
    const entry = peers.get(peerId);
    if (!entry || entry.closed) return null;
    return entry;
  }

  /**
   * Create the PC, wire up event handlers, attach local tracks.
   * Caller must NOT have an entry for `remotePeerId` already (we
   * check via the closed flag).
   */
  function createPeerEntry(remotePeerId: string): PeerEntry {
    const pc = pcFactory({ iceServers: Array.from(iceServers) });
    const polite = decidePolite(localPeerId, remotePeerId);
    log.log(
      `peer=${remotePeerId} event=add polite=${polite} iceServers=${iceServers.length}`
    );

    const entry: PeerEntry = {
      remotePeerId,
      pc,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      hasRemoteDescription: false,
      pendingCandidates: [],
      closed: false,
    };

    pc.onnegotiationneeded = () => {
      if (entry.closed) return;
      void (async () => {
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer();
          if (entry.closed) return;
          await pc.setLocalDescription(offer);
          if (entry.closed) return;
          log.log(`peer=${remotePeerId} event=offer-send`);
          signaling.sendOffer(remotePeerId, offer.sdp ?? "");
        } catch (err) {
          log.error(
            `peer=${remotePeerId} event=offer-fail reason=${(err as Error)?.message ?? String(err)}`
          );
        } finally {
          entry.makingOffer = false;
        }
      })();
    };

    pc.onicecandidate = (ev) => {
      if (entry.closed) return;
      const c = candidateToInit(ev.candidate);
      log.log(
        `peer=${remotePeerId} event=ice-send endOfCandidates=${c === null}`
      );
      signaling.sendIce(remotePeerId, c);
    };

    pc.ontrack = (ev) => {
      if (entry.closed) return;
      log.log(
        `peer=${remotePeerId} event=remote-track kind=${ev.track.kind} id=${ev.track.id}`
      );
      fan(
        trackSubs,
        remotePeerId,
        ev.track,
        ev.streams as unknown as ReadonlyArray<MediaStream>
      );
    };

    pc.oniceconnectionstatechange = () => {
      if (entry.closed) return;
      const state = pc.iceConnectionState;
      log.log(`peer=${remotePeerId} event=ice-state to=${state}`);
      fan(iceStateSubs, remotePeerId, state);
      // Auto-restart on failure for the polite side. The impolite
      // peer waits — if both sides tried to restart simultaneously
      // we'd be back in glare. Polite-only initiation avoids that.
      if (state === "failed" && entry.polite) {
        log.log(
          `peer=${remotePeerId} event=auto-restart reason=ice-failed`
        );
        restartInternal(entry);
      }
    };

    pc.onconnectionstatechange = () => {
      if (entry.closed) return;
      log.log(
        `peer=${remotePeerId} event=conn-state to=${pc.connectionState}`
      );
      fan(connStateSubs, remotePeerId, pc.connectionState);
    };

    // Attach local tracks AFTER event handlers are wired so the
    // `onnegotiationneeded` fired by addTrack() is captured.
    let tracks: MediaStreamTrack[] = [];
    try {
      tracks = getLocalTracks(remotePeerId) ?? [];
    } catch (err) {
      log.warn(
        `peer=${remotePeerId} event=local-tracks-fail reason=${(err as Error)?.message ?? String(err)}`
      );
    }
    for (const track of tracks) {
      try {
        pc.addTrack(track);
      } catch (err) {
        log.warn(
          `peer=${remotePeerId} event=addtrack-fail kind=${track.kind} reason=${(err as Error)?.message ?? String(err)}`
        );
      }
    }

    return entry;
  }

  // ---------------------------------------------------------------
  // Signal handler — perfect negotiation per peer
  // ---------------------------------------------------------------

  const handleSignal: SignalHandler = (fromPeerId, payload) => {
    if (disposed) return;
    const entry = lifeOf(fromPeerId);
    if (!entry) {
      // No PC for this peer yet. In Phase 4a, the host (`useLiveAV`
      // in 4b) is responsible for calling `addPeer(fromPeerId)`
      // before the first inbound signal lands. If we see a signal
      // without an entry, drop it with a warning — auto-add is
      // out of scope for 4a.
      log.warn(
        `peer=${fromPeerId} event=signal-no-entry type=${payload.type}`
      );
      return;
    }
    void applyInboundSignal(entry, payload);
  };

  async function applyInboundSignal(
    entry: PeerEntry,
    payload: WhiteboardWireSignalPayload
  ): Promise<void> {
    const { pc, remotePeerId } = entry;
    try {
      if (payload.type === "offer") {
        const offerCollision =
          entry.makingOffer || pc.signalingState !== "stable";
        entry.ignoreOffer = !entry.polite && offerCollision;
        if (entry.ignoreOffer) {
          log.log(
            `peer=${remotePeerId} event=offer-ignore reason=glare-impolite signalingState=${pc.signalingState}`
          );
          return;
        }
        if (offerCollision && entry.polite) {
          // Polite peer rolls back its own offer before accepting.
          log.log(
            `peer=${remotePeerId} event=glare-rollback signalingState=${pc.signalingState}`
          );
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch (err) {
            // Some browsers throw if there's no pending offer to
            // roll back. Log and continue — setRemoteDescription
            // below will assert the correct state.
            log.warn(
              `peer=${remotePeerId} event=rollback-fail reason=${(err as Error)?.message ?? String(err)}`
            );
          }
          if (entry.closed) return;
        }
        await pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
        if (entry.closed) return;
        entry.hasRemoteDescription = true;
        await drainPendingCandidates(entry);
        if (entry.closed) return;
        const answer = await pc.createAnswer();
        if (entry.closed) return;
        await pc.setLocalDescription(answer);
        if (entry.closed) return;
        log.log(`peer=${remotePeerId} event=answer-send`);
        signaling.sendAnswer(remotePeerId, answer.sdp ?? "");
        return;
      }
      if (payload.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
        if (entry.closed) return;
        entry.hasRemoteDescription = true;
        await drainPendingCandidates(entry);
        log.log(`peer=${remotePeerId} event=answer-applied`);
        return;
      }
      if (payload.type === "ice") {
        if (!entry.hasRemoteDescription) {
          // Queue until setRemoteDescription is called. We still
          // queue null (end-of-candidates) because the recipient
          // may rely on it being applied AFTER the description.
          if (payload.candidate !== null) {
            entry.pendingCandidates.push(payload.candidate);
            log.log(
              `peer=${remotePeerId} event=ice-queue size=${entry.pendingCandidates.length}`
            );
          } else {
            log.log(
              `peer=${remotePeerId} event=ice-end-queue`
            );
          }
          return;
        }
        await applyIceCandidate(entry, payload.candidate);
        return;
      }
      if (payload.type === "leave") {
        log.log(`peer=${remotePeerId} event=remote-leave`);
        // Don't send a `leave` back — the remote already left. Just
        // close locally.
        closePeerEntryLocal(entry);
        return;
      }
    } catch (err) {
      log.error(
        `peer=${remotePeerId} event=signal-apply-fail type=${payload.type} reason=${(err as Error)?.message ?? String(err)}`
      );
    }
  }

  async function applyIceCandidate(
    entry: PeerEntry,
    candidate: RTCIceCandidateInit | null
  ): Promise<void> {
    try {
      // Spec allows passing `null` to signal end-of-candidates; some
      // implementations also accept `undefined`. Normalize.
      if (candidate === null) {
        // RTCPeerConnection.addIceCandidate(null) or addIceCandidate()
        // both work in modern browsers; the empty-init form is the
        // most portable.
        await entry.pc.addIceCandidate();
        return;
      }
      // Treat empty-string candidate as end-of-candidates sentinel.
      // Some browsers emit `{ candidate: "" }` instead of `null` from
      // their `onicecandidate` event; passing that empty string to
      // `addIceCandidate` causes "Error processing ICE candidate" on
      // Chrome. Normalize here.
      if (
        typeof candidate.candidate === "string" &&
        candidate.candidate.length === 0
      ) {
        log.log(
          `peer=${entry.remotePeerId} event=ice-end-of-candidates-empty-string-normalized`
        );
        await entry.pc.addIceCandidate();
        return;
      }
      await entry.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!entry.ignoreOffer) {
        // Ignore-offer is the perfect-negotiation flag for "I'm
        // dropping this peer's offer due to glare-impolite"; ICE
        // failures during that window are expected and silent.
        //
        // Include diagnostic fields so we can tell apart different
        // failure modes (malformed candidate, m-line mismatch, PC
        // in wrong state, etc.) without re-deploying.
        const reason = (err as Error)?.message ?? String(err);
        const sdpMidStr =
          candidate === null
            ? "<eoc>"
            : candidate.sdpMid === null || candidate.sdpMid === undefined
              ? "null"
              : `'${candidate.sdpMid}'`;
        const sdpMLineIndexStr =
          candidate === null
            ? "<eoc>"
            : candidate.sdpMLineIndex === null || candidate.sdpMLineIndex === undefined
              ? "null"
              : String(candidate.sdpMLineIndex);
        const candidateStr =
          candidate === null
            ? "<eoc>"
            : (candidate.candidate ?? "<missing>").slice(0, 80);
        log.warn(
          `peer=${entry.remotePeerId} event=ice-apply-fail reason=${reason}` +
            ` sdpMid=${sdpMidStr} sdpMLineIndex=${sdpMLineIndexStr}` +
            ` signalingState=${entry.pc.signalingState}` +
            ` iceConnectionState=${entry.pc.iceConnectionState}` +
            ` hasRemoteDescription=${entry.hasRemoteDescription}` +
            ` candidate='${candidateStr}'`
        );
      }
    }
  }

  async function drainPendingCandidates(entry: PeerEntry): Promise<void> {
    if (entry.pendingCandidates.length === 0) return;
    const queued = entry.pendingCandidates.slice();
    entry.pendingCandidates.length = 0;
    log.log(
      `peer=${entry.remotePeerId} event=ice-drain count=${queued.length}`
    );
    for (const c of queued) {
      if (entry.closed) return;
      await applyIceCandidate(entry, c);
    }
  }

  // ---------------------------------------------------------------
  // Restart
  // ---------------------------------------------------------------

  function restartInternal(entry: PeerEntry): void {
    if (entry.closed) return;
    void (async () => {
      try {
        entry.makingOffer = true;
        const offer = await entry.pc.createOffer({ iceRestart: true });
        if (entry.closed) return;
        await entry.pc.setLocalDescription(offer);
        if (entry.closed) return;
        log.log(`peer=${entry.remotePeerId} event=restart-send`);
        signaling.sendOffer(entry.remotePeerId, offer.sdp ?? "");
      } catch (err) {
        log.error(
          `peer=${entry.remotePeerId} event=restart-fail reason=${(err as Error)?.message ?? String(err)}`
        );
      } finally {
        entry.makingOffer = false;
      }
    })();
  }

  // ---------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------

  function closePeerEntryLocal(entry: PeerEntry): void {
    if (entry.closed) return;
    entry.closed = true;
    peers.delete(entry.remotePeerId);
    try {
      // Detach event handlers FIRST so no late callback fires once
      // we close the PC.
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onnegotiationneeded = null;
      entry.pc.oniceconnectionstatechange = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.onsignalingstatechange = null;
    } catch (err) {
      log.warn(
        `peer=${entry.remotePeerId} event=detach-fail reason=${(err as Error)?.message ?? String(err)}`
      );
    }
    try {
      entry.pc.close();
    } catch (err) {
      log.warn(
        `peer=${entry.remotePeerId} event=close-fail reason=${(err as Error)?.message ?? String(err)}`
      );
    }
  }

  // ---------------------------------------------------------------
  // Wire signaling
  // ---------------------------------------------------------------

  const unsubscribeFromSignaling = signaling.onSignal(handleSignal);

  // ---------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------

  return {
    addPeer: (peerId: string) => {
      if (disposed) {
        log.warn(`addPeer: ignored (disposed) peer=${peerId}`);
        return;
      }
      if (typeof peerId !== "string" || peerId.length === 0) {
        log.warn(`addPeer: bad peerId`);
        return;
      }
      if (peerId === localPeerId) {
        log.warn(`addPeer: cannot add self peer=${peerId}`);
        return;
      }
      if (peers.has(peerId)) {
        log.log(`peer=${peerId} event=add-skip reason=already-present`);
        return;
      }
      const entry = createPeerEntry(peerId);
      peers.set(peerId, entry);
    },
    removePeer: (peerId: string) => {
      if (disposed) return;
      const entry = lifeOf(peerId);
      if (!entry) return;
      log.log(`peer=${peerId} event=remove`);
      // Notify the remote peer; best-effort, signaling.send is a
      // no-op if it's been disposed.
      try {
        signaling.sendLeave(peerId);
      } catch (err) {
        log.warn(
          `peer=${peerId} event=leave-send-fail reason=${(err as Error)?.message ?? String(err)}`
        );
      }
      closePeerEntryLocal(entry);
    },
    peers: () => new Set(peers.keys()),
    restart: (peerId: string) => {
      if (disposed) return;
      const entry = lifeOf(peerId);
      if (!entry) {
        log.warn(`restart: no entry for peer=${peerId}`);
        return;
      }
      log.log(`peer=${peerId} event=restart-manual`);
      restartInternal(entry);
    },
    onRemoteTrack: (cb) => {
      trackSubs.add(cb);
      return () => {
        trackSubs.delete(cb);
      };
    },
    onPeerConnectionStateChange: (cb) => {
      connStateSubs.add(cb);
      return () => {
        connStateSubs.delete(cb);
      };
    },
    onIceConnectionStateChange: (cb) => {
      iceStateSubs.add(cb);
      return () => {
        iceStateSubs.delete(cb);
      };
    },
    isDisposed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        unsubscribeFromSignaling();
      } catch (err) {
        log.warn(
          `dispose: unsubscribe threw: ${(err as Error)?.message ?? String(err)}`
        );
      }
      for (const id of Array.from(peers.keys())) {
        const entry = peers.get(id);
        if (entry) closePeerEntryLocal(entry);
      }
      trackSubs.clear();
      connStateSubs.clear();
      iceStateSubs.clear();
      log.log(`event=dispose`);
    },
  };
}
