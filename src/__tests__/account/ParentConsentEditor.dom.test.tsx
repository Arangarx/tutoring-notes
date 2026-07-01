/**
 * @jest-environment jsdom
 *
 * Dormant consent fields hidden from parent consent UI:
 * - allowNoteSending — WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30)
 * - allowWhiteboardRecording — WB-CONSENT-UNCONDITIONAL (Andrew 2026-06-30)
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

describe("ParentConsentEditor — dormant consent toggles", () => {
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

  test("does not render whiteboard recording permission toggle", () => {
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
      screen.queryByLabelText(/allow whiteboard replay/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/saves every stroke so you and your child/i)
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

    expect(screen.getByLabelText(/allow live tutoring sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
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
      screen.getByText(
        /everything drawn on the shared whiteboard during the session is saved for later review/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /live conversation is always available when live sessions are allowed/i
      )
    ).toBeInTheDocument();
  });
});
