/**
 * @jest-environment jsdom
 *
 * allowNoteSending is dormant — hidden from parent consent UI pending
 * WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30).
 */

import { render, screen } from "@testing-library/react";

import { ParentConsentEditor } from "@/app/account/children/[id]/consent/ParentConsentEditor";

const sampleTutor = {
  adminUserId: "tutor-1",
  tutorLabel: "Ms. Smith",
  version: 1,
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

describe("ParentConsentEditor — dormant allowNoteSending toggle", () => {
  test("does not render session notes email permission toggle", () => {
    render(
      <ParentConsentEditor
        learnerName="Alex"
        tutors={[sampleTutor]}
        restrictions={{
          restrictAudioRecording: false,
          restrictWhiteboardRecording: false,
          restrictNoteSending: false,
        }}
      />
    );

    expect(
      screen.queryByLabelText(/allow session notes email/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/always block session notes email/i)
    ).not.toBeInTheDocument();
  });

  test("still renders active consent toggles", () => {
    render(
      <ParentConsentEditor
        learnerName="Alex"
        tutors={[sampleTutor]}
        restrictions={{
          restrictAudioRecording: false,
          restrictWhiteboardRecording: false,
          restrictNoteSending: false,
        }}
      />
    );

    expect(screen.getByLabelText(/allow live sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow audio recording/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/allow whiteboard replay/i)
    ).toBeInTheDocument();
  });
});
