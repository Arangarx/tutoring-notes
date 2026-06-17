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
 * `getAudioTracks`, `id`).
 *
 * Each call gets a unique `id` (incrementing counter) so that the
 * key-remount mechanism in AVTile works correctly in tests: different
 * stream objects produce different keys, matching the real-world
 * `MediaStream.id` UUID behaviour.
 */
type FakeTrack = {
  kind: "audio" | "video";
  enabled: boolean;
  readyState: "live" | "ended";
};
let _fakeStreamIdCounter = 0;
function makeFakeStream(tracks: FakeTrack[]): MediaStream {
  const id = `fake-stream-${++_fakeStreamIdCounter}`;
  return {
    id,
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

  test("re-render with a new MediaStream re-assigns srcObject on the (possibly remounted) element", () => {
    const first = makeRemoteParticipant({ peerId: "p-rer" });
    const { rerender } = render(<AVTile participant={first} />);
    expect(
      (screen.getByTestId("av-tile-video-p-rer") as HTMLVideoElement).srcObject
    ).toBe(first.videoStream);

    const second = makeRemoteParticipant({ peerId: "p-rer" });
    rerender(<AVTile participant={second} />);
    // With key-remount (stream identity changes → different key → new element),
    // we query the current element from the DOM rather than holding a stale ref.
    expect(
      (screen.getByTestId("av-tile-video-p-rer") as HTMLVideoElement).srcObject
    ).toBe(second.videoStream);
  });

  test("video element is remounted as display:block when remote peer gains a videoStream — key-remount paint fix", () => {
    // This test verifies the root fix for "black video until manual resize" (4th attempt).
    //
    // Mechanism: AVTile keys the <video> element on stream.id. When videoStream goes
    // null → non-null, the key changes ("vid-inactive" → stream.id), React replaces
    // the element with a fresh instance that starts life as display:block. Chrome wires
    // the compositor pipeline on freshly-mounted visible elements; it does NOT do so
    // when an existing display:none element transitions to display:block.
    //
    // Red-before: old element (display:none → display:block) stayed black until resize.
    // Green-after: new element (starts display:block, never display:none) paints on arrival.
    const videoPlayMock = jest.fn().mockResolvedValue(undefined);
    const origPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.tagName === "VIDEO") videoPlayMock();
      return Promise.resolve();
    };
    try {
      const { rerender } = render(
        <AVTile
          participant={makeRemoteParticipant({
            peerId: "p-remount",
            audioStream: null,
            videoStream: null,
          })}
        />
      );

      // Before stream: video element exists but is hidden (display:none)
      const videoBeforeStream = screen.getByTestId(
        "av-tile-video-p-remount"
      ) as HTMLVideoElement;
      expect(videoBeforeStream.style.display).toBe("none");
      expect(videoPlayMock).not.toHaveBeenCalled();

      const fakeVideoStream = makeFakeStream([
        { kind: "video", enabled: true, readyState: "live" },
      ]);
      rerender(
        <AVTile
          participant={makeRemoteParticipant({
            peerId: "p-remount",
            audioStream: null,
            videoStream: fakeVideoStream,
          })}
        />
      );

      // After stream arrives: a NEW element is mounted (key changed) with display:block
      const videoAfterStream = screen.getByTestId(
        "av-tile-video-p-remount"
      ) as HTMLVideoElement;

      // Verify it is a DIFFERENT DOM node (the remount happened)
      expect(videoAfterStream).not.toBe(videoBeforeStream);

      // New element must start as display:block — it was never display:none
      expect(videoAfterStream.style.display).not.toBe("none");

      // srcObject must be set to the new stream on the new element
      expect(videoAfterStream.srcObject).toBe(fakeVideoStream);

      // play() must have been called (via double-RAF, fired synchronously by mock)
      expect(videoPlayMock).toHaveBeenCalledTimes(1);
    } finally {
      HTMLMediaElement.prototype.play = origPlay;
    }
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
 * Tests for the double-RAF belt-and-suspenders play() call.
 *
 * Uses a manual rAF intercept (NOT the auto-flush shim from the "remote
 * participant" describe) so we can prove the exact deferral behaviour.
 *
 * PRIMARY FIX — key-remount (see "key-remount paint fix" test above):
 *   When videoStream goes null → non-null, AVTile changes the <video> key
 *   (via stream.id) so React mounts a fresh element that starts as display:block.
 *   Chrome wires the compositor pipeline on freshly-mounted visible elements,
 *   so the video paints on arrival without any layout event.
 *
 * BELT-AND-SUSPENDERS — double-RAF play() (tested here):
 *   Even on a freshly mounted display:block element, some browsers do not
 *   auto-start a muted autoPlay video without an explicit play() call. The
 *   double-RAF defers play() past the current paint cycle so the browser has
 *   processed the srcObject assignment before play() is invoked.
 *
 *   Frame N:   useEffect fires on newly mounted element → srcObject set →
 *              outer RAF scheduled.
 *   Frame N+1 rAF (outer): fires BEFORE N+1 paint → schedules inner RAF.
 *   Frame N+1 PAINT: browser processes srcObject on compositor.
 *   Frame N+2 rAF (inner): fires AFTER N+1 paint → play() called.
 */
describe("AVTile — video play() deferral (double-RAF belt-and-suspenders)", () => {
  afterEach(() => cleanup());

  test("play() is NOT called synchronously nor after the first (outer) RAF; fires exactly once after the second (inner) RAF", () => {
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
      const p = makeRemoteParticipant({
        peerId: "p-raf-guard",
        audioStream: null,
        videoStream: makeFakeStream([
          { kind: "video", enabled: true, readyState: "live" },
        ]),
      });
      render(<AVTile participant={p} />);

      // Only the outer RAF is scheduled at this point; play() not called.
      expect(videoPlayMock).not.toHaveBeenCalled();
      expect(capturedCbs).toHaveLength(1); // outer RAF captured

      // Fire the outer RAF (frame N+1 pre-paint). This schedules the inner RAF
      // but must NOT call play() yet — the N+1 paint hasn't run.
      act(() => { capturedCbs[0](0); });
      expect(videoPlayMock).not.toHaveBeenCalled(); // still black — compositor not wired
      expect(capturedCbs).toHaveLength(2); // inner RAF now captured

      // Fire the inner RAF (frame N+2 pre-paint, i.e. after N+1 paint where
      // Chrome connected the decoder to the compositor layer). NOW play() fires.
      act(() => { capturedCbs[1](0); });
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

      // Double-RAF for first stream assignment: outer + inner, then play().
      expect(capturedCbs).toHaveLength(1); // outer scheduled
      act(() => { capturedCbs[0](0); }); // fire outer → inner scheduled
      expect(capturedCbs).toHaveLength(2);
      act(() => { capturedCbs[1](0); }); // fire inner → play() called
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

// Mechanism B (ResizeObserver-driven play) was removed as part of the principled
// fix for the "black remote video until manual resize" bug.  The root cause was
// that whiteboard-chrome.css applied `aspect-ratio: unset !important` to the tile
// video body, removing its intrinsic height and leaving Chrome's compositor without
// a concrete box at mount time.  With that CSS rule removed, the video body has a
// concrete aspect-ratio-derived height on initial mount (matching the student-side
// pattern), so the ResizeObserver hack is no longer needed.

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
