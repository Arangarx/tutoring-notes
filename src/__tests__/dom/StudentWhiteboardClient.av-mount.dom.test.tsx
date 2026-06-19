/**
 * @jest-environment jsdom
 */

/**
 * Student Γåö live-A/V mount contract (Phase 4c).
 *
 * The student side is intentionally narrower than the tutor side
 * (no FSM, no recorder). We assert:
 *
 *   1. `localPeerId` is minted once and threaded into BOTH
 *      `createWhiteboardSyncClient({peerId})` and
 *      `useLiveAV({localPeerId})`. Same id everywhere, no drift.
 *
 *   2. `AVPermissionsPrompt` + `AVTilesPanel` + `AVControls` render
 *      on the student surface.
 *
 *   3. Sync-reconnect → `liveAv.reconnectPeer(peerId)` for every
 *      current peer once the sync-client emits a disconnect →
 *      reconnect transition.
 *
 *   4. First-mount `onConnect` does NOT fire reconnectPeer (the
 *      natural handshake should not race against initial
 *      negotiation).
 *
 * What we explicitly DON'T assert: no recorder instantiation, no
 * FSM `inputStreams` population — the student client has neither.
 * If a regression accidentally introduces either, the workspace
 * mount test will catch the recorder side; the FSM side has no
 * student-side analogue and is intentionally untested here (no
 * code to test).
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";

// ----- Stub the heavy / unrelated student-side deps -----

jest.mock("@/components/whiteboard/ExcalidrawDynamic", () => ({
  ExcalidrawDynamic: () => null,
}));
jest.mock("@/components/whiteboard/UndoRedoButtons", () => ({
  UndoRedoButtons: () => null,
}));
jest.mock("@/hooks/useStudentWhiteboardCanvas", () => ({
  useStudentWhiteboardCanvas: () => ({
    onCanvasChange: jest.fn(),
    syncActivePageElements: jest.fn(),
    snapToTutorView: jest.fn(),
    getPageBroadcastExtras: jest.fn(() => null),
    pageList: [],
    sectionsRegistry: {},
    activePageId: "p1",
    tutorStreamReady: true,
  }),
}));
jest.mock("@/lib/whiteboard/ensure-native-image-asset-urls-for-sync", () => ({
  ensureNativeImageAssetUrlsForSync: jest.fn(async () => null),
}));
jest.mock("@/lib/whiteboard/validate-embeddable", () => ({
  validateExcalidrawEmbeddable: jest.fn(() => true),
}));
jest.mock("@/lib/whiteboard/active-time", () => ({
  ACTIVE_PING_STALE_MS: 10_000,
  computeDisplayActiveMs: () => 0,
}));
jest.mock("@/hooks/useWindowScrollToTopOnMount", () => ({
  useWindowScrollToTopOnMount: () => undefined,
}));
jest.mock("@/hooks/useExcalidrawThemeFromSystem", () => ({
  useExcalidrawThemeFromSystem: () => "light",
}));
jest.mock("next/navigation", () => ({
  useParams: () => ({ joinToken: "tok-stub" }),
}));

// ----- Sync-client mock with the same shape as the workspace test -----

type FakeSyncClient = {
  isConnected: () => boolean;
  disconnect: jest.Mock;
  onRemoteScene: () => () => void;
  onConnect: jest.Mock;
  onDisconnect: jest.Mock;
  onPeerCountChange: jest.Mock;
  onRoomPeersChange: jest.Mock;
  onRemotePointer: jest.Mock;
  broadcastScene: jest.Mock;
  broadcastDocument: jest.Mock;
  broadcastPointer: jest.Mock;
  flushPendingBroadcast: jest.Mock;
  __triggerConnect: () => void;
  __triggerDisconnect: () => void;
  __triggerRoomPeers: (peers: Array<{ peerId: string; role: string }>) => void;
  __getPeerId: () => string | undefined;
};

const createdSyncClients: FakeSyncClient[] = [];

const mockCreateWhiteboardSyncClient = jest.fn(
  (opts: { peerId?: string }): FakeSyncClient => {
    const connectCbs: Array<() => void> = [];
    const disconnectCbs: Array<() => void> = [];
    const roomPeersCbs: Array<(peers: ReadonlyArray<{ peerId: string; role: string }>) => void> = [];
    let connected = false;
    const client: FakeSyncClient = {
      isConnected: () => connected,
      disconnect: jest.fn(),
      onRemoteScene: () => () => {},
      onConnect: jest.fn((cb: () => void) => {
        connectCbs.push(cb);
        return () => {
          const i = connectCbs.indexOf(cb);
          if (i >= 0) connectCbs.splice(i, 1);
        };
      }),
      onDisconnect: jest.fn((cb: () => void) => {
        disconnectCbs.push(cb);
        return () => {
          const i = disconnectCbs.indexOf(cb);
          if (i >= 0) disconnectCbs.splice(i, 1);
        };
      }),
      onPeerCountChange: jest.fn(() => () => {}),
      onRoomPeersChange: jest.fn(
        (cb: (peers: ReadonlyArray<{ peerId: string; role: string }>) => void) => {
          roomPeersCbs.push(cb);
          return () => {
            const i = roomPeersCbs.indexOf(cb);
            if (i >= 0) roomPeersCbs.splice(i, 1);
          };
        }
      ),
      onRemotePointer: jest.fn(() => () => {}),
      broadcastScene: jest.fn(),
      broadcastDocument: jest.fn(),
      broadcastPointer: jest.fn(),
      flushPendingBroadcast: jest.fn(),
      __triggerConnect: () => {
        connected = true;
        for (const cb of [...connectCbs]) cb();
      },
      __triggerDisconnect: () => {
        connected = false;
        for (const cb of [...disconnectCbs]) cb();
      },
      __triggerRoomPeers: (peers) => {
        for (const cb of [...roomPeersCbs]) cb(peers);
      },
      __getPeerId: () => opts.peerId,
    };
    createdSyncClients.push(client);
    return client;
  }
);
jest.mock("@/lib/whiteboard/sync-client", () => ({
  createWhiteboardSyncClient: (opts: { peerId?: string }) =>
    mockCreateWhiteboardSyncClient(opts),
  generateEncryptionKeyBase64Url: () =>
    "test-integration-key-16chars-min",
}));

// ----- useLiveAV mock (scriptable participants + spies) -----

type LiveAvState = {
  participants: ReadonlyArray<{
    peerId: string;
    role: "tutor" | "student";
    label?: string;
    audioStream: MediaStream | null;
    videoStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;
    iceConnectionState: RTCIceConnectionState;
  }>;
  localAudioStream: MediaStream | null;
  localVideoStream: MediaStream | null;
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  isMicMuted: boolean;
  isCamMuted: boolean;
  error: null;
  videoError: null;
};

let liveAvState: LiveAvState = {
  participants: [],
  localAudioStream: null,
  localVideoStream: null,
  hasMicPermission: "prompt",
  hasCamPermission: "prompt",
  isMicMuted: false,
  isCamMuted: true,
  error: null,
  videoError: null,
};
let receivedLocalPeerId: string | undefined;
const reconnectPeerSpy = jest.fn();
const requestMicSpy = jest.fn().mockResolvedValue(undefined);
const requestCamSpy = jest.fn().mockResolvedValue(undefined);
const toggleMicSpy = jest.fn();
const toggleCamSpy = jest.fn();

jest.mock("@/hooks/useLiveAV", () => ({
  useLiveAV: (opts: { localPeerId?: string }) => {
    receivedLocalPeerId = opts.localPeerId;
    return {
      ...liveAvState,
      // reachableParticipants: same as participants in tests (no WebRTC state distinction)
      reachableParticipants: liveAvState.participants.filter(
        (p) => p.peerConnectionState === "connected" &&
          (p.iceConnectionState === "connected" || p.iceConnectionState === "completed")
      ),
      toggleMic: toggleMicSpy,
      toggleCam: toggleCamSpy,
      requestMic: requestMicSpy,
      requestCam: requestCamSpy,
      isAcquiring: false,
      isActive: false,
      reconnectPeer: reconnectPeerSpy,
      retryAcquire: jest.fn().mockResolvedValue(undefined),
    };
  },
}));

// ----- Test helpers -----

function makeFakeAudioStream(id: string): MediaStream {
  const track = {
    kind: "audio" as const,
    enabled: true,
    readyState: "live" as const,
    id,
  };
  return {
    id,
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeParticipant(
  peerId: string,
  overrides: Partial<{
    role: "tutor" | "student";
    label: string;
    audioStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;
  }> = {}
): LiveAvState["participants"][number] {
  return {
    peerId,
    role: overrides.role ?? "tutor",
    label: overrides.label,
    audioStream:
      overrides.audioStream !== undefined
        ? overrides.audioStream
        : makeFakeAudioStream(`stream-${peerId}`),
    videoStream: null,
    peerConnectionState: overrides.peerConnectionState ?? "connected",
    iceConnectionState: "connected",
  };
}

const baseProps = {
  whiteboardSessionId: "wb-sess-student-1",
  studentId: "stu-1",
  joinToken: "tok-stub",
  syncUrl: "wss://wb.example.com",
  tutorName: "Ms. Sarah",
  initialActiveMs: 0,
  initialLastActiveAtIso: null,
};

async function renderStudent() {
  const mod = await import("@/app/w/[joinToken]/StudentWhiteboardClient");
  // Park an encryption key in the hash so the sync-client effect
  // proceeds past its `if (!encryptionKey) return` gate.
  window.history.replaceState(
    null,
    "",
    "#k=test-integration-key-16chars-min"
  );
  const utils = render(<mod.StudentWhiteboardClient {...baseProps} />);
  // Flush the sync-client mount effect.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return utils;
}

beforeAll(() => {
  // The student client polls /api/whiteboard/<id>/join-timer; head it
  // off with a stub that always returns a JSON 200.
  global.fetch = jest.fn(async () =>
    new Response(
      JSON.stringify({
        activeMs: 0,
        lastActiveAtIso: null,
        endedAt: null,
        revokedAt: null,
        expired: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  ) as unknown as typeof fetch;
});

beforeEach(() => {
  mockCreateWhiteboardSyncClient.mockClear();
  createdSyncClients.length = 0;
  reconnectPeerSpy.mockClear();
  receivedLocalPeerId = undefined;
  liveAvState = {
    participants: [],
    localAudioStream: null,
    localVideoStream: null,
    hasMicPermission: "prompt",
    hasCamPermission: "prompt",
    isMicMuted: false,
    isCamMuted: true,
    error: null,
    videoError: null,
  };
});

describe("StudentWhiteboardClient Γåö live A/V mount", () => {
  test("mints localPeerId once and threads it into BOTH sync-client and useLiveAV", async () => {
    await renderStudent();
    expect(createdSyncClients).toHaveLength(1);
    const syncPeerId = createdSyncClients[0].__getPeerId();
    expect(syncPeerId).toBeTruthy();
    expect(receivedLocalPeerId).toBe(syncPeerId);
  });

  test("renders AVPermissionsPrompt + AVTilesPanel + AVControls", async () => {
    await renderStudent();
    expect(screen.getByTestId("av-permissions-prompt")).toBeTruthy();
    expect(screen.getByTestId("av-tiles-panel")).toBeTruthy();
    expect(screen.getByTestId("av-controls")).toBeTruthy();
  });

  test("renders one tile per remote participant + the local tile", async () => {
    liveAvState = {
      ...liveAvState,
      localAudioStream: makeFakeAudioStream("local"),
      hasMicPermission: "granted",
      participants: [
        makeParticipant("peer-tutor", {
          role: "tutor",
          label: "Tutor",
        }),
      ],
    };
    await renderStudent();
    const panel = screen.getByTestId("av-tiles-panel");
    const tiles = Array.from(
      panel.querySelectorAll<HTMLElement>("[data-peer-id]")
    );
    const peerIds = tiles.map((t) => t.getAttribute("data-peer-id"));
    expect(peerIds).toContain("peer-tutor");
    expect(peerIds).toContain(receivedLocalPeerId);
  });

  test("sync-reconnect → reconnectPeer for every current peer", async () => {
    liveAvState = {
      ...liveAvState,
      participants: [
        makeParticipant("peer-tutor", { role: "tutor" }),
        makeParticipant("peer-other-student"),
      ],
    };
    await renderStudent();
    const client = createdSyncClients[0];

    // Populate lastPresencePeerIdsRef via onRoomPeersChange so the
    // sync-reconnect handler has peer IDs to reconnect (fix B: the handler
    // now drives off sync presence rather than liveAv.participants so it
    // works even when the 10s eviction timer has cleared participants).
    act(() => {
      client.__triggerRoomPeers([
        { peerId: "peer-tutor", role: "tutor" },
        { peerId: "peer-other-student", role: "student" },
      ]);
    });

    act(() => {
      client.__triggerConnect();
    });
    expect(reconnectPeerSpy).not.toHaveBeenCalled();

    act(() => {
      client.__triggerDisconnect();
    });
    act(() => {
      client.__triggerConnect();
    });

    expect(reconnectPeerSpy).toHaveBeenCalledTimes(2);
    const calledIds = reconnectPeerSpy.mock.calls.map((c) => c[0]).sort();
    expect(calledIds).toEqual(["peer-other-student", "peer-tutor"]);
  });

  test("first-mount onConnect does NOT trigger reconnectPeer (only reconnect-after-disconnect does)", async () => {
    liveAvState = {
      ...liveAvState,
      participants: [makeParticipant("peer-tutor", { role: "tutor" })],
    };
    await renderStudent();
    const client = createdSyncClients[0];
    act(() => {
      client.__triggerConnect();
    });
    expect(reconnectPeerSpy).not.toHaveBeenCalled();
  });
});
