/**
 * Unit tests for the Web Audio helper used by the in-browser recorder.
 *
 * Covers:
 *  - Returns null gracefully when AudioContext is unavailable (test envs / old browsers).
 *  - Returns the expected shape (recordingStream, dispose, getLevel, setGain).
 *  - setGain forwards to the GainNode without rebuilding the graph.
 *  - dispose stops the mic tracks and closes the AudioContext.
 */

import { createMicAudioGraph } from "@/lib/mic-recorder-audio";

type GainParam = { value: number };
type FakeNode = { connect: jest.Mock };

function fakeMicStream() {
  const track = { stop: jest.fn() };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    track,
  };
}

describe("createMicAudioGraph", () => {
  const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

  afterEach(() => {
    if (originalAudioContext === undefined) {
      delete (globalThis as { AudioContext?: unknown }).AudioContext;
    } else {
      (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
    }
  });

  test("returns null when AudioContext is missing (allows raw-stream fallback)", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).toBeNull();
  });

  test("returns null when AudioContext throws (e.g. test stub stream)", async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = function FailingCtx() {
      throw new Error("no audio ctx in test env");
    };
    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).toBeNull();
  });

  test("happy path: builds graph, exposes setGain/getLevel/dispose, cleans up", async () => {
    const gainParam: GainParam = { value: 0 };
    const sourceNode: FakeNode = { connect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        // Inject a small amplitude so getLevel returns > 0.
        for (let i = 0; i < arr.length; i++) arr[i] = 0.1;
      }),
    };
    const recordingStream = { id: "recording-stream" };
    const publishStream = { id: "publish-stream" };
    const destinations = [
      { stream: recordingStream },
      { stream: publishStream },
    ];
    let destIdx = 0;
    const close = jest.fn().mockResolvedValue(undefined);
    const resume = jest.fn().mockResolvedValue(undefined);

    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume,
      close,
    };

    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1.5);

    expect(graph).not.toBeNull();
    expect(resume).toHaveBeenCalled();
    expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(gainParam.value).toBe(1.5);
    // source -> gain, gain -> recordingDest, gain -> publishDest, gain -> analyser
    expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledTimes(3);
    // Two destinations created (recording + publish).
    expect(ctx.createMediaStreamDestination).toHaveBeenCalledTimes(2);

    // recordingStream and publishStream are separate Web Audio destinations.
    expect(graph!.recordingStream).toBe(recordingStream);
    expect(graph!.publishStream).toBe(publishStream);
    expect(graph!.recordingStream).not.toBe(graph!.publishStream);

    // Level should reflect the amplitude we injected.
    const level = graph!.getLevel();
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);

    // setGain updates the live param without rebuilding.
    graph!.setGain(0.75);
    expect(gainParam.value).toBe(0.75);

    // Negative gains clamp to 0 (defensive).
    graph!.setGain(-0.5);
    expect(gainParam.value).toBe(0);

    // dispose stops the mic and closes the context.
    graph!.dispose();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  test("addRemoteAudio mixes remote streams into recordingStream only (NOT publishStream)", async () => {
    // Mixdown contract — the whole point of this feature. Tutor audio
    // goes both places (recording + WebRTC out); remote participant
    // audio goes ONLY to recording. Sending remote audio over
    // WebRTC's publishStream would be a tutor-mediated feedback loop
    // (every peer hears every other peer's voice via the tutor's
    // outbound track on top of their own direct peer connection),
    // which is why publishStream is intentionally excluded.
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: { value: 0 }, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const recordingDest = { stream: { id: "recording-stream" } };
    const publishDest = { stream: { id: "publish-stream" } };
    const destinations = [recordingDest, publishDest];
    let destIdx = 0;

    const remoteSourceNodes: Array<{
      connect: jest.Mock;
      disconnect: jest.Mock;
    }> = [];
    const remoteStreamsHandedToCreate: MediaStream[] = [];

    const ctx = {
      createMediaStreamSource: jest.fn((s: MediaStream) => {
        if (remoteStreamsHandedToCreate.includes(s)) {
          const node = { connect: jest.fn(), disconnect: jest.fn() };
          remoteSourceNodes.push(node);
          return node;
        }
        if (s === (stream as unknown as MediaStream)) {
          return sourceNode;
        }
        // Remote sources are created on demand inside addRemoteAudio;
        // record the stream so the next createMediaStreamSource call
        // returns a remote-source mock.
        remoteStreamsHandedToCreate.push(s);
        const node = { connect: jest.fn(), disconnect: jest.fn() };
        remoteSourceNodes.push(node);
        return node;
      }),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).not.toBeNull();

    // Two remote audio streams arrive (e.g. wife + son).
    const remoteA = { id: "remote-a" } as unknown as MediaStream;
    const remoteB = { id: "remote-b" } as unknown as MediaStream;
    const unsubA = graph!.addRemoteAudio(remoteA);
    const unsubB = graph!.addRemoteAudio(remoteB);
    expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(remoteA);
    expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(remoteB);

    // Each remote source connects to recordingDest exactly once and
    // NEVER to publishDest. This is the central feedback-loop guard.
    expect(remoteSourceNodes).toHaveLength(2);
    for (const node of remoteSourceNodes) {
      expect(node.connect).toHaveBeenCalledTimes(1);
      expect(node.connect).toHaveBeenCalledWith(recordingDest);
      expect(node.connect).not.toHaveBeenCalledWith(publishDest);
    }

    // Unsubscribe detaches one without touching the other.
    unsubA();
    expect(remoteSourceNodes[0]!.disconnect).toHaveBeenCalledTimes(1);
    expect(remoteSourceNodes[1]!.disconnect).not.toHaveBeenCalled();

    // Unsubscribe is idempotent.
    unsubA();
    expect(remoteSourceNodes[0]!.disconnect).toHaveBeenCalledTimes(1);

    // dispose detaches the remaining remote source too.
    graph!.dispose();
    expect(remoteSourceNodes[1]!.disconnect).toHaveBeenCalled();

    // Calling unsub after dispose is a no-op (no throw).
    expect(() => unsubB()).not.toThrow();
  });

  test("addRemoteAudio after dispose is a safe no-op", async () => {
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: { value: 0 }, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const destinations = [{ stream: { id: "r" } }, { stream: { id: "p" } }];
    let destIdx = 0;
    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    graph!.dispose();

    const before = ctx.createMediaStreamSource.mock.calls.length;
    const unsub = graph!.addRemoteAudio({} as unknown as MediaStream);
    // Did NOT create a new source (graph is disposed).
    expect(ctx.createMediaStreamSource.mock.calls.length).toBe(before);
    expect(() => unsub()).not.toThrow();
  });

  test("addRemoteAudio swallows createMediaStreamSource errors and returns a no-op unsub", async () => {
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: { value: 0 }, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const destinations = [{ stream: { id: "r" } }, { stream: { id: "p" } }];
    let destIdx = 0;
    let micCreated = false;
    const ctx = {
      createMediaStreamSource: jest.fn(() => {
        if (!micCreated) {
          micCreated = true;
          return sourceNode;
        }
        throw new Error("remote stream has no audio tracks");
      }),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);

    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const unsub = graph!.addRemoteAudio({} as unknown as MediaStream);
      expect(warnSpy).toHaveBeenCalled();
      expect(() => unsub()).not.toThrow();
    } finally {
      warnSpy.mockRestore();
      graph!.dispose();
    }
  });
});
