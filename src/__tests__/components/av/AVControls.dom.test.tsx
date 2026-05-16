/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";

import {
  AVControls,
  type AVModerationDescriptor,
} from "@/components/av/AVControls";
import type { AvParticipant } from "@/hooks/useLiveAV";

afterEach(() => {
  cleanup();
});

function makeParticipant(
  id: string,
  overrides: Partial<AvParticipant> = {}
): AvParticipant {
  return {
    peerId: id,
    role: "student",
    label: undefined,
    audioStream: null,
    videoStream: null,
    peerConnectionState: "connected",
    iceConnectionState: "connected",
    ...overrides,
  };
}

describe("AVControls — local mute toggles (always rendered)", () => {
  test("renders Mute mic + Turn camera off when both are unmuted", () => {
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
      />
    );
    expect(
      screen.getByTestId("av-controls-toggle-mic").textContent
    ).toBe("Mute mic");
    expect(
      screen.getByTestId("av-controls-toggle-cam").textContent
    ).toBe("Turn camera off");
  });

  test("button copy flips when isMicMuted / isCamMuted are true", () => {
    render(
      <AVControls
        isMicMuted={true}
        isCamMuted={true}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
      />
    );
    expect(screen.getByTestId("av-controls-toggle-mic").textContent).toBe(
      "Unmute mic"
    );
    expect(screen.getByTestId("av-controls-toggle-cam").textContent).toBe(
      "Turn camera on"
    );
  });

  test("toggleMic is invoked on click; toggleCam stays untouched", () => {
    const toggleMic = jest.fn();
    const toggleCam = jest.fn();
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={toggleMic}
        toggleCam={toggleCam}
      />
    );
    fireEvent.click(screen.getByTestId("av-controls-toggle-mic"));
    expect(toggleMic).toHaveBeenCalledTimes(1);
    expect(toggleCam).not.toHaveBeenCalled();
  });

  test("toggleCam is invoked on click", () => {
    const toggleCam = jest.fn();
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={toggleCam}
      />
    );
    fireEvent.click(screen.getByTestId("av-controls-toggle-cam"));
    expect(toggleCam).toHaveBeenCalledTimes(1);
  });

  test("disabled=true makes both buttons inert", () => {
    const toggleMic = jest.fn();
    const toggleCam = jest.fn();
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={toggleMic}
        toggleCam={toggleCam}
        disabled
      />
    );
    const micBtn = screen.getByTestId(
      "av-controls-toggle-mic"
    ) as HTMLButtonElement;
    const camBtn = screen.getByTestId(
      "av-controls-toggle-cam"
    ) as HTMLButtonElement;
    expect(micBtn.disabled).toBe(true);
    expect(camBtn.disabled).toBe(true);
    fireEvent.click(micBtn);
    fireEvent.click(camBtn);
    expect(toggleMic).not.toHaveBeenCalled();
    expect(toggleCam).not.toHaveBeenCalled();
  });

  test("aria-pressed reflects mute state for accessibility", () => {
    render(
      <AVControls
        isMicMuted={true}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
      />
    );
    expect(
      screen.getByTestId("av-controls-toggle-mic").getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByTestId("av-controls-toggle-cam").getAttribute("aria-pressed")
    ).toBe("false");
  });
});

describe("AVControls — tutor moderation surface (optional)", () => {
  function makeModeration(
    overrides: Partial<AVModerationDescriptor> = {}
  ): AVModerationDescriptor {
    return {
      participants: [
        makeParticipant("peer-a", { label: "Alex" }),
        makeParticipant("peer-b", { label: "Beth" }),
      ],
      mutedPeerIds: new Set<string>(),
      onTogglePeer: jest.fn(),
      ...overrides,
    };
  }

  test("moderation section is OMITTED when prop is undefined (student page)", () => {
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
      />
    );
    expect(screen.queryByTestId("av-controls-moderation")).toBeNull();
  });

  test("moderation section is OMITTED when participants list is empty", () => {
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration({ participants: [] })}
      />
    );
    expect(screen.queryByTestId("av-controls-moderation")).toBeNull();
  });

  test("renders one moderation row per participant with stable testids", () => {
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration()}
      />
    );
    expect(screen.getByTestId("av-controls-moderation")).toBeTruthy();
    expect(screen.getByTestId("av-controls-mod-row-peer-a")).toBeTruthy();
    expect(screen.getByTestId("av-controls-mod-row-peer-b")).toBeTruthy();
    expect(
      (screen.getByTestId(
        "av-controls-mod-checkbox-peer-a"
      ) as HTMLInputElement).checked
    ).toBe(false);
  });

  test("checkbox reflects mutedPeerIds membership", () => {
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration({
          mutedPeerIds: new Set(["peer-a"]),
        })}
      />
    );
    expect(
      (screen.getByTestId(
        "av-controls-mod-checkbox-peer-a"
      ) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (screen.getByTestId(
        "av-controls-mod-checkbox-peer-b"
      ) as HTMLInputElement).checked
    ).toBe(false);
  });

  test("checking a row calls onTogglePeer(peerId, true)", () => {
    const onTogglePeer = jest.fn();
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration({ onTogglePeer })}
      />
    );
    fireEvent.click(screen.getByTestId("av-controls-mod-checkbox-peer-a"));
    expect(onTogglePeer).toHaveBeenCalledWith("peer-a", true);
  });

  test("unchecking a currently-muted row calls onTogglePeer(peerId, false)", () => {
    const onTogglePeer = jest.fn();
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration({
          mutedPeerIds: new Set(["peer-a"]),
          onTogglePeer,
        })}
      />
    );
    fireEvent.click(screen.getByTestId("av-controls-mod-checkbox-peer-a"));
    expect(onTogglePeer).toHaveBeenCalledWith("peer-a", false);
  });

  test("disabled=true disables moderation checkboxes too", () => {
    // Real browsers swallow click events on a disabled <input>;
    // jsdom + React's synthetic event layer still routes the change
    // through, so we just assert the DOM disabled attribute (the
    // user-facing behaviour) rather than firing a click that would
    // never happen in a real browser.
    render(
      <AVControls
        isMicMuted={false}
        isCamMuted={false}
        toggleMic={jest.fn()}
        toggleCam={jest.fn()}
        moderation={makeModeration({ onTogglePeer: jest.fn() })}
        disabled
      />
    );
    const box = screen.getByTestId(
      "av-controls-mod-checkbox-peer-a"
    ) as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });
});
