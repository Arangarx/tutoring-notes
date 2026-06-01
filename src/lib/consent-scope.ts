/**
 * Consent enforcement guards (§7.3, §8.1).
 *
 * P2a STUBS: ConsentRecord, ConsentRestriction, and SessionConsentSnapshot
 * models are not yet implemented (Phase 3).
 *
 * `assertEffectiveConsent`: always uses the tutor-acknowledged fallback
 * (the existing behavior for unclaimed/pre-P2 sessions). This is correct
 * and safe: no snapshot = existing tutor-acknowledged consent, which already
 * gates session start. No sessions will be blocked by this stub.
 *
 * `assertOwnsConsentRecord`: always denies (no ConsentRecord rows exist yet).
 *
 * Phase 3 executor: replace these stubs with real implementations using
 * `db.sessionConsentSnapshot` and `db.consentRecord`. Function signatures
 * must remain identical so call sites need no changes.
 */

import { notFound } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentPermission =
  | "allowAudioRecording"
  | "allowWhiteboardRecording"
  | "allowNoteSending"
  | "allowMessaging"
  | "allowVideoRecording"
  | "allowLiveSession";

/**
 * Thrown when a required consent is not present.
 * Maps to HTTP 403 in route error handlers.
 */
export class ConsentError extends Error {
  constructor(
    public readonly permission: ConsentPermission,
    message?: string
  ) {
    super(message ?? `${permission} not consented for this session`);
    this.name = "ConsentError";
  }
}

// ---------------------------------------------------------------------------
// assertEffectiveConsent
// ---------------------------------------------------------------------------

/**
 * Assert that the required consent permission is granted for the given session.
 *
 * P2a stub: SessionConsentSnapshot model is Phase 3.
 * Returns void immediately (tutor-acknowledged fallback) with an observability warning.
 *
 * Reliability contract: MUST NOT block session continuation even if consent
 * cannot be verified. Use the tutor-acknowledged fallback path.
 */
export async function assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: ConsentPermission
): Promise<void> {
  // P2a: SessionConsentSnapshot not yet implemented — tutor-acknowledged fallback.
  console.warn(
    `[cns] sessionId=${whiteboardSessionId} action=no_snapshot permission=${permission} fallback=tutor_acknowledged`
  );
}

// ---------------------------------------------------------------------------
// assertOwnsConsentRecord
// ---------------------------------------------------------------------------

/**
 * Assert that the AccountHolder owns the given ConsentRecord.
 * Returns the ConsentRecord on success; calls notFound() on failure.
 *
 * P2a stub: ConsentRecord model is Phase 3. Always denies (no rows exist).
 *
 * Phase 3 executor: replace this with:
 *   const record = await db.consentRecord.findUnique({
 *     where: { id: consentRecordId },
 *     include: { learnerProfile: { select: { accountHolderId: true, tombstonedAt: true } } },
 *   });
 *   if (!record || record.learnerProfile.accountHolderId !== accountHolderId || record.learnerProfile.tombstonedAt) {
 *     console.error(`[cns] cns=${consentRecordId} action=assert_owns_denied accountHolderId=${accountHolderId}`);
 *     notFound();
 *   }
 *   return record;
 */
export async function assertOwnsConsentRecord(
  accountHolderId: string,
  consentRecordId: string
): Promise<never> {
  // P2a stub: ConsentRecord model ships in Phase 3.
  console.error(
    `[cns] cns=${consentRecordId} action=assert_owns_denied accountHolderId=${accountHolderId}`
  );
  notFound();
  throw new Error("unreachable");
}
