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
    expect(
      screen.getByText(
        "Session notes are drafted from the audio. Transcription is for English speech. If this is off, nothing is transcribed and no notes are drafted, even if audio was saved."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/allow whiteboard recording/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "The board is saved and can be replayed. If this is off, the board still works during the session. After the session ends, the saved board is deleted from our servers."
      )
    ).toBeInTheDocument();
  });

  test("still renders active consent toggles", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(screen.getByLabelText(/allow online sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
    render(<ParentConsentEditor {...defaultProps} />);

    expect(
      screen.getByText(
        "Your child can join online sessions with video and audio. In person is not affected by this switch. You can also join an online session as your child from your parent account when they need help signing in."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/everything drawn/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Session audio is recorded. If this is off, online sessions save the tutor's voice only, and in person sessions save no audio. The live call still works when online sessions are on. This switch only controls what is saved. The whiteboard follows its own setting."
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
      restrictions: {
        ...defaultProps.restrictions,
        restrictLiveSession: false,
      },
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

    await user.click(screen.getByLabelText(/allow online sessions/i));
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
      restrictions: {
        ...defaultProps.restrictions,
        restrictLiveSession: false,
      },
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
      restrictions: {
        ...defaultProps.restrictions,
        restrictLiveSession: false,
      },
    });
  });

  test("hides the live-session sentence while live sessions are on", () => {
    render(<ParentConsentEditor {...defaultProps} />);
    expect(
      screen.queryByText(
        "With online sessions off, online sessions cannot be started or joined. In person is not affected."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but Mynk recommends keeping this on/i)
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
        "With online sessions off, online sessions cannot be started or joined. In person is not affected."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/limited to scheduling/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/without live sessions/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but Mynk recommends keeping this on/i)
    ).toBeInTheDocument();
  });

  test("a child-off online row is labeled Online sessions", () => {
    render(
      <ParentConsentEditor
        {...defaultProps}
        childSet={{
          childSetLiveSession: true,
          childSetAudioRecording: false,
          childSetWhiteboardRecording: false,
          childSetNoteSending: false,
        }}
      />
    );
    expect(screen.getByLabelText("Online sessions")).toBeInTheDocument();
    expect(
      screen.getByText("Your child turned this off. Turn it back on to allow it again.")
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Live tutoring sessions")).not.toBeInTheDocument();
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
