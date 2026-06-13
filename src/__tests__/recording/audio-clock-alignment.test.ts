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
});