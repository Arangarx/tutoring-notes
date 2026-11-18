/**
 * @jest-environment jsdom
 *
 * Dormant consent fields hidden from claim-setup UI:
 * - allowNoteSending — WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30)
 * - allowWhiteboardRecording — WB-CONSENT-UNCONDITIONAL (Andrew 2026-06-30)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

import { ConsentSetupForm } from "@/app/claim/[token]/setup/ConsentSetupForm";

const defaultProps = {
  rawToken: "token-abc",
  studentName: "Alex",
  enforcementEnabled: true,
  hasPendingSessionInvite: false,
} as const;

describe("ConsentSetupForm — consent switches", () => {
  test("renders the four consent switches, including notes and whiteboard", () => {
    render(<ConsentSetupForm {...defaultProps} />);

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
    render(<ConsentSetupForm {...defaultProps} />);

    expect(screen.getByLabelText(/allow online sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
    render(<ConsentSetupForm {...defaultProps} />);

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

  test("save payload still includes allowWhiteboardRecording default", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, version: 1 }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(<ConsentSetupForm {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    expect(body).toMatchObject({
      action: "consent",
      allowLiveSession: false,
      allowAudioRecording: false,
      allowWhiteboardRecording: false,
      allowNoteSending: false,
    });
  });
});

describe("ConsentSetupForm — CC-2 mandatory consent choice (T8, decline dialog)", () => {
  test("T8: hides save-later footnote when enforcementEnabled", () => {
    render(<ConsentSetupForm {...defaultProps} enforcementEnabled={true} />);

    expect(
      screen.queryByText(/save these preferences later from your account dashboard/i)
    ).not.toBeInTheDocument();
  });

  test("shows save-later footnote when enforcement is off", () => {
    render(<ConsentSetupForm {...defaultProps} enforcementEnabled={false} />);

    expect(
      screen.getByText(/save these preferences later from your account dashboard/i)
    ).toBeInTheDocument();
  });

  test("decline flow: variant (b) dialog then consent_decline → saved state", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, version: 1 }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      <ConsentSetupForm {...defaultProps} hasPendingSessionInvite={false} />
    );

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(
        "If you continue, every switch is saved off. Online sessions cannot start. You can still meet in person. In person, no audio is saved, and the board is not kept after the session. You can change this later from your account."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Your child has already been invited/i)
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /continue without enabling/i })
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ action: "consent_decline" });

    await waitFor(() =>
      expect(screen.getByText(/✓ preferences saved/i)).toBeInTheDocument()
    );
  });

  test("self-learner decline dialog does not address a parent", async () => {
    const user = userEvent.setup();
    render(
      <ConsentSetupForm
        {...defaultProps}
        showAgreement
        enforcementEnabled={false}
        hasPendingSessionInvite={false}
      />
    );

    expect(
      screen.getByText(/save these preferences later from your account dashboard/i)
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "If you continue, every switch is saved off. You cannot join an online session until you turn online sessions on. In person can still happen. Open Manage, then Privacy."
    );
    expect(dialog.textContent ?? "").not.toMatch(/record/i);
    expect(dialog).not.toHaveTextContent(/your child/i);
  });

  test("self-learner pending-invite decline dialog does not address a parent", async () => {
    const user = userEvent.setup();
    render(
      <ConsentSetupForm
        {...defaultProps}
        showAgreement
        enforcementEnabled={false}
        hasPendingSessionInvite
      />
    );

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "If you continue, every switch is saved off. You cannot join an online session until you turn online sessions on. In person can still happen. Open Manage, then Privacy. You have already been invited. You cannot join that online session until online sessions are on."
    );
    expect(dialog.textContent ?? "").not.toMatch(/record/i);
    expect(dialog).not.toHaveTextContent(/your child/i);
  });

  test("decline flow: variant (a) when hasPendingSessionInvite", async () => {
    const user = userEvent.setup();

    render(
      <ConsentSetupForm {...defaultProps} hasPendingSessionInvite={true} />
    );

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "If you continue, every switch is saved off. Online sessions cannot start. You can still meet in person. In person, no audio is saved, and the board is not kept after the session. You can change this later from your account. Your child has already been invited. They cannot join an online session until online sessions are on."
    );
    expect(dialog).not.toHaveTextContent(/cannot participate in live tutoring sessions/i);
  });

  test("409 consent_already_saved on decline is treated as saved", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "consent_already_saved" }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(<ConsentSetupForm {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );
    await user.click(
      screen.getByRole("button", { name: /continue without enabling/i })
    );

    await waitFor(() =>
      expect(screen.getByText(/✓ preferences saved/i)).toBeInTheDocument()
    );
  });
});
