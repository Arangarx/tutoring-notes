/**
 * Client-safe helpers for consent denials surfaced from server actions.
 * Do not import consent-scope.ts here — it is server-only.
 */

import { ENTRY_BLOCK_COPY, type EntryBlockReason } from "@/lib/scheduling/session-entry";

/**
 * Tutor sentence when no consent record exists. The same line the disabled
 * control shows for a parent-held learner (`ENTRY_BLOCK_COPY`).
 */
export const CONSENT_RECORD_TUTOR_MESSAGE = ENTRY_BLOCK_COPY.consent_missing_parent.tutor;

export const CONSENT_RECORD_PARENT_SECTION_HINT =
  "Go to the Parent account section on this student's page to send a claim invite or check connection status.";

export type ParsedConsentActionError = {
  permission: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Detect ConsentError-shaped failures from server actions (class may be
 * stripped by Next serialization in production).
 */
export function parseConsentActionError(
  err: unknown
): ParsedConsentActionError | null {
  if (!isRecord(err)) return null;

  const name = typeof err.name === "string" ? err.name : null;
  const permission =
    typeof err.permission === "string" ? err.permission : null;
  const message =
    typeof err.message === "string" && err.message.length > 0
      ? err.message
      : null;

  if (name === "ConsentError" && permission) {
    return { permission, message: message ?? "" };
  }

  if (
    message &&
    (message.includes("Parent privacy preferences must be set") ||
      consentRecordReasonOf(message) !== null)
  ) {
    return { permission: "consentRecord", message };
  }

  return null;
}

/** The missing-record reasons a tutor can be refused with, in match order. */
const CONSENT_RECORD_REASONS = [
  "consent_missing_parent",
  "consent_missing_self",
  "unclaimed",
] as const satisfies readonly EntryBlockReason[];

/** Whether `message` is this reason's tutor line (`{name}` matches any learner name). */
function isTutorLineFor(reason: EntryBlockReason, message: string): boolean {
  const [head, tail] = ENTRY_BLOCK_COPY[reason].tutor.split("{name}");
  if (tail === undefined) return message === head;
  return message.length > head.length + tail.length && message.startsWith(head) && message.endsWith(tail);
}

/**
 * The missing-record reason a server message carries: the server throws the table line
 * for the learner's situation (`entryRefusalError`), so the line names the reason.
 */
function consentRecordReasonOf(message: string): EntryBlockReason | null {
  return CONSENT_RECORD_REASONS.find((reason) => isTutorLineFor(reason, message)) ?? null;
}

export function formatConsentActionError(
  parsed: ParsedConsentActionError
): string {
  if (parsed.permission === "consentRecord") {
    const reason = consentRecordReasonOf(parsed.message);
    // A self-learner has no parent account, so the Parent-account hint does not fit them.
    if (reason === "consent_missing_self") return parsed.message;
    if (reason) return `${parsed.message}\n\n${CONSENT_RECORD_PARENT_SECTION_HINT}`;
    // A message that names no situation (the generic missing-record error) keeps the
    // parent line, as before.
    return `${CONSENT_RECORD_TUTOR_MESSAGE}\n\n${CONSENT_RECORD_PARENT_SECTION_HINT}`;
  }

  if (parsed.permission === "allowLiveSession" && parsed.message) {
    return parsed.message;
  }

  return parsed.message || CONSENT_RECORD_TUTOR_MESSAGE;
}
