/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StudentLiveWorkspaceClient } from "@/app/w/[joinToken]/StudentLiveWorkspaceClient";
import { STUDENT_EXCALIDRAW_INITIAL_DATA } from "@/hooks/useExcalidrawLoadingGuard";

jest.mock("@/components/ThemeProvider", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({
    mode: "system" as const,
    resolvedTheme: "light" as const,
    setMode: jest.fn(),
  }),
}));

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: ({
    initialData,
  }: {
    initialData?: unknown;
  }) => (
    <div
      data-testid="mock-excalidraw"
      data-initial-ref={String(Object.is(initialData, STUDENT_EXCALIDRAW_INITIAL_DATA))}
    />
  ),
}));

jest.mock("@/hooks/useStudentWhiteboardCanvas", () => ({
  useStudentWhiteboardCanvas: () => ({
    onCanvasChange: jest.fn(),
    syncActivePageElements: jest.fn(),
    snapToTutorView: jest.fn(),
    getPageBroadcastExtras: jest.fn(() => null),
    pageList: [{ id: "p1", title: "Board 1", section: "board" }],
    activePageId: "p1",
    activePageIdRef: { current: "p1" },
    applyingRemoteRef: { current: false },
    selectStudentPage: jest.fn(),
    tutorStreamReady: true,
  }),
}));

jest.mock("@/hooks/useCollaboratorPointers", () => ({
  useCollaboratorPointers: jest.fn(),
}));

jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: () => ({
    isConnected: () => false,
    onConnect: (cb: () => void) => {
      cb();
      return () => undefined;
    },
    onDisconnect: () => () => undefined,
    onPeerCountChange: () => () => undefined,
    onRemoteScene: () => () => undefined,
    disconnect: jest.fn(),
  }),
}));

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: () => ({
    participants: [],
    reachableParticipants: [],
    localAudioStream: null,
    localVideoStream: {
      id: "cam",
      getVideoTracks: () => [{ kind: "video", enabled: true, readyState: "live" }],
      getAudioTracks: () => [],
      getTracks: () => [{ kind: "video", enabled: true, readyState: "live" }],
    },
    isMicMuted: false,
    isCamMuted: false,
    isActive: true,
    hasMicPermission: "granted",
    hasCamPermission: "granted",
    error: null,
    videoError: null,
    videoDevices: [{ deviceId: "cam1", label: "Cam" }],
    pickedVideoCameraSlot: 0,
    requestMic: jest.fn(),
    requestCam: jest.fn(),
    toggleMic: jest.fn(),
    toggleCam: jest.fn(),
    reconnectPeer: jest.fn(),
    setMicDevice: jest.fn(),
    setVideoCameraBySlot: jest.fn(),
  }),
}));

jest.mock("@/hooks/useWindowScrollToTopOnMount", () => ({
  useWindowScrollToTopOnMount: () => undefined,
}));

jest.mock("next/navigation", () => ({
  useParams: () => ({ joinToken: "join-token-abc" }),
}));

describe("StudentLiveWorkspaceClient chrome contract", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/w/join-token-abc#k=0123456789abcdef0123456789abcdef");
  });

  it("renders student chrome, disclosure, and stable initialData", () => {
    const { rerender } = render(
      <StudentLiveWorkspaceClient
        whiteboardSessionId="wbs-p2"
        studentId="stu-1"
        joinToken="join-token-abc"
        syncUrl="ws://localhost:3002"
        tutorName="Sarah"
        initialActiveMs={0}
        initialLastActiveAtIso={null}
      />
    );

    expect(screen.getByTestId("mynk-wb-chrome")).toHaveAttribute("data-role", "student");
    expect(screen.getByTestId("wb-student-recording-disclosure")).toHaveTextContent(
      /being recorded by your tutor/i
    );
    expect(screen.getByTestId("student-whiteboard-canvas-mount")).toBeInTheDocument();
    expect(screen.getByTestId("wb-student-av-cluster")).toBeInTheDocument();
    expect(screen.getByTestId("mock-excalidraw")).toHaveAttribute("data-initial-ref", "true");

    rerender(
      <StudentLiveWorkspaceClient
        whiteboardSessionId="wbs-p2"
        studentId="stu-1"
        joinToken="join-token-abc"
        syncUrl="ws://localhost:3002"
        tutorName="Sarah Tutor"
        initialActiveMs={12000}
        initialLastActiveAtIso="2026-06-16T12:00:00.000Z"
      />
    );
    expect(screen.getByTestId("mock-excalidraw")).toHaveAttribute("data-initial-ref", "true");
  });

  it("renders full student chrome: Exit, tool strip, read-only page strip, no AVPermissionsPrompt", () => {
    render(
      <StudentLiveWorkspaceClient
        whiteboardSessionId="wbs-p2"
        studentId="stu-1"
        joinToken="join-token-abc"
        syncUrl="ws://localhost:3002"
        tutorName="Sarah"
        initialActiveMs={0}
        initialLastActiveAtIso={null}
      />
    );

    expect(screen.getByTestId("wb-student-exit")).toHaveTextContent("Exit");
    expect(screen.queryByTestId("av-permissions-prompt")).not.toBeInTheDocument();
    expect(screen.getByTestId("wb-student-tool-strip")).toBeInTheDocument();
    expect(screen.getByLabelText("Pointer wand (K)")).toBeInTheDocument();
    expect(screen.getByTestId("wb-student-page-strip")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Board 1" })).toBeDisabled();
    expect(screen.getByTestId("wb-topbar-mic")).toBeInTheDocument();
    expect(screen.getByTestId("wb-topbar-cam")).toBeInTheDocument();
  });
});
