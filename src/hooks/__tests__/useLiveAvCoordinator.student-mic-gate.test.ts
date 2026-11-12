/**
 * @jest-environment jsdom
 *
 * Consent wave C3c (plan § 4.1 item 6): the learner A/V bootstrap asks for the mic only when the learner's mic gate
 * is `yes`. Defer / no still bring the camera up; a later flip to `yes` asks for the mic once.
 * @wb-av
 */

import { act, renderHook } from "@testing-library/react";
import type { MicAcquire } from "@/lib/recording/session-capabilities";
import type { UseLiveAVReturn } from "@/hooks/useLiveAV";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

let touchPrimary = false;
jest.mock("@/components/whiteboard/chrome/useWbLayoutMode", () => ({
  isTouchPrimaryDevice: () => touchPrimary,
}));

import { useLiveAvCoordinator } from "@/hooks/useLiveAvCoordinator";

type Calls = { requestMic: jest.Mock; requestCam: jest.Mock; requestMicAndCam: jest.Mock };

function makeLiveAv(): { ref: { current: UseLiveAVReturn }; calls: Calls } {
  const live = {
    localAudioStream: null as MediaStream | null,
    localVideoStream: null as MediaStream | null,
    reachableParticipants: [],
    participants: [],
    reconnectPeer: jest.fn(),
    refreshAudioDeviceList: jest.fn(),
    refreshVideoDeviceList: jest.fn(),
  } as Record<string, unknown>;
  const calls: Calls = {
    requestMic: jest.fn(async () => {
      live.localAudioStream = {} as MediaStream;
    }),
    requestCam: jest.fn(async () => {
      live.localVideoStream = {} as MediaStream;
    }),
    requestMicAndCam: jest.fn(async (opts?: { wantAudio?: boolean }) => {
      if (opts?.wantAudio !== false) live.localAudioStream = {} as MediaStream;
      live.localVideoStream = {} as MediaStream;
    }),
  };
  Object.assign(live, calls);
  return { ref: { current: live as unknown as UseLiveAVReturn }, calls };
}

const connectedSync = {
  isConnected: () => true,
  onConnect: () => () => {},
  onDisconnect: () => () => {},
} as unknown as WhiteboardSyncClient;

function renderStudent(ref: { current: UseLiveAVReturn }, initial: MicAcquire) {
  return renderHook(
    ({ acquire }: { acquire: MicAcquire }) =>
      useLiveAvCoordinator({
        role: "student",
        sync: null,
        studentSyncClient: connectedSync,
        peerCount: 0,
        whiteboardSessionId: "wbs-c3c",
        liveAvRef: ref,
        studentHasConnectedOnceRef: { current: false },
        joinUnavailableReason: null,
        hasLeft: false,
        studentMicAcquire: acquire,
        openMenu: null,
        hasCamPermission: "unknown",
        tutorMicAcquireSettled: true,
        reachablePeerIdsKey: "",
        reachableParticipantsCount: 0,
        tutorSyncConnected: false,
        studentConnected: true,
        setLifecycleParticipants: jest.fn(),
        setBothPartiesInRoom: jest.fn(),
      }),
    { initialProps: { acquire: initial } }
  );
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("useLiveAvCoordinator — learner bootstrap follows the learner mic gate (C3c)", () => {
  afterEach(() => {
    touchPrimary = false;
  });

  test.each(["defer", "no"] as const)("touch, %s: the video-only bundle, no mic request", async (acquire) => {
    touchPrimary = true;
    const { ref, calls } = makeLiveAv();
    renderStudent(ref, acquire);
    await flush();
    expect(calls.requestMicAndCam).toHaveBeenCalledTimes(1);
    expect(calls.requestMicAndCam).toHaveBeenCalledWith({ wantAudio: false });
    expect(calls.requestMic).not.toHaveBeenCalled();
  });

  test.each(["defer", "no"] as const)("desktop, %s: the camera only, no mic request", async (acquire) => {
    const { ref, calls } = makeLiveAv();
    renderStudent(ref, acquire);
    await flush();
    expect(calls.requestCam).toHaveBeenCalledTimes(1);
    expect(calls.requestMic).not.toHaveBeenCalled();
    expect(calls.requestMicAndCam).not.toHaveBeenCalled();
  });

  test("touch, yes: today's bundled call (characterization)", async () => {
    touchPrimary = true;
    const { ref, calls } = makeLiveAv();
    renderStudent(ref, "yes");
    await flush();
    expect(calls.requestMicAndCam).toHaveBeenCalledTimes(1);
    expect(calls.requestMicAndCam.mock.calls[0]![0]?.wantAudio).not.toBe(false);
    expect(calls.requestMic).not.toHaveBeenCalled();
  });

  test("desktop, yes: mic then camera (characterization)", async () => {
    const { ref, calls } = makeLiveAv();
    renderStudent(ref, "yes");
    await flush();
    expect(calls.requestMic).toHaveBeenCalledTimes(1);
    expect(calls.requestCam).toHaveBeenCalledTimes(1);
    expect(calls.requestMic.mock.invocationCallOrder[0]).toBeLessThan(calls.requestCam.mock.invocationCallOrder[0]!);
  });

  test("touch, defer then yes: the mic is requested once after the flip; the camera is not asked for again", async () => {
    touchPrimary = true;
    const { ref, calls } = makeLiveAv();
    const hook = renderStudent(ref, "defer");
    await flush();
    expect(calls.requestMic).not.toHaveBeenCalled();
    hook.rerender({ acquire: "yes" });
    await flush();
    expect(calls.requestMic).toHaveBeenCalledTimes(1);
    expect(calls.requestMicAndCam).toHaveBeenCalledTimes(1);
    expect(calls.requestCam).not.toHaveBeenCalled();
  });
});
