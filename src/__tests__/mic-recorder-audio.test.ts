/**
 * Unit tests for the Web Audio helper used by the in-browser recorder.
 *
 * Covers:
 *  - Returns null gracefully when AudioContext is unavailable (test envs / old browsers).
 *  - Returns the expected shape (recordingStream, dispose, getLevel, setGain).
 *  - setGain forwards to the GainNode without rebuilding the graph.
 *  - dispose stops the mic tracks and closes the AudioContext.
 *  - calibrateMicLevel: noise-floor subtraction + bar-range coverage (8d).
 */

import { createMicAudioGraph, createMicPublishGraph, calibrateMicLevel, METER_NOISE_FLOOR, METER_SCALE } from "@/lib/mic-recorder-audio";

type GainParam = { value: number };
type FakeNode = { connect: jest.Mock; disconnect?: jest.Mock };

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
    const recordingMuteGainParam: GainParam = { value: 1 };
    const sourceNode: FakeNode = { connect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const recordingMuteGainNode = {
      gain: recordingMuteGainParam,
      connect: jest.fn(),
    };
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
    let gainCall = 0;
    const close = jest.fn().mockResolvedValue(undefined);
    const resume = jest.fn().mockResolvedValue(undefined);

    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => {
        gainCall += 1;
        return gainCall === 1 ? gainNode : recordingMuteGainNode;
      }),
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
    expect(recordingMuteGainParam.value).toBe(1);
    // source -> boost gain; boost -> recordingMute + publish + analyser
    expect(sourceNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledTimes(3);
    expect(gainNode.connect).toHaveBeenCalledWith(recordingMuteGainNode);
    expect(recordingMuteGainNode.connect).toHaveBeenCalledWith(destinations[0]);
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

  test("setTutorRecordingMute gates only the recording branch (not boost/publish)", async () => {
    const gainParam: GainParam = { value: 1 };
    const recordingMuteGainParam: GainParam = { value: 1 };
    const sourceNode: FakeNode = { connect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const recordingMuteGainNode = {
      gain: recordingMuteGainParam,
      connect: jest.fn(),
    };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const destinations = [{ stream: { id: "r" } }, { stream: { id: "p" } }];
    let destIdx = 0;
    let gainCall = 0;
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => {
        gainCall += 1;
        return gainCall === 1 ? gainNode : recordingMuteGainNode;
      }),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1, {
      sessionId: "sess-ws-i",
    });

    graph!.setTutorRecordingMute(true);
    expect(recordingMuteGainParam.value).toBe(0);
    expect(gainParam.value).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(
      "[avx] avx=sess-ws-i action=tutor_recording_mute muted=true"
    );

    graph!.setTutorRecordingMute(false);
    expect(recordingMuteGainParam.value).toBe(1);

    logSpy.mockRestore();
    graph!.dispose();
  });

  test("swapLocalMicSource rewires the local mic without recreating destinations (MediaRecorder path stable)", async () => {
    const gainParam: GainParam = { value: 1 };
    const firstSource = { connect: jest.fn(), disconnect: jest.fn() };
    const secondSource = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 0.05;
      }),
    };
    const recordingStream = { id: "rec" };
    const publishStream = { id: "pub" };
    const destinations = [{ stream: recordingStream }, { stream: publishStream }];
    let destIdx = 0;
    let micCall = 0;
    const micStreams = [
      { getTracks: () => [{ stop: jest.fn() }] },
      { getTracks: () => [{ stop: jest.fn() }] },
    ];
    const ctx = {
      createMediaStreamSource: jest.fn((s: MediaStream) => {
        micCall += 1;
        return micCall === 1 ? firstSource : secondSource;
      }),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const graph = await createMicAudioGraph(
      micStreams[0] as unknown as MediaStream,
      1,
      { sessionId: "sess-1" }
    );
    expect(graph).not.toBeNull();
    const recBefore = graph!.recordingStream;
    const pubBefore = graph!.publishStream;

    graph!.swapLocalMicSource(micStreams[1] as unknown as MediaStream);
    expect(firstSource.disconnect).toHaveBeenCalled();
    expect(secondSource.connect).toHaveBeenCalledWith(gainNode);
    expect(graph!.recordingStream).toBe(recBefore);
    expect(graph!.publishStream).toBe(pubBefore);

    graph!.dispose();
  });

  test("addRemoteAudio mixes remote streams into recordingStream only (NOT publishStream), via per-remote GainNode", async () => {
    // Mixdown contract — the whole point of this feature. Tutor audio
    // goes both places (recording + WebRTC out); remote participant
    // audio goes ONLY to recording. Sending remote audio over
    // WebRTC's publishStream would be a tutor-mediated feedback loop
    // (every peer hears every other peer's voice via the tutor's
    // outbound track on top of their own direct peer connection),
    // which is why publishStream is intentionally excluded.
    //
    // Phase 4d Commit 7: the path is now
    //   remoteSource → remoteGain → recordingDest
    // so the workspace can mute individual participants from the
    // recording by setting `remoteGain.gain.value = 0` without
    // disconnecting the source (replay then sees a clean silence
    // instead of a gap).
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const micGain = { gain: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
    const recordingMuteGain = {
      gain: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const remoteGains: Array<{
      gain: { value: number };
      connect: jest.Mock;
      disconnect: jest.Mock;
    }> = [];
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const recordingDest = { stream: { id: "recording-stream" } };
    const publishDest = { stream: { id: "publish-stream" } };
    const destinations = [recordingDest, publishDest];
    let destIdx = 0;
    let gainIdx = 0;

    const remoteSourceNodes: Array<{
      connect: jest.Mock;
      disconnect: jest.Mock;
    }> = [];

    const ctx = {
      createMediaStreamSource: jest.fn((s: MediaStream) => {
        if (s === (stream as unknown as MediaStream)) {
          return sourceNode;
        }
        const node = { connect: jest.fn(), disconnect: jest.fn() };
        remoteSourceNodes.push(node);
        return node;
      }),
      createGain: jest.fn(() => {
        if (gainIdx === 0) {
          gainIdx += 1;
          return micGain;
        }
        if (gainIdx === 1) {
          gainIdx += 1;
          return recordingMuteGain;
        }
        const g = {
          gain: { value: 1 },
          connect: jest.fn(),
          disconnect: jest.fn(),
        };
        remoteGains.push(g);
        return g;
      }),
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

    // Each remote source connects to ITS OWN gain (NOT directly to
    // recordingDest); each gain connects to recordingDest.
    expect(remoteSourceNodes).toHaveLength(2);
    expect(remoteGains).toHaveLength(2);
    for (let i = 0; i < remoteSourceNodes.length; i++) {
      const sourceN = remoteSourceNodes[i]!;
      const gainN = remoteGains[i]!;
      expect(sourceN.connect).toHaveBeenCalledTimes(1);
      expect(sourceN.connect).toHaveBeenCalledWith(gainN);
      expect(sourceN.connect).not.toHaveBeenCalledWith(recordingDest);
      expect(sourceN.connect).not.toHaveBeenCalledWith(publishDest);
      expect(gainN.connect).toHaveBeenCalledTimes(1);
      expect(gainN.connect).toHaveBeenCalledWith(recordingDest);
      // Default gain is 1 (full volume).
      expect(gainN.gain.value).toBe(1);
    }

    // Unsubscribe detaches the SOURCE for that remote without
    // touching the other.
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

  test("setRemoteGain flips the per-remote GainNode value live (per-peer recording mute)", async () => {
    // Phase 4d Commit 7 — the workspace flips a peer's gain to 0
    // when the tutor toggles "Don't record this student". Replay
    // then sees a clean silence rather than a gap because the
    // source stays connected.
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const micGain = { gain: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
    const recordingMuteGain = {
      gain: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    const remoteGains: Array<{
      gain: { value: number };
      connect: jest.Mock;
      disconnect: jest.Mock;
    }> = [];
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const destinations = [{ stream: { id: "r" } }, { stream: { id: "p" } }];
    let destIdx = 0;
    let gainIdx = 0;
    const ctx = {
      createMediaStreamSource: jest.fn((s: MediaStream) => {
        if (s === (stream as unknown as MediaStream)) return sourceNode;
        return { connect: jest.fn(), disconnect: jest.fn() };
      }),
      createGain: jest.fn(() => {
        if (gainIdx === 0) {
          gainIdx += 1;
          return micGain;
        }
        if (gainIdx === 1) {
          gainIdx += 1;
          return recordingMuteGain;
        }
        const g = {
          gain: { value: 1 },
          connect: jest.fn(),
          disconnect: jest.fn(),
        };
        remoteGains.push(g);
        return g;
      }),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);
    expect(graph).not.toBeNull();

    const remoteA = { id: "remote-a" } as unknown as MediaStream;
    const remoteB = { id: "remote-b" } as unknown as MediaStream;
    graph!.addRemoteAudio(remoteA);
    graph!.addRemoteAudio(remoteB);
    expect(remoteGains).toHaveLength(2);
    expect(remoteGains[0]!.gain.value).toBe(1);
    expect(remoteGains[1]!.gain.value).toBe(1);

    // Mute remote A → its gain flips to 0; remote B stays at 1.
    graph!.setRemoteGain(remoteA, 0);
    expect(remoteGains[0]!.gain.value).toBe(0);
    expect(remoteGains[1]!.gain.value).toBe(1);

    // Unmute remote A → flips back to 1.
    graph!.setRemoteGain(remoteA, 1);
    expect(remoteGains[0]!.gain.value).toBe(1);

    // Negative gain clamps to 0 (defensive).
    graph!.setRemoteGain(remoteA, -0.5);
    expect(remoteGains[0]!.gain.value).toBe(0);

    // Calling setRemoteGain for an unknown stream is a safe no-op.
    expect(() =>
      graph!.setRemoteGain({} as unknown as MediaStream, 0.5)
    ).not.toThrow();

    graph!.dispose();
  });

  test("addRemoteAudio is idempotent: re-attaching the same stream does NOT create a second source/gain pair", async () => {
    // The workspace's reconcile effect already guards against
    // double-attach with a per-stream sub map, but the graph
    // itself must also be defensive (e.g. if a future caller skips
    // the cache).
    const sourceNode = { connect: jest.fn(), disconnect: jest.fn() };
    const micGain = { gain: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const destinations = [{ stream: { id: "r" } }, { stream: { id: "p" } }];
    let destIdx = 0;
    let createSourceCalls = 0;
    let createGainCalls = 0;
    const ctx = {
      createMediaStreamSource: jest.fn((s: MediaStream) => {
        createSourceCalls += 1;
        if (s === (stream as unknown as MediaStream)) return sourceNode;
        return { connect: jest.fn(), disconnect: jest.fn() };
      }),
      createGain: jest.fn(() => {
        createGainCalls += 1;
        if (createGainCalls === 1) return micGain;
        return {
          gain: { value: 1 },
          connect: jest.fn(),
          disconnect: jest.fn(),
        };
      }),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => destinations[destIdx++]),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicAudioGraph(stream as unknown as MediaStream, 1);

    const remote = { id: "remote-a" } as unknown as MediaStream;
    const unsub1 = graph!.addRemoteAudio(remote);
    const sourceCallsAfterFirst = createSourceCalls;
    const gainCallsAfterFirst = createGainCalls;

    // Re-attach the same stream. Idempotent: no new source/gain.
    const unsub2 = graph!.addRemoteAudio(remote);
    expect(createSourceCalls).toBe(sourceCallsAfterFirst);
    expect(createGainCalls).toBe(gainCallsAfterFirst);

    // Both unsubs are safe.
    expect(() => unsub1()).not.toThrow();
    expect(() => unsub2()).not.toThrow();

    graph!.dispose();
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

/**
 * 8d: Meter calibration — noise-floor subtraction + bar-range coverage.
 *
 * Independent oracle for the level-mapping math: test the pure
 * `calibrateMicLevel` function directly (no AudioContext needed).
 *
 * The old formula (rms * 4.5) required RMS ≈ 0.122 to light bar-3, causing
 * the meter to appear stuck at 1–2 bars during typical laptop-mic speech.
 * The new formula applies a noise-floor subtraction then a higher scale factor
 * so normal speech spans all three bars.
 *
 * Bar thresholds (from WbInlineMicMeter): bar-1 ≥ 0.05, bar-2 ≥ 0.25, bar-3 ≥ 0.55.
 */
describe("calibrateMicLevel — noise-floor calibration (8d)", () => {
  test("silence (below noise floor) maps to 0", () => {
    // RMS values well below the noise floor must clamp to 0 — no bars lit.
    expect(calibrateMicLevel(0)).toBe(0);
    expect(calibrateMicLevel(METER_NOISE_FLOOR * 0.5)).toBe(0);
    expect(calibrateMicLevel(METER_NOISE_FLOOR)).toBe(0);
  });

  test("quiet speech lights bar-1 only", () => {
    // Quiet mic: RMS ≈ 0.015 — above noise floor but below bar-2 threshold.
    const level = calibrateMicLevel(0.015);
    expect(level).toBeGreaterThanOrEqual(0.05); // bar-1 lit
    expect(level).toBeLessThan(0.25);            // bar-2 not lit
  });

  test("normal speech lights bar-1 and bar-2", () => {
    // Normal conversation: RMS ≈ 0.04.
    const level = calibrateMicLevel(0.04);
    expect(level).toBeGreaterThanOrEqual(0.25); // bar-2 lit
    expect(level).toBeLessThan(0.55);            // bar-3 not lit
  });

  test("louder speech lights all three bars", () => {
    // Moderately loud: RMS ≈ 0.075.
    const level = calibrateMicLevel(0.075);
    expect(level).toBeGreaterThanOrEqual(0.55); // bar-3 lit
    expect(level).toBeLessThanOrEqual(1);
  });

  test("very loud audio clamps to 1", () => {
    expect(calibrateMicLevel(1)).toBe(1);
    expect(calibrateMicLevel(0.5)).toBe(1);
  });

  test("offset-invariance: noise-floor offsets do not change the bar when below threshold", () => {
    // Any RMS ≤ METER_NOISE_FLOOR must yield exactly 0 regardless of value.
    for (const rms of [0, 0.001, 0.003, METER_NOISE_FLOOR]) {
      expect(calibrateMicLevel(rms)).toBe(0);
    }
  });

  test("calibration constants satisfy bar-range coverage invariant", () => {
    // Verify the constants are tuned so that:
    //   (0.075 - NOISE_FLOOR) * SCALE >= 0.55  (louder speech lights bar-3)
    //   (0.04  - NOISE_FLOOR) * SCALE >= 0.25  (normal speech lights bar-2)
    //   (0.015 - NOISE_FLOOR) * SCALE >= 0.05  (quiet speech lights bar-1)
    expect(Math.max(0, 0.075 - METER_NOISE_FLOOR) * METER_SCALE).toBeGreaterThanOrEqual(0.55);
    expect(Math.max(0, 0.04  - METER_NOISE_FLOOR) * METER_SCALE).toBeGreaterThanOrEqual(0.25);
    expect(Math.max(0, 0.015 - METER_NOISE_FLOOR) * METER_SCALE).toBeGreaterThanOrEqual(0.05);
  });
});

describe("createMicPublishGraph", () => {
  const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;

  afterEach(() => {
    if (originalAudioContext === undefined) {
      delete (globalThis as { AudioContext?: unknown }).AudioContext;
    } else {
      (globalThis as { AudioContext?: unknown }).AudioContext = originalAudioContext;
    }
  });

  test("returns null when AudioContext is missing", async () => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    const stream = fakeMicStream();
    const graph = await createMicPublishGraph(stream as unknown as MediaStream, 1);
    expect(graph).toBeNull();
  });

  test("builds publish-only graph: setGain, dispose, no recording destination", async () => {
    const gainParam: GainParam = { value: 0 };
    const sourceNode: FakeNode = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn((arr: Float32Array) => {
        for (let i = 0; i < arr.length; i++) arr[i] = 0.08;
      }),
    };
    const publishStream = { id: "publish-only" };
    const close = jest.fn().mockResolvedValue(undefined);
    const ctx = {
      createMediaStreamSource: jest.fn(() => sourceNode),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => ({ stream: publishStream })),
      resume: jest.fn().mockResolvedValue(undefined),
      close,
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicPublishGraph(
      stream as unknown as MediaStream,
      1.25
    );

    expect(graph).not.toBeNull();
    expect(ctx.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    expect(graph!.publishStream).toBe(publishStream);
    expect(gainParam.value).toBe(1.25);
    expect(graph!.getLevel()).toBeGreaterThan(0);

    graph!.setGain(2);
    expect(gainParam.value).toBe(2);

    graph!.dispose();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  test("swapLocalMicSource rewires without recreating publish destination", async () => {
    const gainParam: GainParam = { value: 1 };
    const firstSource = { connect: jest.fn(), disconnect: jest.fn() };
    const secondSource = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const publishStream = { id: "stable-publish" };
    let sourceCall = 0;
    const ctx = {
      createMediaStreamSource: jest.fn(() => {
        sourceCall += 1;
        return sourceCall === 1 ? firstSource : secondSource;
      }),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => ({ stream: publishStream })),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicPublishGraph(stream as unknown as MediaStream, 1);
    const nextStream = fakeMicStream();
    expect(graph!.swapLocalMicSource(nextStream as unknown as MediaStream)).toBe(
      true
    );

    expect(firstSource.disconnect).toHaveBeenCalled();
    expect(secondSource.connect).toHaveBeenCalledWith(gainNode);
    expect(graph!.publishStream).toBe(publishStream);
    graph!.dispose();
  });

  test("swapLocalMicSource returns false and recovers prior source when createMediaStreamSource throws", async () => {
    const gainParam: GainParam = { value: 1 };
    const firstSource = { connect: jest.fn(), disconnect: jest.fn() };
    const gainNode = { gain: gainParam, connect: jest.fn() };
    const analyserNode = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: jest.fn(),
    };
    const publishStream = { id: "stable-publish" };
    let sourceCall = 0;
    const ctx = {
      createMediaStreamSource: jest.fn(() => {
        sourceCall += 1;
        if (sourceCall === 1) return firstSource;
        throw new Error("create-source-failed");
      }),
      createGain: jest.fn(() => gainNode),
      createAnalyser: jest.fn(() => analyserNode),
      createMediaStreamDestination: jest.fn(() => ({ stream: publishStream })),
      resume: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (globalThis as { AudioContext?: unknown }).AudioContext = jest.fn(() => ctx);

    const stream = fakeMicStream();
    const graph = await createMicPublishGraph(stream as unknown as MediaStream, 1);
    const nextStream = fakeMicStream();
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(graph!.swapLocalMicSource(nextStream as unknown as MediaStream)).toBe(
      false
    );
    expect(firstSource.disconnect).toHaveBeenCalled();
    expect(firstSource.connect).toHaveBeenCalledWith(gainNode);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[avx] avx=? event=mic_device_swap result=failed reason=create-source-failed recovered=true"
      ),
      "create-source-failed"
    );

    warnSpy.mockRestore();
    graph!.dispose();
  });
});
