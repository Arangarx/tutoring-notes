/**
 * @jest-environment jsdom
 */

/**
 * jsdom + RTL coverage for `useLiveAV` (Phase 4b, post-realignment).
 *
 * Stubs:
 *   - `getUserMedia` via the `_getUserMedia` option.
 *   - `createPeerMesh` / `createSignaling` via the `_create*`
 *     options. We don't exercise real WebRTC here — the peer-mesh
 *     + signaling modules have their own unit suites
 *     (Phase 4a, src/__tests__/av/*). useLiveAV's job is the React
 *     lifecycle glue, and that's what these tests verify.
 *   - `navigator.permissions` via the `_permissions` option.
 *   - `MediaStream` / `MediaStreamTrack`: jsdom provides minimal
 *     stubs, supplemented by a `FakeMediaStream` / `FakeTrack` pair
 *     below.
 *
 * Contract under test: see `src/hooks/useLiveAV.ts` docblock.
 * Highlights:
 *   - INERT on mount — no getUserMedia, no mesh.
 *   - requestMic() / requestCam() are the only acquisition triggers.
 *   - Permissions API populates hasMicPermission/hasCamPermission.
 *   - Mesh builds once mic + sync-client are both present.
 *   - Reconcile add-then-remove with stable peerId-sorted output.
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

(globalThis as unknown as { MediaStream: typeof FakeMediaStream }).MediaStream =
  FakeMediaStream;

function makeFakeStream(
  numAudio = 1,
  numVideo = 0
): {
  stream: FakeMediaStream;
  tracks: FakeMediaStreamTrack[];
  audioTracks: FakeMediaStreamTrack[];
  videoTracks: FakeMediaStreamTrack[];
} {
  const stream = new FakeMediaStream();
  const audioTracks: FakeMediaStreamTrack[] = [];
  const videoTracks: FakeMediaStreamTrack[] = [];
  for (let i = 0; i < numAudio; i++) {
    const t = new FakeMediaStreamTrack("audio");
    stream.addTrack(t as unknown as MediaStreamTrack);
    audioTracks.push(t);
  }
  for (let i = 0; i < numVideo; i++) {
    const t = new FakeMediaStreamTrack("video");
    stream.addTrack(t as unknown as MediaStreamTrack);
    videoTracks.push(t);
  }
  return {
    stream,
    tracks: [...audioTracks, ...videoTracks],
    audioTracks,
    videoTracks,
  };
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

type FakePermissionStatus = {
  state: "granted" | "prompt" | "denied";
  _changeListeners: Array<() => void>;
  addEventListener: (name: "change", cb: () => void) => void;
  removeEventListener: (name: "change", cb: () => void) => void;
  setState: (next: "granted" | "prompt" | "denied") => void;
};

function makeFakePermissionStatus(
  initial: "granted" | "prompt" | "denied"
): FakePermissionStatus {
  const status: FakePermissionStatus = {
    state: initial,
    _changeListeners: [],
    addEventListener(_name, cb) {
      this._changeListeners.push(cb);
    },
    removeEventListener(_name, cb) {
      const i = this._changeListeners.indexOf(cb);
      if (i >= 0) this._changeListeners.splice(i, 1);
    },
    setState(next) {
      this.state = next;
      for (const cb of [...this._changeListeners]) cb();
    },
  };
  return status;
}

function makeFakePermissions(opts?: {
  mic?: FakePermissionStatus | Error;
  cam?: FakePermissionStatus | Error;
}): NonNullable<UseLiveAVOptions["_permissions"]> {
  return {
    query: jest.fn(async ({ name }: { name: string }) => {
      const slot = name === "microphone" ? opts?.mic : opts?.cam;
      if (slot instanceof Error) throw slot;
      if (!slot) throw new Error(`unknown permission: ${name}`);
      return slot;
    }),
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
    // Default permissions: simulate no Permissions API (null).
    _permissions: null,
    _getUserMedia: jest.fn(
      async () => makeFakeStream(1).stream as unknown as MediaStream
    ),
    log: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
}

// -----------------------------------------------------------------
// Tests
// -----------------------------------------------------------------

describe("useLiveAV — initial state (post-realignment: inert on mount)", () => {
  test("on mount: no getUserMedia, no mesh, returns inert state", async () => {
    const getUM = jest.fn();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _getUserMedia: getUM as unknown as UseLiveAVOptions["_getUserMedia"],
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await Promise.resolve();
    });

    expect(getUM).not.toHaveBeenCalled();
    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.localVideoStream).toBeNull();
    expect(result.current.isAcquiring).toBe(false);
    expect(result.current.isActive).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.videoError).toBeNull();
    expect(result.current.isMicMuted).toBe(false);
    expect(result.current.isCamMuted).toBe(true);
    expect(result.current.participants).toEqual([]);

    unmount();
  });

  test("permissions=null: hasMicPermission/hasCamPermission stay 'unknown'", async () => {
    const props = makeBaseProps({ _permissions: null });
    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.hasMicPermission).toBe("unknown");
    expect(result.current.hasCamPermission).toBe("unknown");

    unmount();
  });

  test("permissions API populates mic + cam states from query", async () => {
    const mic = makeFakePermissionStatus("granted");
    const cam = makeFakePermissionStatus("prompt");
    const props = makeBaseProps({
      _permissions: makeFakePermissions({ mic, cam }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.hasMicPermission).toBe("granted");
    });
    await waitFor(() => {
      expect(result.current.hasCamPermission).toBe("prompt");
    });

    unmount();
  });

  test("permissions API throws on camera query (Safari): hasCamPermission='unknown', mic unaffected", async () => {
    const mic = makeFakePermissionStatus("granted");
    const props = makeBaseProps({
      _permissions: makeFakePermissions({
        mic,
        cam: new Error("not supported"),
      }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.hasMicPermission).toBe("granted");
    });
    expect(result.current.hasCamPermission).toBe("unknown");

    unmount();
  });

  test("permission change event updates hasMicPermission live", async () => {
    const mic = makeFakePermissionStatus("prompt");
    const cam = makeFakePermissionStatus("prompt");
    const props = makeBaseProps({
      _permissions: makeFakePermissions({ mic, cam }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await waitFor(() => {
      expect(result.current.hasMicPermission).toBe("prompt");
    });

    act(() => {
      mic.setState("granted");
    });
    await waitFor(() => {
      expect(result.current.hasMicPermission).toBe("granted");
    });

    unmount();
  });
});

describe("useLiveAV — requestMic", () => {
  test("requestMic: calls getUserMedia, populates localAudioStream + hasMicPermission='granted'", async () => {
    const { stream, audioTracks } = makeFakeStream(1);
    const getUM = jest.fn(
      async () => stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    await act(async () => {
      await result.current.requestMic();
    });

    expect(getUM).toHaveBeenCalledTimes(1);
    expect(getUM).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: true, video: false })
    );
    expect(result.current.localAudioStream).not.toBeNull();
    expect(result.current.isAcquiring).toBe(false);
    expect(result.current.hasMicPermission).toBe("granted");
    expect(result.current.error).toBeNull();
    expect(result.current.isActive).toBe(true);
    expect(audioTracks[0]!.enabled).toBe(true);

    unmount();
  });

  test("requestMic permission denied: error type='permission-denied', hasMicPermission='denied'", async () => {
    const err = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => {
        throw err;
      }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    expect(result.current.error?.type).toBe("permission-denied");
    expect(result.current.hasMicPermission).toBe("denied");
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isActive).toBe(false);

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
    await act(async () => {
      await result.current.requestMic();
    });
    expect(result.current.error?.type).toBe("no-device");

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
    await act(async () => {
      await result.current.requestMic();
    });
    expect(result.current.error?.type).toBe("device-in-use");

    unmount();
  });

  test("requestMic idempotent: 2nd call while in-flight returns same promise; 3rd after success no-ops", async () => {
    let resolveGUM: (s: MediaStream) => void = () => undefined;
    const getUM = jest.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGUM = resolve;
        })
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    let p1: Promise<void> | undefined;
    let p2: Promise<void> | undefined;
    act(() => {
      p1 = result.current.requestMic();
      p2 = result.current.requestMic();
    });
    expect(getUM).toHaveBeenCalledTimes(1);
    expect(result.current.isAcquiring).toBe(true);

    const { stream } = makeFakeStream(1);
    await act(async () => {
      resolveGUM(stream as unknown as MediaStream);
      await Promise.all([p1, p2]);
    });

    expect(result.current.localAudioStream).not.toBeNull();
    expect(getUM).toHaveBeenCalledTimes(1);

    // 3rd call after success: no-op (idempotent).
    await act(async () => {
      await result.current.requestMic();
    });
    expect(getUM).toHaveBeenCalledTimes(1);

    unmount();
  });

  test("requestMic does NOT trigger requestCam", async () => {
    const getUM = jest.fn(
      async () => makeFakeStream(1).stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    expect(getUM).toHaveBeenCalledTimes(1);
    expect(getUM).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: true, video: false })
    );
    expect(result.current.localVideoStream).toBeNull();
    expect(result.current.videoError).toBeNull();

    unmount();
  });
});

describe("useLiveAV — requestCam", () => {
  test("requestCam: calls getUserMedia for video, populates localVideoStream, isCamMuted=false", async () => {
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn(
      async () => video.stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });

    expect(getUM).toHaveBeenCalledTimes(1);
    expect(getUM).toHaveBeenLastCalledWith(
      expect.objectContaining({ audio: false, video: true })
    );
    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.isCamMuted).toBe(false);
    expect(result.current.hasCamPermission).toBe("granted");
    expect(result.current.videoError).toBeNull();

    unmount();
  });

  test("requestCam permission denied: videoError set, hasCamPermission='denied', mic untouched", async () => {
    const err = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => {
        throw err;
      }),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });

    expect(result.current.videoError?.type).toBe("permission-denied");
    expect(result.current.hasCamPermission).toBe("denied");
    expect(result.current.localVideoStream).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.localAudioStream).toBeNull();

    unmount();
  });

  test("requestCam independent of requestMic", async () => {
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn(
      async () => video.stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });

    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isActive).toBe(false); // no mic yet

    unmount();
  });

  test("requestMic + requestCam in parallel: both resolve, isAcquiring true during", async () => {
    let resolveAudio: (s: MediaStream) => void = () => undefined;
    let resolveVideo: (s: MediaStream) => void = () => undefined;
    const getUM = jest.fn((constraints: MediaStreamConstraints) => {
      if (constraints.video) {
        return new Promise<MediaStream>((r) => {
          resolveVideo = r;
        });
      }
      return new Promise<MediaStream>((r) => {
        resolveAudio = r;
      });
    });
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    let micP: Promise<void> | undefined;
    let camP: Promise<void> | undefined;
    act(() => {
      micP = result.current.requestMic();
      camP = result.current.requestCam();
    });
    expect(result.current.isAcquiring).toBe(true);

    await act(async () => {
      resolveAudio(makeFakeStream(1, 0).stream as unknown as MediaStream);
      await micP;
    });
    expect(result.current.isAcquiring).toBe(true); // cam still in flight
    expect(result.current.localAudioStream).not.toBeNull();

    await act(async () => {
      resolveVideo(makeFakeStream(0, 1).stream as unknown as MediaStream);
      await camP;
    });
    expect(result.current.isAcquiring).toBe(false);
    expect(result.current.localVideoStream).not.toBeNull();

    unmount();
  });

  test("requestCam idempotent: 2nd call after success no-ops", async () => {
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn(
      async () => video.stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });
    expect(getUM).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.requestCam();
    });
    expect(getUM).toHaveBeenCalledTimes(1);

    unmount();
  });
});

describe("useLiveAV — retryAcquire", () => {
  test("retryAcquire after mic error: re-runs requestMic", async () => {
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
    await act(async () => {
      await result.current.requestMic();
    });
    expect(result.current.error?.type).toBe("permission-denied");
    expect(getUM).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retryAcquire();
    });
    expect(getUM).toHaveBeenCalledTimes(2);
    expect(result.current.localAudioStream).not.toBeNull();
    expect(result.current.error).toBeNull();

    unmount();
  });

  test("retryAcquire after cam error: re-runs requestCam", async () => {
    let attempts = 0;
    const getUM = jest.fn(async (constraints: MediaStreamConstraints) => {
      attempts += 1;
      if (constraints.video && attempts === 1) {
        const e = Object.assign(new Error("denied"), {
          name: "NotAllowedError",
        });
        throw e;
      }
      if (constraints.video) {
        return makeFakeStream(0, 1).stream as unknown as MediaStream;
      }
      return makeFakeStream(1, 0).stream as unknown as MediaStream;
    });
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });
    expect(result.current.videoError?.type).toBe("permission-denied");

    await act(async () => {
      await result.current.retryAcquire();
    });
    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.videoError).toBeNull();

    unmount();
  });

  test("retryAcquire no-op when neither error nor videoError set", async () => {
    const getUM = jest.fn(
      async () => makeFakeStream(1).stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    const initialCalls = getUM.mock.calls.length;

    await act(async () => {
      await result.current.retryAcquire();
    });
    expect(getUM.mock.calls.length).toBe(initialCalls);

    unmount();
  });
});

describe("useLiveAV — mesh + signaling lifecycle", () => {
  test("mesh built once requestMic resolves AND syncClient is non-null", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    expect(meshHandles.capturedOpts.length).toBe(0);

    await act(async () => {
      await result.current.requestMic();
    });

    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });
    expect(sig.capturedOpts.length).toBe(1);
    expect(meshHandles.capturedOpts[0]?.localPeerId).toBe("tutor-A");
    expect(meshHandles.capturedOpts[0]?.sessionId).toBe("wb-1");
    expect(sig.capturedOpts[0]?.localPeerId).toBe("tutor-A");
    expect(result.current.isActive).toBe(true);

    unmount();
    expect(meshHandles.dispose).toHaveBeenCalledTimes(1);
    expect(sig.dispose).toHaveBeenCalledTimes(1);
  });

  test("mesh NOT built before requestMic", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await Promise.resolve();
    });

    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.participants).toEqual([]);

    unmount();
  });

  test("syncClient null: no mesh even after requestMic", async () => {
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: null,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.isActive).toBe(false);
    expect(result.current.localAudioStream).not.toBeNull();

    unmount();
  });

  test("getLocalTracks returns audio tracks after requestMic", async () => {
    const { stream, audioTracks } = makeFakeStream(1);
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _getUserMedia: jest.fn(async () => stream as unknown as MediaStream),
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });

    const gltrk = meshHandles.capturedOpts[0]?.getLocalTracks;
    const out = gltrk?.("any-remote") ?? [];
    expect(out.length).toBe(1);
    expect(out[0]).toBe(audioTracks[0]);

    unmount();
  });

  test("getLocalTracks returns audio + video after both requested", async () => {
    const audio = makeFakeStream(1, 0);
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn((constraints: MediaStreamConstraints) => {
      if (constraints.video) {
        return Promise.resolve(video.stream as unknown as MediaStream);
      }
      return Promise.resolve(audio.stream as unknown as MediaStream);
    });
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _getUserMedia: getUM,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
      await result.current.requestCam();
    });
    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });

    const gltrk = meshHandles.capturedOpts[0]?.getLocalTracks;
    const out = gltrk?.("any-remote") ?? [];
    expect(out.length).toBe(2);
    const kinds = out.map((t) => t.kind).sort();
    expect(kinds).toEqual(["audio", "video"]);

    unmount();
  });
});

describe("useLiveAV — peer membership reconciliation", () => {
  async function withActiveHook(): Promise<{
    result: ReturnType<typeof renderHook<ReturnType<typeof useLiveAV>, unknown>>["result"];
    unmount: () => void;
    sync: ReturnType<typeof makeFakeSyncClient>;
    meshHandles: MeshHandles;
    sig: ReturnType<typeof makeFakeSignaling>;
  }> {
    const sync = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync.sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });
    return { result, unmount, sync, meshHandles, sig };
  }

  test("onRoomPeersChange add: mesh.addPeer called, participant appears with 'new' connection state", async () => {
    const { result, unmount, sync, meshHandles } = await withActiveHook();

    act(() => {
      sync.emitPeers([
        { peerId: "student-B", role: "student", label: "Alex" },
      ]);
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
    const { result, unmount, sync, meshHandles } = await withActiveHook();

    act(() => {
      sync.emitPeers([
        { peerId: "student-B", role: "student" },
        { peerId: "student-C", role: "student" },
      ]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(2);
    });

    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
    });

    expect(meshHandles.removePeer).toHaveBeenCalledWith("student-C");
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });
    expect(result.current.participants[0]?.peerId).toBe("student-B");

    unmount();
  });

  test("participants sorted lexicographically by peerId (3-peer canary)", async () => {
    const { result, unmount, sync } = await withActiveHook();

    act(() => {
      sync.emitPeers([
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

  test("re-emit of identical peer list: mesh.addPeer not called twice; label update applies", async () => {
    const { result, unmount, sync, meshHandles } = await withActiveHook();

    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
    });
    act(() => {
      sync.emitPeers([
        { peerId: "student-B", role: "student", label: "Alex" },
      ]);
    });

    expect(meshHandles.addPeer).toHaveBeenCalledTimes(1);
    expect(result.current.participants[0]?.label).toBe("Alex");

    unmount();
  });
});

describe("useLiveAV — remote tracks + state", () => {
  async function withPeer(peerId = "student-B"): Promise<{
    result: ReturnType<typeof renderHook<ReturnType<typeof useLiveAV>, unknown>>["result"];
    unmount: () => void;
    meshHandles: MeshHandles;
    sig: ReturnType<typeof makeFakeSignaling>;
  }> {
    const sync = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync.sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });
    act(() => {
      sync.emitPeers([{ peerId, role: "student" }]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });
    return { result, unmount, meshHandles, sig };
  }

  test("onRemoteTrack(audio): participant.audioStream contains the track", async () => {
    const { result, unmount, meshHandles } = await withPeer();
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
    const stream = result.current.participants[0]!
      .audioStream as unknown as FakeMediaStream;
    expect(stream.getAudioTracks().length).toBe(1);
    expect(stream.getAudioTracks()[0]).toBe(remoteTrack);

    unmount();
  });

  test("onRemoteTrack(video): participant.videoStream contains the track", async () => {
    const { result, unmount, meshHandles } = await withPeer();
    const remoteVideo = new FakeMediaStreamTrack("video");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteVideo as unknown as MediaStreamTrack
      );
    });

    await waitFor(() => {
      expect(result.current.participants[0]?.videoStream).not.toBeNull();
    });
    expect(result.current.participants[0]?.audioStream).toBeNull();
    const vs = result.current.participants[0]!
      .videoStream as unknown as FakeMediaStream;
    expect(vs.getVideoTracks().length).toBe(1);
    expect(vs.getVideoTracks()[0]).toBe(remoteVideo);

    unmount();
  });

  test("track 'ended' event removes the track from audioStream", async () => {
    const { result, unmount, meshHandles } = await withPeer();
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

  test("peer-mesh state callbacks update participant peer/ice connection state", async () => {
    const { result, unmount, meshHandles } = await withPeer();

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
    const { stream, audioTracks } = makeFakeStream(1);
    const getUM = jest.fn(async () => stream as unknown as MediaStream);
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    expect(result.current.isMicMuted).toBe(false);
    expect(audioTracks[0]!.enabled).toBe(true);

    act(() => {
      result.current.toggleMic();
    });
    expect(result.current.isMicMuted).toBe(true);
    expect(audioTracks[0]!.enabled).toBe(false);

    act(() => {
      result.current.toggleMic();
    });
    expect(result.current.isMicMuted).toBe(false);
    expect(audioTracks[0]!.enabled).toBe(true);

    unmount();
  });

  test("toggleCam flips video track.enabled and isCamMuted (after requestCam)", async () => {
    const video = makeFakeStream(0, 1);
    const videoTrack = video.videoTracks[0]!;
    const getUM = jest.fn(
      async () => video.stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });
    expect(result.current.isCamMuted).toBe(false);
    expect(videoTrack.enabled).toBe(true);

    act(() => {
      result.current.toggleCam();
    });
    expect(result.current.isCamMuted).toBe(true);
    expect(videoTrack.enabled).toBe(false);

    act(() => {
      result.current.toggleCam();
    });
    expect(result.current.isCamMuted).toBe(false);
    expect(videoTrack.enabled).toBe(true);

    unmount();
  });

  test("toggleCam before requestCam: state flips, no tracks to apply yet", async () => {
    const props = makeBaseProps();
    const { result, unmount } = renderHook(() => useLiveAV(props));
    expect(result.current.isCamMuted).toBe(true);

    act(() => {
      result.current.toggleCam();
    });
    expect(result.current.isCamMuted).toBe(false);
    // No video stream — toggle is a state-only flip until requestCam.
    expect(result.current.localVideoStream).toBeNull();

    unmount();
  });

  test("reconnectPeer calls mesh.restart", async () => {
    const sync = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync.sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
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
      syncClient: null,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
      log: { log: jest.fn(), warn: warnLog, error: jest.fn() },
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
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
    const { stream: localStream, audioTracks: localAud } = makeFakeStream(1);
    const sync = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync.sync,
      _getUserMedia: jest.fn(
        async () => localStream as unknown as MediaStream
      ),
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
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
    expect(localAud[0]!.stopped).toBe(true);
    expect(remoteTrack.stopped).toBe(true);
  });

  test("peer removal stops their remote tracks", async () => {
    const sync = makeFakeSyncClient();
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: sync.sync,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
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
      sync.emitPeers([]);
    });
    await waitFor(() => {
      expect(result.current.participants.length).toBe(0);
    });
    expect(remoteTrack.stopped).toBe(true);

    type Cast = AvParticipant;
    void ({} as Cast);

    unmount();
  });

  test("unmount stops local video tracks acquired via requestCam", async () => {
    const video = makeFakeStream(0, 1);
    const videoTrack = video.videoTracks[0]!;
    const props = makeBaseProps({
      _getUserMedia: jest.fn(
        async () => video.stream as unknown as MediaStream
      ),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });
    expect(videoTrack.stopped).toBe(false);

    unmount();
    expect(videoTrack.stopped).toBe(true);
  });
});
