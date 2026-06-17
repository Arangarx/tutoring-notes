/**
 * @jest-environment jsdom
 *
 * Mechanism A: WbAVCluster automatically replicates the manual-resize reflow
 * when a remote participant with a videoStream arrives.
 *
 * The manual resize's effect on paint: the cluster transitions from CSS-flex
 * auto-height (data-auto-grow="true") to explicit inline pixel height
 * (data-auto-grow absent, style.height set to a concrete px value).  That
 * structural change causes the browser to recompute layout, giving the <video>
 * element concrete pixel dimensions — the trigger the compositor needs to wire
 * up and paint the remote video.
 *
 * jsdom limitation note: jsdom does not run a paint pipeline or a compositor,
 * so these tests can only verify that the DOM/state change (data-auto-grow
 * removal + concrete style.height) happens. Definitive proof that the video
 * paints requires a two-device LV-2 smoke test on real hardware.
 */

import React from "react";
import { act, render, screen, cleanup } from "@testing-library/react";

import { WbAVCluster, type WbAVClusterProps } from "@/components/whiteboard/chrome/WbAVCluster";
import type { AvParticipant } from "@/hooks/useLiveAV";

// ---------------------------------------------------------------------------
// Fake MediaStream helper (mirrors AVTile.dom.test.tsx pattern)
// ---------------------------------------------------------------------------
let _fakeStreamIdCounter = 0;
function makeFakeStream(hasVideo = true): MediaStream {
  const id = `fake-stream-${++_fakeStreamIdCounter}`;
  return {
    id,
    getAudioTracks: () => hasVideo ? [] : [{ kind: "audio", enabled: true, readyState: "live" }],
    getVideoTracks: () => hasVideo ? [{ kind: "video", enabled: true, readyState: "live" }] : [],
    getTracks: () => hasVideo ? [{ kind: "video", enabled: true, readyState: "live" }] : [],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
}

function makeRemoteParticipant(peerId: string, withVideo = true): AvParticipant {
  return {
    peerId,
    role: "student",
    label: "Student",
    audioStream: null,
    videoStream: withVideo ? makeFakeStream(true) : null,
    peerConnectionState: "connected",
    iceConnectionState: "connected",
  };
}

function makeBaseProps(
  participants: ReadonlyArray<AvParticipant> = []
): WbAVClusterProps {
  return {
    participants,
    localTile: {
      peerId: "self",
      role: "tutor",
      label: "Tutor",
      audioStream: null,
      videoStream: null,
      isMicMuted: false,
      isCamMuted: true,
    },
    isMicMuted: false,
    isCamMuted: true,
    onToggleMic: jest.fn(),
    onToggleCam: jest.fn(),
    layoutMode: "desktop",
  };
}

afterEach(() => cleanup());

describe("WbAVCluster — Mechanism A (auto-reflow on remote video arrival)", () => {
  test("cluster starts in auto-grow mode (data-auto-grow=true) with only a local tile", () => {
    render(<WbAVCluster {...makeBaseProps([])} />);
    const cluster = screen.getByTestId("wb-av-cluster");
    // data-auto-grow is set when useAutoGrow=true (CSS-flex controls height, no inline px).
    expect(cluster.getAttribute("data-auto-grow")).toBe("true");
  });

  test("data-auto-grow is removed and style.height becomes a concrete px value when a remote participant with videoStream arrives", async () => {
    const props = makeBaseProps([]);
    const { rerender } = render(<WbAVCluster {...props} />);

    const clusterBefore = screen.getByTestId("wb-av-cluster");
    expect(clusterBefore.getAttribute("data-auto-grow")).toBe("true");

    // Add a remote participant who has a live videoStream.
    const remote = makeRemoteParticipant("peer-1", true);
    await act(async () => {
      rerender(
        <WbAVCluster
          {...makeBaseProps([remote])}
        />
      );
    });

    const clusterAfter = screen.getByTestId("wb-av-cluster");
    // Mechanism A must have fired: data-auto-grow should no longer be set,
    // indicating the cluster switched from CSS-flex height to explicit inline px.
    expect(clusterAfter.getAttribute("data-auto-grow")).toBeNull();

    // The inline style.height must be a non-empty px value (concrete pixels).
    const h = (clusterAfter as HTMLElement).style.height;
    expect(h).toMatch(/^\d+px$/);
  });

  test("data-auto-grow is NOT removed when a remote participant arrives WITHOUT a videoStream", async () => {
    const props = makeBaseProps([]);
    const { rerender } = render(<WbAVCluster {...props} />);

    // Add participant with no video (audio-only or not yet negotiated).
    const remoteNoVideo = makeRemoteParticipant("peer-2", false);
    await act(async () => {
      rerender(<WbAVCluster {...makeBaseProps([remoteNoVideo])} />);
    });

    const cluster = screen.getByTestId("wb-av-cluster");
    // No videoStream → Mechanism A does not fire → still auto-grow.
    expect(cluster.getAttribute("data-auto-grow")).toBe("true");
  });

  test("Mechanism A fires when videoStream transitions from null to non-null on existing participant", async () => {
    const noVideoParticipant = makeRemoteParticipant("peer-3", false);
    const { rerender } = render(
      <WbAVCluster {...makeBaseProps([noVideoParticipant])} />
    );

    // Still auto-grow while participant has no video.
    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBe("true");

    // Now the participant gains a videoStream (camera turned on mid-session).
    const withVideoParticipant: AvParticipant = {
      ...noVideoParticipant,
      videoStream: makeFakeStream(true),
    };
    await act(async () => {
      rerender(<WbAVCluster {...makeBaseProps([withVideoParticipant])} />);
    });

    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBeNull();
  });

  test("cluster height after Mechanism A matches the 2-tile auto-grow height (no squish)", async () => {
    // The squish guard: after Mechanism A, the cluster height must be the same
    // value that auto-grow would have produced for 2 tiles (local + 1 remote).
    // We verify by checking that the inline px value equals computeAutoClusterHeight(2).
    //
    // Constants from WbAVCluster:
    //   CLUSTER_CHROME_HEIGHT = 14 + 8 + 45 = 67
    //   PER_TILE_BODY_HEIGHT  = 280 - 67     = 213
    //   TILE_GAP              = 4
    //   autoHeight(2)         = 67 + 2*213 + 1*4 = 497
    const EXPECTED_2_TILE_HEIGHT = 497;

    const { rerender } = render(<WbAVCluster {...makeBaseProps([])} />);

    await act(async () => {
      rerender(
        <WbAVCluster {...makeBaseProps([makeRemoteParticipant("peer-sq", true)])} />
      );
    });

    const cluster = screen.getByTestId("wb-av-cluster") as HTMLElement;
    const heightPx = parseInt(cluster.style.height, 10);
    expect(heightPx).toBe(EXPECTED_2_TILE_HEIGHT);
  });
});
