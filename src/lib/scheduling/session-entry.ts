/**
 * The one entry rule: may this appointment's room be opened, and in which mode?
 *
 * PURE and client-safe: no database, no server imports. Server enforcement sites
 * (`startWhiteboardSession`, the schedule bridge) load their own inputs through
 * `session-entry-loader.ts`, call `sessionEntryState` in place, and refuse when
 * `!state[mode].allowed`. UI surfaces read the same function through the same
 * loader, so a reason on screen and a refusal on the server cannot disagree.
 * (Org UX plan W4 / consent wave plan § 2.4, decision D3.)
 *
 * Modes (Andrew 2026-10-29, decision 5): "Allow online sessions" governs ONLINE
 * only. In person is allowed unless the learner has no usable consent record,
 * is unclaimed, is under erasure, or the org / instructor admission fails.
 *
 * Copy lives in `ENTRY_BLOCK_COPY`, keyed by (reason, audience). Every reason has
 * a line for every audience, so no disabled control can render blank.
 */

import { JOIN_WINDOW_OPENS_BEFORE_MS } from "@/lib/scheduling/join-window";

/** Closed union of why entry is blocked. Add a member only with a copy line. */
export type EntryBlockReason =
  | "unclaimed"
  | "consent_missing_self"
  | "consent_missing_parent"
  | "live_off"
  | "not_yet"
  | "org_inactive"
  | "instructor_not_admitted"
  | "erasure_pending"
  | "unknown";

export type EntryDecision =
  | { allowed: true }
  | { allowed: false; reason: EntryBlockReason };

/** `online` = remote session (the learner joins from their own device). */
export type SessionEntryMode = "online" | "inPerson";

export type SessionEntryState = Record<SessionEntryMode, EntryDecision>;

/** Everything the rule needs. Plain data so the rule is a pure function. */
export type SessionEntryInputs = {
  /** Learner is in the erasure grace period or already purged. */
  erasureSuspended: boolean;
  /** Org-owned student only: the org is active, and the tutor is an active instructor of it. */
  org: { active: boolean; instructorAdmitted: boolean } | null;
  /** The student has a LearnerProfile (parent or self-learner has claimed). */
  claimed: boolean;
  /** The claimed learner is their own account holder. Picks the self / parent reason. */
  isSelfLearner: boolean;
  /**
   * Effective consent for this student's owner, or null when no ConsentRecord
   * exists. Only `allowLiveSession` decides entry; the other switches are saved-data
   * rules (consent wave), not entry rules.
   */
  consent: { allowLiveSession: boolean } | null;
};

/** Fresh object per call: a caller mutating one result must not change the next. */
function allowed(): EntryDecision {
  return { allowed: true };
}

function blocked(reason: EntryBlockReason): EntryDecision {
  return { allowed: false, reason };
}

function blockBoth(reason: EntryBlockReason): SessionEntryState {
  return { online: blocked(reason), inPerson: blocked(reason) };
}

/**
 * The truth table, in order of precedence (first match wins):
 *
 * 1. erasure suspended           -> both blocked `erasure_pending`
 * 2. org inactive                -> both blocked `org_inactive`
 * 3. instructor not admitted     -> both blocked `instructor_not_admitted`
 * 4. unclaimed                   -> both blocked `unclaimed`
 * 5. no consent record           -> both blocked `consent_missing_self|parent`
 * 6. record, online switch off   -> online blocked `live_off`, in person allowed
 * 7. otherwise                   -> both allowed
 */
export function sessionEntryState(inputs: SessionEntryInputs): SessionEntryState {
  if (inputs.erasureSuspended) return blockBoth("erasure_pending");
  if (inputs.org) {
    if (!inputs.org.active) return blockBoth("org_inactive");
    if (!inputs.org.instructorAdmitted) return blockBoth("instructor_not_admitted");
  }
  if (!inputs.claimed) return blockBoth("unclaimed");
  if (!inputs.consent) {
    return blockBoth(inputs.isSelfLearner ? "consent_missing_self" : "consent_missing_parent");
  }
  if (!inputs.consent.allowLiveSession) {
    return { online: blocked("live_off"), inPerson: allowed() };
  }
  return { online: allowed(), inPerson: allowed() };
}

/** For a viewer who has no tutor identity to evaluate (e.g. the env-admin scope): nothing opens. */
export const ENTRY_UNAVAILABLE: SessionEntryState = {
  online: { allowed: false, reason: "unknown" },
  inPerson: { allowed: false, reason: "unknown" },
};

/** A decision's reason, or null when it is allowed. */
export function decisionReason(decision: EntryDecision): EntryBlockReason | null {
  return decision.allowed ? null : decision.reason;
}

/**
 * What a tutor-side control (Open room, Start session) shows.
 * `disabledReason`: neither mode can be entered, so the control is disabled.
 * `onlineOnlyReason`: the room can be opened in person but not online; the control
 * stays enabled and the reason is shown beside it.
 */
export function tutorControlState(state: SessionEntryState): {
  disabledReason: EntryBlockReason | null;
  onlineOnlyReason: EntryBlockReason | null;
} {
  const disabledReason = decisionReason(state.inPerson);
  if (disabledReason) return { disabledReason, onlineOnlyReason: null };
  return { disabledReason: null, onlineOnlyReason: decisionReason(state.online) };
}

export type EntryAudience = "tutor" | "family" | "scheduler";

const JOIN_OPENS_MINUTES = Math.round(JOIN_WINDOW_OPENS_BEFORE_MS / 60_000);

const TUTOR_UNKNOWN = "This session can't be opened right now.";
const FAMILY_UNAVAILABLE = "This session isn't available right now.";

/**
 * One line per (reason, audience). `{name}` is the learner's name.
 * Family lines never reveal org-internal state (org status, instructor
 * membership): those collapse to the generic family line.
 * `scheduler` falls back to the tutor line where it has no short form.
 */
export const ENTRY_BLOCK_COPY: Record<
  EntryBlockReason,
  { tutor: string; family: string; scheduler?: string }
> = {
  unclaimed: {
    tutor: "{name} hasn't connected their Mynk account yet.",
    family: FAMILY_UNAVAILABLE,
    scheduler: "Waiting on the family",
  },
  consent_missing_self: {
    tutor: "{name} hasn't finished privacy preferences yet.",
    family: "Finish privacy preferences (Manage → Privacy) to join.",
  },
  consent_missing_parent: {
    tutor: "The parent hasn't finished privacy preferences yet.",
    family: "Finish privacy preferences for {name} to join.",
  },
  live_off: {
    tutor: "Live sessions are off in {name}'s privacy settings.",
    family: "Live sessions are off in privacy settings.",
    scheduler: "Live sessions are off",
  },
  not_yet: {
    tutor: TUTOR_UNKNOWN,
    family: `Join opens ${JOIN_OPENS_MINUTES} minutes before the start.`,
  },
  org_inactive: {
    tutor: "This organization isn't active right now.",
    family: FAMILY_UNAVAILABLE,
  },
  instructor_not_admitted: {
    tutor: "You're not an active instructor in this organization.",
    family: FAMILY_UNAVAILABLE,
  },
  erasure_pending: {
    tutor:
      "This learner's account is deactivated pending erasure. You cannot start new sessions until erasure is canceled or the grace period ends.",
    family: FAMILY_UNAVAILABLE,
  },
  unknown: {
    tutor: TUTOR_UNKNOWN,
    family: FAMILY_UNAVAILABLE,
  },
};

/** Appended to the online-off line when the room can still be opened in person. */
export const ENTRY_IN_PERSON_STILL_OPEN = "You can still open the room in person.";

/** The line for a reason. Unknown reason codes (stale client) render the generic line, never blank. */
export function entryBlockCopy(
  reason: EntryBlockReason,
  audience: EntryAudience,
  learnerName: string
): string {
  const entry = ENTRY_BLOCK_COPY[reason] ?? ENTRY_BLOCK_COPY.unknown;
  let template: string;
  if (audience === "family") template = entry.family;
  else if (audience === "scheduler") template = entry.scheduler ?? entry.tutor;
  else template = entry.tutor;
  const name = learnerName.trim() || "The learner";
  return template.replaceAll("{name}", name);
}
