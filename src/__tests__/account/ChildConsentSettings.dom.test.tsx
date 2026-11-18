/**
 * @jest-environment jsdom
 *
 * Child online-session line (approved item 29). The board sentence lives on the whiteboard switch.
 */

import { render, screen } from "@testing-library/react";

jest.mock("@/app/join/child-home-actions", () => ({
  saveChildConsentAction: jest.fn(),
}));

import { ChildConsentSettings } from "@/components/consent/ChildConsentSettings";

const flags = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

describe("ChildConsentSettings", () => {
  test("the online switch does not say the board is saved", () => {
    render(
      <ChildConsentSettings
        ceiling={flags}
        effective={flags}
        restoredByParent={{
          allowLiveSession: false,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        }}
      />
    );

    expect(
      screen.getByText(
        "You can join online sessions with video and audio. In person is not affected by this switch."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/everything drawn/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Session audio is recorded. If this is off, online sessions leave your voice out, and your tutor's microphone can still be saved. In person, no audio is saved. The whiteboard follows its own setting."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/saved for notes and review/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The board is saved and can be replayed. If this is off, the board still works during the session. After the session ends, the saved board is deleted from our servers."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/allow online sessions/i)).toBeInTheDocument();
  });
});
