/**
 * @jest-environment jsdom
 *
 * Dormant consent fields hidden from claim-setup UI:
 * - allowNoteSending — WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30)
 * - allowWhiteboardRecording — WB-CONSENT-UNCONDITIONAL (Andrew 2026-06-30)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConsentSetupForm } from "@/app/claim/[token]/setup/ConsentSetupForm";

const defaultProps = {
  rawToken: "token-abc",
  studentName: "Alex",
  enforcementEnabled: true,
  hasPendingSessionInvite: false,
} as const;

describe("ConsentSetupForm — dormant consent toggles", () => {
  test("does not render notes email permission toggle", () => {
    render(<ConsentSetupForm {...defaultProps} />);

    expect(screen.queryByLabelText(/allow notes email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session summary notes can be emailed/i)).not.toBeInTheDocument();
  });

  test("does not render whiteboard recording permission toggle", () => {
    render(<ConsentSetupForm {...defaultProps} />);

    expect(
      screen.queryByLabelText(/allow whiteboard recording/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/whiteboard strokes are saved/i)
    ).not.toBeInTheDocument();
  });

  test("still renders active consent toggles", () => {
    render(<ConsentSetupForm {...defaultProps} />);

    expect(screen.getByLabelText(/allow live tutoring sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
    render(<ConsentSetupForm {...defaultProps} />);

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
      screen.getByText(/cannot participate in live tutoring sessions with this tutor/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/session they've already been invited to/i)
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

  test("decline flow: variant (a) when hasPendingSessionInvite", async () => {
    const user = userEvent.setup();

    render(
      <ConsentSetupForm {...defaultProps} hasPendingSessionInvite={true} />
    );

    await user.click(
      screen.getByRole("button", { name: /no consent now, i'll review later/i })
    );

    expect(
      screen.getByText(/session they've already been invited to/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/cannot participate in live tutoring sessions with this tutor/i)
    ).not.toBeInTheDocument();
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
