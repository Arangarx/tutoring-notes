/**
 * @jest-environment jsdom
 *
 * Principal fix for "black remote video until manual resize":
 *
 * Root cause: the A3b CSS rule previously applied `aspect-ratio: unset !important`
 * to the tile video body inside the cluster, removing its intrinsic height.  The
 * video body's height then depended on a multi-level flex chain (cluster → tiles
 * area → panel → tile → body), and Chrome's compositor did not wire the <video>
 * element at initial mount in that absolutely-positioned flex context.
 *
 * Fix: remove `aspect-ratio: unset !important` from A3b so the video body keeps
 * its `aspect-ratio: 4/3` from AVTile's inline style.  The body now has a
 * concrete intrinsic height (tile-width × 0.75) at mount — the same pattern that
 * makes the student-side remote video paint on arrival.  The cluster stays in
 * auto-grow mode; no state-mutation hack is needed.
 *
 * jsdom limitation: jsdom does not run a paint pipeline or compositor, so these
 * tests verify DOM/style state only.  Definitive proof that the video paints
 * requires a two-device LV-2 smoke test on real hardware.
 */

import React from "react";
import { act, render, screen, cleanup } from "@testing-library/react";

// jsdom does not define PointerEvent — polyfill so pointer-event dispatch works.
if (typeof (global as Record<string, unknown>).PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  (global as Record<string, unknown>).PointerEvent = PointerEvent;
}

import { WbAVCluster, type WbAVClusterProps } from "@/components/whiteboard/chrome/WbAVCluster";
import type { AVLocalTileDescriptor } from "@/components/av/AVTilesPanel";
import type { AvParticipant } from "@/hooks/useLiveAV";

// ---------------------------------------------------------------------------
// Fake MediaStream helper
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
    peerConnectionState: "connected" as RTCPeerConnectionState,
    iceConnectionState: "connected" as RTCIceConnectionState,
  };
}

const LOCAL_TILE: AVLocalTileDescriptor = {
  peerId: "self",
  role: "tutor",
  label: "Tutor",
  audioStream: null,
  videoStream: null,
  isMicMuted: false,
  isCamMuted: true,
};

function makeBaseProps(
  participants: ReadonlyArray<AvParticipant> = []
): WbAVClusterProps {
  return {
    participants,
    localTile: LOCAL_TILE,
    isMicMuted: false,
    isCamMuted: true,
    onToggleMic: jest.fn(),
    onToggleCam: jest.fn(),
    layoutMode: "desktop",
  };
}

afterEach(() => cleanup());

describe("WbAVCluster — auto-grow mode", () => {
  test("cluster starts in auto-grow mode (data-auto-grow=true) with only a local tile", () => {
    render(<WbAVCluster {...makeBaseProps([])} />);
    const cluster = screen.getByTestId("wb-av-cluster");
    expect(cluster.getAttribute("data-auto-grow")).toBe("true");
  });

  test("cluster STAYS in auto-grow mode when a remote participant with videoStream arrives (no hack needed)", async () => {
    // The principal fix: the video body has a concrete intrinsic box from
    // aspect-ratio: 4/3 at mount, so the cluster does NOT need to mutate its
    // own state to replicate a manual-resize reflow.
    const props = makeBaseProps([]);
    const { rerender } = render(<WbAVCluster {...props} />);

    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBe("true");

    const remote = makeRemoteParticipant("peer-1", true);
    await act(async () => {
      rerender(<WbAVCluster {...makeBaseProps([remote])} />);
    });

    // data-auto-grow must still be "true" — no state mutation on video arrival.
    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBe("true");
  });

  test("cluster STAYS in auto-grow mode when participant transitions null → videoStream", async () => {
    const noVideoParticipant = makeRemoteParticipant("peer-2", false);
    const { rerender } = render(
      <WbAVCluster {...makeBaseProps([noVideoParticipant])} />
    );
    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBe("true");

    const withVideoParticipant: AvParticipant = {
      ...noVideoParticipant,
      videoStream: makeFakeStream(true),
    };
    await act(async () => {
      rerender(<WbAVCluster {...makeBaseProps([withVideoParticipant])} />);
    });

    // Still auto-grow — no spontaneous state mutation.
    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBe("true");
  });

  test("cluster auto-grow height is correct for 2 tiles (local + 1 remote)", async () => {
    // Constants from WbAVCluster:
    //   CLUSTER_CHROME_HEIGHT = 14 + 8 + 45 = 67
    //   PER_TILE_BODY_HEIGHT  = 280 - 67     = 213
    //   TILE_GAP              = 4
    //   autoHeight(2)         = 67 + 2*213 + 1*4 = 497
    const EXPECTED_2_TILE_HEIGHT = 497;

    const { rerender } = render(<WbAVCluster {...makeBaseProps([])} />);

    await act(async () => {
      rerender(
        <WbAVCluster {...makeBaseProps([makeRemoteParticipant("peer-h", true)])} />
      );
    });

    const cluster = screen.getByTestId("wb-av-cluster") as HTMLElement;
    const heightPx = parseInt(cluster.style.height, 10);
    expect(heightPx).toBe(EXPECTED_2_TILE_HEIGHT);
    // Still auto-grow.
    expect(cluster.getAttribute("data-auto-grow")).toBe("true");
  });

  test("cluster auto-grow height is correct for 1 tile (local only — DEFAULT_SIZE.height)", () => {
    // autoHeight(1) = 67 + 1*213 = 280 = DEFAULT_SIZE.height
    const EXPECTED_1_TILE_HEIGHT = 280;
    render(<WbAVCluster {...makeBaseProps([])} />);
    const cluster = screen.getByTestId("wb-av-cluster") as HTMLElement;
    const heightPx = parseInt(cluster.style.height, 10);
    expect(heightPx).toBe(EXPECTED_1_TILE_HEIGHT);
  });
});

describe("WbAVCluster — manual resize (userResized path)", () => {
  // jsdom stubs for pointer-capture APIs missing from jsdom's HTMLElement.
  beforeAll(() => {
    HTMLElement.prototype.setPointerCapture = jest.fn();
    HTMLElement.prototype.releasePointerCapture = jest.fn();
  });
  afterAll(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  });

  test("after manual resize userResized flips the cluster out of auto-grow mode", () => {
    render(<WbAVCluster {...makeBaseProps([])} />);
    const cluster = screen.getByTestId("wb-av-cluster");
    const resizeHandle = cluster.querySelector(".mynk-wb-av-cluster__resize-handle");
    expect(resizeHandle).toBeTruthy();

    // Simulate a resize drag: pointerdown + pointermove (non-zero delta).
    act(() => {
      resizeHandle!.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, clientX: 100, clientY: 100,
      }));
    });
    act(() => {
      resizeHandle!.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true, clientX: 110, clientY: 115,
      }));
    });

    // After a drag with non-zero delta, userResized should be true →
    // data-auto-grow is removed from the cluster.
    expect(screen.getByTestId("wb-av-cluster").getAttribute("data-auto-grow")).toBeNull();
  });
});
