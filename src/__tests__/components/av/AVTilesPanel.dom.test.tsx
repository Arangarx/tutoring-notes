/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, cleanup, screen } from "@testing-library/react";

import { AVTilesPanel } from "@/components/av/AVTilesPanel";
import type { AvParticipant } from "@/hooks/useLiveAV";

function makeFakeStream(): MediaStream {
  const track = {
    kind: "video" as const,
    enabled: true,
    readyState: "live" as const,
  };
  return {
    getAudioTracks: () => [],
    getVideoTracks: () => [track],
    getTracks: () => [track],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}
function makeAudioOnlyStream(): MediaStream {
  const track = {
    kind: "audio" as const,
    enabled: true,
    readyState: "live" as const,
  };
  return {
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
    getTracks: () => [track],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeParticipant(
  id: string,
  overrides: Partial<AvParticipant> = {}
): AvParticipant {
  return {
    peerId: id,
    role: "student",
    audioStream: makeAudioOnlyStream(),
    videoStream: makeFakeStream(),
    peerConnectionState: "connected",
    iceConnectionState: "connected",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe("AVTilesPanel — layout + empty / populated states", () => {
  test("shows empty-state copy when no localTile and no participants", () => {
    render(<AVTilesPanel participants={[]} />);
    expect(screen.getByTestId("av-tiles-panel-empty")).toBeTruthy();
  });

  test("renders one tile per remote participant, with stable data-peer-id", () => {
    const ps = [
      makeParticipant("peer-a"),
      makeParticipant("peer-b", { role: "tutor", label: "Sarah" }),
      makeParticipant("peer-c"),
    ];
    render(<AVTilesPanel participants={ps} />);
    expect(screen.getByTestId("av-tile-peer-a")).toBeTruthy();
    expect(screen.getByTestId("av-tile-peer-b")).toBeTruthy();
    expect(screen.getByTestId("av-tile-peer-c")).toBeTruthy();
    const panel = screen.getByTestId("av-tiles-panel");
    expect(panel.getAttribute("data-participant-count")).toBe("3");
  });

  test("renders local tile FIRST when provided (preview tile UX convention)", () => {
    const ps = [makeParticipant("peer-a"), makeParticipant("peer-b")];
    render(
      <AVTilesPanel
        participants={ps}
        localTile={{
          role: "tutor",
          label: "Tutor",
          audioStream: makeAudioOnlyStream(),
          videoStream: makeFakeStream(),
          isMicMuted: false,
          isCamMuted: false,
        }}
      />
    );
    const panel = screen.getByTestId("av-tiles-panel");
    // Each tile root is the only element with a `data-peer-id`
    // attribute — filter on that to avoid matching nested test ids
    // (av-tile-video-..., av-tile-label-..., etc.).
    const tiles = Array.from(
      panel.querySelectorAll<HTMLElement>("[data-peer-id]")
    );
    // First child must be the local tile (peerId default = "self").
    expect(tiles[0].getAttribute("data-peer-id")).toBe("self");
    expect(tiles[0].getAttribute("data-is-local")).toBe("true");
    // Remote tiles preserve provided order (the host already sorted
    // them lexicographically via useLiveAV).
    expect(tiles[1].getAttribute("data-peer-id")).toBe("peer-a");
    expect(tiles[2].getAttribute("data-peer-id")).toBe("peer-b");
  });

  test("local tile honours custom peerId override", () => {
    render(
      <AVTilesPanel
        participants={[]}
        localTile={{
          peerId: "tutor-pid",
          role: "tutor",
          audioStream: null,
          videoStream: null,
          isMicMuted: false,
          isCamMuted: true,
        }}
      />
    );
    expect(screen.getByTestId("av-tile-tutor-pid")).toBeTruthy();
  });

  test("3-peer canary: tutor + 2 students all render as distinct tiles", () => {
    // Pillar 1's 3-peer canary applied to the panel layer: a group
    // session with the tutor and 2 students renders 3 tiles (or 4 if
    // we include the local preview). Each peerId must produce its own
    // tile root in the panel.
    const remote = [
      makeParticipant("peer-A", { role: "student", label: "Alex" }),
      makeParticipant("peer-B", { role: "student", label: "Beth" }),
    ];
    render(
      <AVTilesPanel
        participants={remote}
        localTile={{
          peerId: "tutor-self",
          role: "tutor",
          label: "Sarah",
          audioStream: makeAudioOnlyStream(),
          videoStream: makeFakeStream(),
          isMicMuted: false,
          isCamMuted: false,
        }}
      />
    );
    expect(screen.getByTestId("av-tile-tutor-self")).toBeTruthy();
    expect(screen.getByTestId("av-tile-peer-A")).toBeTruthy();
    expect(screen.getByTestId("av-tile-peer-B")).toBeTruthy();
    const panel = screen.getByTestId("av-tiles-panel");
    expect(panel.getAttribute("data-participant-count")).toBe("2");
  });

  test("local tile mutes are passed through to the local-tile component", () => {
    render(
      <AVTilesPanel
        participants={[]}
        localTile={{
          role: "tutor",
          audioStream: makeAudioOnlyStream(),
          videoStream: makeFakeStream(),
          isMicMuted: true,
          isCamMuted: true,
        }}
      />
    );
    expect(screen.getByTestId("av-tile-local-mic-muted-self")).toBeTruthy();
    expect(screen.getByTestId("av-tile-cam-placeholder-self")).toBeTruthy();
  });
});
