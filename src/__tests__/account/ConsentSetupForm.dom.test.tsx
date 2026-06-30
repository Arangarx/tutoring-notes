/**
 * @jest-environment jsdom
 *
 * allowNoteSending is dormant — hidden from claim-setup consent UI pending
 * WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME (Andrew 2026-06-30).
 */

import { render, screen } from "@testing-library/react";

import { ConsentSetupForm } from "@/app/claim/[token]/setup/ConsentSetupForm";

describe("ConsentSetupForm — dormant allowNoteSending toggle", () => {
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

  test("still renders active consent toggles", () => {
    render(
      <ConsentSetupForm
        rawToken="token-abc"
        studentName="Alex"
        enforcementEnabled={true}
      />
    );

    expect(screen.getByLabelText(/allow live sessions/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/allow audio recording/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/allow whiteboard recording/i)
    ).toBeInTheDocument();
  });
});
