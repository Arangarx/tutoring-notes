/**
 * @jest-environment jsdom
 */

/**
 * jsdom + RTL coverage for `useLiveAV` (Phase 4b commit 2).
 *
 * Stubs:
 *   - `getUserMedia` via the `_getUserMedia` option.
 *   - `createPeerMesh` / `createSignaling` via the `_create*`
 *     options. We don't exercise real WebRTC here — the
 *     peer-mesh + signaling modules have their own unit suites
 *     (Phase 4a, src/__tests__/av/*). useLiveAV's job is the React
 *     lifecycle glue, and that's what these tests verify.
 *   - `MediaStream` / `MediaStreamTrack`: jsdom provides minimal
 *     stubs, supplemented by a `FakeMediaStream` / `FakeTrack`
 *     pair below for cases the jsdom stubs don't cover (event
 *     dispatching, addTrack, etc.).
 */

import { act, renderHook, waitFor } from "@testing-library/react";

import {
  useLiveAV,
  type AvParticipant,
  type UseLiveAVOptions,
} from "@/hooks/useLiveAV";
import type {
  PeerMesh,
  PeerMeshOptions,
  RemoteTrackHandler,
  PeerConnectionStateHandler,
  IceConnectionStateHandler,
} from "@/lib/av/peer-mesh";
import type { Signaling, SignalingOptions } from "@/lib/av/signaling";
import type {
  WhiteboardSyncClient,
  RoomPeer,
} from "@/lib/whiteboard/sync-client";

// -----------------------------------------------------------------
// Fakes
// -----------------------------------------------------------------

class FakeMediaStream {
  private readonly _tracks: MediaStreamTrack[] = [];
  addTrack(t: MediaStreamTrack): void {
    if (this._tracks.includes(t)) return;
    this._tracks.push(t);
  }
  removeTrack(t: MediaStreamTrack): void {
    const i = this._tracks.indexOf(t);
    if (i >= 0) this._tracks.splice(i, 1);
  }
  getTracks(): MediaStreamTrack[] {
    return [...this._tracks];
  }
  getAudioTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "video");
  }
}

class FakeMediaStreamTrack {
  kind: "audio" | "video";
  enabled = true;
  stopped = false;
  private listeners: { [k: string]: Array<(e?: unknown) => void> } = {};

  constructor(kind: "audio" | "video" = "audio") {
    this.kind = kind;
  }
  stop(): void {
    this.stopped = true;
  }
  addEventListener(name: string, cb: (e?: unknown) => void): void {
    (this.listeners[name] ??= []).push(cb);
  }
  removeEventListener(name: string, cb: (e?: unknown) => void): void {
    const arr = this.listeners[name];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  }
  emit(name: string, e?: unknown): void {
    for (const cb of this.listeners[name] ?? []) cb(e);
  }
}

// Install jsdom-friendly globals so cast paths in the hook
// (`new MediaStream()`) work. The hook only uses .addTrack /
// .removeTrack / .getTracks / .getAudioTracks; FakeMediaStream
// covers all of them.
(globalThis as unknown as { MediaStream: typeof FakeMediaStream }).MediaStream =
  FakeMediaStream;

function makeFakeStream(numAudio = 1): {
  stream: FakeMediaStream;
  tracks: FakeMediaStreamTrack[];
} {
  const stream = new FakeMediaStream();
  const tracks: FakeMediaStreamTrack[] = [];
  for (let i = 0; i < numAudio; i++) {
    const t = new FakeMediaStreamTrack("audio");
    stream.addTrack(t as unknown as MediaStreamTrack);
    tracks.push(t);
  }
  return { stream, tracks };
}

function makeFakeSyncClient(): {
  sync: WhiteboardSyncClient;
  emitPeers: (peers: ReadonlyArray<RoomPeer>) => void;
  subscriberCount: () => number;
} {
  const subs = new Set<(peers: ReadonlyArray<RoomPeer>) => void>();
  const sync = {
    isConnected: () => true,
    onRemoteScene: () => () => undefined,
    onConnect: () => () => undefined,
    onDisconnect: () => () => undefined,
    onPeerCountChange: () => () => undefined,
    broadcastScene: () => undefined,
    broadcastDocument: () => undefined,
    flushPendingBroadcast: () => false,
    broadcastSignal: () => undefined,
    onRemoteSignal: () => () => undefined,
    onRoomPeersChange: (cb: (peers: ReadonlyArray<RoomPeer>) => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    disconnect: () => undefined,
  } as unknown as WhiteboardSyncClient;
  function emitPeers(peers: ReadonlyArray<RoomPeer>) {
    for (const cb of subs) cb(peers);
  }
  return { sync, emitPeers, subscriberCount: () => subs.size };
}

type MeshHandles = {
  mesh: PeerMesh;
  factory: (opts: PeerMeshOptions) => PeerMesh;
  capturedOpts: PeerMeshOptions[];
  addPeer: jest.Mock;
  removePeer: jest.Mock;
  restart: jest.Mock;
  dispose: jest.Mock;
  emitTrack: (
    peerId: string,
    track: MediaStreamTrack,
    streams?: MediaStream[]
  ) => void;
  emitPcState: (peerId: string, state: RTCPeerConnectionState) => void;
  emitIceState: (peerId: string, state: RTCIceConnectionState) => void;
  isDisposed: () => boolean;
};

function makeFakeMesh(): MeshHandles {
  const trackSubs = new Set<RemoteTrackHandler>();
  const pcSubs = new Set<PeerConnectionStateHandler>();
  const iceSubs = new Set<IceConnectionStateHandler>();
  const peerSet = new Set<string>();
  let disposed = false;
  const capturedOpts: PeerMeshOptions[] = [];

  const addPeer = jest.fn((peerId: string) => {
    peerSet.add(peerId);
  });
  const removePeer = jest.fn((peerId: string) => {
    peerSet.delete(peerId);
  });
  const restart = jest.fn();
  const dispose = jest.fn(() => {
    disposed = true;
    trackSubs.clear();
    pcSubs.clear();
    iceSubs.clear();
  });

  const mesh: PeerMesh = {
    addPeer,
    removePeer,
    peers: () => peerSet,
    restart,
    onRemoteTrack: (cb) => {
      trackSubs.add(cb);
      return () => {
        trackSubs.delete(cb);
      };
    },
    onPeerConnectionStateChange: (cb) => {
      pcSubs.add(cb);
      return () => {
        pcSubs.delete(cb);
      };
    },
    onIceConnectionStateChange: (cb) => {
      iceSubs.add(cb);
      return () => {
        iceSubs.delete(cb);
      };
    },
    isDisposed: () => disposed,
    dispose,
  };

  return {
    mesh,
    factory: (opts) => {
      capturedOpts.push(opts);
      return mesh;
    },
    capturedOpts,
    addPeer,
    removePeer,
    restart,
    dispose,
    emitTrack: (peerId, track, streams = []) => {
      for (const cb of trackSubs) cb(peerId, track, streams);
    },
    emitPcState: (peerId, state) => {
      for (const cb of pcSubs) cb(peerId, state);
    },
    emitIceState: (peerId, state) => {
      for (const cb of iceSubs) cb(peerId, state);
    },
    isDisposed: () => disposed,
  };
}

function makeFakeSignaling(): {
  signaling: Signaling;
  factory: (opts: SignalingOptions) => Signaling;
  dispose: jest.Mock;
  capturedOpts: SignalingOptions[];
} {
  const dispose = jest.fn();
  const capturedOpts: SignalingOptions[] = [];
  const signaling: Signaling = {
    onSignal: () => () => undefined,
    sendOffer: () => undefined,
    sendAnswer: () => undefined,
    sendIce: () => undefined,
    sendLeave: () => undefined,
    isDisposed: () => false,
    dispose,
  };
  return {
    signaling,
    factory: (opts) => {
      capturedOpts.push(opts);
      return signaling;
    },
    dispose,
    capturedOpts,
  };
}

function makeBaseProps(
  overrides?: Partial<UseLiveAVOptions>
): UseLiveAVOptions {
  const sync = makeFakeSyncClient();
  return {
    syncClient: sync.sync,
    localPeerId: "tutor-A",
    sessionId: "wb-1",
    enabled: true,
    _getUserMedia: jest.fn(async () => makeFakeStream(1).stream as unknown as MediaStream),
    log: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
}

// -----------------------------------------------------------------
// Tests
// -----------------------------------------------------------------

describe("useLiveAV — initial state + mic acquisition", () => {
  test("initial render: stream null, isAcquiring true, no error", async () => {
    let resolveGUM: (s: MediaStream) => void = () => undefined;
    const getUM = jest.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGUM = resolve;
        })
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isAcquiring).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.isActive).toBe(false);

    // Resolve so the cleanup path doesn't dangle.
    const { stream } = makeFakeStream(1);
    await act(async () => {
      resolveGUM(stream as unknown as MediaStream);
    });

    unmount();
  });

  test("getUserMedia resolves: stream set, isAcquiring false, isActive true", async () => {
    const { stream, tracks } = makeFakeStream(1);
    const getUM = jest.fn(
      async () => stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });
    expect(result.current.isAcquiring).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isActive).toBe(true);
    expect(tracks[0]!.enabled).toBe(true);

    unmount();
  });

  test("permission denied: error.type === 'permission-denied', no mesh built", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const err = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const getUM = jest.fn(async () => {
      throw err;
    });

    const props = makeBaseProps({
      _getUserMedia: getUM,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    await waitFor(() => {
      expect(result.current.error?.type).toBe("permission-denied");
    });
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isAcquiring).toBe(false);
    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);

    unmount();
  });

  test("classifies NotFoundError as 'no-device'", async () => {
    const err = Object.assign(new Error("none"), { name: "NotFoundError" });
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => {
        throw err;
      }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.error?.type).toBe("no-device");
    });
    unmount();
  });

  test("classifies NotReadableError as 'device-in-use'", async () => {
    const err = Object.assign(new Error("busy"), {
      name: "NotReadableError",
    });
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => {
        throw err;
      }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.error?.type).toBe("device-in-use");
    });
    unmount();
  });

  test("retryAcquire triggers getUserMedia again", async () => {
    let attempts = 0;
    const getUM = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        const e = Object.assign(new Error("denied"), {
          name: "NotAllowedError",
        });
        throw e;
      }
      return makeFakeStream(1).stream as unknown as MediaStream;
    });
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.error?.type).toBe("permission-denied");
    });
    expect(getUM).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retryAcquire();
    });

    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });
    expect(getUM).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();

    unmount();
  });

  test("enabled=false: hook is fully inert (no getUserMedia)", async () => {
    const getUM = jest.fn();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      enabled: false,
      _getUserMedia: getUM as unknown as UseLiveAVOptions["_getUserMedia"],
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    // Allow any pending effects to settle
    await act(async () => {
      await Promise.resolve();
    });

    expect(getUM).not.toHaveBeenCalled();
    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isAcquiring).toBe(false);
    expect(result.current.isActive).toBe(false);

    unmount();
  });
});

describe("useLiveAV — mesh + signaling lifecycle", () => {
  test("mesh + signaling built once mic + syncClient + localPeerId are present", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    expect(meshHandles.capturedOpts.length).toBe(1);
    expect(sig.capturedOpts.length).toBe(1);
    expect(meshHandles.capturedOpts[0]?.localPeerId).toBe("tutor-A");
    expect(meshHandles.capturedOpts[0]?.sessionId).toBe("wb-1");
    expect(sig.capturedOpts[0]?.localPeerId).toBe("tutor-A");

    unmount();
    // Both modules torn down on unmount.
    expect(meshHandles.dispose).toHaveBeenCalledTimes(1);
    expect(sig.dispose).toHaveBeenCalledTimes(1);
  });

  test("syncClient null: no mesh built, no participants", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: null,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });
    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.isActive).toBe(false);
    expect(result.current.participants).toEqual([]);

    unmount();
  });

  test("getLocalTracks passed to peer-mesh returns the current local audio tracks", async () => {
    const { stream, tracks } = makeFakeStream(1);
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => stream as unknown as MediaStream),
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    const gltrk = meshHandles.capturedOpts[0]?.getLocalTracks;
    expect(typeof gltrk).toBe("function");
    const out = gltrk?.("any-remote") ?? [];
    expect(out.length).toBe(1);
    expect(out[0]).toBe(tracks[0]);

    unmount();
  });
});

describe("useLiveAV — peer membership reconciliation", () => {
  test("onRoomPeersChange add: mesh.addPeer called, participant appears", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student", label: "Alex" }]);
    });

    expect(meshHandles.addPeer).toHaveBeenCalledWith("student-B");
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });
    expect(result.current.participants[0]?.peerId).toBe("student-B");
    expect(result.current.participants[0]?.role).toBe("student");
    expect(result.current.participants[0]?.label).toBe("Alex");
    expect(result.current.participants[0]?.audioStream).toBeNull();
    expect(result.current.participants[0]?.videoStream).toBeNull();
    expect(result.current.participants[0]?.peerConnectionState).toBe("new");
    expect(result.current.participants[0]?.iceConnectionState).toBe("new");

    unmount();
  });

  test("onRoomPeersChange remove: mesh.removePeer called, participant disappears", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([
        { peerId: "student-B", role: "student" },
        { peerId: "student-C", role: "student" },
      ]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(2);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });

    expect(meshHandles.removePeer).toHaveBeenCalledWith("student-C");
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });
    expect(result.current.participants[0]?.peerId).toBe("student-B");

    unmount();
  });

  test("participants sorted lexicographically by peerId", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([
        { peerId: "z-stu", role: "student" },
        { peerId: "a-stu", role: "student" },
        { peerId: "m-stu", role: "student" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.participants.length).toBe(3);
    });
    expect(result.current.participants.map((p) => p.peerId)).toEqual([
      "a-stu",
      "m-stu",
      "z-stu",
    ]);

    unmount();
  });

  test("re-emit of identical peer list: mesh.addPeer not called twice", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    act(() => {
      emitPeers([{ peerId: "student-B", role: "student", label: "Alex" }]);
    });

    expect(meshHandles.addPeer).toHaveBeenCalledTimes(1);
    expect(result.current.participants[0]?.label).toBe("Alex");

    unmount();
  });
});

describe("useLiveAV — remote tracks + state", () => {
  test("onRemoteTrack(audio): participant.audioStream contains the track", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    const remoteTrack = new FakeMediaStreamTrack("audio");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteTrack as unknown as MediaStreamTrack
      );
    });

    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).not.toBeNull();
    });
    const stream =
      result.current.participants[0]!.audioStream as unknown as FakeMediaStream;
    expect(stream.getAudioTracks().length).toBe(1);
    expect(stream.getAudioTracks()[0]).toBe(remoteTrack);

    unmount();
  });

  test("onRemoteTrack(video): ignored in commit 2 (mic-only)", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    const remoteTrack = new FakeMediaStreamTrack("video");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteTrack as unknown as MediaStreamTrack
      );
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.participants[0]?.audioStream).toBeNull();
    expect(result.current.participants[0]?.videoStream).toBeNull();

    unmount();
  });

  test("track 'ended' event removes the track from audioStream", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    const remoteTrack = new FakeMediaStreamTrack("audio");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteTrack as unknown as MediaStreamTrack
      );
    });
    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).not.toBeNull();
    });

    act(() => {
      remoteTrack.emit("ended");
    });
    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).toBeNull();
    });

    unmount();
  });

  test("peer-mesh state callbacks update participant state", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    act(() => {
      meshHandles.emitPcState("student-B", "connected");
      meshHandles.emitIceState("student-B", "checking");
    });
    await waitFor(() => {
      expect(result.current.participants[0]?.peerConnectionState).toBe(
        "connected"
      );
    });
    expect(result.current.participants[0]?.iceConnectionState).toBe(
      "checking"
    );

    unmount();
  });
});

describe("useLiveAV — mute control + reconnect", () => {
  test("toggleMic flips track.enabled and isMicMuted", async () => {
    const { stream, tracks } = makeFakeStream(1);
    const getUM = jest.fn(async () => stream as unknown as MediaStream);
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });

    expect(result.current.isMicMuted).toBe(false);
    expect(tracks[0]!.enabled).toBe(true);

    act(() => {
      result.current.toggleMic();
    });
    expect(result.current.isMicMuted).toBe(true);
    expect(tracks[0]!.enabled).toBe(false);

    act(() => {
      result.current.toggleMic();
    });
    expect(result.current.isMicMuted).toBe(false);
    expect(tracks[0]!.enabled).toBe(true);

    unmount();
  });

  test("reconnectPeer calls mesh.restart", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    act(() => {
      result.current.reconnectPeer("student-B");
    });
    expect(meshHandles.restart).toHaveBeenCalledWith("student-B");

    unmount();
  });

  test("reconnectPeer is a no-op when mesh is not yet built", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const warnLog = jest.fn();
    const props = makeBaseProps({
      syncClient: null, // no mesh built
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
      log: { log: jest.fn(), warn: warnLog, error: jest.fn() },
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });

    act(() => {
      result.current.reconnectPeer("ghost");
    });
    expect(meshHandles.restart).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalled();

    unmount();
  });
});

describe("useLiveAV — teardown", () => {
  test("unmount disposes mesh + signaling and stops local + remote tracks", async () => {
    const { stream: localStream, tracks: localTracks } = makeFakeStream(1);
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _getUserMedia: jest.fn(
        async () => localStream as unknown as MediaStream
      ),
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    const remoteTrack = new FakeMediaStreamTrack("audio");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteTrack as unknown as MediaStreamTrack
      );
    });
    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).not.toBeNull();
    });

    unmount();

    expect(meshHandles.dispose).toHaveBeenCalledTimes(1);
    expect(sig.dispose).toHaveBeenCalledTimes(1);
    expect(localTracks[0]!.stopped).toBe(true);
    expect(remoteTrack.stopped).toBe(true);
  });

  test("peer removal stops their remote tracks", async () => {
    const { sync, emitPeers } = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    const remoteTrack = new FakeMediaStreamTrack("audio");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteTrack as unknown as MediaStreamTrack
      );
    });
    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).not.toBeNull();
    });

    act(() => {
      emitPeers([]); // remove student-B
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(0);
    });
    expect(remoteTrack.stopped).toBe(true);

    // Sanity: tracks of unused participants would touch the
    // participant entry — confirm participants reset cleanly.
    type Cast = AvParticipant;
    void ({} as Cast);

    unmount();
  });

  test("disposes correctly when localAudioStream changes (mic re-acquired)", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    let attempts = 0;
    const getUM = jest.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        return makeFakeStream(1).stream as unknown as MediaStream;
      }
      return makeFakeStream(1).stream as unknown as MediaStream;
    });
    const props = makeBaseProps({
      _getUserMedia: getUM,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });
    expect(meshHandles.capturedOpts.length).toBe(1);

    act(() => {
      result.current.retryAcquire();
    });
    await waitFor(() => {
      // After re-acquire, factory has been called a second time.
      expect(meshHandles.capturedOpts.length).toBe(2);
    });
    // First mesh disposed once; second mesh is the same fake (shared
    // instance), so dispose count climbs to 2 after the first effect
    // cleanup ran.
    expect(meshHandles.dispose).toHaveBeenCalled();

    unmount();
  });
});
