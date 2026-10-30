/**
 * @jest-environment jsdom
 */

/**
 * T10 — StartWhiteboardSession consent affordance + ConsentError UX.
 * Reads the one entry rule's answer (`SessionEntryState`); every disabled state shows
 * its reason. Expected strings are hand-written from the W4 / consent spec.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createWhiteboardSessionMock = jest.fn();
jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  __esModule: true,
  createWhiteboardSession: (...args: unknown[]) =>
    createWhiteboardSessionMock(...args),
}));

import { StartWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/StartWhiteboardSession";
import { CONSENT_RECORD_PARENT_SECTION_HINT } from "@/lib/consent-action-error";
import { ENTRY_BLOCK_COPY, type SessionEntryState } from "@/lib/scheduling/session-entry";

function bothBlocked(
  reason: "unclaimed" | "consent_missing_self" | "consent_missing_parent" | "erasure_pending"
): SessionEntryState {
  return {
    online: { allowed: false, reason },
    inPerson: { allowed: false, reason },
  };
}

const ALLOWED: SessionEntryState = {
  online: { allowed: true },
  inPerson: { allowed: true },
};

const baseProps = {
  studentId: "stu_1",
  learnerName: "Maya",
  entry: ALLOWED,
} as const;

beforeEach(() => {
  createWhiteboardSessionMock.mockReset();
});

describe("StartWhiteboardSession — T10 consent affordance", () => {
  it("replaces Start with claim/consent callout when no record (claimed minor)", () => {
    render(
      <StartWhiteboardSession {...baseProps} entry={bothBlocked("consent_missing_parent")} />
    );

    const callout = screen.getByTestId("start-wb-consent-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveAttribute("role", "alert");
    expect(
      screen.getByText(/Start whiteboard session unavailable/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/privacy preferences are not complete/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /parent account/i })
    ).not.toBeInTheDocument();
  });

  it("replaces Start with callout when student is unclaimed and links to Account & sharing", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        entry={bothBlocked("unclaimed")}
        claimInvitesEnabled={true}
        hasTopClaimBanner={true}
      />
    );

    expect(screen.getByTestId("start-wb-consent-callout")).toBeInTheDocument();
    expect(screen.getByText(/banner above/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Account & sharing/i })).toHaveAttribute(
      "href",
      "/admin/students/stu_1/account"
    );
  });

  it("renders normal Start when entry is allowed", () => {
    render(<StartWhiteboardSession {...baseProps} entry={ALLOWED} />);

    expect(screen.getByTestId("start-whiteboard-session-btn")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-wb-consent-callout")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-reason")
    ).not.toBeInTheDocument();
  });

  it("hides Start for a self-learner when consent is missing", () => {
    render(
      <StartWhiteboardSession {...baseProps} entry={bothBlocked("consent_missing_self")} />
    );

    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    const callout = screen.getByTestId("start-wb-consent-callout");
    expect(callout).toBeInTheDocument();
    expect(callout).toHaveTextContent(/privacy preferences are not complete/i);
    expect(callout).toHaveTextContent(/Manage → Privacy/);
    expect(callout).not.toHaveTextContent(/Ask the parent/i);
    expect(callout).not.toHaveTextContent(/parent account/i);
  });

  it("keeps Start enabled when only online sessions are off, and says so beside it", () => {
    render(
      <StartWhiteboardSession
        {...baseProps}
        entry={{
          online: { allowed: false, reason: "live_off" },
          inPerson: { allowed: true },
        }}
      />
    );

    const button = screen.getByTestId("start-whiteboard-session-btn");
    expect(button).toBeEnabled();
    const reason = screen.getByTestId("start-whiteboard-session-reason");
    expect(reason).toHaveTextContent("Live sessions are off in Maya's privacy settings.");
    expect(reason).toHaveTextContent("You can still open the room in person.");
    expect(button.getAttribute("aria-describedby")).toBe(reason.id);
    expect(screen.queryByTestId("start-wb-consent-callout")).not.toBeInTheDocument();
  });

  it("replaces Start with erasure callout when access is suspended (ER-4)", () => {
    render(
      <StartWhiteboardSession {...baseProps} entry={bothBlocked("erasure_pending")} />
    );

    expect(screen.getByTestId("start-wb-erasure-callout")).toBeInTheDocument();
    expect(
      screen.queryByTestId("start-whiteboard-session-btn")
    ).not.toBeInTheDocument();
    expect(createWhiteboardSessionMock).not.toHaveBeenCalled();
  });

  it("maps ConsentError from the action to friendly copy without Error ID", async () => {
    const consentErr = Object.assign(
      new Error(
        "Parent privacy preferences must be set before starting a session."
      ),
      { name: "ConsentError", permission: "consentRecord" }
    );
    createWhiteboardSessionMock.mockRejectedValueOnce(consentErr);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);

    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        ENTRY_BLOCK_COPY.consent_missing_parent.tutor
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      CONSENT_RECORD_PARENT_SECTION_HINT
    );
    expect(screen.getByRole("alert").textContent).not.toMatch(/Error ID/i);
  });

  it("surfaces allowLiveSession server message verbatim without digest", async () => {
    const liveDeniedMsg =
      "Live sessions are not permitted under the parent's current privacy preferences.";
    const consentErr = Object.assign(new Error(liveDeniedMsg), {
      name: "ConsentError",
      permission: "allowLiveSession",
    });
    createWhiteboardSessionMock.mockRejectedValueOnce(consentErr);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);

    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(liveDeniedMsg);
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/Error ID/i);
  });
});
