/**
 * @jest-environment jsdom
 *
 * Dormant consent fields hidden from parent consent UI:
 * - allowNoteSending — WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30)
 * - allowWhiteboardRecording — WB-CONSENT-UNCONDITIONAL (Andrew 2026-06-30)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ParentConsentEditor } from "@/app/account/children/[id]/consent/ParentConsentEditor";

jest.mock("@/app/account/children/[id]/consent/actions", () => ({
  saveParentConsentAction: jest.fn(),
}));

import { saveParentConsentAction } from "@/app/account/children/[id]/consent/actions";

const saveParentConsentActionMock = saveParentConsentAction as jest.MockedFunction<
  typeof saveParentConsentAction
>;

const sampleTutor = {
  adminUserId: "tutor-1",
  tutorLabel: "Ms. Smith",
  version: 1,
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

const defaultProps = {
  learnerProfileId: "learner-1",
  learnerName: "Alex",
  tutors: [sampleTutor],
  restrictions: {
    restrictAudioRecording: false,
    restrictWhiteboardRecording: false,
    restrictNoteSending: false,
  },
};

describe("ParentConsentEditor — dormant consent toggles", () => {
  beforeEach(() => {
    saveParentConsentActionMock.mockReset();
  });

  test("does not render session notes email permission toggle", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(
      screen.queryByLabelText(/allow session notes email/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/always block session notes email/i)
    ).not.toBeInTheDocument();
  });

  test("does not render whiteboard recording permission toggle", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(
      screen.queryByLabelText(/allow whiteboard replay/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/saves every stroke so you and your child/i)
    ).not.toBeInTheDocument();
  });

  test("still renders active consent toggles", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(screen.getByLabelText(/allow live tutoring sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
    render(<ParentConsentEditor {...defaultProps} />);

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

  test("calls saveParentConsentAction when Save privacy preferences is clicked", async () => {
    const user = userEvent.setup();
    saveParentConsentActionMock.mockResolvedValue({
      ok: true,
      tutorVersions: { "tutor-1": 2 },
    });

    render(<ParentConsentEditor {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: /save privacy preferences/i })
    );

    await waitFor(() => expect(saveParentConsentActionMock).toHaveBeenCalledTimes(1));

    expect(saveParentConsentActionMock).toHaveBeenCalledWith("learner-1", {
      tutors: [
        {
          adminUserId: "tutor-1",
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        },
      ],
      restrictions: defaultProps.restrictions,
    });

    expect(screen.getByText(/preferences saved/i)).toBeInTheDocument();
    expect(screen.getByText(/v2/i)).toBeInTheDocument();
  });

  test("calls saveParentConsentAction with changed toggle values in payload", async () => {
    const user = userEvent.setup();
    saveParentConsentActionMock.mockResolvedValue({
      ok: true,
      tutorVersions: { "tutor-1": 2 },
    });

    render(<ParentConsentEditor {...defaultProps} />);

    await user.click(screen.getByLabelText(/allow live tutoring sessions/i));
    await user.click(
      screen.getByRole("button", { name: /save privacy preferences/i })
    );

    await waitFor(() => expect(saveParentConsentActionMock).toHaveBeenCalledTimes(1));

    expect(saveParentConsentActionMock).toHaveBeenCalledWith("learner-1", {
      tutors: [
        {
          adminUserId: "tutor-1",
          allowLiveSession: false,
          allowAudioRecording: true,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        },
      ],
      restrictions: defaultProps.restrictions,
    });
  });

  test("renders error Alert when saveParentConsentAction returns ok:false", async () => {
    const user = userEvent.setup();
    saveParentConsentActionMock.mockResolvedValue({
      ok: false,
      error: "consent_already_saved",
    });

    render(<ParentConsentEditor {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: /save privacy preferences/i })
    );

    await waitFor(() => {
      expect(screen.getByText("Could not save")).toBeInTheDocument();
    });
    expect(screen.getByText(/preferences were already saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/preferences saved/i)).not.toBeInTheDocument();
  });
});
