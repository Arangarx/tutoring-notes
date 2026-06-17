/**
 * Unit tests for `src/lib/av/peer-mesh.ts` — Phase 4a.
 *
 * Pure Jest, no DOM, no `wrtc`/native binding. The fake
 * `RTCPeerConnection` (`FakePc`) below implements just enough of the
 * WebRTC surface that peer-mesh actually touches:
 *
 *   - createOffer / createAnswer (returns a fake SDP)
 *   - setLocalDescription / setRemoteDescription (tracks signalingState)
 *   - setLocalDescription({ type: "rollback" }) (for glare rollback)
 *   - addIceCandidate (records the candidate)
 *   - addTrack / close
 *   - event handler properties (onnegotiationneeded, onicecandidate,
 *     ontrack, oniceconnectionstatechange, onconnectionstatechange,
 *     onsignalingstatechange)
 *   - signalingState / iceConnectionState / connectionState properties
 *
 * Tests cover the bootstrapper's required matrix:
 *
 *   - Outgoing offer happy path (negotiationneeded → offer → answer → ICE → connected).
 *   - Polite vs impolite role determined by lexicographic local/remote id.
 *   - Glare resolution: simultaneous offers from both sides — polite
 *     rolls back its own offer, impolite ignores the inbound offer.
 *   - ICE trickle ordering: candidates received BEFORE the remote
 *     description are queued and applied immediately after.
 *   - removePeer closes the PC and stops firing callbacks.
 *   - 3-peer mesh fan-out: addPeer("B") then addPeer("C") creates two
 *     independent PCs, signals scoped per-peer (no cross-talk).
 *   - Auto-restart: iceConnectionState === "failed" triggers an
 *     iceRestart offer for the POLITE side; impolite waits.
 *
 * Logging contract is asserted at the `avx=<sid> peer=<id>` shape.
 */

import {
  createPeerMesh,
  type PeerMesh,
  type PeerMeshLogger,
  type PeerConnectionFactory,
} from "@/lib/av/peer-mesh";
import type {
  Signaling,
  SignalHandler,
  SignalingLogger,
} from "@/lib/av/signaling";
import type { WhiteboardWireSignalPayload } from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Fake RTCPeerConnection — just enough surface for peer-mesh.ts
// -----------------------------------------------------------------

type FakePcSend = { targetPeerId?: string; type: string; [k: string]: unknown };

/**
 * Minimal RTCPeerConnection double. Tests drive it via the `_trigger*`
 * helpers; peer-mesh code reads the event-handler properties and the
 * three state fields. SDP strings are opaque tokens — the fake never
 * parses them.
 */
class FakePc {
  signalingState: RTCSignalingState = "stable";
  iceConnectionState: RTCIceConnectionState = "new";
  connectionState: RTCPeerConnectionState = "new";

  onnegotiationneeded: ((this: RTCPeerConnection, ev: Event) => unknown) | null = null;
  onicecandidate:
    | ((this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) => unknown)
    | null = null;
  ontrack: ((this: RTCPeerConnection, ev: RTCTrackEvent) => unknown) | null = null;
  oniceconnectionstatechange:
    | ((this: RTCPeerConnection, ev: Event) => unknown)
    | null = null;
  onconnectionstatechange:
    | ((this: RTCPeerConnection, ev: Event) => unknown)
    | null = null;
  onsignalingstatechange:
    | ((this: RTCPeerConnection, ev: Event) => unknown)
    | null = null;

  config: RTCConfiguration;
  /** History of every method call against this fake, in order. */
  history: FakePcSend[] = [];
  /** RTCIceCandidateInit values passed to addIceCandidate (null = end). */
  iceApplied: (RTCIceCandidateInit | null | undefined)[] = [];
  /** Options passed to createOffer (iceRestart visible here). */
  createOfferCalls: RTCOfferOptions[] = [];
  /** Tracks added via addTrack — peer-mesh attaches local-track outputs here. */
  addedTracks: MediaStreamTrack[] = [];
  closed = false;

  constructor(config: RTCConfiguration = {}) {
    this.config = config;
  }

  async createOffer(opts: RTCOfferOptions = {}): Promise<RTCSessionDescriptionInit> {
    this.createOfferCalls.push(opts);
    this.history.push({ type: "createOffer" });
    return { type: "offer", sdp: `fake-offer-sdp${opts.iceRestart ? "-restart" : ""}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    this.history.push({ type: "createAnswer" });
    return { type: "answer", sdp: "fake-answer-sdp" };
  }

  async setLocalDescription(desc?: RTCSessionDescriptionInit | RTCLocalSessionDescriptionInit): Promise<void> {
    const t = (desc as { type?: string } | undefined)?.type ?? "(none)";
    this.history.push({ type: `setLocalDescription:${t}` });
    if (t === "offer") {
      this.signalingState = "have-local-offer";
    } else if (t === "answer") {
      this.signalingState = "stable";
      this._fireSignalingStateChange();
    } else if (t === "rollback") {
      this.signalingState = "stable";
      this._fireSignalingStateChange();
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.history.push({ type: `setRemoteDescription:${desc.type}` });
    if (desc.type === "offer") {
      this.signalingState = "have-remote-offer";
    } else if (desc.type === "answer") {
      this.signalingState = "stable";
      this._fireSignalingStateChange();
    }
  }

  /** Fire onsignalingstatechange — called automatically when state transitions to stable. */
  _fireSignalingStateChange(): void {
    this.onsignalingstatechange?.call(
      this as unknown as RTCPeerConnection,
      new Event("signalingstatechange")
    );
  }

  /** Test helper: manually set signalingState and fire onsignalingstatechange. */
  triggerSignalingStateChange(state: RTCSignalingState): void {
    this.signalingState = state;
    this._fireSignalingStateChange();
  }

  async addIceCandidate(candidate?: RTCIceCandidateInit | null): Promise<void> {
    this.history.push({ type: "addIceCandidate" });
    this.iceApplied.push(candidate ?? null);
  }

  addTrack(track: MediaStreamTrack, ..._streams: MediaStream[]): RTCRtpSender {
    this.history.push({ type: "addTrack" });
    this.addedTracks.push(track);
    const trackHolder: { current: MediaStreamTrack | null } = { current: track };
    const sender = {
      get track(): MediaStreamTrack | null {
        return trackHolder.current;
      },
      replaceTrack: async (next: MediaStreamTrack | null) => {
        this.history.push({ type: "replaceTrack" });
        trackHolder.current = next;
      },
    } as unknown as RTCRtpSender;
    this._senders.push(sender);
    return sender;
  }

  /** Senders backing `getSenders()` — populated by `addTrack`. */
  _senders: RTCRtpSender[] = [];

  getSenders(): RTCRtpSender[] {
    return [...this._senders];
  }

  close(): void {
    this.closed = true;
    this.history.push({ type: "close" });
  }

  // ---------------- test helpers ----------------

  triggerNegotiationNeeded(): void {
    this.onnegotiationneeded?.call(
      this as unknown as RTCPeerConnection,
      new Event("negotiationneeded")
    );
  }

  triggerIce(candidate: RTCIceCandidate | null): void {
    const ev = { candidate } as unknown as RTCPeerConnectionIceEvent;
    this.onicecandidate?.call(this as unknown as RTCPeerConnection, ev);
  }

  triggerTrack(track: MediaStreamTrack, streams: MediaStream[] = []): void {
    const ev = { track, streams } as unknown as RTCTrackEvent;
    this.ontrack?.call(this as unknown as RTCPeerConnection, ev);
  }

  setIceConnectionState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.call(
      this as unknown as RTCPeerConnection,
      new Event("iceconnectionstatechange")
    );
  }

  setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.call(
      this as unknown as RTCPeerConnection,
      new Event("connectionstatechange")
    );
  }
}

function makePcFactory(): {
  factory: PeerConnectionFactory;
  instances: FakePc[];
} {
  const instances: FakePc[] = [];
  const factory: PeerConnectionFactory = (config) => {
    const pc = new FakePc(config);
    instances.push(pc);
    return pc as unknown as RTCPeerConnection;
  };
  return { factory, instances };
}

// -----------------------------------------------------------------
// Fake signaling — exposes the inbound-handler hook + send history
// -----------------------------------------------------------------

type SignalSend =
  | { kind: "offer"; targetPeerId: string; sdp: string }
  | { kind: "answer"; targetPeerId: string; sdp: string }
  | { kind: "ice"; targetPeerId: string; candidate: RTCIceCandidateInit | null }
  | { kind: "leave"; targetPeerId: string };

type FakeSignaling = Signaling & {
  /** Test-only: deliver a remote signal to every onSignal subscriber. */
  inject: (fromPeerId: string, payload: WhiteboardWireSignalPayload) => void;
  sends: SignalSend[];
  subs: Set<SignalHandler>;
};

function makeFakeSignaling(): FakeSignaling {
  const subs = new Set<SignalHandler>();
  const sends: SignalSend[] = [];
  let disposed = false;
  const sig: FakeSignaling = {
    sends,
    subs,
    inject: (fromPeerId, payload) => {
      for (const cb of Array.from(subs)) cb(fromPeerId, payload);
    },
    onSignal: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    sendOffer: (targetPeerId, sdp) => {
      sends.push({ kind: "offer", targetPeerId, sdp });
    },
    sendAnswer: (targetPeerId, sdp) => {
      sends.push({ kind: "answer", targetPeerId, sdp });
    },
    sendIce: (targetPeerId, candidate) => {
      sends.push({ kind: "ice", targetPeerId, candidate });
    },
    sendLeave: (targetPeerId) => {
      sends.push({ kind: "leave", targetPeerId });
    },
    isDisposed: () => disposed,
    dispose: () => {
      disposed = true;
      subs.clear();
    },
  };
  return sig;
}

// -----------------------------------------------------------------
// Microtask-flush helpers (peer-mesh state machine is async via void
// IIFEs — we drive it forward by awaiting the microtask queue).
// -----------------------------------------------------------------

async function flush(n = 12): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function quietLog(): { log: PeerMeshLogger; lines: string[] } {
  const lines: string[] = [];
  const fn = (msg: string, ..._rest: unknown[]) => {
    lines.push(msg);
  };
  return {
    log: { log: fn, warn: fn, error: fn } as SignalingLogger,
    lines,
  };
}

function makeFakeTrack(kind: "audio" | "video" = "audio"): MediaStreamTrack {
  // We only need the structural surface peer-mesh touches: .kind and .id.
  return {
    kind,
    id: `${kind}-${Math.random().toString(36).slice(2, 8)}`,
    readyState: "live",
  } as unknown as MediaStreamTrack;
}

// =================================================================
// Constructor invariants
// =================================================================

describe("createPeerMesh — constructor invariants", () => {
  test("throws on empty localPeerId", () => {
    expect(() =>
      createPeerMesh({
        signaling: makeFakeSignaling(),
        localPeerId: "",
      })
    ).toThrow(/localPeerId/);
  });

  test("subscribes to signaling.onSignal exactly once", () => {
    const sig = makeFakeSignaling();
    createPeerMesh({ signaling: sig, localPeerId: "A" });
    expect(sig.subs.size).toBe(1);
  });

  test("dispose is idempotent and unsubscribes from signaling", () => {
    const sig = makeFakeSignaling();
    const m = createPeerMesh({ signaling: sig, localPeerId: "A" });
    m.dispose();
    m.dispose();
    expect(sig.subs.size).toBe(0);
    expect(m.isDisposed()).toBe(true);
  });
});

// =================================================================
// Polite vs impolite role
// =================================================================

describe("createPeerMesh — polite/impolite role from lex comparison", () => {
  test("'B' is polite vs remote 'A' (B > A lexicographically)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "B",
      _pcFactory: factory,
    });
    m.addPeer("A");
    expect(instances).toHaveLength(1);
    const pc = instances[0]!;

    // Simulate glare: WE send an offer first, THEN remote A's offer arrives.
    pc.triggerNegotiationNeeded();
    await flush();
    expect(sig.sends).toEqual([
      { kind: "offer", targetPeerId: "A", sdp: "fake-offer-sdp" },
    ]);
    // signalingState is now have-local-offer, so the next inbound
    // offer triggers glare. Polite peer rolls back its own offer.
    sig.inject("A", { type: "offer", sdp: "remote-offer-from-A" });
    await flush();
    // Polite rollback observed in PC history.
    const hist = pc.history.map((h) => h.type);
    expect(hist).toContain("setLocalDescription:rollback");
    expect(hist).toContain("setRemoteDescription:offer");
    expect(sig.sends.some((s) => s.kind === "answer")).toBe(true);
    m.dispose();
  });

  test("'A' is impolite vs remote 'B' (A < B lexicographically)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    // We send an offer first…
    pc.triggerNegotiationNeeded();
    await flush();
    expect(sig.sends.filter((s) => s.kind === "offer")).toHaveLength(1);
    // …then remote B's offer arrives. Impolite peer IGNORES the
    // inbound offer (no rollback, no setRemoteDescription, no
    // outgoing answer).
    const sendsBeforeGlare = sig.sends.length;
    const histBefore = pc.history.length;
    sig.inject("B", { type: "offer", sdp: "remote-offer-from-B" });
    await flush();
    expect(sig.sends.length).toBe(sendsBeforeGlare);
    const newHist = pc.history.slice(histBefore).map((h) => h.type);
    expect(newHist).not.toContain("setLocalDescription:rollback");
    expect(newHist).not.toContain("setRemoteDescription:offer");
    m.dispose();
  });
});

// =================================================================
// addPeer + removePeer lifecycle
// =================================================================

describe("createPeerMesh — addPeer/removePeer lifecycle", () => {
  test("addPeer creates a PC and attaches local tracks before negotiation handler is wired", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const track = makeFakeTrack("audio");
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [track],
    });
    m.addPeer("B");
    expect(instances).toHaveLength(1);
    const pc = instances[0]!;
    expect(pc.addedTracks).toEqual([track]);
    // Event handlers must be wired BEFORE addTrack so that any
    // implicit onnegotiationneeded fired during addTrack is captured.
    expect(pc.onnegotiationneeded).not.toBeNull();
    expect(pc.onicecandidate).not.toBeNull();
    expect(pc.ontrack).not.toBeNull();
    expect(pc.oniceconnectionstatechange).not.toBeNull();
    expect(pc.onconnectionstatechange).not.toBeNull();
    m.dispose();
  });

  test("addPeer is idempotent", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    m.addPeer("B");
    m.addPeer("B");
    expect(instances).toHaveLength(1);
    expect(m.peers()).toEqual(new Set(["B"]));
    m.dispose();
  });

  test("addPeer rejects self", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("A");
    expect(instances).toHaveLength(0);
    expect(m.peers().has("A")).toBe(false);
    m.dispose();
  });

  test("removePeer closes the PC, fires no further callbacks, and emits leave", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;
    const trackCb = jest.fn();
    const stateCb = jest.fn();
    m.onRemoteTrack(trackCb);
    m.onPeerConnectionStateChange(stateCb);

    m.removePeer("B");

    expect(pc.closed).toBe(true);
    expect(sig.sends.filter((s) => s.kind === "leave")).toEqual([
      { kind: "leave", targetPeerId: "B" },
    ]);
    expect(m.peers().has("B")).toBe(false);

    // Late callbacks on the closed PC must NOT propagate.
    pc.triggerTrack(makeFakeTrack(), []);
    pc.setConnectionState("connected");
    expect(trackCb).not.toHaveBeenCalled();
    expect(stateCb).not.toHaveBeenCalled();
    m.dispose();
  });

  test("removePeer on unknown peer is a no-op", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    expect(() => m.removePeer("never-added")).not.toThrow();
    expect(sig.sends).toEqual([]);
    m.dispose();
  });

  test("peers() returns a defensive snapshot, not a live view", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const snap = m.peers();
    m.addPeer("C");
    expect(snap.has("B")).toBe(true);
    expect(snap.has("C")).toBe(false);
    expect(m.peers().has("C")).toBe(true);
    m.dispose();
  });
});

// =================================================================
// Outgoing offer happy path
// =================================================================

describe("createPeerMesh — outgoing offer happy path", () => {
  test("addPeer + negotiationneeded → offer → answer → connected; ICE candidates trickled", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });

    const trackCb = jest.fn();
    const connState = jest.fn();
    const iceState = jest.fn();
    m.onRemoteTrack(trackCb);
    m.onPeerConnectionStateChange(connState);
    m.onIceConnectionStateChange(iceState);

    m.addPeer("B");
    const pc = instances[0]!;

    // 1. Negotiation fires (in real browsers, addTrack does this;
    //    with no tracks we trigger it manually for determinism).
    pc.triggerNegotiationNeeded();
    await flush();

    // 2. createOffer + setLocalDescription completed, signaling.sendOffer emitted.
    expect(sig.sends).toEqual([
      { kind: "offer", targetPeerId: "B", sdp: "fake-offer-sdp" },
    ]);
    expect(pc.history.map((h) => h.type)).toEqual(
      expect.arrayContaining([
        "createOffer",
        "setLocalDescription:offer",
      ])
    );

    // 3. Local ICE candidate trickles outbound via signaling.
    const fakeCandidate = {
      candidate: "candidate:1 1 udp 2113937151 192.0.2.1 54321 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: null,
    } as unknown as RTCIceCandidate;
    pc.triggerIce(fakeCandidate);
    expect(sig.sends.some((s) => s.kind === "ice" && s.targetPeerId === "B")).toBe(true);

    // End-of-candidates is signaled by candidate=null.
    pc.triggerIce(null);
    const lastIce = [...sig.sends].reverse().find((s) => s.kind === "ice");
    expect(lastIce).toEqual({ kind: "ice", targetPeerId: "B", candidate: null });

    // 4. Remote answers — peer-mesh applies the SDP.
    sig.inject("B", { type: "answer", sdp: "answer-sdp" });
    await flush();
    expect(pc.history.map((h) => h.type)).toContain("setRemoteDescription:answer");

    // 5. Remote track arrives — subscriber fires.
    const remoteTrack = makeFakeTrack("audio");
    pc.triggerTrack(remoteTrack, []);
    expect(trackCb).toHaveBeenCalledWith("B", remoteTrack, []);

    // 6. State transitions surfaced.
    pc.setIceConnectionState("checking");
    pc.setIceConnectionState("connected");
    expect(iceState).toHaveBeenCalledWith("B", "checking");
    expect(iceState).toHaveBeenCalledWith("B", "connected");
    pc.setConnectionState("connected");
    expect(connState).toHaveBeenCalledWith("B", "connected");

    m.dispose();
  });
});

// =================================================================
// Inbound offer happy path (impolite — no prior local offer)
// =================================================================

describe("createPeerMesh — inbound offer happy path", () => {
  test("inbound offer with no local offer in flight → setRemoteDescription → answer", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    sig.inject("B", { type: "offer", sdp: "remote-offer-from-B" });
    await flush();

    const types = pc.history.map((h) => h.type);
    expect(types).toContain("setRemoteDescription:offer");
    expect(types).toContain("createAnswer");
    expect(types).toContain("setLocalDescription:answer");
    expect(sig.sends).toEqual([
      { kind: "answer", targetPeerId: "B", sdp: "fake-answer-sdp" },
    ]);
    m.dispose();
  });
});

// =================================================================
// ICE trickle queuing (candidates arrive BEFORE remote description)
// =================================================================

describe("createPeerMesh — ICE trickle queuing", () => {
  test("candidates arriving before setRemoteDescription are queued and drained after", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    // Three ICE candidates arrive BEFORE the offer.
    const c1: RTCIceCandidateInit = { candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 };
    const c2: RTCIceCandidateInit = { candidate: "c2", sdpMid: "0", sdpMLineIndex: 0 };
    const c3: RTCIceCandidateInit = { candidate: "c3", sdpMid: "0", sdpMLineIndex: 0 };
    sig.inject("B", { type: "ice", candidate: c1 });
    sig.inject("B", { type: "ice", candidate: c2 });
    sig.inject("B", { type: "ice", candidate: c3 });
    await flush();

    // None applied yet — no remote description.
    expect(pc.iceApplied).toEqual([]);

    // Offer arrives — drain queue AFTER setRemoteDescription.
    sig.inject("B", { type: "offer", sdp: "remote-offer" });
    await flush();

    // The history must record setRemoteDescription BEFORE the
    // addIceCandidate drain calls.
    const types = pc.history.map((h) => h.type);
    const setRemoteIdx = types.indexOf("setRemoteDescription:offer");
    const firstIceIdx = types.indexOf("addIceCandidate");
    expect(setRemoteIdx).toBeGreaterThanOrEqual(0);
    expect(firstIceIdx).toBeGreaterThan(setRemoteIdx);

    // All three candidates applied, in arrival order.
    expect(pc.iceApplied).toEqual([c1, c2, c3]);
    m.dispose();
  });

  test("candidates arriving AFTER remote description apply immediately, not queued", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    sig.inject("B", { type: "offer", sdp: "remote-offer" });
    await flush();
    const beforeAddIce = pc.iceApplied.length;
    expect(beforeAddIce).toBe(0);

    const c: RTCIceCandidateInit = { candidate: "c-late", sdpMid: "0", sdpMLineIndex: 0 };
    sig.inject("B", { type: "ice", candidate: c });
    await flush();
    expect(pc.iceApplied).toEqual([c]);
    m.dispose();
  });

  test("end-of-candidates (null) before remote description is not queued, but a no-op", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    sig.inject("B", { type: "ice", candidate: null });
    await flush();
    expect(pc.iceApplied).toEqual([]);
    m.dispose();
  });

  test("sender normalizes empty-string-candidate emitted by onicecandidate to null on the wire", async () => {
    // Defense-in-depth pair to the receiver-side normalization: if a
    // browser fires `pc.onicecandidate` with `{ candidate: "" }`
    // instead of `null`, peer-mesh must NOT forward an empty-string
    // candidate over the wire — older clients (or strict browsers on
    // the other side) would reject it. The wire should carry `null`.
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    const emptyStringCandidate = {
      candidate: "",
      sdpMid: null,
      sdpMLineIndex: null,
      usernameFragment: null,
    } as unknown as RTCIceCandidate;
    pc.triggerIce(emptyStringCandidate);

    const lastIce = [...sig.sends].reverse().find((s) => s.kind === "ice");
    expect(lastIce).toEqual({ kind: "ice", targetPeerId: "B", candidate: null });
    m.dispose();
  });

  test("empty-string-candidate sentinel is normalized to null (Chrome compat)", async () => {
    // Some browsers emit `{ candidate: "" }` instead of `null` as the
    // end-of-candidates sentinel. Passing the empty string straight
    // to Chrome's `addIceCandidate` throws "Error processing ICE
    // candidate" — peer-mesh must normalize it back to null so the
    // call becomes a no-op.
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    sig.inject("B", { type: "offer", sdp: "remote-offer" });
    await flush();

    sig.inject("B", {
      type: "ice",
      candidate: { candidate: "", sdpMid: null, sdpMLineIndex: null },
    });
    await flush();

    // The fake PC records null for the end-of-candidates path, so
    // the normalized empty-string candidate should land as null
    // alongside any earlier real candidates (there are none in this
    // test).
    expect(pc.iceApplied).toEqual([null]);
    m.dispose();
  });
});

// =================================================================
// Glare resolution (simultaneous offers from both sides)
// =================================================================

describe("createPeerMesh — glare resolution", () => {
  test("polite side rolls back, impolite side ignores; both eventually converge", async () => {
    // Mesh-of-two: localA (impolite vs B) and localB (polite vs A).
    // We feed each one's outbound signals into the other one's
    // signaling inject helper to simulate the encrypted relay.
    const sigA = makeFakeSignaling();
    const sigB = makeFakeSignaling();
    const fa = makePcFactory();
    const fb = makePcFactory();
    const meshA = createPeerMesh({
      signaling: sigA,
      localPeerId: "A",
      _pcFactory: fa.factory,
    });
    const meshB = createPeerMesh({
      signaling: sigB,
      localPeerId: "B",
      _pcFactory: fb.factory,
    });
    meshA.addPeer("B");
    meshB.addPeer("A");
    const pcA = fa.instances[0]!;
    const pcB = fb.instances[0]!;

    // Both sides fire onnegotiationneeded simultaneously — classic glare.
    pcA.triggerNegotiationNeeded();
    pcB.triggerNegotiationNeeded();
    await flush();

    // Each sent its own offer.
    expect(sigA.sends.filter((s) => s.kind === "offer")).toHaveLength(1);
    expect(sigB.sends.filter((s) => s.kind === "offer")).toHaveLength(1);

    // Now cross-deliver each side's offer to the other.
    sigA.inject("B", { type: "offer", sdp: "B-offer" });
    sigB.inject("A", { type: "offer", sdp: "A-offer" });
    await flush();

    // A is impolite: must NOT have rolled back, must NOT have
    // setRemoteDescription:offer.
    const aTypes = pcA.history.map((h) => h.type);
    expect(aTypes).not.toContain("setLocalDescription:rollback");
    expect(aTypes).not.toContain("setRemoteDescription:offer");

    // B is polite: rolled back its own offer, applied A's offer,
    // and sent an answer.
    const bTypes = pcB.history.map((h) => h.type);
    expect(bTypes).toContain("setLocalDescription:rollback");
    expect(bTypes).toContain("setRemoteDescription:offer");
    expect(bTypes).toContain("createAnswer");
    expect(sigB.sends.filter((s) => s.kind === "answer")).toHaveLength(1);

    // B's answer eventually reaches A → setRemoteDescription:answer.
    sigA.inject("B", { type: "answer", sdp: "B-answer" });
    await flush();
    expect(pcA.history.map((h) => h.type)).toContain("setRemoteDescription:answer");

    meshA.dispose();
    meshB.dispose();
  });
});

// =================================================================
// ICE restart on connection failure
// =================================================================

describe("createPeerMesh — restart on iceConnectionState 'failed'", () => {
  test("polite side auto-restarts with iceRestart: true offer", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    // Local "B" is polite vs remote "A".
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "B",
      _pcFactory: factory,
    });
    m.addPeer("A");
    const pc = instances[0]!;

    // Drive through a normal negotiation first so signalingState is stable.
    pc.triggerNegotiationNeeded();
    await flush();
    sig.inject("A", { type: "answer", sdp: "x" });
    await flush();
    const sendsBeforeFail = sig.sends.length;

    // Now the connection fails.
    pc.setIceConnectionState("failed");
    await flush();

    // Polite side fires an ICE-restart offer.
    const sendsAfter = sig.sends.slice(sendsBeforeFail);
    expect(sendsAfter.filter((s) => s.kind === "offer")).toHaveLength(1);
    // The createOffer call carried iceRestart=true.
    expect(pc.createOfferCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ iceRestart: true })])
    );
    m.dispose();
  });

  test("impolite side does NOT auto-restart on failed — waits for the polite peer", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    // Local "A" is impolite vs remote "B".
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    pc.triggerNegotiationNeeded();
    await flush();
    sig.inject("B", { type: "answer", sdp: "x" });
    await flush();
    const sendsBeforeFail = sig.sends.length;

    pc.setIceConnectionState("failed");
    await flush();

    // No outgoing offer fired after failure.
    expect(sig.sends.slice(sendsBeforeFail).filter((s) => s.kind === "offer")).toHaveLength(0);
    // And createOffer was not called a second time.
    expect(pc.createOfferCalls).toHaveLength(1);
    m.dispose();
  });

  test("manual restart(peerId) fires an iceRestart offer regardless of polite role", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    // Local "A" is impolite vs "B" — but manual restart still works.
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;
    pc.triggerNegotiationNeeded();
    await flush();
    sig.inject("B", { type: "answer", sdp: "x" });
    await flush();

    const sendsBefore = sig.sends.length;
    m.restart("B");
    await flush();
    expect(sig.sends.slice(sendsBefore).filter((s) => s.kind === "offer")).toHaveLength(1);
    expect(pc.createOfferCalls.at(-1)).toEqual(
      expect.objectContaining({ iceRestart: true })
    );
    m.dispose();
  });

  test("restart on unknown peer is a no-op with a warning", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });
    m.restart("never-added");
    expect(lines.some((l) => /restart.*never-added|no entry/.test(l))).toBe(true);
    expect(sig.sends).toEqual([]);
    m.dispose();
  });
});

// =================================================================
// 3-peer mesh fan-out (tutor + 2 students canary)
// =================================================================

describe("createPeerMesh — 3-peer mesh fan-out", () => {
  test("addPeer('B') then addPeer('C') creates independent PCs, signals are scoped per peer", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });

    m.addPeer("B");
    m.addPeer("C");
    expect(instances).toHaveLength(2);
    const [pcB, pcC] = instances;
    expect(pcB).not.toBe(pcC);
    expect(m.peers()).toEqual(new Set(["B", "C"]));

    // Drive B's negotiation only — C must be untouched.
    pcB!.triggerNegotiationNeeded();
    await flush();
    expect(sig.sends.filter((s) => s.targetPeerId === "B" && s.kind === "offer"))
      .toHaveLength(1);
    expect(sig.sends.filter((s) => s.targetPeerId === "C")).toEqual([]);
    expect(pcC!.history).toEqual([]);

    // Inbound offer from C lands ONLY in C's PC.
    sig.inject("C", { type: "offer", sdp: "from-C" });
    await flush();
    expect(pcC!.history.map((h) => h.type)).toContain("setRemoteDescription:offer");
    // B's PC has not seen C's offer.
    expect(pcB!.history.map((h) => h.type).filter((t) => t === "setRemoteDescription:offer"))
      .toEqual([]);

    // Track callbacks fan out per-peer, identifying the source.
    const trackEvents: Array<{ peerId: string; trackId: string }> = [];
    m.onRemoteTrack((peerId, track) => {
      trackEvents.push({ peerId, trackId: track.id });
    });
    const tB = makeFakeTrack("audio");
    const tC = makeFakeTrack("audio");
    pcB!.triggerTrack(tB, []);
    pcC!.triggerTrack(tC, []);
    expect(trackEvents).toEqual([
      { peerId: "B", trackId: tB.id },
      { peerId: "C", trackId: tC.id },
    ]);

    // ICE state changes fan out per-peer.
    const iceEvents: Array<{ peerId: string; state: RTCIceConnectionState }> = [];
    m.onIceConnectionStateChange((peerId, state) => {
      iceEvents.push({ peerId, state });
    });
    pcB!.setIceConnectionState("connected");
    pcC!.setIceConnectionState("checking");
    expect(iceEvents).toEqual([
      { peerId: "B", state: "connected" },
      { peerId: "C", state: "checking" },
    ]);

    m.dispose();
  });

  test("removePeer one of three leaves the other two intact", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    m.addPeer("C");
    m.addPeer("D");
    const [pcB, pcC, pcD] = instances;
    expect(m.peers().size).toBe(3);

    m.removePeer("C");
    expect(pcB!.closed).toBe(false);
    expect(pcC!.closed).toBe(true);
    expect(pcD!.closed).toBe(false);
    expect(m.peers()).toEqual(new Set(["B", "D"]));

    // The remaining peers still negotiate normally.
    pcB!.triggerNegotiationNeeded();
    await flush();
    expect(sig.sends.some((s) => s.kind === "offer" && s.targetPeerId === "B")).toBe(true);

    m.dispose();
  });
});

// =================================================================
// Signal-from-unknown-peer drops cleanly
// =================================================================

describe("createPeerMesh — signal from unknown peer", () => {
  test("inbound OFFER from unknown peer triggers implicit-add + answer (May 15 hotfix #3)", async () => {
    // Pilot race this guards against:
    //   1. Wife joins a session; her useLiveAV builds the mesh and
    //      subscribes to onRoomPeersChange.
    //   2. The presence replay fires `addPeer(Andrew)` on wife's side
    //      → her negotiationneeded fires → she sends an offer.
    //   3. Andrew's mesh was already up, but the buffered-replay in
    //      sync-client delivers wife's offer to Andrew's signaling
    //      BEFORE Andrew's host has called `addPeer(wife)` (presence
    //      replay timing differs across tabs).
    //   4. Pre-hotfix #3: Andrew dropped the offer with
    //      `event=signal-no-entry`. The PCs never connected.
    //
    // With implicit-add, the offer creates the PC, fires
    // setRemoteDescription, and sends an answer — the connection
    // proceeds even though the host's addPeer hasn't landed yet.
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });

    sig.inject("Z", { type: "offer", sdp: "remote-offer-from-Z" });
    await flush();

    expect(m.peers().size).toBe(1);
    expect(m.peers().has("Z")).toBe(true);
    expect(instances.length).toBe(1);
    expect(instances[0]!.history.some((h) => h.type === "setRemoteDescription:offer")).toBe(true);
    expect(instances[0]!.history.some((h) => h.type === "createAnswer")).toBe(true);
    expect(
      sig.sends.some(
        (s) => s.kind === "answer" && s.targetPeerId === "Z" && s.sdp === "fake-answer-sdp"
      )
    ).toBe(true);
    expect(lines.some((l) => /implicit-add.*inbound-offer/.test(l))).toBe(true);

    // Host's later addPeer(Z) must be a no-op (idempotent).
    m.addPeer("Z");
    expect(instances.length).toBe(1);
    expect(lines.some((l) => /add-skip.*already-present/.test(l))).toBe(true);

    m.dispose();
  });

  test("inbound ANSWER from unknown peer warns and drops (NOT implicit-added — no PC ever sent an offer)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });

    sig.inject("Z", { type: "answer", sdp: "spurious-answer" });
    await flush();

    expect(m.peers().size).toBe(0);
    expect(instances.length).toBe(0);
    expect(sig.sends).toEqual([]);
    expect(lines.some((l) => /signal-no-entry.*type=answer/.test(l))).toBe(true);
    m.dispose();
  });

  test("inbound ICE from unknown peer warns and drops (NOT implicit-added — no remote description yet)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });

    sig.inject("Z", {
      type: "ice",
      candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0 },
    });
    await flush();

    expect(m.peers().size).toBe(0);
    expect(instances.length).toBe(0);
    expect(lines.some((l) => /signal-no-entry.*type=ice/.test(l))).toBe(true);
    m.dispose();
  });

  test("inbound LEAVE from unknown peer warns and drops (no-op — nothing to clean up)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });

    sig.inject("Z", { type: "leave" });
    await flush();

    expect(m.peers().size).toBe(0);
    expect(instances.length).toBe(0);
    expect(lines.some((l) => /signal-no-entry.*type=leave/.test(l))).toBe(true);
    m.dispose();
  });

  test("implicit-add ignores a self-targeted offer (defense-in-depth)", async () => {
    // signaling.ts already filters self-echoes, but if a future
    // relay/test bypass delivered a self-offer we must NOT create a
    // self-peer entry (every other peer-mesh invariant assumes
    // peerId !== localPeerId).
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      log,
    });

    sig.inject("A", { type: "offer", sdp: "self-echo-offer" });
    await flush();

    expect(m.peers().size).toBe(0);
    expect(instances.length).toBe(0);
    expect(lines.some((l) => /signal-no-entry-self-offer/.test(l))).toBe(true);
    m.dispose();
  });

  test("inbound 'leave' from a known peer closes that peer's PC without sending leave back", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    const pc = instances[0]!;

    sig.inject("B", { type: "leave" });
    await flush();

    expect(pc.closed).toBe(true);
    expect(m.peers().has("B")).toBe(false);
    // Note: we did NOT emit a leave back to B — they already left.
    expect(sig.sends.filter((s) => s.kind === "leave")).toEqual([]);
    m.dispose();
  });
});

// =================================================================
// Dispose tears everything down
// =================================================================

describe("createPeerMesh — dispose", () => {
  test("dispose closes every PC and silences callbacks", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.addPeer("B");
    m.addPeer("C");
    const trackCb = jest.fn();
    m.onRemoteTrack(trackCb);

    m.dispose();
    for (const pc of instances) expect(pc.closed).toBe(true);
    expect(sig.subs.size).toBe(0);

    // Late callbacks on closed PCs must not fire subscribers.
    instances[0]!.triggerTrack(makeFakeTrack(), []);
    expect(trackCb).not.toHaveBeenCalled();
  });

  test("addPeer/removePeer after dispose are no-ops", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
    });
    m.dispose();
    m.addPeer("B");
    m.removePeer("B");
    m.restart("B");
    expect(instances).toHaveLength(0);
    expect(sig.sends).toEqual([]);
  });
});

// =================================================================
// Logging shape — `avx=<sid> peer=<peerId>` per AGENTS.md contract
// =================================================================

describe("createPeerMesh — log shape", () => {
  test("default log carries `avx=<sid>` and `peer=<id>` subkeys", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "A",
        sessionId: "sess-7",
        _pcFactory: factory,
      });
      m.addPeer("B");
      const pc = instances[0]!;
      pc.triggerNegotiationNeeded();
      await flush();
      const all = logSpy.mock.calls.map((c) => String(c[0]));
      expect(all.some((l) => l.includes("avx=sess-7"))).toBe(true);
      expect(all.some((l) => l.includes("peer=B"))).toBe(true);
      // Specific transitions also logged.
      expect(all.some((l) => l.includes("event=add"))).toBe(true);
      expect(all.some((l) => l.includes("event=offer-send"))).toBe(true);
      m.dispose();
    } finally {
      logSpy.mockRestore();
    }
  });

  test("missing sessionId falls back to '?'", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "A",
        _pcFactory: factory,
      });
      m.addPeer("B");
      const all = logSpy.mock.calls.map((c) => String(c[0]));
      expect(all.some((l) => l.includes("avx=?"))).toBe(true);
      m.dispose();
    } finally {
      logSpy.mockRestore();
    }
  });
});

// =================================================================
// addLocalTrackToAllPeers — late-arriving track fan-out
//
// Regression: prior to May 15 evening, `useLiveAV`'s mesh-build
// effect included `localAudioStream` + `localVideoStream` in its
// dependency array. Acquiring the cam AFTER the mic (the natural
// flow when the tutor clicks "Allow microphone" → mesh builds →
// "Allow camera" later) forced a full mesh teardown + rebuild,
// dropping every remote peer's media for the duration. This
// method is the in-place alternative: each existing PC gets the
// new track via `pc.addTrack`, perfect-negotiation handles the
// rest, and remote peers see only a brief renegotiation pause
// (no media gap on already-flowing tracks).
// =================================================================

describe("createPeerMesh — addLocalTrackToAllPeers", () => {
  test("adds the track to every existing peer connection in one call", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      // No initial tracks — simulates "cam not granted at mesh build".
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.addPeer("C");
    expect(instances).toHaveLength(2);
    const [pcB, pcC] = instances as [FakePc, FakePc];
    expect(pcB.addedTracks).toEqual([]);
    expect(pcC.addedTracks).toEqual([]);

    const lateCamTrack = makeFakeTrack("video");
    m.addLocalTrackToAllPeers(lateCamTrack);

    expect(pcB.addedTracks).toEqual([lateCamTrack]);
    expect(pcC.addedTracks).toEqual([lateCamTrack]);
    m.dispose();
  });

  test("idempotent on the same track id — a second call is a no-op", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;

    const t = makeFakeTrack("video");
    m.addLocalTrackToAllPeers(t);
    m.addLocalTrackToAllPeers(t);
    m.addLocalTrackToAllPeers(t);
    // Only one addTrack call survived idempotency.
    expect(pc.addedTracks).toEqual([t]);
    m.dispose();
  });

  test("no-op when disposed", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;
    m.dispose();
    const t = makeFakeTrack("video");
    expect(() => m.addLocalTrackToAllPeers(t)).not.toThrow();
    expect(pc.addedTracks).toEqual([]);
  });

  test("no-op when track.readyState is 'ended' — never attach a dead track", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;
    const deadTrack = {
      kind: "video",
      id: "dead-1",
      readyState: "ended" as MediaStreamTrackState,
    } as unknown as MediaStreamTrack;
    m.addLocalTrackToAllPeers(deadTrack);
    expect(pc.addedTracks).toEqual([]);
    m.dispose();
  });

  test("triggers onnegotiationneeded on the PC so perfect-negotiation re-runs", async () => {
    // The real RTCPeerConnection fires negotiationneeded asynchronously
    // after addTrack. The FakePc does NOT auto-fire, but we can verify
    // that the event handler the mesh wired up still exists (i.e. the
    // mesh did NOT detach the PC), so a real browser would correctly
    // re-negotiate.
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;
    const negNeededBefore = pc.onnegotiationneeded;
    expect(negNeededBefore).not.toBeNull();

    m.addLocalTrackToAllPeers(makeFakeTrack("video"));
    expect(pc.onnegotiationneeded).toBe(negNeededBefore);

    // Now simulate the browser firing the event after addTrack; the
    // existing handler should produce a fresh offer via signaling.
    pc.triggerNegotiationNeeded();
    await flush();
    const offerSends = sig.sends.filter((s) => s.kind === "offer");
    expect(offerSends).toHaveLength(1);
    m.dispose();
  });
});

// =================================================================
// replaceLocalTrackOnAllPeers
// =================================================================

describe("createPeerMesh — replaceLocalTrackOnAllPeers", () => {
  test("calls replaceTrack on each peer's sender for the matching kind", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "host",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    const a1 = makeFakeTrack("audio");
    const a2 = makeFakeTrack("audio");
    m.addPeer("B");
    m.addPeer("C");
    m.addLocalTrackToAllPeers(a1);
    m.replaceLocalTrackOnAllPeers("audio", a2);
    expect(instances).toHaveLength(2);
    for (const pc of instances) {
      const fake = pc as FakePc;
      const audioSender = fake.getSenders().find((s) => s.track?.kind === "audio");
      expect(audioSender?.track?.id).toBe(a2.id);
      expect(
        fake.history.filter((h) => h.type === "replaceTrack")
      ).toHaveLength(1);
    }
    m.dispose();
  });

  test("no-op when there are no peers", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "host",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.replaceLocalTrackOnAllPeers("audio", makeFakeTrack("audio"));
    expect(instances).toHaveLength(0);
    m.dispose();
  });

  test("no replaceTrack when no sender matches the kind (defensive)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "host",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.addLocalTrackToAllPeers(makeFakeTrack("video"));
    m.replaceLocalTrackOnAllPeers("audio", makeFakeTrack("audio"));
    const pc = instances[0]! as FakePc;
    expect(pc.history.some((h) => h.type === "replaceTrack")).toBe(false);
    m.dispose();
  });
});

// =================================================================
// addLocalTrackToAllPeers — return value distinguishes add vs skip
//
// The return value `{ addedPeerIds, skippedPeerIds }` lets the caller
// (useLiveAV mid-session effect) branch on add-path vs hotswap-path
// without calling replaceTrack(sameTrack) on a freshly-created sender.
// =================================================================

describe("createPeerMesh — addLocalTrackToAllPeers return value", () => {
  test("returns addedPeerIds for peers where addTrack was called (new sender)", () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.addPeer("C");

    const t = makeFakeTrack("video");
    const result = m.addLocalTrackToAllPeers(t);

    expect(result.addedPeerIds).toEqual(new Set(["B", "C"]));
    expect(result.skippedPeerIds).toEqual(new Set());
    m.dispose();
  });

  test("returns skippedPeerIds for peers that already had the sender (idempotent second call)", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");

    const t = makeFakeTrack("video");
    m.addLocalTrackToAllPeers(t); // First call — adds the sender
    const result2 = m.addLocalTrackToAllPeers(t); // Second call — sender already present

    expect(result2.addedPeerIds).toEqual(new Set());
    expect(result2.skippedPeerIds).toEqual(new Set(["B"]));
    m.dispose();
  });

  test("returns empty sets when mesh is disposed", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.dispose();

    const result = m.addLocalTrackToAllPeers(makeFakeTrack("video"));
    expect(result.addedPeerIds.size).toBe(0);
    expect(result.skippedPeerIds.size).toBe(0);
  });

  test("returns empty sets when there are no peers", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });

    const result = m.addLocalTrackToAllPeers(makeFakeTrack("video"));
    expect(result.addedPeerIds.size).toBe(0);
    expect(result.skippedPeerIds.size).toBe(0);
    m.dispose();
  });

  test("mixed: one peer already had the track, another is new", () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.addPeer("C");

    const t = makeFakeTrack("video");
    // Give B the sender first
    m.addLocalTrackToAllPeers(t);
    // Now remove C so we can re-add only B having the track
    m.removePeer("C");
    m.addPeer("C"); // C's new PC has no senders yet

    const result = m.addLocalTrackToAllPeers(t);
    expect(result.addedPeerIds).toEqual(new Set(["C"]));
    expect(result.skippedPeerIds).toEqual(new Set(["B"]));
    m.dispose();
  });
});

// =================================================================
// triggerRenegotiationOnPeers — explicit renegotiation for late-add
//
// Primary fix for the "tutor never sees student's video" bug:
// after the student calls addLocalTrackToAllPeers for a video track,
// useLiveAV calls triggerRenegotiationOnPeers to guarantee an offer
// is sent even if the browser doesn't reliably re-fire
// onnegotiationneeded while mid-negotiation.
// =================================================================

describe("createPeerMesh — triggerRenegotiationOnPeers", () => {
  test("fires an offer immediately when PC is in stable state", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;

    // PC starts in stable state — trigger should fire an offer immediately.
    const sendsBefore = sig.sends.length;
    m.triggerRenegotiationOnPeers(["B"]);
    await flush();

    expect(sig.sends.slice(sendsBefore).filter((s) => s.kind === "offer")).toHaveLength(1);
    m.dispose();
  });

  test("defers (sets pendingRenegotiation) when PC is mid-negotiation (have-local-offer)", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;

    // Drive PC to have-local-offer (in-flight audio negotiation).
    pc.triggerNegotiationNeeded();
    await flush();
    expect(pc.signalingState).toBe("have-local-offer");

    const sendsBefore = sig.sends.length;
    m.triggerRenegotiationOnPeers(["B"]);
    await flush();

    // No additional offer yet — deferred.
    expect(sig.sends.slice(sendsBefore).filter((s) => s.kind === "offer")).toHaveLength(0);

    // Answer arrives → state returns to stable → pendingRenegotiation flushes.
    sig.inject("B", { type: "answer", sdp: "answer" });
    await flush();

    const offersAfterAnswer = sig.sends.slice(sendsBefore).filter((s) => s.kind === "offer");
    expect(offersAfterAnswer).toHaveLength(1);
    m.dispose();
  });

  test("logs event=renegotiation-triggered with peer= on trigger", async () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
      log,
    });
    m.addPeer("B");

    m.triggerRenegotiationOnPeers(["B"]);
    await flush();

    expect(lines.some((l) => /event=renegotiation-triggered/.test(l) && /peer=B/.test(l))).toBe(true);
    m.dispose();
  });

  test("logs event=renegotiation-flush when deferred offer finally fires", async () => {
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
      log,
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;

    // Force into mid-negotiation state.
    pc.triggerNegotiationNeeded();
    await flush();

    m.triggerRenegotiationOnPeers(["B"]);
    sig.inject("B", { type: "answer", sdp: "answer" });
    await flush();

    expect(lines.some((l) => /event=renegotiation-flush/.test(l))).toBe(true);
    m.dispose();
  });

  test("no-op for unknown peer — logs warning, sends no offer", async () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const { log, lines } = quietLog();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
      log,
    });

    m.triggerRenegotiationOnPeers(["never-added"]);
    await flush();

    expect(sig.sends.filter((s) => s.kind === "offer")).toHaveLength(0);
    expect(lines.some((l) => /no entry.*peer=never-added|peer=never-added.*no entry/.test(l))).toBe(true);
    m.dispose();
  });

  test("no-op when mesh is disposed", async () => {
    const sig = makeFakeSignaling();
    const { factory } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    m.dispose();

    expect(() => m.triggerRenegotiationOnPeers(["B"])).not.toThrow();
    expect(sig.sends.filter((s) => s.kind === "offer")).toHaveLength(0);
  });

  test("onnegotiationneeded defers when PC is mid-negotiation", async () => {
    // This covers the primary bug: onnegotiationneeded fires when the
    // student adds their video track while the initial audio negotiation
    // is in-flight (PC in have-local-offer). The handler should defer
    // via pendingRenegotiation rather than trying setLocalDescription
    // (which throws InvalidStateError) and silently dropping the offer.
    const sig = makeFakeSignaling();
    const { factory, instances } = makePcFactory();
    const m = createPeerMesh({
      signaling: sig,
      localPeerId: "A",
      _pcFactory: factory,
      getLocalTracks: () => [],
    });
    m.addPeer("B");
    const pc = instances[0]! as FakePc;

    // Drive PC to have-local-offer (in-flight audio negotiation).
    pc.triggerNegotiationNeeded();
    await flush();
    expect(pc.signalingState).toBe("have-local-offer");
    const offersSent = sig.sends.filter((s) => s.kind === "offer").length;

    // Student adds video track mid-negotiation — onnegotiationneeded fires.
    pc.triggerNegotiationNeeded(); // Simulates addTrack firing the event
    await flush();
    // Offer NOT sent yet — deferred.
    expect(sig.sends.filter((s) => s.kind === "offer").length).toBe(offersSent);

    // Audio negotiation completes: answer arrives → state = stable.
    sig.inject("B", { type: "answer", sdp: "answer" });
    await flush();

    // Deferred renegotiation flushes — a new offer is sent for the video track.
    expect(sig.sends.filter((s) => s.kind === "offer").length).toBeGreaterThan(offersSent);
    m.dispose();
  });
});

// =================================================================
// ICE disconnected → debounced restart (split-brain fix, A4)
// =================================================================

describe("ICE disconnected → debounced polite restart", () => {
  test("polite side schedules a restart 3s after ICE disconnected", async () => {
    jest.useFakeTimers();
    try {
      const sig = makeFakeSignaling();
      const { factory, instances } = makePcFactory();
      // localPeerId="B" > remotePeerId="A" → B is polite
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "B",
        _pcFactory: factory,
        getLocalTracks: () => [],
        sessionId: "test-sid",
      });
      m.addPeer("A");
      const pc = instances[0]! as FakePc;

      // Bring PC to a working state first so we're past initial setup.
      pc.setIceConnectionState("connected");
      await flush();

      // Clear prior offers (from negotiation setup).
      const offersBefore = sig.sends.filter((s) => s.kind === "offer").length;

      // ICE drops to disconnected.
      pc.setIceConnectionState("disconnected");
      await flush();

      // Before the timer fires, no restart offer yet.
      expect(sig.sends.filter((s) => s.kind === "offer").length).toBe(offersBefore);

      // Advance 3 s — restart should fire.
      jest.advanceTimersByTime(3_000);
      await flush();

      const offersAfter = sig.sends.filter((s) => s.kind === "offer").length;
      expect(offersAfter).toBeGreaterThan(offersBefore);
      m.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  test("impolite side does NOT schedule a disconnect restart", async () => {
    jest.useFakeTimers();
    try {
      const sig = makeFakeSignaling();
      const { factory, instances } = makePcFactory();
      // localPeerId="A" < remotePeerId="B" → A is impolite
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "A",
        _pcFactory: factory,
        getLocalTracks: () => [],
      });
      m.addPeer("B");
      const pc = instances[0]! as FakePc;

      const offersBefore = sig.sends.filter((s) => s.kind === "offer").length;

      pc.setIceConnectionState("disconnected");
      await flush();
      jest.advanceTimersByTime(4_000);
      await flush();

      // Impolite side must NOT send a restart offer on disconnected.
      const offersAfter = sig.sends.filter((s) => s.kind === "offer").length;
      expect(offersAfter).toBe(offersBefore);
      m.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  test("timer is cancelled if ICE recovers before 3s", async () => {
    jest.useFakeTimers();
    try {
      const sig = makeFakeSignaling();
      const { factory, instances } = makePcFactory();
      // localPeerId="B" > remotePeerId="A" → B is polite
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "B",
        _pcFactory: factory,
        getLocalTracks: () => [],
      });
      m.addPeer("A");
      const pc = instances[0]! as FakePc;

      pc.setIceConnectionState("connected");
      await flush();
      const offersBefore = sig.sends.filter((s) => s.kind === "offer").length;

      // ICE goes disconnected.
      pc.setIceConnectionState("disconnected");
      await flush();

      // ICE recovers before the 3s timer fires.
      jest.advanceTimersByTime(1_000);
      pc.setIceConnectionState("connected");
      await flush();

      // Advance past the 3s mark — timer should have been cancelled.
      jest.advanceTimersByTime(5_000);
      await flush();

      // No new restart offer should have been sent.
      const offersAfter = sig.sends.filter((s) => s.kind === "offer").length;
      expect(offersAfter).toBe(offersBefore);
      m.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

  test("ICE failed on polite side still triggers immediate restart", async () => {
    jest.useFakeTimers();
    try {
      const sig = makeFakeSignaling();
      const { factory, instances } = makePcFactory();
      // localPeerId="B" > remotePeerId="A" → B is polite
      const m = createPeerMesh({
        signaling: sig,
        localPeerId: "B",
        _pcFactory: factory,
        getLocalTracks: () => [],
      });
      m.addPeer("A");
      const pc = instances[0]! as FakePc;

      pc.setIceConnectionState("connected");
      await flush();
      const offersBefore = sig.sends.filter((s) => s.kind === "offer").length;

      // ICE fails — existing auto-restart behavior, synchronous.
      pc.setIceConnectionState("failed");
      await flush();

      const offersAfter = sig.sends.filter((s) => s.kind === "offer").length;
      expect(offersAfter).toBeGreaterThan(offersBefore);
      m.dispose();
    } finally {
      jest.useRealTimers();
    }
  });
});
