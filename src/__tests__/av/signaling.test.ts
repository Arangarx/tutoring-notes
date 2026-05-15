/**
 * Unit tests for `src/lib/av/signaling.ts` — Phase 4a.
 *
 * Pure Jest, no DOM, no real socket.io. The sync-client dependency
 * is mocked to its minimum shape (`broadcastSignal` + `onRemoteSignal`)
 * so this suite exercises only the muxer's own behavior:
 *   - send-side forwarding to broadcastSignal with the right payload
 *   - recv-side demux by `targetPeerId === localPeerId`
 *   - self-target / empty-target / disposed guards
 *   - subscriber lifecycle (unsubscribe, dispose-clears-all)
 *
 * The peer-mesh integration is exercised in peer-mesh.test.ts; this
 * file pins only the wiring contract that peer-mesh inherits.
 */

import { createSignaling, type SignalingSyncDependency } from "@/lib/av/signaling";
import type {
  WhiteboardSyncClient,
  WhiteboardWireSignalPayload,
} from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Fake sync-client — just enough surface to drive the muxer.
// -----------------------------------------------------------------

type RemoteSignalCb = Parameters<WhiteboardSyncClient["onRemoteSignal"]>[0];

type FakeSyncClient = SignalingSyncDependency & {
  /**
   * Test helper: invoke every registered onRemoteSignal handler with
   * the supplied envelope as if it arrived on the encrypted channel.
   * Returns the count of subscribers that fired.
   */
  injectRemoteSignal: (
    fromPeerId: string,
    targetPeerId: string,
    payload: WhiteboardWireSignalPayload
  ) => number;
  /** All `broadcastSignal` calls in invocation order. */
  sends: Array<{ targetPeerId: string; payload: WhiteboardWireSignalPayload }>;
  /** Active subscribers (for assertions on dispose-time cleanup). */
  subs: Set<RemoteSignalCb>;
};

function makeFakeSyncClient(): FakeSyncClient {
  const subs = new Set<RemoteSignalCb>();
  const sends: FakeSyncClient["sends"] = [];
  return {
    broadcastSignal: (targetPeerId, payload) => {
      sends.push({ targetPeerId, payload });
    },
    onRemoteSignal: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    injectRemoteSignal: (fromPeerId, targetPeerId, payload) => {
      let n = 0;
      for (const cb of Array.from(subs)) {
        cb(fromPeerId, targetPeerId, payload);
        n++;
      }
      return n;
    },
    sends,
    subs,
  };
}

// -----------------------------------------------------------------
// Constructor invariants
// -----------------------------------------------------------------

describe("createSignaling — constructor invariants", () => {
  test("throws on empty localPeerId", () => {
    expect(() =>
      createSignaling({
        syncClient: makeFakeSyncClient(),
        localPeerId: "",
      })
    ).toThrow(/localPeerId/);
  });

  test("subscribes to sync-client.onRemoteSignal exactly once", () => {
    const sc = makeFakeSyncClient();
    createSignaling({ syncClient: sc, localPeerId: "A" });
    expect(sc.subs.size).toBe(1);
  });

  test("dispose unsubscribes from sync-client and clears local subs", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const handler = jest.fn();
    s.onSignal(handler);
    expect(sc.subs.size).toBe(1);
    s.dispose();
    expect(sc.subs.size).toBe(0);
    expect(s.isDisposed()).toBe(true);
  });

  test("dispose is idempotent", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    expect(() => {
      s.dispose();
      s.dispose();
    }).not.toThrow();
    expect(s.isDisposed()).toBe(true);
  });
});

// -----------------------------------------------------------------
// Send side — outbound forwarding to broadcastSignal
// -----------------------------------------------------------------

describe("createSignaling — send side", () => {
  test("sendOffer forwards { type: 'offer', sdp } to broadcastSignal", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    s.sendOffer("B", "v=0\r\no=offer\r\n...");
    expect(sc.sends).toEqual([
      {
        targetPeerId: "B",
        payload: { type: "offer", sdp: expect.stringContaining("v=0") },
      },
    ]);
  });

  test("sendAnswer forwards { type: 'answer', sdp }", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    s.sendAnswer("B", "v=0\r\no=answer\r\n...");
    expect(sc.sends[0]).toEqual({
      targetPeerId: "B",
      payload: { type: "answer", sdp: expect.stringContaining("v=0") },
    });
  });

  test("sendIce forwards an RTCIceCandidateInit", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const cand: RTCIceCandidateInit = {
      candidate: "candidate:1 1 udp 2113937151 192.168.1.2 54321 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    s.sendIce("B", cand);
    expect(sc.sends[0]).toEqual({
      targetPeerId: "B",
      payload: { type: "ice", candidate: cand },
    });
  });

  test("sendIce with null candidate represents end-of-candidates", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    s.sendIce("B", null);
    expect(sc.sends[0]).toEqual({
      targetPeerId: "B",
      payload: { type: "ice", candidate: null },
    });
  });

  test("sendLeave forwards { type: 'leave' }", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    s.sendLeave("B");
    expect(sc.sends[0]).toEqual({
      targetPeerId: "B",
      payload: { type: "leave" },
    });
  });

  test("rejects empty remotePeerId on every send (no broadcast)", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    s.sendOffer("", "sdp");
    s.sendAnswer("", "sdp");
    s.sendIce("", { candidate: "x" });
    s.sendLeave("");
    expect(sc.sends).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  test("rejects send to self (cannot signal own peer)", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    s.sendOffer("A", "sdp");
    s.sendIce("A", null);
    expect(sc.sends).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("rejects empty SDP for offer / answer (defends RTCPeerConnection from undefined SDP)", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    s.sendOffer("B", "");
    s.sendAnswer("B", "");
    expect(sc.sends).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test("sends after dispose are no-ops (warns, no broadcast)", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    s.dispose();
    s.sendOffer("B", "sdp");
    s.sendLeave("B");
    s.sendIce("B", null);
    expect(sc.sends).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------
// Recv side — inbound demux
// -----------------------------------------------------------------

describe("createSignaling — recv side (target demux)", () => {
  test("signal addressed to localPeerId fires the handler", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const h = jest.fn();
    s.onSignal(h);
    sc.injectRemoteSignal("B", "A", { type: "offer", sdp: "sdp-data" });
    expect(h).toHaveBeenCalledTimes(1);
    expect(h).toHaveBeenCalledWith("B", { type: "offer", sdp: "sdp-data" });
  });

  test("signal addressed to a different peer does NOT fire the handler", () => {
    // The whole point of the muxer — peerA must not see peerB's
    // SDP/ICE just because the sync-client delivered it to every
    // member of the room.
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const h = jest.fn();
    s.onSignal(h);
    sc.injectRemoteSignal("B", "C", { type: "offer", sdp: "for-C-not-A" });
    expect(h).not.toHaveBeenCalled();
  });

  test("multiple subscribers all receive the signal", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const h1 = jest.fn();
    const h2 = jest.fn();
    s.onSignal(h1);
    s.onSignal(h2);
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  test("unsubscriber stops the handler", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const h = jest.fn();
    const unsub = s.onSignal(h);
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(h).toHaveBeenCalledTimes(1);
    unsub();
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(h).toHaveBeenCalledTimes(1);
  });

  test("handler that unsubscribes itself mid-fan does not break the loop", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const order: string[] = [];
    let unsubA: (() => void) | null = null;
    unsubA = s.onSignal(() => {
      order.push("a");
      unsubA?.();
    });
    s.onSignal(() => order.push("b"));
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(order).toEqual(["a", "b"]);
  });

  test("a handler that throws does not poison the other handlers", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    s.onSignal(() => {
      throw new Error("boom");
    });
    const h2 = jest.fn();
    s.onSignal(h2);
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(h2).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  test("signal from self (defense-in-depth) is dropped", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    const h = jest.fn();
    s.onSignal(h);
    // Sync-client normally suppresses these — but if it ever
    // doesn't, signaling.ts must.
    sc.injectRemoteSignal("A", "A", { type: "leave" });
    expect(h).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  test("signal from empty fromPeerId is dropped", () => {
    const sc = makeFakeSyncClient();
    const warn = jest.fn();
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log: { log: jest.fn(), warn, error: jest.fn() },
    });
    const h = jest.fn();
    s.onSignal(h);
    sc.injectRemoteSignal("", "A", { type: "leave" });
    expect(h).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  test("after dispose, inbound signals do NOT fire the handler", () => {
    const sc = makeFakeSyncClient();
    const s = createSignaling({ syncClient: sc, localPeerId: "A" });
    const h = jest.fn();
    s.onSignal(h);
    s.dispose();
    sc.injectRemoteSignal("B", "A", { type: "leave" });
    expect(h).not.toHaveBeenCalled();
  });

  test("3-peer mesh: A's signaling does not see B↔C traffic", () => {
    // Pin the multi-peer target-scoping. Without this filter the
    // group-session canary in peer-mesh.test.ts would also fail,
    // but pinning the contract at the muxer layer keeps the
    // failure local and grep-able.
    const sc = makeFakeSyncClient();
    const sA = createSignaling({ syncClient: sc, localPeerId: "A" });
    const hA = jest.fn();
    sA.onSignal(hA);

    // B sends an offer to C (A is in the room but not the target).
    sc.injectRemoteSignal("B", "C", { type: "offer", sdp: "from-B-to-C" });
    expect(hA).not.toHaveBeenCalled();

    // C answers B — still not for A.
    sc.injectRemoteSignal("C", "B", { type: "answer", sdp: "from-C-to-B" });
    expect(hA).not.toHaveBeenCalled();

    // B sends ICE candidate addressed to A — A sees it.
    sc.injectRemoteSignal("B", "A", { type: "ice", candidate: null });
    expect(hA).toHaveBeenCalledTimes(1);
    expect(hA).toHaveBeenCalledWith("B", { type: "ice", candidate: null });
  });
});

// -----------------------------------------------------------------
// Logging contract — `avx=<sessionId> peer=<localPeerId>`
// -----------------------------------------------------------------

describe("createSignaling — log shape", () => {
  test("sessionId is threaded into the avx prefix", () => {
    const sc = makeFakeSyncClient();
    const lines: string[] = [];
    const cap = (msg: string) => lines.push(msg);
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      sessionId: "sess-xyz",
      log: { log: cap, warn: cap, error: cap },
    });
    s.sendOffer("B", "sdp");
    expect(lines.some((l) => l.includes("send kind=offer target=B"))).toBe(true);
  });

  test("missing sessionId falls back to '?'", () => {
    // Cosmetic but pinned — a missing sessionId should not blow up
    // the log line construction.
    const sc = makeFakeSyncClient();
    const log = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const s = createSignaling({
      syncClient: sc,
      localPeerId: "A",
      log,
    });
    s.sendLeave("B");
    expect(log.log).toHaveBeenCalled();
  });
});
