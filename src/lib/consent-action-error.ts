/**
 * Client-safe helpers for consent denials surfaced from server actions.
 * Do not import consent-scope.ts here — it is server-only.
 */

import { ENTRY_BLOCK_COPY } from "@/lib/scheduling/session-entry";

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
      message === CONSENT_RECORD_TUTOR_MESSAGE)
  ) {
    return { permission: "consentRecord", message };
  }

  return null;
}

export function formatConsentActionError(
  parsed: ParsedConsentActionError
): string {
  if (parsed.permission === "consentRecord") {
    return `${CONSENT_RECORD_TUTOR_MESSAGE}\n\n${CONSENT_RECORD_PARENT_SECTION_HINT}`;
  }

  if (parsed.permission === "allowLiveSession" && parsed.message) {
    return parsed.message;
  }

  return parsed.message || CONSENT_RECORD_TUTOR_MESSAGE;
}
