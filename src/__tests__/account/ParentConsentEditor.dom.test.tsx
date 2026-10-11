/**
 * @jest-environment jsdom
 *
 * Dormant consent fields hidden from parent consent UI:
 * - allowNoteSending — WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30)
 * - allowWhiteboardRecording — WB-CONSENT-UNCONDITIONAL (Andrew 2026-06-30)
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("ParentConsentEditor — consent switches", () => {
  beforeEach(() => {
    saveParentConsentActionMock.mockReset();
  });

  test("renders the four consent switches, including notes and whiteboard", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(screen.getByLabelText(/allow session notes/i)).toBeInTheDocument();
    expect(screen.getByText(/mynk can draft session notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow whiteboard recording/i)).toBeInTheDocument();
    expect(screen.getByText(/shared whiteboard can be saved and replayed/i)).toBeInTheDocument();
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
      organizations: [],
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
      organizations: [],
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

describe("ParentConsentEditor — organization rows", () => {
  test("lists the organization and Withdraw turns all four switches off", async () => {
    saveParentConsentActionMock.mockReset();
    saveParentConsentActionMock.mockResolvedValue({ ok: true, tutorVersions: {} });
    render(
      <ParentConsentEditor
        {...defaultProps}
        tutors={[]}
        organizations={[
          {
            organizationId: "org-1",
            organizationName: "Harbor Learning",
            version: 1,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
          },
        ]}
      />
    );

    expect(screen.getByText("Harbor Learning")).toBeInTheDocument();
    expect(screen.getByText(/what each organization may do/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /withdraw consent/i }));
    fireEvent.click(screen.getByTestId("parent-consent-save-btn"));

    await waitFor(() => expect(saveParentConsentActionMock).toHaveBeenCalledTimes(1));
    expect(saveParentConsentActionMock).toHaveBeenCalledWith("learner-1", {
      tutors: [],
      organizations: [
        {
          organizationId: "org-1",
          allowLiveSession: false,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultProps.restrictions,
    });
  });

  test("hides the live-session sentence while live sessions are on", () => {
    render(<ParentConsentEditor {...defaultProps} />);
    expect(
      screen.queryByText(
        /without live sessions, mynk is effectively just a scheduling calendar/i
      )
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but most families keep it on/i)
    ).toBeInTheDocument();
  });

  test("shows the live-session sentence when live sessions are off", () => {
    render(
      <ParentConsentEditor
        {...defaultProps}
        tutors={[{ ...sampleTutor, allowLiveSession: false }]}
      />
    );
    expect(
      screen.getByText(
        /without live sessions, mynk is effectively just a scheduling calendar/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but most families keep it on/i)
    ).toBeInTheDocument();
  });
});

describe("ParentConsentEditor — SectionCard realm=account", () => {
  test("always-off limits block uses shared SectionCard with account realm", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    const heading = screen.getByText("Always-off limits for Alex");
    const card = heading.closest('[data-realm="account"]');
    expect(card).not.toBeNull();
    expect(card).toHaveAttribute("data-slot", "card");
  });
});
