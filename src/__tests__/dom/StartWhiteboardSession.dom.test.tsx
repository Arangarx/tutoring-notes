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
import type { SessionEntryState } from "@/lib/scheduling/session-entry";

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

  // A refused Start tells the tutor the same sentence the disabled control shows for that
  // learner's situation. The server RESOLVES the refusal as `{ ok: false, reason }` (a thrown
  // error is redacted by Next in a production build), and the client words it from the
  // reason. Expected strings are written by hand from the W4 copy spec.
  const PARENT_HINT =
    "Go to the Parent account section on this student's page to send a claim invite or check connection status.";

  it.each([
    {
      situation: "self-learner",
      reason: "consent_missing_self",
      expected: "Maya hasn't finished privacy preferences yet.",
      parentHint: false,
    },
    {
      situation: "parent-held learner",
      reason: "consent_missing_parent",
      expected: "The parent hasn't finished privacy preferences yet.",
      parentHint: true,
    },
    {
      situation: "unclaimed learner",
      reason: "unclaimed",
      expected: "Maya hasn't connected their Mynk account yet.",
      parentHint: true,
    },
    {
      situation: "learner with online sessions off",
      reason: "live_off",
      expected: "Live sessions are off in Maya's privacy settings.",
      parentHint: false,
    },
  ])(
    "after a refused Start, a $situation sees their own line (parent hint: $parentHint)",
    async ({ reason, expected, parentHint }) => {
      createWhiteboardSessionMock.mockResolvedValueOnce({ ok: false, reason });

      const user = userEvent.setup();
      render(<StartWhiteboardSession {...baseProps} />);
      await user.click(screen.getByTestId("start-whiteboard-session-btn"));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(parentHint ? `${expected}\n\n${PARENT_HINT}` : expected);
      expect(alert.textContent).not.toMatch(/Error ID/i);
      // The button is usable again: a refusal is not a stuck state.
      expect(screen.getByTestId("start-whiteboard-session-btn")).toBeEnabled();
    }
  );

  it("a successful create that resolves undefined does not show an error", async () => {
    // Next's server-action reducer can resolve a redirect() with no flight data
    // (`undefined`) instead of rejecting NEXT_REDIRECT. Reading `.reason` on that
    // throws, and the catch paints an error during navigation. Hand-written: no
    // alert, and none of the catch's copy.
    createWhiteboardSessionMock.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);
    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("start-whiteboard-session-btn")).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not start the session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unexpected error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reading ['"]reason['"]/i)).not.toBeInTheDocument();
  });

  it("an unexpected production-redacted server error still shows the Error ID message", async () => {
    // Shape Next gives the client for a thrown server-action error in a production build:
    // a generic message and a digest; name and custom fields are not serialized.
    const redacted = Object.assign(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the specific error."
      ),
      { digest: "1234567890" }
    );
    createWhiteboardSessionMock.mockRejectedValueOnce(redacted);

    const user = userEvent.setup();
    render(<StartWhiteboardSession {...baseProps} />);
    await user.click(screen.getByTestId("start-whiteboard-session-btn"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Could not start the session \u2014 the server hit an unexpected error.\n\nError ID: 1234567890\n(copy this and send it back so we can find the failure in the server logs)."
    );
  });
});
