/**
 * @jest-environment node
 *
 * Compile-time guard (covered by `npx tsc --noEmit`, not by the jest run): a tutor
 * entry state can never be handed to a family component. The family entry state carries
 * a type-only brand (`familyAudienceBrand` in `session-entry.ts`); a raw
 * `SessionEntryState` has org-internal reason codes a family must never receive, so
 * assigning one must be a type error.
 *
 * If the brand is removed, the two `@ts-expect-error` lines below become unused and
 * `tsc` fails with TS2578. The positive controls differ from the failing calls only in
 * the tutor-vs-family entry, so the error is the brand and nothing else.
 */

import { JoinScheduledSessionButton } from "@/components/scheduling/JoinScheduledSessionButton";
import { UpcomingSessionsCard } from "@/components/scheduling/UpcomingSessionsCard";
import type { FamilySessionEntryState } from "@/lib/scheduling/session-entry";
import type {
  FamilyUpcomingScheduledSessionRow,
  UpcomingScheduledSessionRow,
} from "@/lib/scheduling/upcoming-sessions";

/** Never called: it exists to be type-checked. */
function typeCheckOnly(
  tutorRow: UpcomingScheduledSessionRow,
  familyRow: FamilyUpcomingScheduledSessionRow,
  familyEntry: FamilySessionEntryState
) {
  const joinProps = {
    scheduledSessionId: "s1",
    startAtIso: "2026-10-30T16:00:00.000Z",
    endAtIso: "2026-10-30T17:00:00.000Z",
    learnerName: "Maya",
    notYetCopy: "x",
    unavailableCopy: "y",
  };

  // Positive controls: the family shapes are accepted.
  UpcomingSessionsCard({ mode: "family", sessions: [familyRow] });
  JoinScheduledSessionButton({ ...joinProps, entry: familyEntry });

  // A tutor row (raw entry state) is not a family row.
  // @ts-expect-error tutor `SessionEntryState` is not a `FamilySessionEntryState`
  UpcomingSessionsCard({ mode: "family", sessions: [tutorRow] });

  // A tutor entry state is not a family entry state.
  // @ts-expect-error tutor `SessionEntryState` is not a `FamilySessionEntryState`
  JoinScheduledSessionButton({ ...joinProps, entry: tutorRow.entry });

  // The brand alone: an entry that is shaped like a family state (only family-safe
  // reasons, or none) but never went through `familySafeEntryState` is refused. The two
  // cases above are also stopped by the narrower family reason union; these two are
  // stopped by the brand and nothing else, so they go red if the brand is removed.
  const unbranded = { online: { allowed: true }, inPerson: { allowed: true } } as const;
  // @ts-expect-error an unbranded entry (not from `familySafeEntryState`) is not a family row
  UpcomingSessionsCard({ mode: "family", sessions: [{ ...familyRow, entry: unbranded }] });
  // @ts-expect-error an unbranded entry (not from `familySafeEntryState`) is not a family entry
  JoinScheduledSessionButton({ ...joinProps, entry: unbranded });
}

describe("family entry brand (compile-time)", () => {
  it("is enforced by tsc; the guard function is type-checked and never run", () => {
    expect(typeof typeCheckOnly).toBe("function");
  });
});
