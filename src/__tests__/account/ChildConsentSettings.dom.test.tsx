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
    expect(screen.getByLabelText(/allow online sessions/i)).toBeInTheDocument();
  });
});
