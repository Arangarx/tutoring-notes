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
});

describe("recording watchdog", () => {
  it("watchdog fires stall alert when frame clock does not advance", async () => {
    const fakeGraph = new FakeMicAudioGraph();
    const onWatchdogAlert = jest.fn();
    const view = renderHook(() =>
      useAudioRecorder({
        studentId: "s1",
        onRecorded: jest.fn(),
        _graphOverride: fakeGraph,
        onWatchdogAlert,
        recordingDraft: { sessionId: "s1", streamId: "mic" },
      })
    );

    await flushAsync();
    await act(async () => {
      await view.result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();
    fakeGraph.advance(1_000);

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(onWatchdogAlert).toHaveBeenCalledWith("stall");
  });
});
