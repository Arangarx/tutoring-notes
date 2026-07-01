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

describe("ConsentSetupForm — dormant consent toggles", () => {
  test("does not render notes email permission toggle", () => {
    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
      />
    );

    expect(screen.queryByLabelText(/allow notes email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session summary notes can be emailed/i)).not.toBeInTheDocument();
  });

  test("does not render whiteboard recording permission toggle", () => {
    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
      />
    );

    expect(
      screen.queryByLabelText(/allow whiteboard recording/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/whiteboard strokes are saved/i)
    ).not.toBeInTheDocument();
  });

  test("still renders active consent toggles", () => {
    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
      />
    );

    expect(screen.getByLabelText(/allow live tutoring sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow session audio recording/i)).toBeInTheDocument();
  });

  test("renders approved live-session and audio-recording descriptions", () => {
    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
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

  test("save payload still includes allowWhiteboardRecording default", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, version: 1 }),
    });
    global.fetch = fetchMock as typeof fetch;

    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
      />
    );

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
