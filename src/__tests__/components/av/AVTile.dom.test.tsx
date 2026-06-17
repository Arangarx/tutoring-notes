/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, render, cleanup, screen, waitFor } from "@testing-library/react";

import { AVTile, type AVTileProps } from "@/components/av/AVTile";
import type { AvParticipant } from "@/hooks/useLiveAV";

/**
 * Lightweight MediaStream stand-in for jsdom (which doesn't ship
 * MediaStream). Mirrors the shape AVTile reads (`getVideoTracks`,
 * `getAudioTracks`).
 */
type FakeTrack = {
  kind: "audio" | "video";
  enabled: boolean;
  readyState: "live" | "ended";
};
function makeFakeStream(tracks: FakeTrack[]): MediaStream {
  return {
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
    getTracks: () => tracks,
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeRemoteParticipant(
  overrides: Partial<AvParticipant> = {}
): AvParticipant {
  return {
    peerId: "peer-a",
    role: "student",
    label: undefined,
    audioStream: makeFakeStream([
      { kind: "audio", enabled: true, readyState: "live" },
    ]),
    videoStream: makeFakeStream([
      { kind: "video", enabled: true, readyState: "live" },
    ]),
    peerConnectionState: "connected",
    iceConnectionState: "connected",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("AVTile — remote participant", () => {
  /**
   * The video effect now defers play() via requestAnimationFrame so that
   * Chrome's compositor layer is connected before the play() call (see the
   * "compositor-layer race" comment in AVTile.tsx). In jsdom, rAF is
   * implemented as setTimeout(cb, 1000/60), so it doesn't fire automatically
   * within act(). We shim it to fire synchronously (the callback runs
   * immediately when scheduled) so that play() lands within the same act()
   * call and existing synchronous-count assertions continue to work.
   *
   * Note: the compositor-race-guard describe below uses its own *non*-
   * synchronous mock to prove that play() is genuinely deferred.
   */
  let _origRAF: typeof window.requestAnimationFrame;
  let _origCAF: typeof window.cancelAnimationFrame;
  const _rafPending = new Map<number, FrameRequestCallback>();
  let _rafIdSeq = 0;

  beforeEach(() => {
    _rafPending.clear();
    _rafIdSeq = 0;
    _origRAF = window.requestAnimationFrame;
    _origCAF = window.cancelAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const id = ++_rafIdSeq;
      _rafPending.set(id, cb);
      // Fire synchronously so play() lands inside act()'s effect-flush scope.
      cb(0);
      _rafPending.delete(id);
      return id;
    };
    window.cancelAnimationFrame = (id: number) => {
      _rafPending.delete(id);
    };
  });

  afterEach(() => {
    window.requestAnimationFrame = _origRAF;
    window.cancelAnimationFrame = _origCAF;
  });
  test("renders <video muted playsInline> with the participant's videoStream as srcObject", () => {
    const p = makeRemoteParticipant({ peerId: "p-1" });
    render(<AVTile participant={p} />);
    const video = screen.getByTestId("av-tile-video-p-1") as HTMLVideoElement;
    expect(video).toBeTruthy();
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.srcObject).toBe(p.videoStream);
  });

  test("calls play() on the video element when a videoStream is assigned", () => {
    const videoPlayMock = jest.fn().mockResolvedValue(undefined);
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.tagName === "VIDEO") videoPlayMock();
      return Promise.resolve();
    };
    try {
      const p = makeRemoteParticipant({
        peerId: "p-vplay",
        audioStream: null,
        videoStream: makeFakeStream([
          { kind: "video", enabled: true, readyState: "live" },
        ]),
      });
      render(<AVTile participant={p} />);
      expect(videoPlayMock).toHaveBeenCalledTimes(1);
    } finally {
      HTMLMediaElement.prototype.play = originalPlay;
    }
  });

  test("calls play() on the video element when participant gains a videoStream on rerender", () => {
    const videoPlayMock = jest.fn().mockResolvedValue(undefined);
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.tagName === "VIDEO") videoPlayMock();
      return Promise.resolve();
    };
    try {
      const { rerender } = render(
        <AVTile
          participant={makeRemoteParticipant({
            peerId: "p-gain",
            audioStream: null,
            videoStream: null,
          })}
        />
      );
      expect(videoPlayMock).not.toHaveBeenCalled();

      rerender(
        <AVTile
          participant={makeRemoteParticipant({
            peerId: "p-gain",
            audioStream: null,
            videoStream: makeFakeStream([
              { kind: "video", enabled: true, readyState: "live" },
            ]),
          })}
        />
      );
      expect(videoPlayMock).toHaveBeenCalledTimes(1);
    } finally {
      HTMLMediaElement.prototype.play = originalPlay;
    }
  });

  test("renders <audio autoplay> alongside the video; <audio> srcObject = audioStream", () => {
    const p = makeRemoteParticipant({ peerId: "p-2" });
    render(<AVTile participant={p} />);
    const audio = screen.getByTestId("av-tile-audio-p-2") as HTMLAudioElement;
    expect(audio).toBeTruthy();
    expect(audio.autoplay).toBe(true);
    expect(audio.srcObject).toBe(p.audioStream);
  });

  test("uses participant.label when non-empty; otherwise falls back to role-derived default", () => {
    render(
      <AVTile
        participant={makeRemoteParticipant({ peerId: "p-3", label: "Sarah" })}
      />
    );
    expect(screen.getByTestId("av-tile-label-p-3").textContent).toBe("Sarah");

    render(
      <AVTile
        participant={makeRemoteParticipant({
          peerId: "p-4",
          label: "   ",
          role: "tutor",
        })}
      />
    );
    expect(screen.getByTestId("av-tile-label-p-4").textContent).toBe("Tutor");

    render(
      <AVTile
        participant={makeRemoteParticipant({
          peerId: "p-5",
          label: undefined,
          role: "student",
        })}
      />
    );
    expect(screen.getByTestId("av-tile-label-p-5").textContent).toBe("Student");
  });

  test("Phase 4d pill mapping: connected → no pill; connecting/new → 'Connecting…'; failed → 'Connection failed'; closed → 'Disconnected'", () => {
    // `connected` deliberately renders NO pill — reduces visual
    // noise during the steady state. The data-state-kind attribute
    // on the tile root still reflects "connected" for tests.
    {
      const p = makeRemoteParticipant({
        peerId: "p-connected",
        peerConnectionState: "connected",
      });
      render(<AVTile participant={p} />);
      expect(screen.queryByTestId("av-tile-state-p-connected")).toBeNull();
      expect(
        screen.getByTestId("av-tile-p-connected").getAttribute("data-state-kind")
      ).toBe("connected");
      cleanup();
    }
    for (const [pc, expected] of [
      ["connecting", "Connecting…"],
      ["new", "Connecting…"],
      ["failed", "Connection failed"],
      ["closed", "Disconnected"],
    ] as const) {
      const p = makeRemoteParticipant({
        peerId: `p-${pc}`,
        peerConnectionState: pc as RTCPeerConnectionState,
      });
      render(<AVTile participant={p} />);
      expect(screen.getByTestId(`av-tile-state-p-${pc}`).textContent).toMatch(
        new RegExp(expected.replace("…", "."))
      );
      cleanup();
    }
  });

  test("Phase 4d: disconnected pill reads 'Reconnecting…' (not the raw ICE state)", () => {
    const p = makeRemoteParticipant({
      peerId: "p-disc",
      peerConnectionState: "disconnected",
      iceConnectionState: "checking",
    });
    render(<AVTile participant={p} />);
    const pill = screen.getByTestId("av-tile-state-p-disc");
    expect(pill.textContent).toMatch(/Reconnecting(\.{1,3}|…)/);
    // The ICE string must NOT leak into the user-facing copy.
    expect(pill.textContent).not.toMatch(/checking/);
  });

  test("Phase 4d: failed pill renders a Retry button when onReconnect is supplied; clicking it invokes the callback", () => {
    const onReconnect = jest.fn();
    const p = makeRemoteParticipant({
      peerId: "p-failed-r",
      peerConnectionState: "failed",
    });
    render(<AVTile participant={p} onReconnect={onReconnect} />);
    const retry = screen.getByTestId(
      "av-tile-retry-p-failed-r"
    ) as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(retry.textContent).toMatch(/Retry/);
    retry.click();
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  test("Phase 4d: failed pill omits the Retry button when no onReconnect is supplied", () => {
    const p = makeRemoteParticipant({
      peerId: "p-failed-no-cb",
      peerConnectionState: "failed",
    });
    render(<AVTile participant={p} />);
    expect(screen.queryByTestId("av-tile-retry-p-failed-no-cb")).toBeNull();
    expect(
      screen.getByTestId("av-tile-state-p-failed-no-cb").textContent
    ).toMatch(/Connection failed/);
  });

  test("Phase 4d: closed and reconnecting pills never show a Retry button (mesh.restart can't help)", () => {
    for (const pc of ["closed", "disconnected"] as const) {
      const onReconnect = jest.fn();
      const p = makeRemoteParticipant({
        peerId: `p-noretry-${pc}`,
        peerConnectionState: pc,
      });
      render(<AVTile participant={p} onReconnect={onReconnect} />);
      expect(screen.queryByTestId(`av-tile-retry-p-noretry-${pc}`)).toBeNull();
      cleanup();
    }
  });

  test("Phase 4d: cam-off placeholder renders the initials circle (deterministic colour per peerId)", () => {
    const p = makeRemoteParticipant({
      peerId: "p-novid",
      label: "Sarah Johnson",
      videoStream: makeFakeStream([]),
      peerConnectionState: "connected",
    });
    render(<AVTile participant={p} />);
    const placeholder = screen.getByTestId("av-tile-cam-placeholder-p-novid");
    expect(placeholder.getAttribute("data-placeholder-kind")).toBe("initials");
    expect(
      screen.getByTestId("av-tile-initials-p-novid").textContent
    ).toBe("SJ");
    // Placeholder must NOT carry the legacy "Camera off" plain-text
    // copy — initials replace it entirely.
    expect(placeholder.textContent).not.toMatch(/Camera off/i);
  });

  test("Phase 4d: cam-off placeholder for connecting peer keeps the 'Waiting for video…' copy (not initials)", () => {
    const p = makeRemoteParticipant({
      peerId: "p-wait",
      videoStream: makeFakeStream([]),
      peerConnectionState: "connecting",
    });
    render(<AVTile participant={p} />);
    const placeholder = screen.getByTestId("av-tile-cam-placeholder-p-wait");
    expect(placeholder.getAttribute("data-placeholder-kind")).toBe(
      "awaiting-video"
    );
    expect(placeholder).toHaveTextContent("Waiting for video");
    // No initials circle in this case — the peer's identity is
    // ambiguous (still negotiating) so we show the negotiation copy.
    expect(screen.queryByTestId("av-tile-initials-p-wait")).toBeNull();
  });

  test("Phase 4d: cam-off placeholder for a connected peer with no label falls back to the role initial", () => {
    const p = makeRemoteParticipant({
      peerId: "p-noname",
      label: undefined,
      role: "student",
      videoStream: makeFakeStream([]),
      peerConnectionState: "connected",
    });
    render(<AVTile participant={p} />);
    expect(
      screen.getByTestId("av-tile-initials-p-noname").textContent
    ).toBe("S");
  });

  test("re-render with a new MediaStream re-assigns srcObject", () => {
    const first = makeRemoteParticipant({ peerId: "p-rer" });
    const { rerender } = render(<AVTile participant={first} />);
    const video = screen.getByTestId("av-tile-video-p-rer") as HTMLVideoElement;
    expect(video.srcObject).toBe(first.videoStream);

    const second = makeRemoteParticipant({ peerId: "p-rer" });
    rerender(<AVTile participant={second} />);
    expect(video.srcObject).toBe(second.videoStream);
  });

  test("data-* attributes expose peerId + role + isLocal=false for downstream tests", () => {
    const p = makeRemoteParticipant({ peerId: "p-attrs", role: "student" });
    render(<AVTile participant={p} />);
    const root = screen.getByTestId("av-tile-p-attrs");
    expect(root.getAttribute("data-peer-id")).toBe("p-attrs");
    expect(root.getAttribute("data-role")).toBe("student");
    expect(root.getAttribute("data-is-local")).toBe("false");
  });

  test("when remote <audio> autoplay is blocked, shows a tap-to-hear overlay; tapping retries play()", async () => {
    // Simulate the iOS Safari / Chrome Android case where the
    // browser refuses to autoplay the remote audio element even
    // though the user has previously granted mic permission.
    // First play() rejects with NotAllowedError; the overlay should
    // appear. A click on the overlay should retry play() — this time
    // we resolve, and the overlay disappears.
    const playMock = jest
      .fn<Promise<void>, []>()
      .mockRejectedValueOnce(
        Object.assign(new Error("video autoplay aborted"), { name: "AbortError" })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("autoplay blocked"), { name: "NotAllowedError" })
      )
      .mockResolvedValueOnce(undefined);
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = playMock;
    // Silence the console.warn from the AVTile autoplay-block log line.
    const originalWarn = console.warn;
    console.warn = jest.fn();
    try {
      const p = makeRemoteParticipant({ peerId: "p-block" });
      render(<AVTile participant={p} />);
      const btn = (await waitFor(() =>
        screen.getByTestId("av-tile-audio-unblock-p-block")
      )) as HTMLButtonElement;
      expect(btn.textContent).toMatch(/tap to hear/i);

      btn.click();
      await waitFor(() =>
        expect(
          screen.queryByTestId("av-tile-audio-unblock-p-block")
        ).toBeNull()
      );
      expect(playMock).toHaveBeenCalledTimes(3);
    } finally {
      HTMLMediaElement.prototype.play = originalPlay;
      console.warn = originalWarn;
    }
  });
});

/**
 * Red-before / green-after test for the rAF-deferred play() fix.
 *
 * Uses a manual rAF intercept (NOT the auto-flush shim from the "remote
 * participant" describe) so we can prove that play() does NOT fire
 * synchronously and only fires after the rAF callback is explicitly invoked.
 *
 * RED-BEFORE (old immediate-play code): `expect(videoPlayMock).not.toHaveBeenCalled()`
 *   would FAIL because play() was called directly inside the useEffect.
 * GREEN-AFTER (rAF-deferred fix): assertion PASSES, and a manual rAF dispatch
 *   then calls play() exactly once.
 */
describe("AVTile — video compositor-race guard (rAF-deferred play)", () => {
  afterEach(() => cleanup());

  test("play() is NOT called synchronously; fires exactly once after the rAF callback", () => {
    const videoPlayMock = jest.fn().mockResolvedValue(undefined);
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.tagName === "VIDEO") videoPlayMock();
      return Promise.resolve();
    };
    const origRAF = window.requestAnimationFrame;
    const origCAF = window.cancelAnimationFrame;
    let capturedCb: FrameRequestCallback | null = null;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      capturedCb = cb;
      return 1;
    };
    window.cancelAnimationFrame = jest.fn();
    try {
      const p = makeRemoteParticipant({
        peerId: "p-raf-guard",
        audioStream: null,
        videoStream: makeFakeStream([
          { kind: "video", enabled: true, readyState: "live" },
        ]),
      });
      render(<AVTile participant={p} />);

      // RED-BEFORE: with the old immediate-play() code, play() was called
      // synchronously inside useEffect, so this assertion would FAIL.
      // GREEN-AFTER: play() is deferred to rAF — it has NOT fired yet.
      expect(videoPlayMock).not.toHaveBeenCalled();

      // Simulate the browser granting the next animation frame (frame N+1),
      // the exact moment the Chrome compositor finishes wiring the GPU
      // frame-routing path. This is what manual resize was triggering.
      expect(capturedCb).not.toBeNull();
      act(() => {
        capturedCb!(0);
      });

      // After the rAF fires, play() must have been called exactly once.
      expect(videoPlayMock).toHaveBeenCalledTimes(1);
    } finally {
      HTMLMediaElement.prototype.play = origPlay;
      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame = origCAF;
    }
  });

  test("play() is NOT called on rerender when the stream has not changed", () => {
    const videoPlayMock = jest.fn().mockResolvedValue(undefined);
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.tagName === "VIDEO") videoPlayMock();
      return Promise.resolve();
    };
    const origRAF = window.requestAnimationFrame;
    const origCAF = window.cancelAnimationFrame;
    const capturedCbs: FrameRequestCallback[] = [];
    let rafId = 0;
    window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      capturedCbs.push(cb);
      return ++rafId;
    };
    window.cancelAnimationFrame = jest.fn();
    try {
      const stream = makeFakeStream([{ kind: "video", enabled: true, readyState: "live" }]);
      const p = makeRemoteParticipant({ peerId: "p-raf-stable", audioStream: null, videoStream: stream });
      const { rerender } = render(<AVTile participant={p} />);

      // rAF scheduled for first stream assignment; fire it.
      expect(capturedCbs).toHaveLength(1);
      act(() => { capturedCbs[0](0); });
      expect(videoPlayMock).toHaveBeenCalledTimes(1);
      videoPlayMock.mockClear();
      capturedCbs.length = 0;

      // Rerender with the SAME stream object — effect does not re-run.
      rerender(<AVTile participant={{ ...p, label: "Updated" }} />);
      expect(capturedCbs).toHaveLength(0);
      expect(videoPlayMock).not.toHaveBeenCalled();
    } finally {
      HTMLMediaElement.prototype.play = origPlay;
      window.requestAnimationFrame = origRAF;
      window.cancelAnimationFrame = origCAF;
    }
  });
});

describe("AVTile — local preview tile", () => {
  type LocalProps = Extract<AVTileProps["participant"], { isLocal: true }>;
  function localDescriptor(extra: Partial<LocalProps> = {}): LocalProps {
    return {
      peerId: "self",
      role: "tutor",
      label: "Sarah",
      audioStream: makeFakeStream([
        { kind: "audio", enabled: true, readyState: "live" },
      ]),
      videoStream: makeFakeStream([
        { kind: "video", enabled: true, readyState: "live" },
      ]),
      isLocal: true,
      ...extra,
    };
  }

  test("omits the <audio> element entirely (no self-echo)", () => {
    render(<AVTile participant={localDescriptor()} isLocal />);
    expect(screen.queryByTestId("av-tile-audio-self")).toBeNull();
  });

  test("mirrors the <video> via transform: scaleX(-1)", () => {
    render(<AVTile participant={localDescriptor()} isLocal />);
    const video = screen.getByTestId("av-tile-video-self") as HTMLVideoElement;
    expect(video.style.transform).toBe("scaleX(-1)");
  });

  test("state pill reads 'You' for the local tile", () => {
    render(<AVTile participant={localDescriptor()} isLocal />);
    expect(screen.getByTestId("av-tile-state-self").textContent).toMatch(/You/);
  });

  test("local mic-muted overlay appears when localMicMuted=true", () => {
    render(
      <AVTile participant={localDescriptor()} isLocal localMicMuted />
    );
    expect(screen.getByTestId("av-tile-local-mic-muted-self")).toBeTruthy();
  });

  test("local cam placeholder appears when localCamMuted=true (even if stream has tracks)", () => {
    render(
      <AVTile participant={localDescriptor()} isLocal localCamMuted />
    );
    expect(screen.getByTestId("av-tile-cam-placeholder-self")).toBeTruthy();
  });
});
