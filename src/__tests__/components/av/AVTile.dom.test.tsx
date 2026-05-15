/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, cleanup, screen } from "@testing-library/react";

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

  test("connection-state pill reflects peerConnectionState (connected → green, connecting → amber, failed → red)", () => {
    for (const [pc, expected] of [
      ["connected", "Connected"],
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

  test("disconnected state surfaces the ICE label (4c basic mapping; 4d polishes copy)", () => {
    const p = makeRemoteParticipant({
      peerId: "p-disc",
      peerConnectionState: "disconnected",
      iceConnectionState: "checking",
    });
    render(<AVTile participant={p} />);
    expect(screen.getByTestId("av-tile-state-p-disc").textContent).toMatch(
      /checking/
    );
  });

  test("camera-off placeholder appears when videoStream has no video tracks", () => {
    const p = makeRemoteParticipant({
      peerId: "p-novid",
      videoStream: makeFakeStream([]), // no video tracks
    });
    render(<AVTile participant={p} />);
    expect(
      screen.getByTestId("av-tile-cam-placeholder-p-novid")
    ).toBeTruthy();
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
