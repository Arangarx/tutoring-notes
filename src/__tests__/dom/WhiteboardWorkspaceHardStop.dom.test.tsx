/**
 * @jest-environment jsdom
 */

/**
 * P1-J7 / smokebook item 8 — session safety hard-stop DOM contract.
 *
 * Requirement: when pause-aware session elapsed crosses the safety max,
 * recording hard-stops and the tutor-facing panel surfaces the settled
 * done-state (no Start affordance).
 *
 * Boundary note: full `WhiteboardWorkspaceClient` mount is impractical here —
 * the live board hides `RecordingControlPanel` (mic lives in top-bar chrome)
 * and `WhiteboardWorkspaceAudioBridge` auto-resets the hook on `done` while
 * `recordingActive` stays true, which would immediately re-arm Start. We assert
 * at the nearest real workspace consumer DOM boundary:
 * `RecordingControlPanel` fed by real `useAudioRecorder` — the same panel tree
 * `WhiteboardWorkspaceAudioBridge` renders when `showPanel` is true.
 *
 * Timer driven via `__SESSION_SAFETY_MAX_SECONDS_OVERRIDE` — no 8h wait.
 */

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { uploadAudioDirect } from "@/lib/recording/upload";

/** Independent oracle — not read from segment-policy exports. */
const TEST_SAFETY_CAP_SECONDS = 10;

// ---- Mic graph + upload leaf mocks (same shape as useAudioRecorder.dom) ----

let mockMeterLevel = 0.5;

jest.mock("@/lib/mic-recorder-audio", () => ({
  __esModule: true,
  createMicAudioGraph: jest.fn(async (stream: MediaStream) => ({
    publishStream: stream,
    recordingStream: stream,
    getLevel: () => mockMeterLevel,
    dispose: jest.fn(),
    setGain: jest.fn(),
    addRemoteAudio: jest.fn(() => () => {}),
    setRemoteGain: jest.fn(),
    setTutorRecordingMute: jest.fn(),
  })),
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
  formatUserFacingActionError: (msg: string, debugId?: string) =>
    debugId ? `${msg} [debug=${debugId}]` : msg,
}));

const uploadMock = uploadAudioDirect as unknown as jest.Mock;

// ---- Fake MediaRecorder ----------------------------------------------------

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static lastInstance(): FakeMediaRecorder {
    const last = FakeMediaRecorder.instances.at(-1);
    if (!last) throw new Error("no FakeMediaRecorder created yet");
    return last;
  }
  static reset() {
    FakeMediaRecorder.instances = [];
  }

  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "audio/webm;codecs=opus";
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }
  pause() {
    if (this.state === "recording") this.state = "paused";
  }
  resume() {
    if (this.state === "paused") this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.onstop?.();
    });
  }

  feedData(blob: Blob = new Blob(["ok"], { type: this.mimeType })) {
    this.ondataavailable?.({ data: blob });
  }
}

(globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
  FakeMediaRecorder;
(FakeMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported =
  () => true;

function installMediaDevicesMock() {
  const fakeTrack = {
    stop: jest.fn(),
    getSettings: () => ({ deviceId: "fake-mic-id" }),
  };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  } as unknown as MediaStream;

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: jest.fn(async () => fakeStream),
      enumerateDevices: jest.fn(async () => [
        {
          kind: "audioinput",
          deviceId: "fake-mic-id",
          label: "Fake Mic",
          groupId: "",
        },
      ] as MediaDeviceInfo[]),
    },
  });

  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: {
      query: jest.fn(async () => ({ state: "granted" })),
    },
  });
}

function HardStopHarness({
  initialElapsedSeconds = 0,
}: {
  initialElapsedSeconds?: number;
}) {
  const onRecorded = React.useRef(jest.fn());
  const audio = useAudioRecorder({
    studentId: "stu-hard-stop",
    onRecorded: onRecorded.current,
    initialElapsedSeconds,
  });

  return <RecordingControlPanel recorder={audio} />;
}

async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

async function startRecordingFromPanel() {
  await flushAsync();
  const start = await waitFor(() => screen.getByTestId("audio-record-start"));
  await act(async () => {
    fireEvent.click(start);
    await flushAsync();
  });
  FakeMediaRecorder.lastInstance().feedData();
  await flushAsync();
}

const originalCreateObjectURL = URL.createObjectURL;
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => "blob://fake-preview");
});
afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
});

describe("WhiteboardWorkspace hard-stop DOM (P1-J7 / item 8)", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMeterLevel = 0.5;
    FakeMediaRecorder.reset();
    installMediaDevicesMock();
    uploadMock.mockReset();
    uploadMock.mockResolvedValue({
      ok: true,
      blobUrl: "https://blob.example/hard-stop-seg",
      mimeType: "audio/webm",
      sizeBytes: 1,
    });
    (
      window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number }
    ).__SESSION_SAFETY_MAX_SECONDS_OVERRIDE = TEST_SAFETY_CAP_SECONDS;
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete (
      window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number }
    ).__SESSION_SAFETY_MAX_SECONDS_OVERRIDE;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("below safety cap: recording controls visible, Start absent", async () => {
    render(<HardStopHarness initialElapsedSeconds={TEST_SAFETY_CAP_SECONDS - 3} />);
    await startRecordingFromPanel();

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await flushAsync();
    });

    expect(screen.getByTestId("audio-record-controls")).toBeInTheDocument();
    expect(screen.queryByTestId("audio-record-start")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audio-record-done")).not.toBeInTheDocument();
  });

  test("at/after safety cap: hard-stop surfaces done card and blocks Start", async () => {
    render(<HardStopHarness initialElapsedSeconds={TEST_SAFETY_CAP_SECONDS - 1} />);
    await startRecordingFromPanel();

    await act(async () => {
      jest.advanceTimersByTime(1_500);
      await flushAsync();
    });

    await waitFor(() => {
      expect(screen.getByTestId("audio-record-done")).toBeInTheDocument();
    });
    expect(screen.getByTestId("audio-record-done")).toHaveTextContent(
      /recording saved/i
    );
    expect(screen.queryByTestId("audio-record-start")).not.toBeInTheDocument();
    expect(screen.queryByTestId("audio-record-controls")).not.toBeInTheDocument();
  });
});
