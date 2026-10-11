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
