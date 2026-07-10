/**
 * @jest-environment jsdom
 *
 * AUDIO-1 attempt #4 — tutor auto-cam waits for recorder mic settle.
 * @wb-av
 */

import { act, renderHook } from "@testing-library/react";
import { useLiveAvCoordinator } from "@/hooks/useLiveAvCoordinator";
import type { UseLiveAVReturn } from "@/hooks/useLiveAV";

function makeLiveAvStub(requestCam: jest.Mock): UseLiveAVReturn {
  return {
    localVideoStream: null,
    requestCam,
    reachableParticipants: [],
    participants: [],
    reconnectPeer: jest.fn(),
  } as unknown as UseLiveAVReturn;
}

describe("useLiveAvCoordinator — tutor mic-before-cam (AUDIO-1 #4)", () => {
  it("defers auto requestCam until tutorMicAcquireSettled is true", async () => {
    const requestCam = jest.fn().mockResolvedValue(undefined);
    const liveAvRef = { current: makeLiveAvStub(requestCam) };
    const studentHasConnectedOnceRef = { current: false };

    const { rerender } = renderHook(
      ({ settled }: { settled: boolean }) =>
        useLiveAvCoordinator({
          role: "tutor",
          sync: null,
          studentSyncClient: null,
          peerCount: 0,
          whiteboardSessionId: "wbs-test",
          liveAvRef,
          studentHasConnectedOnceRef,
          joinUnavailableReason: null,
          hasLeft: false,
          openMenu: null,
          hasCamPermission: "granted",
          tutorMicAcquireSettled: settled,
          reachablePeerIdsKey: "",
          reachableParticipantsCount: 0,
          tutorSyncConnected: false,
          studentConnected: false,
          setLifecycleParticipants: jest.fn(),
          setBothPartiesInRoom: jest.fn(),
        }),
      { initialProps: { settled: false } }
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestCam).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ settled: true });
      await Promise.resolve();
    });
    expect(requestCam).toHaveBeenCalledTimes(1);
  });

  it("student path does not require tutorMicAcquireSettled (settled=true always from caller)", async () => {
    const requestCam = jest.fn().mockResolvedValue(undefined);
    const liveAvRef = { current: makeLiveAvStub(requestCam) };
    const studentHasConnectedOnceRef = { current: false };

    // Student bootstrap uses requestMic/requestCam on sync connect — auto-cam
    // effect still runs when hasCamPermission granted. Workspace passes
    // tutorMicAcquireSettled=true for students.
    renderHook(() =>
      useLiveAvCoordinator({
        role: "student",
        sync: null,
        studentSyncClient: null,
        peerCount: 0,
        whiteboardSessionId: "wbs-student",
        liveAvRef,
        studentHasConnectedOnceRef,
        joinUnavailableReason: null,
        hasLeft: false,
        openMenu: null,
        hasCamPermission: "granted",
        tutorMicAcquireSettled: true,
        reachablePeerIdsKey: "",
        reachableParticipantsCount: 0,
        tutorSyncConnected: false,
        studentConnected: false,
        setLifecycleParticipants: jest.fn(),
        setBothPartiesInRoom: jest.fn(),
      })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(requestCam).toHaveBeenCalledTimes(1);
  });
});
