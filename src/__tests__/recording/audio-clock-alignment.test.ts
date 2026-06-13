/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { FakeMicAudioGraph } from "@/__tests__/recording/helpers/fakeMicAudioGraph";
import {
  FakeMediaRecorder,
  installFakeMediaRecorder,
  installMediaDevicesMock,
} from "@/__tests__/recording/helpers/fakeMediaRecorder";
import { uploadAudioDirect } from "@/lib/recording/upload";

jest.mock("@/lib/mic-recorder-audio", () => ({
  __esModule: true,
  createMicAudioGraph: jest.fn(async () => null),
}));

jest.mock("@/lib/recording/upload", () => {
  const actual = jest.requireActual("@/lib/recording/upload");
  return {
    __esModule: true,
    ...actual,
    uploadAudioDirect: jest.fn(),
  };
});

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  formatUserFacingActionError: (msg: string) => msg,
}));

const uploadMock = uploadAudioDirect as unknown as jest.Mock;

async function flushAsync(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

async function startRecordingWithFakeGraph(
  fakeGraph: FakeMicAudioGraph,
  opts: { recordingDraft?: boolean } = {}
) {
  const onRecorded = jest.fn();
  const view = renderHook(() =>
    useAudioRecorder({
      studentId: "s1",
      onRecorded,
      _graphOverride: fakeGraph,
      ...(opts.recordingDraft
        ? { recordingDraft: { sessionId: "s1", streamId: "mic" } }
        : {}),
    })
  );
  await flushAsync();
  await act(async () => {
    await view.result.current.handleStartRecording();
  });
  FakeMediaRecorder.lastInstance().feedData();
  return { ...view, onRecorded };
}

/**
 * Like startRecordingWithFakeGraph but does NOT call feedData() after start.
 * Simulates the production timeslice latency: ondataavailable is not delivered
 * until 30s (non-iOS) or stop() (iOS) — never at frame 0.
 *
 * Used by tests that prove the baseline is captured at recording-start, NOT
 * at first ondataavailable.
 */
async function startRecordingNoChunk(
  fakeGraph: FakeMicAudioGraph,
  opts: { recordingDraft?: boolean } = {}
) {
  const onRecorded = jest.fn();
  const view = renderHook(() =>
    useAudioRecorder({
      studentId: "s1",
      onRecorded,
      _graphOverride: fakeGraph,
      ...(opts.recordingDraft
        ? { recordingDraft: { sessionId: "s1", streamId: "mic" } }
        : {}),
    })
  );
  await flushAsync();
  await act(async () => {
    await view.result.current.handleStartRecording();
  });
  // No feedData() — baseline must already be correct from recording-start.
  return { ...view, onRecorded };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  FakeMediaRecorder.reset();
  installFakeMediaRecorder();
  installMediaDevicesMock();
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({
    ok: true,
    blobUrl: "https://blob.example/x",
    mimeType: "audio/webm",
    sizeBytes: 1,
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  delete (window as unknown as { __SEGMENT_MAX_SECONDS_OVERRIDE?: number })
    .__SEGMENT_MAX_SECONDS_OVERRIDE;
});

describe("audio-clock alignment", () => {
  it("getAudioMs follows frame clock, not performance.now drift", async () => {
    const fakeGraph = new FakeMicAudioGraph();
    const { result } = await startRecordingWithFakeGraph(fakeGraph);

    fakeGraph.advance(10_000);
    jest.advanceTimersByTime(11_500);

    expect(result.current.getAudioMs()).toBe(10_000);
  });

  it("getAudioMs accumulates correctly across pause/resume", async () => {
    const fakeGraph = new FakeMicAudioGraph();
    const { result } = await startRecordingWithFakeGraph(fakeGraph);

    fakeGraph.advance(5_000);
    act(() => result.current.pauseRecording());
    fakeGraph.advance(3_000);
    act(() => result.current.resumeRecording());
    fakeGraph.advance(2_000);

    expect(result.current.getAudioMs()).toBe(7_000);
  });

  it("getAudioMs does NOT reset on auto-rollover", async () => {
    (
      window as unknown as { __SEGMENT_MAX_SECONDS_OVERRIDE: number }
    ).__SEGMENT_MAX_SECONDS_OVERRIDE = 5;

    const fakeGraph = new FakeMicAudioGraph();
    const { result } = await startRecordingWithFakeGraph(fakeGraph);

    fakeGraph.advance(5_000);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
      await flushAsync();
    });

    FakeMediaRecorder.lastInstance().feedData();
    fakeGraph.advance(1_000);

    expect(result.current.getAudioMs()).toBeGreaterThan(5_000 + 900);
  });

  /**
   * B-TEST-1 replacement — proves the baseline is captured at recording-start,
   * not at first ondataavailable.
   *
   * Production reality: with DRAFT_TIMESLICE_MS = 30_000, the first
   * ondataavailable fires after ~30 s. On broken code (baseline keyed to
   * first chunk), getAudioMs() returns 0 for the entire first 30 s. This
   * test would FAIL on the broken implementation and must PASS after the fix.
   */
  it("baseline captured at recording-start: clock reads correctly before first ondataavailable (30s timeslice sim)", async () => {
    const fakeGraph = new FakeMicAudioGraph();
    // No feedData() call — simulates the 30 s timeslice latency where
    // ondataavailable has not yet fired.
    const { result } = await startRecordingNoChunk(fakeGraph);

    // Advance 30 s of audio frames — no chunk delivered yet.
    fakeGraph.advance(30_000);
    jest.advanceTimersByTime(30_000);

    // On broken code: segmentPrimingBaselineRef is null (no chunk yet),
    // readAudioClockMs() = Math.floor(sessionAudioMsRef.current) = 0.
    // On fixed code: baseline was captured at frameClockSetActive(true) time
    // (= rawFrameClockMs() at recording-start = 0), so
    // readAudioClockMs() = 0 + 30_000 - 0 = 30_000.
    expect(result.current.getAudioMs()).toBeGreaterThan(28_000);
  });

  /**
   * B-TEST-1 replacement (iOS path) — getAudioMs must not be 0 mid-session
   * even when ondataavailable has NEVER fired yet (iOS no-timeslice path:
   * ondataavailable fires only at stop()).
   *
   * On broken code this test fails: baseline stays null the whole session,
   * getAudioMs() = 0 for every whiteboard event.
   */
  it("iOS no-timeslice: getAudioMs is non-zero mid-session before any ondataavailable fires", async () => {
    const fakeGraph = new FakeMicAudioGraph();
    // No feedData() at all — simulates iOS where ondataavailable fires only
    // at recorder.stop().
    const { result } = await startRecordingNoChunk(fakeGraph);

    fakeGraph.advance(5_000);
    jest.advanceTimersByTime(5_000);

    // On broken code: getAudioMs() = 0 (baseline null before first chunk).
    // On fixed code: baseline = rawFrameClockMs() at recording-start = 0,
    // so getAudioMs() = 0 + 5_000 - 0 = 5_000.
    expect(result.current.getAudioMs()).toBeGreaterThan(4_900);

    // Now simulate iOS stop(): ondataavailable fires for the first time.
    FakeMediaRecorder.lastInstance().feedData();
    fakeGraph.advance(1_000);

    // Clock must continue advancing correctly after the first chunk arrives.
    expect(result.current.getAudioMs()).toBeGreaterThan(5_900);
  });
});

// ---------------------------------------------------------------------------
// perf.now FALLBACK — both frame sources fail (e.g. iOS CSP blocks blob: URL)
// ---------------------------------------------------------------------------

/**
 * Renders the hook with a fake graph that reports hasFrameClock=false.
 * Uses an independent oracle: performance.now() advances via
 * jest.advanceTimersByTime(), completely separate from the fake frame counter
 * (which always returns 0). This proves the fallback is backed by wall-clock
 * time, not the dead frame counter.
 */
async function startRecordingNoClock(opts: { recordingDraft?: boolean } = {}) {
  const fakeGraph = new FakeMicAudioGraph({ hasFrameClock: false });
  const onRecorded = jest.fn();
  const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  const view = renderHook(() =>
    useAudioRecorder({
      studentId: "s1",
      onRecorded,
      avLogSessionId: "test-session",
      _graphOverride: fakeGraph,
      ...(opts.recordingDraft
        ? { recordingDraft: { sessionId: "s1", streamId: "mic" } }
        : {}),
    })
  );
  await flushAsync();
  await act(async () => {
    await view.result.current.handleStartRecording();
  });
  FakeMediaRecorder.lastInstance().feedData();
  return { ...view, onRecorded, fakeGraph, logSpy };
}

describe("audio-clock fallback (perf.now) — both frame sources unavailable", () => {
  it("FAILS-BEFORE/PASSES-AFTER: getAudioMs() is non-zero and advances when hasFrameClock=false", async () => {
    // RED: before this change, rawFrameClockMs() always returned 0 when
    // hasFrameClock=false (no frame node). readAudioClockMs() = 0 + 0 - 0 = 0.
    // GREEN: perf.now fallback accumulates elapsed recording-active time.
    // Oracle: jest.advanceTimersByTime advances performance.now() independently
    // of the fake frame counter (which stays at 0 — an independent oracle).
    const { result, logSpy } = await startRecordingNoClock();

    // Advance 10 s of wall-clock. The fake frame counter stays 0 (proven
    // by fakeGraph.frameClockGetMs() always returning this._ms which is 0).
    jest.advanceTimersByTime(10_000);

    const audioMs = result.current.getAudioMs();

    // (a) non-zero and advancing
    expect(audioMs).toBeGreaterThan(9_000);

    // (c) init log shows perfnow-fallback (from useAudioRecorder with rid=)
    const perfnowLog = logSpy.mock.calls.some((args) =>
      String(args[0]).includes("frame-counter=perfnow-fallback")
    );
    expect(perfnowLog).toBe(true);

    logSpy.mockRestore();
  });

  it("(b) paused intervals do NOT accumulate — fallback is gated on recording-active", async () => {
    const { result, logSpy } = await startRecordingNoClock();

    // Record 5 s
    jest.advanceTimersByTime(5_000);
    const msAfter5s = result.current.getAudioMs();
    expect(msAfter5s).toBeGreaterThan(4_500);

    // Pause: clock must freeze
    act(() => result.current.pauseRecording());

    // 10 wall-clock seconds pass while paused — should NOT accumulate
    jest.advanceTimersByTime(10_000);
    const msDuringPause = result.current.getAudioMs();
    expect(msDuringPause).toBeLessThan(msAfter5s + 500); // tolerance for timing jitter

    // Resume and record 3 more seconds
    act(() => result.current.resumeRecording());
    jest.advanceTimersByTime(3_000);
    const msAfterResume = result.current.getAudioMs();

    // Total should be ~8 s (5 before pause + 3 after), NOT ~18 s
    expect(msAfterResume).toBeGreaterThan(7_500);
    expect(msAfterResume).toBeLessThan(9_500);

    logSpy.mockRestore();
  });

  it("perf.now fallback does NOT engage when hasFrameClock=true (frame clock wins)", async () => {
    // Safety net: confirms the strict `=== false` guard prevents the fallback
    // from shadowing a working frame counter and reintroducing drift.
    const fakeGraph = new FakeMicAudioGraph({ hasFrameClock: true });
    const { result } = await startRecordingWithFakeGraph(fakeGraph);

    // Advance frame clock by 7 s, wall-clock by 12 s.
    // If perf.now fallback were engaged it would return ~12 s (wrong).
    // Frame clock returns 7 s (correct).
    fakeGraph.advance(7_000);
    jest.advanceTimersByTime(12_000);

    // Must track the frame counter, NOT wall-clock
    expect(result.current.getAudioMs()).toBe(7_000);
  });
});