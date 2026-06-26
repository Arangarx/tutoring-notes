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
 *   - Mesh builds once sync-client is present AND at least one of mic
 *     / camera streams is present; deps include video so cam-after-mic
 *     rebuilds mesh.
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
  addLocalTrackToAllPeers: jest.Mock;
  replaceLocalTrackOnAllPeers: jest.Mock;
  triggerRenegotiationOnPeers: jest.Mock;
  dispose: jest.Mock;
  emitTrack: (
    peerId: string,
    track: MediaStreamTrack,
    streams?: MediaStream[]
  ) => void;
  emitPcState: (peerId: string, state: RTCPeerConnectionState) => void;
  emitIceState: (peerId: string, state: RTCIceConnectionState) => void;
  emitLeave: (peerId: string) => void;
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
  // Default: returns empty sets (no active peers). Override with
  // .mockReturnValue({ addedPeerIds: new Set(['B']), skippedPeerIds: new Set() })
  // in tests that exercise the add-vs-skip branching logic.
  const addLocalTrackToAllPeers = jest.fn(() => ({
    addedPeerIds: new Set<string>(),
    skippedPeerIds: new Set<string>(),
  }));
  const replaceLocalTrackOnAllPeers = jest.fn();
  const triggerRenegotiationOnPeers = jest.fn();
  const dispose = jest.fn(() => {
    disposed = true;
    trackSubs.clear();
    pcSubs.clear();
    iceSubs.clear();
  });

  const leaveSubs = new Set<(peerId: string) => void>();

  const mesh: PeerMesh = {
    addPeer,
    removePeer,
    peers: () => peerSet,
    restart,
    addLocalTrackToAllPeers,
    replaceLocalTrackOnAllPeers,
    triggerRenegotiationOnPeers,
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
    onPeerLeave: (cb) => {
      leaveSubs.add(cb);
      return () => {
        leaveSubs.delete(cb);
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
    addLocalTrackToAllPeers,
    replaceLocalTrackOnAllPeers,
    triggerRenegotiationOnPeers,
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
    emitLeave: (peerId: string) => {
      for (const cb of leaveSubs) cb(peerId);
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
    await act(async () => {
      await Promise.resolve();
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

  test("requestCam independent of requestMic (cam alone still activates mesh when sync on)", async () => {
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn(
      async () => video.stream as unknown as MediaStream
    );
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      _getUserMedia: getUM,
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });

    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.localAudioStream).toBeNull();
    expect(result.current.isActive).toBe(true);
    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });
    const gltrk = meshHandles.capturedOpts[0]?.getLocalTracks;
    const out = gltrk?.("r1") ?? [];
    expect(out.length).toBe(1);
    expect(out[0]).toBe(video.videoTracks[0]);

    unmount();
  });

  test("requestMic then requestCam: device mutex serializes getUserMedia", async () => {
    const audio = makeFakeStream(1, 0);
    const video = makeFakeStream(0, 1);
    const getUM = jest.fn((constraints: MediaStreamConstraints) => {
      if (constraints.video) {
        return Promise.resolve(video.stream as unknown as MediaStream);
      }
      return Promise.resolve(audio.stream as unknown as MediaStream);
    });
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
      await result.current.requestCam();
    });
    expect(result.current.localAudioStream).not.toBeNull();
    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.isAcquiring).toBe(false);
    expect(getUM).toHaveBeenCalledTimes(2);

    unmount();
  });

  test("requestMicAndCam: single getUserMedia populates audio + video streams", async () => {
    const both = makeFakeStream(1, 1);
    const getUM = jest.fn(
      async () => both.stream as unknown as MediaStream
    );
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMicAndCam();
    });
    expect(getUM).toHaveBeenCalledTimes(1);
    expect(result.current.localAudioStream).not.toBeNull();
    expect(result.current.localVideoStream).not.toBeNull();
    expect(result.current.isCamMuted).toBe(false);
    expect(result.current.isAcquiring).toBe(false);

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

  // -----------------------------------------------------------------
  // Regression: May 15 evening smoke. Tutor granted mic first → mesh
  // built. Tutor later clicked "Allow camera" → localVideoStream
  // changed null→stream. Pre-fix: mesh-build effect's
  // [localAudioStream, localVideoStream] dep array forced a full
  // mesh.dispose() + rebuild, dropping son's audio + video for the
  // entire renegotiation window. Post-fix: the mesh stays up, and
  // the new cam track is fanned out to every existing peer via
  // mesh.addLocalTrackToAllPeers — perfect negotiation handles the
  // SDP refresh in-place.
  //
  // This test asserts the contract: mic-then-cam in a real
  // sequencing produces EXACTLY ONE mesh build + ZERO disposes
  // (until unmount), and the cam track is routed through
  // addLocalTrackToAllPeers rather than via getLocalTracks on a
  // freshly-rebuilt mesh.
  // -----------------------------------------------------------------
  test("regression: requestMic then requestCam does NOT dispose+rebuild mesh; cam track fans out via addLocalTrackToAllPeers", async () => {
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

    // Step 1: mic-first acquisition builds the mesh.
    await act(async () => {
      await result.current.requestMic();
    });
    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });
    expect(meshHandles.dispose).not.toHaveBeenCalled();

    // Step 2: cam acquired mid-session — the late-arriving cam track
    // must travel through addLocalTrackToAllPeers, NOT through a
    // mesh rebuild.
    await act(async () => {
      await result.current.requestCam();
    });
    expect(meshHandles.capturedOpts.length).toBe(1); // STILL ONE
    expect(meshHandles.dispose).not.toHaveBeenCalled();
    // The video track was fanned out via addLocalTrackToAllPeers.
    // (The mic track may have been fanned out too — when there are
    // 0 peers, the call is a harmless no-op, so we don't assert on
    // it negatively. The crucial contract is that the mesh wasn't
    // disposed + rebuilt.)
    const fannedTracks = meshHandles.addLocalTrackToAllPeers.mock.calls.map(
      (c: unknown[]) => c[0]
    );
    expect(fannedTracks).toContain(video.videoTracks[0]);
    // With 0 peers, addLocalTrackToAllPeers returns empty sets, so
    // neither replaceLocalTrackOnAllPeers nor triggerRenegotiationOnPeers
    // is called — both are no-ops with no active peers.
    expect(meshHandles.replaceLocalTrackOnAllPeers).not.toHaveBeenCalledWith(
      "video",
      video.videoTracks[0]
    );
    expect(meshHandles.triggerRenegotiationOnPeers).not.toHaveBeenCalled();

    // Cleanup: unmount triggers exactly one dispose.
    unmount();
    expect(meshHandles.dispose).toHaveBeenCalledTimes(1);
  });

  test("regression: requestCam then requestMic ALSO does NOT rebuild; mic track fans out via addLocalTrackToAllPeers", async () => {
    // Mirror-image of the above — covers the cam-first user flow
    // (e.g. tutor previewed video before turning mic on).
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
      await result.current.requestCam();
    });
    await waitFor(() => {
      expect(meshHandles.capturedOpts.length).toBe(1);
    });
    expect(meshHandles.dispose).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.requestMic();
    });
    expect(meshHandles.capturedOpts.length).toBe(1);
    expect(meshHandles.dispose).not.toHaveBeenCalled();
    const fannedTracks = meshHandles.addLocalTrackToAllPeers.mock.calls.map(
      (c: unknown[]) => c[0]
    );
    expect(fannedTracks).toContain(audio.audioTracks[0]);
    // With 0 peers, addLocalTrackToAllPeers returns empty sets, so
    // neither replaceLocalTrackOnAllPeers nor triggerRenegotiationOnPeers
    // is called — both are no-ops with no active peers.
    expect(meshHandles.replaceLocalTrackOnAllPeers).not.toHaveBeenCalledWith(
      "audio",
      audio.audioTracks[0]
    );
    expect(meshHandles.triggerRenegotiationOnPeers).not.toHaveBeenCalled();

    unmount();
  });

  // -----------------------------------------------------------------
  // Add vs. skip branching — verifies the late-add-video renegotiation
  // fix (the root cause of "tutor never sees student's video").
  // -----------------------------------------------------------------

  test("late-add path (addedPeerIds non-empty): calls triggerRenegotiationOnPeers, NOT replaceLocalTrackOnAllPeers for video", async () => {
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

    // Configure the mesh to report that video track was ADDED (new sender).
    meshHandles.addLocalTrackToAllPeers.mockReturnValue({
      addedPeerIds: new Set(["student-abc"]),
      skippedPeerIds: new Set<string>(),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    await act(async () => { await result.current.requestMic(); });
    meshHandles.addLocalTrackToAllPeers.mockClear();
    meshHandles.triggerRenegotiationOnPeers.mockClear();
    meshHandles.replaceLocalTrackOnAllPeers.mockClear();

    await act(async () => { await result.current.requestCam(); });

    // triggerRenegotiationOnPeers must be called for the add path.
    expect(meshHandles.triggerRenegotiationOnPeers).toHaveBeenCalledWith(["student-abc"]);
    // replaceLocalTrackOnAllPeers must NOT be called for the add path —
    // calling replaceTrack(sameTrack) on a freshly-created sender can
    // interfere with Chrome's pending onnegotiationneeded evaluation.
    expect(meshHandles.replaceLocalTrackOnAllPeers).not.toHaveBeenCalledWith(
      "video",
      video.videoTracks[0]
    );

    unmount();
  });

  test("hotswap path (skippedPeerIds non-empty): calls replaceLocalTrackOnAllPeers for video, NOT triggerRenegotiationOnPeers", async () => {
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

    // Configure the mesh to report that video sender already existed (hotswap).
    meshHandles.addLocalTrackToAllPeers.mockReturnValue({
      addedPeerIds: new Set<string>(),
      skippedPeerIds: new Set(["student-abc"]),
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));

    await act(async () => { await result.current.requestMic(); });
    meshHandles.addLocalTrackToAllPeers.mockClear();
    meshHandles.triggerRenegotiationOnPeers.mockClear();
    meshHandles.replaceLocalTrackOnAllPeers.mockClear();

    await act(async () => { await result.current.requestCam(); });

    // replaceLocalTrackOnAllPeers must be called for the hotswap path.
    expect(meshHandles.replaceLocalTrackOnAllPeers).toHaveBeenCalledWith(
      "video",
      video.videoTracks[0]
    );
    // triggerRenegotiationOnPeers must NOT be called — no renegotiation needed
    // when replacing an existing sender (replaceTrack has no SDP side-effect).
    expect(meshHandles.triggerRenegotiationOnPeers).not.toHaveBeenCalled();

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

  test("syncClient null: no mesh even after requestCam", async () => {
    const video = makeFakeStream(0, 1);
    const meshHandles = makeFakeMesh();
    const sig = makeFakeSignaling();
    const props = makeBaseProps({
      syncClient: null,
      _getUserMedia: jest.fn(
        async () => video.stream as unknown as MediaStream
      ),
      _createPeerMesh: meshHandles.factory,
      _createSignaling: sig.factory,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestCam();
    });

    expect(meshHandles.capturedOpts.length).toBe(0);
    expect(sig.capturedOpts.length).toBe(0);
    expect(result.current.isActive).toBe(false);
    expect(result.current.localVideoStream).not.toBeNull();

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

  /**
   * TRACK-BEFORE-PRESENCE regression test (2026-06-16).
   *
   * Reproduces the tutor-side asymmetric-receive bug: on the host
   * (tutor), peer-mesh can fire ontrack for the student's peerId
   * BEFORE sync presence has emitted that peerId via onRoomPeersChange.
   * The pre-fix code dropped the track permanently. The fix buffers the
   * track and flushes it when the peer's internal entry is first created.
   *
   * jsdom cannot exercise real WebRTC. This test validates the
   * buffer/flush logic path only. The definitive proof is a two-device
   * LV-2 smoke: student grants cam → tutor sees a second tile with live
   * video.
   */
  test("TRACK-BEFORE-PRESENCE: remote track arriving before sync presence is buffered and flushed when presence arrives", async () => {
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

    // At this point: no presence for "student-B" yet.
    expect(result.current.participants.length).toBe(0);

    // Remote track arrives BEFORE presence — the race scenario.
    const remoteVideo = new FakeMediaStreamTrack("video");
    act(() => {
      meshHandles.emitTrack(
        "student-B",
        remoteVideo as unknown as MediaStreamTrack
      );
    });

    // Track should still be buffered — no participant entry yet.
    await act(async () => { await Promise.resolve(); });
    expect(result.current.participants.length).toBe(0);

    // Now presence arrives — buffer must be drained.
    act(() => {
      sync.emitPeers([{ peerId: "student-B", role: "student" }]);
    });

    await waitFor(() => {
      expect(result.current.participants.length).toBe(1);
    });

    // The buffered track must have been flushed onto the participant.
    const participant = result.current.participants[0]!;
    expect(participant.peerId).toBe("student-B");
    expect(participant.videoStream).not.toBeNull();
    const vs = participant.videoStream as unknown as FakeMediaStream;
    expect(vs.getVideoTracks().length).toBe(1);
    expect(vs.getVideoTracks()[0]).toBe(remoteVideo);

    unmount();
  });

  test("presence-then-track happy path still works (no regression)", async () => {
    // Normal order: presence first, then track. Must keep working.
    const { result, unmount, meshHandles } = await withPeer("student-C");
    const remoteAudio = new FakeMediaStreamTrack("audio");
    act(() => {
      meshHandles.emitTrack(
        "student-C",
        remoteAudio as unknown as MediaStreamTrack
      );
    });

    await waitFor(() => {
      expect(result.current.participants[0]?.audioStream).not.toBeNull();
    });
    const stream = result.current.participants[0]!
      .audioStream as unknown as FakeMediaStream;
    expect(stream.getAudioTracks()[0]).toBe(remoteAudio);

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

  /**
   * Phase 4d Commit 5 — regression guard for BACKLOG.md
   * "Student-side 'Mute mic' toggle does not propagate to remote
   * participants" (Andrew, May 15 evening smoke).
   *
   * Real-pilot follow-up confirmed the bug was fixed at some
   * point before the 4c merge (likely as a side effect of the
   * Web Audio fan-out refactor that landed in `5ac2f76`); the
   * BACKLOG just never got the ✅ flip. These tests lock the
   * wire-level contract so a future refactor (e.g. introducing a
   * separate publish vs preview track on the STUDENT side, which
   * doesn't have fan-out today but might tomorrow) cannot silently
   * re-introduce the asymmetric mute that pilot smoke caught.
   *
   * Wire-level proof shape:
   *   - `useLiveAV.toggleMic()` flips `track.enabled = false` on
   *     EVERY local audio track.
   *   - The peer-mesh's `getLocalTracks()` closure returns the
   *     SAME track identity (verified indirectly: the toggled
   *     track is the one exposed via `result.current.localAudioStream`).
   *   - When the host passes `externalAudioStream` (the tutor's
   *     mic-recorder-audio publishStream), the same toggle path
   *     applies — track.enabled flips on the external stream's
   *     tracks too. (Recording's separate Web Audio destination
   *     keeps capturing — that's the desired
   *     "mute peer but keep recording" asymmetry.)
   */
  test("regression guard: toggleMic flips track.enabled on EVERY local audio track (multi-track / stereo capture)", async () => {
    const { stream, audioTracks } = makeFakeStream(3);
    const getUM = jest.fn(async () => stream as unknown as MediaStream);
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    for (const t of audioTracks) expect(t.enabled).toBe(true);

    act(() => {
      result.current.toggleMic();
    });
    // Every track must flip — a regression where only the first
    // track is muted would silently leak audio on the remaining
    // tracks. The bug pilot smoke caught corresponds to either
    // (a) flipping zero tracks (UI-only state), or (b) flipping
    // the wrong stream's tracks. Asserting all-tracks-flipped
    // covers both.
    for (const t of audioTracks) expect(t.enabled).toBe(false);
    expect(result.current.isMicMuted).toBe(true);

    act(() => {
      result.current.toggleMic();
    });
    for (const t of audioTracks) expect(t.enabled).toBe(true);
    expect(result.current.isMicMuted).toBe(false);

    unmount();
  });

  test("regression guard: toggled track is the SAME identity as result.current.localAudioStream.getAudioTracks()[i] (peer-mesh getLocalTracks closure can't drift)", async () => {
    const { stream, audioTracks } = makeFakeStream(2);
    const getUM = jest.fn(async () => stream as unknown as MediaStream);
    const props = makeBaseProps({ _getUserMedia: getUM });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    await act(async () => {
      await result.current.requestMic();
    });

    const exposedTracks =
      result.current.localAudioStream?.getAudioTracks() ?? [];
    expect(exposedTracks.length).toBe(2);
    // Identity check: the exposed tracks ARE the underlying
    // fake tracks. peer-mesh.getLocalTracks() pulls from the same
    // ref so muting via `enabled = false` on these will land on
    // the RTCRtpSender's track and produce wire-silence.
    expect(exposedTracks[0]).toBe(audioTracks[0]);
    expect(exposedTracks[1]).toBe(audioTracks[1]);

    act(() => {
      result.current.toggleMic();
    });
    // The same exposed track instance now reads enabled=false.
    expect(exposedTracks[0]!.enabled).toBe(false);
    expect(exposedTracks[1]!.enabled).toBe(false);

    unmount();
  });

  test("regression guard: when externalAudioStream is supplied (tutor recorder publishStream), toggleMic still flips its tracks", async () => {
    // Build an external stream up-front — the tutor recorder's
    // mic-recorder-audio.createMicAudioGraph() publishStream
    // shape: a MediaStream with a single audio track.
    const external = makeFakeStream(1);
    const props = makeBaseProps({
      externalAudioStream: external.stream as unknown as MediaStream,
    });

    const { result, unmount } = renderHook(() => useLiveAV(props));
    // No requestMic() needed — the externalAudioStream wires
    // automatically via the effect at hook line ~775.
    await waitFor(() => {
      expect(result.current.localAudioStream).not.toBeNull();
    });

    expect(external.audioTracks[0]!.enabled).toBe(true);
    expect(result.current.isMicMuted).toBe(false);

    act(() => {
      result.current.toggleMic();
    });
    // External stream's tracks were the ones flipped — the
    // recording's *separate* Web Audio destination keeps
    // capturing, which is the desired asymmetry.
    expect(external.audioTracks[0]!.enabled).toBe(false);
    expect(result.current.isMicMuted).toBe(true);

    act(() => {
      result.current.toggleMic();
    });
    expect(external.audioTracks[0]!.enabled).toBe(true);
    expect(result.current.isMicMuted).toBe(false);

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

// =================================================================
// Stale-peer eviction timing — 6s window (invariant 3, docs/LIVE-AV.md;
// reliability floor "slow tutor recovery" fix, 2026-06-26)
//
// When a peer's PC stays disconnected/failed for PEER_EVICTION_TIMEOUT_MS
// the hook drops it from the internal map (mesh.removePeer + rebuild) so
// the FSM pauses recording instead of capturing tutor-only audio. The
// window was shortened 10s → 6s so the tutor stops holding a dead PC for
// the remote peer's blip; a recovery before the window must NOT evict.
// =================================================================
describe("useLiveAV — stale-peer eviction timing (6s, invariant 3)", () => {
  async function activeWithPeer(peerId = "student-B"): Promise<{
    result: ReturnType<
      typeof renderHook<ReturnType<typeof useLiveAV>, unknown>
    >["result"];
    unmount: () => void;
    meshHandles: MeshHandles;
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
    return { result, unmount, meshHandles };
  }

  test("evicts a peer that stays disconnected past the 6s window", async () => {
    const { unmount, meshHandles } = await activeWithPeer("student-B");
    jest.useFakeTimers();
    try {
      act(() => {
        meshHandles.emitPcState("student-B", "disconnected");
      });
      // Just before 6s: the 3s ICE-restart + ~3s reconnect window — NOT yet evicted.
      act(() => {
        jest.advanceTimersByTime(5_999);
      });
      expect(meshHandles.removePeer).not.toHaveBeenCalledWith("student-B");
      // Cross the 6s threshold — the dead PC is evicted.
      act(() => {
        jest.advanceTimersByTime(2);
      });
      expect(meshHandles.removePeer).toHaveBeenCalledWith("student-B");
    } finally {
      jest.useRealTimers();
      unmount();
    }
  });

  test("does NOT evict a peer that recovers (connected) before the 6s window", async () => {
    const { unmount, meshHandles } = await activeWithPeer("student-B");
    jest.useFakeTimers();
    try {
      act(() => {
        meshHandles.emitPcState("student-B", "disconnected");
      });
      act(() => {
        jest.advanceTimersByTime(3_000);
      });
      // ICE-restart recovers the peer before eviction fires.
      act(() => {
        meshHandles.emitPcState("student-B", "connected");
      });
      // Advance well past the old 10s window — eviction must have been cancelled.
      act(() => {
        jest.advanceTimersByTime(10_000);
      });
      expect(meshHandles.removePeer).not.toHaveBeenCalledWith("student-B");
    } finally {
      jest.useRealTimers();
      unmount();
    }
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

// -----------------------------------------------------------------
// Device enumeration single-flight + never-downgrade (invariant 14)
//
// wb-wave5-polish reliability floor: every `enumerateDevices()` call
// must run THROUGH the `chainDeviceAcquire` mutex (never concurrently
// with a getUserMedia acquire — the Windows "no webcam / wrong
// dropdown" corruption), rapid out-of-band callers must coalesce, and
// a transient/pre-permission EMPTY enumerate must NEVER overwrite a
// known-good device list. See docs/LIVE-AV.md invariant 14.
//
// The true on-hardware concurrent-acquire corruption is a
// Windows-only failure that the Playwright fake-device harness cannot
// reproduce (PLAYWRIGHT-GAP, docs/BACKLOG.md). These jsdom tests prove
// the fix MECHANISM (single-flight, mutex-serialization, never-
// downgrade), which is the logic that prevents the race.
// -----------------------------------------------------------------

describe("useLiveAV — device enumeration single-flight + never-downgrade (invariant 14)", () => {
  type MutableNavigator = { mediaDevices?: unknown };
  let hadMediaDevices = false;
  let priorMediaDevices: unknown;

  function installEnumerateStub(
    impl: () => Promise<MediaDeviceInfo[]>
  ): jest.Mock<Promise<MediaDeviceInfo[]>, []> {
    const nav = navigator as unknown as MutableNavigator;
    hadMediaDevices = "mediaDevices" in nav;
    priorMediaDevices = nav.mediaDevices;
    const enumerateDevices = jest.fn(impl);
    nav.mediaDevices = {
      enumerateDevices,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    return enumerateDevices;
  }

  afterEach(() => {
    const nav = navigator as unknown as MutableNavigator;
    if (hadMediaDevices) {
      nav.mediaDevices = priorMediaDevices;
    } else {
      delete nav.mediaDevices;
    }
  });

  const dev = (
    deviceId: string,
    kind: "videoinput" | "audioinput",
    label: string
  ): MediaDeviceInfo =>
    ({
      deviceId,
      kind,
      label,
      groupId: `${deviceId}-grp`,
      toJSON() {
        return this;
      },
    }) as unknown as MediaDeviceInfo;

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  test("coalesces a synchronous burst of refresh calls into ONE enumerate (single-flight)", async () => {
    const enumerateDevices = installEnumerateStub(async () => []);
    const props = makeBaseProps();
    const { result, unmount } = renderHook(() => useLiveAV(props));

    // Let the mount enumerate fire + settle so the coalescing ref clears.
    await settle();
    enumerateDevices.mockClear();

    // Three rapid out-of-band callers in the same tick → coalesced to one.
    await act(async () => {
      void result.current.refreshVideoDeviceList();
      void result.current.refreshVideoDeviceList();
      void result.current.refreshAudioDeviceList();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(enumerateDevices).toHaveBeenCalledTimes(1);

    // After it settles, a fresh call enumerates again (ref cleared).
    await act(async () => {
      void result.current.refreshVideoDeviceList();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(enumerateDevices).toHaveBeenCalledTimes(2);

    unmount();
  });

  test("a transient EMPTY enumerate does not overwrite a known-good device list (never-downgrade)", async () => {
    let nextResult: MediaDeviceInfo[] = [
      dev("cam1", "videoinput", "Cam 1"),
      dev("mic1", "audioinput", "Mic 1"),
    ];
    installEnumerateStub(async () => nextResult);
    const props = makeBaseProps();
    const { result, unmount } = renderHook(() => useLiveAV(props));

    // Mount enumerate populates the good list.
    await settle();
    await waitFor(() => {
      expect(result.current.videoDevices.length).toBe(1);
      expect(result.current.audioDevices.length).toBe(1);
    });

    // A transient empty enumerate (pre-permission / Windows race) must
    // NOT wipe the populated picker.
    nextResult = [];
    await act(async () => {
      void result.current.refreshVideoDeviceList();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.videoDevices.length).toBe(1);
    expect(result.current.videoDevices[0]?.deviceId).toBe("cam1");
    expect(result.current.audioDevices.length).toBe(1);
    expect(result.current.audioDevices[0]?.deviceId).toBe("mic1");

    unmount();
  });

  test("never-downgrade is per-kind: a camera-only enumerate cannot wipe the mic list", async () => {
    let nextResult: MediaDeviceInfo[] = [
      dev("cam1", "videoinput", "Cam 1"),
      dev("mic1", "audioinput", "Mic 1"),
    ];
    installEnumerateStub(async () => nextResult);
    const props = makeBaseProps();
    const { result, unmount } = renderHook(() => useLiveAV(props));

    await settle();
    await waitFor(() => {
      expect(result.current.audioDevices.length).toBe(1);
    });

    // Enumerate returns cameras but momentarily no mics — the mic list
    // must survive (a camera plug/unplug can't empty the mic dropdown).
    nextResult = [dev("cam1", "videoinput", "Cam 1")];
    await act(async () => {
      void result.current.refreshVideoDeviceList();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.videoDevices.length).toBe(1);
    expect(result.current.audioDevices.length).toBe(1);
    expect(result.current.audioDevices[0]?.deviceId).toBe("mic1");

    unmount();
  });

  test("an out-of-band enumerate does NOT run concurrently with an in-flight getUserMedia acquire (mutex-serialized)", async () => {
    let acquireInFlight = false;
    let ranDuringAcquire = false;
    const enumerateDevices = installEnumerateStub(async () => {
      if (acquireInFlight) ranDuringAcquire = true;
      return [];
    });

    let resolveGUM: (s: MediaStream) => void = () => undefined;
    const getUM = jest.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGUM = resolve;
        })
    );

    const props = makeBaseProps({ _getUserMedia: getUM });
    const { result, unmount } = renderHook(() => useLiveAV(props));

    // Settle the mount enumerate, then start counting fresh.
    await settle();
    enumerateDevices.mockClear();

    // Start a mic acquire that stays pending (holds the device mutex).
    let micPromise: Promise<void> | undefined;
    act(() => {
      acquireInFlight = true;
      micPromise = result.current.requestMic();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Fire an out-of-band enumerate WHILE the acquire is in flight.
    await act(async () => {
      void result.current.refreshVideoDeviceList();
      await Promise.resolve();
      await Promise.resolve();
    });

    // It must be queued behind the acquire — not executed yet. Pre-fix,
    // refreshVideoDevices called enumerateDevices() directly and it would
    // have run concurrently here (the Windows-corruption race).
    expect(enumerateDevices).not.toHaveBeenCalled();
    expect(ranDuringAcquire).toBe(false);

    // Complete the acquire — the queued enumerate may now run, and only
    // after the acquire released the mutex.
    await act(async () => {
      acquireInFlight = false;
      resolveGUM(makeFakeStream(1).stream as unknown as MediaStream);
      await micPromise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ranDuringAcquire).toBe(false);

    unmount();
  });
});
