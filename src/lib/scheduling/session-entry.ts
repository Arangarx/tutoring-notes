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

/**
 * The reasons that mean "no usable consent record": the learner is unclaimed, or claimed
 * with no record (self-learner / parent-held). The one list: the loader uses it to tell a
 * missing-record refusal from any other, and a test pins it against `sessionEntryState`.
 */
export const MISSING_RECORD_REASONS = [
  "unclaimed",
  "consent_missing_self",
  "consent_missing_parent",
] as const satisfies readonly EntryBlockReason[];

export type MissingRecordReason = (typeof MISSING_RECORD_REASONS)[number];

export function isMissingRecordReason(reason: EntryBlockReason): reason is MissingRecordReason {
  return (MISSING_RECORD_REASONS as readonly EntryBlockReason[]).includes(reason);
}

/**
 * A refused Start / create, RETURNED by the server action as data. An expected refusal is
 * not thrown: Next redacts a thrown server-action error in a production build (generic
 * message plus a digest; the name and fields are not serialized), so a tutor could never
 * read a thrown reason there. A resolved value survives serialization.
 */
export type EntryRefusal = { ok: false; reason: EntryBlockReason };

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
const PRIVACY_PATH = "Manage → Privacy";

/**
 * One entry per reason, one line per audience. `{name}` is the learner's name.
 * Family lines never reveal org-internal state (org status, instructor
 * membership): those collapse to the generic family line.
 * `scheduler` falls back to the tutor line where it has no short form.
 * `card` is the full "what to do next" text of the tutor callout on the student
 * page (one string per paragraph); a reason without `card` shows its tutor line.
 */
export const ENTRY_BLOCK_COPY: Record<
  EntryBlockReason,
  { tutor: string; family: string; scheduler?: string; card?: readonly string[] }
> = {
  unclaimed: {
    tutor: "{name} hasn't connected their Mynk account yet.",
    family: FAMILY_UNAVAILABLE,
    scheduler: "Waiting on the family",
    card: [
      "Before you can start a session, the student's parent must claim this account and set privacy preferences.",
    ],
  },
  consent_missing_self: {
    tutor: "{name} hasn't finished privacy preferences yet.",
    family: `Finish privacy preferences (${PRIVACY_PATH}) to join.`,
    card: [
      "This learner's privacy preferences are not complete. You cannot start a session until they finish them.",
      `They finish privacy preferences under ${PRIVACY_PATH} in their Mynk account.`,
    ],
  },
  consent_missing_parent: {
    tutor: "The parent hasn't finished privacy preferences yet.",
    family: "Finish privacy preferences for {name} to join.",
    card: [
      "A parent account is connected, but privacy preferences are not complete. You cannot start a session until the parent finishes them.",
      "Ask the parent to sign in to their Mynk account and complete privacy preferences for this learner. They can find this under their child's profile in Account.",
    ],
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

/** The visible name of a control a blocked card stands in for. One title per control. */
export type EntryControl = "start" | "openRoom";

export const ENTRY_CONTROL_LABEL: Record<"openRoom", string> = { openRoom: "Open room" };

/** Card heading: names the control the family or tutor cannot use. */
export const ENTRY_CARD_TITLE: Record<EntryControl, string> = {
  start: "Start whiteboard session unavailable",
  openRoom: `${ENTRY_CONTROL_LABEL.openRoom} unavailable`,
};

/**
 * The next-step paragraph under the `unclaimed` card. `**bold**` and `{accountLink}`
 * are markers the card renders (bold text, a link to Account & sharing).
 */
export const ENTRY_UNCLAIMED_NEXT_STEP = {
  withBanner:
    "Use the **claim link** banner above to create and copy an invite, or open {accountLink} for details.",
  claimInvites: "Open {accountLink} to create a claim invite or check connection status.",
  noInvites:
    "Parent account linking is not enabled on this site yet. Open {accountLink} for more information.",
} as const;

/** Paragraphs of the tutor callout for a reason (its `card` text, else its one tutor line). */
export function entryCardParagraphs(reason: EntryBlockReason, learnerName: string): string[] {
  const card = (ENTRY_BLOCK_COPY[reason] ?? ENTRY_BLOCK_COPY.unknown).card;
  return card ? [...card] : [entryBlockCopy(reason, "tutor", learnerName)];
}

/**
 * The only reason codes a family may receive (org UX plan § 3 / W4 family audience).
 * Every other reason (org suspended, instructor removed, erasure, unclaimed) is
 * internal state, and its family line is the generic one anyway, so it collapses
 * to `unknown` before it leaves the server.
 */
export const FAMILY_VISIBLE_REASONS = [
  "consent_missing_self",
  "consent_missing_parent",
  "live_off",
  "not_yet",
  "unknown",
] as const satisfies readonly EntryBlockReason[];

export type FamilyVisibleReason = (typeof FAMILY_VISIBLE_REASONS)[number];

const FAMILY_VISIBLE_REASON_SET: ReadonlySet<string> = new Set(FAMILY_VISIBLE_REASONS);

/**
 * Marks an entry state that has already been collapsed for a family.
 * Type-only: it is not serialized. A raw `SessionEntryState` (the tutor list)
 * is not assignable, so a family component cannot be given org reason codes.
 */
declare const familyAudienceBrand: unique symbol;

export type FamilyEntryDecision =
  | { allowed: true }
  | { allowed: false; reason: FamilyVisibleReason };

export type FamilySessionEntryState = {
  readonly [familyAudienceBrand]: "family";
  online: FamilyEntryDecision;
  inPerson: FamilyEntryDecision;
};

export function familySafeReason(reason: EntryBlockReason): FamilyVisibleReason {
  return FAMILY_VISIBLE_REASON_SET.has(reason) ? (reason as FamilyVisibleReason) : "unknown";
}

/**
 * The entry state as a family may see it. Internal reasons collapse to `unknown`,
 * and the result carries the family brand so only this function (and the family
 * list that calls it) can produce a value a family component accepts.
 */
export function familySafeEntryState(state: SessionEntryState): FamilySessionEntryState {
  const safe = (decision: EntryDecision): FamilyEntryDecision =>
    decision.allowed
      ? { allowed: true }
      : { allowed: false, reason: familySafeReason(decision.reason) };
  return { online: safe(state.online), inPerson: safe(state.inPerson) } as FamilySessionEntryState;
}

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

/** Where a tutor goes to fix a parent-held or unclaimed learner. */
export const ENTRY_PARENT_ACCOUNT_HINT =
  "Go to the Parent account section on this student's page to send a claim invite or check connection status.";

/** Reasons the tutor can fix from the Parent account section (a self-learner has none). */
const PARENT_ACCOUNT_HINT_REASONS: ReadonlySet<EntryBlockReason> = new Set<EntryBlockReason>([
  "consent_missing_parent",
  "unclaimed",
]);

/**
 * What a tutor reads after a refused Start or create: the same tutor line the disabled
 * control shows for that learner's situation, plus the Parent account hint where it fits.
 * One function for the student-page Start button and the waiting-room Start.
 */
export function entryRefusalMessage(reason: EntryBlockReason, learnerName: string): string {
  const line = entryBlockCopy(reason, "tutor", learnerName);
  return PARENT_ACCOUNT_HINT_REASONS.has(reason) ? `${line}\n\n${ENTRY_PARENT_ACCOUNT_HINT}` : line;
}
