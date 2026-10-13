/**
 * @jest-environment jsdom
 *
 * Self-learner settings: shared switches, and the agreement until it is checked.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/app/account/children/[id]/consent/actions", () => ({
  saveSelfLearnerConsentAction: jest.fn(),
}));

import { SelfLearnerConsentSettings } from "@/components/consent/SelfLearnerConsentSettings";
import { saveSelfLearnerConsentAction } from "@/app/account/children/[id]/consent/actions";
import { SELF_LEARNER_AGREEMENT } from "@/lib/consent-toggle-copy";

/** Reader-facing agreement. Closing clause names Manage, then Privacy. */
const SELF_LEARNER_AGREEMENT_COPY =
  "I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk drafts session notes from them. I can turn any of this off later. Open Manage, then Privacy.";

const saveMock = saveSelfLearnerConsentAction as jest.MockedFunction<
  typeof saveSelfLearnerConsentAction
>;

const tutors = [
  {
    adminUserId: "tutor-1",
    tutorLabel: "Ms. Smith",
    allowLiveSession: true,
    allowAudioRecording: false,
    allowWhiteboardRecording: true,
    allowNoteSending: false,
  },
];

describe("SelfLearnerConsentSettings", () => {
  beforeEach(() => {
    saveMock.mockReset();
  });

  test("renders the tutor and saves the four flags", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({ ok: true });
    render(
      <SelfLearnerConsentSettings
        learnerProfileId="learner-1"
        tutors={tutors}
        organizations={[]}
      />
    );

    expect(screen.getByText("Ms. Smith")).toBeInTheDocument();
    expect(screen.getByLabelText(/allow live tutoring sessions/i)).toBeInTheDocument();
    expect(screen.queryByTestId("self-learner-agreement")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/without live sessions, mynk is effectively just a scheduling calendar/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but most families keep it on/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /save preferences/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock).toHaveBeenCalledWith("learner-1", {
      tutors: [
        {
          adminUserId: "tutor-1",
          allowLiveSession: true,
          allowAudioRecording: false,
          allowWhiteboardRecording: true,
          allowNoteSending: false,
        },
      ],
      organizations: [],
      restrictions: {
        restrictAudioRecording: false,
        restrictWhiteboardRecording: false,
        restrictNoteSending: false,
      },
    });
  });

  test("sends the organization flags on Save", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({ ok: true });
    const organization = {
      organizationId: "org-north",
      organizationName: "North Tutoring",
      allowLiveSession: false,
      allowAudioRecording: true,
      allowWhiteboardRecording: false,
      allowNoteSending: true,
    };
    render(
      <SelfLearnerConsentSettings
        learnerProfileId="learner-1"
        tutors={[]}
        organizations={[organization]}
      />
    );

    expect(screen.getByText("North Tutoring")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save preferences/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock).toHaveBeenCalledWith("learner-1", {
      tutors: [],
      organizations: [
        {
          organizationId: "org-north",
          allowLiveSession: false,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: true,
        },
      ],
      restrictions: {
        restrictAudioRecording: false,
        restrictWhiteboardRecording: false,
        restrictNoteSending: false,
      },
    });
  });

  test("blocks save until the agreement is checked", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue({ ok: true });
    render(
      <SelfLearnerConsentSettings
        learnerProfileId="learner-1"
        tutors={tutors}
        organizations={[]}
        showAgreement
      />
    );

    await user.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(screen.getByText(/check the agreement before saving/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("self-learner-agreement"));
    await user.click(screen.getByRole("button", { name: /save preferences/i }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
  });

  test("agreement names Manage, then Privacy as where consent can be changed", () => {
    expect(SELF_LEARNER_AGREEMENT).toBe(SELF_LEARNER_AGREEMENT_COPY);

    render(
      <SelfLearnerConsentSettings
        learnerProfileId="learner-1"
        tutors={tutors}
        organizations={[]}
        showAgreement
      />
    );

    const shown = screen.getByText(/I agree that my tutoring sessions may be recorded/).textContent;
    expect(shown).toBe(SELF_LEARNER_AGREEMENT_COPY);
    // The agreement does not tell the reader to open Settings.
    expect(shown ?? "").not.toMatch(/\bSettings\b/);
  });

  test("shows the live-session sentence when live sessions are off", () => {
    render(
      <SelfLearnerConsentSettings
        learnerProfileId="learner-1"
        tutors={[{ ...tutors[0], allowLiveSession: false }]}
        organizations={[]}
      />
    );

    expect(
      screen.getByText(/without live sessions, mynk is effectively just a scheduling calendar/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you can turn this off, but most families keep it on/i)
    ).toBeInTheDocument();
  });
});
