/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { chooseMimeType } from "@/lib/recording/mime";
import {
  FakeMediaRecorder,
  installFakeMediaRecorder,
  installMediaDevicesMock,
} from "@/__tests__/recording/helpers/fakeMediaRecorder";
import { FakeMicAudioGraph } from "@/__tests__/recording/helpers/fakeMicAudioGraph";
import { uploadAudioDirect } from "@/lib/recording/upload";

jest.mock("@/lib/recording/mime", () => ({
  ...jest.requireActual("@/lib/recording/mime"),
  chooseMimeType: jest.fn(() => "audio/mp4"),
}));

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
    mimeType: "audio/mp4",
    sizeBytes: 1,
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("iOS-conditional no-timeslice", () => {
  it("audio/mp4 mimeType triggers start() without timeslice", async () => {
    (chooseMimeType as jest.Mock).mockReturnValue("audio/mp4");

    const fakeGraph = new FakeMicAudioGraph();
    const view = renderHook(() =>
      useAudioRecorder({
        studentId: "s1",
        onRecorded: jest.fn(),
        _graphOverride: fakeGraph,
        recordingDraft: { sessionId: "s1", streamId: "mic" },
      })
    );

    await flushAsync();
    await act(async () => {
      await view.result.current.handleStartRecording();
    });

    const recorder = FakeMediaRecorder.lastInstance();
    expect(recorder.startCalls.length).toBeGreaterThanOrEqual(1);
    expect(recorder.startCalls[0]).toEqual([]);
    expect(recorder.startCalls[0]).not.toEqual(expect.arrayContaining([expect.any(Number)]));
  });
});
