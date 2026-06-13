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