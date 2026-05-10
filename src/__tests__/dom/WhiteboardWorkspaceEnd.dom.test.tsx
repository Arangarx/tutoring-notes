/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/components/whiteboard/PdfImageUploadButton", () => ({
  PdfImageUploadButton: () => null,
}));
jest.mock("@/components/whiteboard/MathInsertButton", () => ({
  MathInsertButton: () => null,
}));
jest.mock("@/components/whiteboard/DesmosInsertButton", () => ({
  DesmosInsertButton: () => null,
}));
jest.mock("@/lib/whiteboard/ensure-native-image-asset-urls-for-sync", () => ({
  ensureNativeImageAssetUrlsForSync: jest.fn(async () => null),
}));
jest.mock("@/lib/whiteboard/hydrate-remote-files", () => ({
  hydrateRemoteImageFilesForScene: jest.fn(async () => ({
    fetchFailed: [],
    missingAssetUrlFileIds: [],
  })),
}));
jest.mock("@/lib/whiteboard/apply-reconciled-remote-scene", () => ({
  mergeScenesReconciled: jest.fn(async (_a: unknown, b: unknown) => b),
  updateSceneMergingWithRemote: jest.fn(),
}));
jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: jest.fn(() => ({
    disconnect: jest.fn(),
    onRemoteScene: () => () => {},
    onConnect: () => () => {},
    onDisconnect: () => () => {},
    isConnected: () => false,
    broadcastScene: jest.fn(),
    flushPendingBroadcast: jest.fn(),
  })),
  generateEncryptionKeyBase64Url: () =>
    "test-integration-key-16chars-min",
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
}));

const mockUpload = jest.fn(() =>
  Promise.resolve({
    ok: true as const,
    blobUrl: "https://example.com/blob-events",
    sizeBytes: 10,
  })
);
jest.mock("@/lib/whiteboard/upload", () => ({
  uploadWhiteboardEvents: (...args: unknown[]) => mockUpload(...args),
}));

const mockEnd = jest.fn(() => Promise.resolve());
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  endWhiteboardSession: (...args: unknown[]) => mockEnd(...args),
  issueJoinToken: jest.fn(() => Promise.resolve({ token: "tok" })),
  registerWhiteboardSessionAudioSegmentAction: jest.fn(() =>
    Promise.resolve({ ok: true as const, recordingId: "rec1", orderIndex: 0 })
  ),
  revokeJoinTokensForSession: jest.fn(() => Promise.resolve()),
}));

const mockBuildFinalEventsJson = jest.fn(
  () =>
    `{"schemaVersion":1,"startedAt":"2026-05-09T00:00:00.000Z","durationMs":100,"events":[]}`
);

jest.mock("@/hooks/useWhiteboardRecorder", () => ({
  useWhiteboardRecorder: () => ({
    onCanvasChange: jest.fn(),
    ingestRemote: jest.fn(),
    eventCount: 0,
    durationMs: 100,
    lastCheckpointAt: null,
    checkpointStatus: "idle" as const,
    checkpointError: null,
    syncConnected: false,
    resumePrompt: null,
    acceptResume: jest.fn(),
    declineResume: jest.fn(),
    buildFinalEventsJson: mockBuildFinalEventsJson,
    markPersisted: jest.fn(),
    checkpointMountResolved: true,
    postGateAutoCanvas: null,
    acknowledgePostGateAutoCanvas: jest.fn(),
    flushThrottledFrameNow: jest.fn(),
    broadcastScenePageSnapshot: jest.fn(),
  }),
}));

const mockGetState = jest.fn(() => ({
  kind: "idle" as const,
  inFlightCount: 0,
  lastError: null,
}));

jest.mock(
  "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge",
  () => {
    const { forwardRef, useImperativeHandle } =
      jest.requireActual<typeof import("react")>("react");
    return {
      WhiteboardWorkspaceAudioBridge: forwardRef<
        unknown,
        Record<string, unknown>
      >(function MockBridge(_props, ref) {
        useImperativeHandle(ref, () => ({
          waitForPendingUploads: async () => undefined,
          getState: () => mockGetState(),
        }));
        return <div data-testid="mock-wb-audio-bridge" />;
      }),
    };
  }
);

const stableExcalidrawApi = {
  getSceneElements: () => [],
  getAppState: () => ({
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
  }),
  getFiles: () => ({}),
  updateScene: jest.fn(),
};

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: function MockEx(props: Record<string, unknown>) {
    React.useEffect(() => {
      const callback = props.excalidrawAPI as
        | ((api: unknown) => void)
        | undefined;
      callback?.(stableExcalidrawApi);
      // Match real Excalidraw: imperative API is wired once on mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="wb-mock-excalidraw-canvas" />;
  },
}));

jest.mock("@/hooks/useAudioRecorder", () => {
  const st = { state: "ready" as string };
  return {
    useAudioRecorder: () => ({
      get state() {
        return st.state;
      },
      uploadMode: null,
      elapsed: 0,
      segmentNumber: 1,
      doneSegmentSeconds: 0,
      devices: [],
      selectedDeviceId: "",
      gainLinear: 1,
      setGainLinear: jest.fn(),
      chimeEnabled: false,
      setChimeEnabled: jest.fn(),
      chimeVolume: 0.5,
      setChimeVolume: jest.fn(),
      permissionState: "granted" as const,
      error: null,
      isLive: true,
      lockDevice: true,
      isWarning: false,
      meterBarRef: React.createRef<HTMLDivElement>(),
      handleStartRecording: jest.fn(),
      handleDeviceChange: jest.fn(),
      pauseRecording: jest.fn(),
      resumeRecording: jest.fn(),
      stopAndUpload: jest.fn(),
      handleReset: jest.fn(),
    }),
  };
});

import { WhiteboardWorkspaceClient } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient";

describe("WhiteboardWorkspaceClient end session (Phase 0c)", () => {
  beforeEach(() => {
    jest.useRealTimers();
    window.scrollTo = jest.fn();
    mockEnd.mockClear();
    mockUpload.mockClear();
    mockBuildFinalEventsJson.mockClear();
    mockGetState.mockReset();
    mockGetState.mockImplementation(() => ({
      kind: "idle",
      inFlightCount: 0,
      lastError: null,
    }));
    window.history.replaceState(
      null,
      "",
      "http://localhost/#k=integration-test-key-1"
    );
  });

  test("End shows segment-saving copy while bridge is non-idle, then completes", async () => {
    mockGetState
      .mockReturnValueOnce({
        kind: "registering",
        inFlightCount: 2,
        lastError: null,
      })
      .mockReturnValue({ kind: "idle", inFlightCount: 0, lastError: null });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-1"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");

    await userEvent.click(screen.getByTestId("wb-end-session"));

    expect(
      await screen.findByRole("button", { name: /Saving last 2 segments/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockEnd).toHaveBeenCalledWith("ws-end-1", "https://example.com/blob-events");
    });
  });

  test("End surfaces error on finalize timeout and does not end session", async () => {
    jest.useFakeTimers();
    mockGetState.mockReturnValue({
      kind: "registering",
      inFlightCount: 1,
      lastError: null,
    });

    render(
      <WhiteboardWorkspaceClient
        whiteboardSessionId="ws-end-timeout"
        studentId="stu-1"
        studentName="Test Student"
        adminUserId="admin-1"
        startedAtIso="2026-05-09T10:00:00.000Z"
        bothConnectedAtIso={null}
        initialActiveMs={0}
        initialLastActiveAtIso={null}
        syncUrl={null}
        initialUserWantsRecording
      />
    );

    await screen.findByTestId("wb-mock-excalidraw-canvas");

    await act(async () => {
      screen.getByTestId("wb-end-session").click();
    });

    await screen.findByRole("button", { name: /Saving last 1 segment/i });

    await act(async () => {
      jest.advanceTimersByTime(31_000);
    });

    expect(mockEnd).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't finalize/i);
    expect(alert.textContent).toMatch(/still saving/i);
  });
});
