/**
 * @jest-environment jsdom
 */

import React, { useState } from "react";
import { render, act, cleanup } from "@testing-library/react";

import { useRemoteMicRecorders } from "@/hooks/useRemoteMicRecorders";
import {
  studentMicStreamId,
  type RemoteStreamRecorder,
  type RemoteStreamRecorderOptions,
} from "@/lib/recording/remote-stream-recorder";
import type { AvParticipant } from "@/hooks/useLiveAV";
import type { UploadOutbox } from "@/lib/recording/upload-outbox";

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

/**
 * Build a fake `RemoteStreamRecorder` whose `start` / `stop` /
 * `dispose` we can spy on; tracks isRecording state. The recorder
 * orchestrator hook reads `isRecording()` between start/stop
 * transitions, so the fake must honor that contract.
 */
function makeFakeRecorder(): RemoteStreamRecorder & {
  startSpy: jest.Mock;
  stopSpy: jest.Mock;
  disposeSpy: jest.Mock;
} {
  let recording = false;
  const startSpy = jest.fn();
  const stopSpy = jest.fn().mockResolvedValue(undefined);
  const disposeSpy = jest.fn();
  const rec = {
    start: jest.fn(() => {
      startSpy();
      recording = true;
    }),
    stop: jest.fn(async () => {
      await stopSpy();
      recording = false;
    }),
    isRecording: () => recording,
    dispose: jest.fn(() => {
      disposeSpy();
      recording = false;
    }),
    startSpy,
    stopSpy,
    disposeSpy,
  };
  return rec as unknown as RemoteStreamRecorder & {
    startSpy: jest.Mock;
    stopSpy: jest.Mock;
    disposeSpy: jest.Mock;
  };
}

function makeFakeOutbox(): UploadOutbox {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
    onChange: jest.fn(() => () => {}),
    list: jest.fn().mockResolvedValue([]),
    getInFlightCount: jest.fn(() => 0),
    drain: jest.fn().mockResolvedValue(undefined),
  } as unknown as UploadOutbox;
}

function makeFakeAudioStream(id: string): MediaStream {
  const track = {
    kind: "audio" as const,
    enabled: true,
    readyState: "live" as const,
    id,
  };
  return {
    id,
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeParticipant(
  peerId: string,
  overrides: Partial<AvParticipant> = {}
): AvParticipant {
  return {
    peerId,
    role: "student",
    audioStream: makeFakeAudioStream(`stream-${peerId}`),
    videoStream: null,
    peerConnectionState: "connected",
    iceConnectionState: "connected",
    ...overrides,
  };
}

/**
 * Tiny host that drives the hook in a controlled way. Exposes a
 * `setState` setter via window so the test can mutate inputs
 * inside `act(...)`.
 */
type HostState = {
  participants: ReadonlyArray<AvParticipant>;
  shouldCapture: (streamId: string) => boolean;
  mutedPeerIds: ReadonlySet<string>;
};
let setHostStateExternal: ((next: HostState) => void) | null = null;
function Host(props: {
  initial: HostState;
  recorderFactory: jest.Mock<RemoteStreamRecorder, [RemoteStreamRecorderOptions]>;
  outbox: UploadOutbox;
  sessionId: string;
}) {
  const [state, setState] = useState(props.initial);
  setHostStateExternal = setState;
  useRemoteMicRecorders({
    participants: state.participants,
    sessionId: props.sessionId,
    shouldCapture: state.shouldCapture,
    mutedPeerIdsInRecording: state.mutedPeerIds,
    outbox: props.outbox,
    _createRecorder: props.recorderFactory,
  });
  return null;
}

function renderHost(initial: HostState) {
  const recorders = new Map<string, ReturnType<typeof makeFakeRecorder>>();
  const recorderFactory = jest.fn(
    (opts: RemoteStreamRecorderOptions): RemoteStreamRecorder => {
      const rec = makeFakeRecorder();
      // Track by streamId so multiple recorders are addressable in
      // tests; production never reuses streamIds.
      recorders.set(opts.streamId, rec);
      return rec;
    }
  );
  const outbox = makeFakeOutbox();
  const result = render(
    <Host
      initial={initial}
      recorderFactory={recorderFactory}
      outbox={outbox}
      sessionId="sess-001"
    />
  );
  return { ...result, recorderFactory, recorders, outbox };
}

describe("useRemoteMicRecorders — recorder lifecycle reconciliation", () => {
  test("instantiates a recorder per participant on mount, with the canonical streamId", () => {
    const ps = [makeParticipant("peer-a"), makeParticipant("peer-b")];
    const { recorderFactory } = renderHost({
      participants: ps,
      shouldCapture: () => false,
      mutedPeerIds: new Set(),
    });
    expect(recorderFactory).toHaveBeenCalledTimes(2);
    const streamIds = recorderFactory.mock.calls.map(
      (c) => (c[0] as RemoteStreamRecorderOptions).streamId
    );
    expect(streamIds.sort()).toEqual(
      [studentMicStreamId("peer-a"), studentMicStreamId("peer-b")].sort()
    );
  });

  test("does NOT instantiate a recorder when audioStream is null (peer joined but track not yet landed)", () => {
    const ps = [
      makeParticipant("peer-a", { audioStream: null }),
      makeParticipant("peer-b"),
    ];
    const { recorderFactory, recorders } = renderHost({
      participants: ps,
      shouldCapture: () => false,
      mutedPeerIds: new Set(),
    });
    expect(recorderFactory).toHaveBeenCalledTimes(1);
    expect(recorders.has(studentMicStreamId("peer-b"))).toBe(true);
    expect(recorders.has(studentMicStreamId("peer-a"))).toBe(false);
  });

  test("when a participant's audioStream lands on a subsequent render, a recorder is created", () => {
    const ps0 = [makeParticipant("peer-a", { audioStream: null })];
    const { recorderFactory } = renderHost({
      participants: ps0,
      shouldCapture: () => false,
      mutedPeerIds: new Set(),
    });
    expect(recorderFactory).toHaveBeenCalledTimes(0);

    act(() => {
      setHostStateExternal!({
        participants: [makeParticipant("peer-a")],
        shouldCapture: () => false,
        mutedPeerIds: new Set(),
      });
    });
    expect(recorderFactory).toHaveBeenCalledTimes(1);
  });

  test("disposes recorders for peers that leave (and stops them first)", () => {
    const ps = [makeParticipant("peer-a"), makeParticipant("peer-b")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: (sid) => sid === studentMicStreamId("peer-a"),
      mutedPeerIds: new Set(),
    });
    const recA = recorders.get(studentMicStreamId("peer-a"));
    const recB = recorders.get(studentMicStreamId("peer-b"));
    expect(recA?.disposeSpy).not.toHaveBeenCalled();
    expect(recB?.disposeSpy).not.toHaveBeenCalled();

    // Peer A leaves.
    act(() => {
      setHostStateExternal!({
        participants: [makeParticipant("peer-b")],
        shouldCapture: () => false,
        mutedPeerIds: new Set(),
      });
    });
    expect(recA?.stop).toHaveBeenCalled();
    expect(recA?.disposeSpy).toHaveBeenCalled();
    expect(recB?.disposeSpy).not.toHaveBeenCalled();
  });

  test("3-peer canary: tutor + 2 students all get independent recorders", () => {
    // The orchestrator never sees the tutor (the tutor is local); the
    // 3-peer canary at this layer is 2 remote student peers + the
    // local tutor implicit. Pin the multi-peer-recorder shape so a
    // future refactor can't quietly serialize them.
    const ps = [
      makeParticipant("peer-A"),
      makeParticipant("peer-B"),
      makeParticipant("peer-C"),
    ];
    const { recorderFactory, recorders } = renderHost({
      participants: ps,
      shouldCapture: () => false,
      mutedPeerIds: new Set(),
    });
    expect(recorderFactory).toHaveBeenCalledTimes(3);
    expect(recorders.size).toBe(3);
    for (const id of ["peer-A", "peer-B", "peer-C"]) {
      expect(recorders.has(studentMicStreamId(id))).toBe(true);
    }
  });
});

describe("useRemoteMicRecorders — start / stop gating", () => {
  test("starts a recorder when shouldCapture flips to true", () => {
    let shouldCaptureFn: (sid: string) => boolean = () => false;
    const ps = [makeParticipant("peer-a")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: (sid) => shouldCaptureFn(sid),
      mutedPeerIds: new Set(),
    });
    const rec = recorders.get(studentMicStreamId("peer-a"))!;
    expect(rec.startSpy).not.toHaveBeenCalled();

    // Flip shouldCapture true.
    act(() => {
      shouldCaptureFn = () => true;
      setHostStateExternal!({
        participants: ps,
        shouldCapture: (sid) => shouldCaptureFn(sid),
        mutedPeerIds: new Set(),
      });
    });
    expect(rec.startSpy).toHaveBeenCalledTimes(1);
  });

  test("stops a recorder when shouldCapture flips to false mid-recording", () => {
    const ps = [makeParticipant("peer-a")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: () => true,
      mutedPeerIds: new Set(),
    });
    const rec = recorders.get(studentMicStreamId("peer-a"))!;
    expect(rec.startSpy).toHaveBeenCalledTimes(1);

    act(() => {
      setHostStateExternal!({
        participants: ps,
        shouldCapture: () => false,
        mutedPeerIds: new Set(),
      });
    });
    expect(rec.stopSpy).toHaveBeenCalled();
  });

  test("moderation override blocks start even when shouldCapture returns true", () => {
    const ps = [makeParticipant("peer-a")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: () => true,
      mutedPeerIds: new Set(["peer-a"]),
    });
    const rec = recorders.get(studentMicStreamId("peer-a"))!;
    expect(rec.startSpy).not.toHaveBeenCalled();
  });

  test("flipping moderation override mid-recording stops the recorder", () => {
    const ps = [makeParticipant("peer-a")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: () => true,
      mutedPeerIds: new Set(),
    });
    const rec = recorders.get(studentMicStreamId("peer-a"))!;
    expect(rec.startSpy).toHaveBeenCalledTimes(1);

    act(() => {
      setHostStateExternal!({
        participants: ps,
        shouldCapture: () => true,
        mutedPeerIds: new Set(["peer-a"]),
      });
    });
    expect(rec.stopSpy).toHaveBeenCalled();
  });

  test("clearing moderation override resumes capture if shouldCapture is still true", () => {
    const ps = [makeParticipant("peer-a")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: () => true,
      mutedPeerIds: new Set(["peer-a"]),
    });
    const rec = recorders.get(studentMicStreamId("peer-a"))!;
    expect(rec.startSpy).not.toHaveBeenCalled();

    act(() => {
      setHostStateExternal!({
        participants: ps,
        shouldCapture: () => true,
        mutedPeerIds: new Set(),
      });
    });
    expect(rec.startSpy).toHaveBeenCalledTimes(1);
  });

  test("multi-peer: per-peer shouldCapture decisions are independent", () => {
    const ps = [makeParticipant("peer-a"), makeParticipant("peer-b")];
    const { recorders } = renderHost({
      participants: ps,
      shouldCapture: (sid) => sid === studentMicStreamId("peer-a"),
      mutedPeerIds: new Set(),
    });
    const recA = recorders.get(studentMicStreamId("peer-a"))!;
    const recB = recorders.get(studentMicStreamId("peer-b"))!;
    expect(recA.startSpy).toHaveBeenCalledTimes(1);
    expect(recB.startSpy).not.toHaveBeenCalled();
  });
});

describe("useRemoteMicRecorders — unmount teardown", () => {
  test("unmount disposes every recorder (no leaked devices)", () => {
    const ps = [makeParticipant("peer-a"), makeParticipant("peer-b")];
    const { unmount, recorders } = renderHost({
      participants: ps,
      shouldCapture: () => true,
      mutedPeerIds: new Set(),
    });
    const recA = recorders.get(studentMicStreamId("peer-a"))!;
    const recB = recorders.get(studentMicStreamId("peer-b"))!;
    unmount();
    expect(recA.disposeSpy).toHaveBeenCalled();
    expect(recB.disposeSpy).toHaveBeenCalled();
  });
});
