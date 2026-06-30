/**
 * Consent enforcement guards — Gate B2 parent privacy consent.
 *
 * Enforcement is UNCONDITIONAL (the `CONSENT_ENFORCEMENT` flag has been
 * removed). assertEffectiveConsent always enforces: session-scoped snapshot
 * read, self-learner pass, permission check, ConsentError throw on denial.
 *
 * Schema writes (ConsentRecord, SessionConsentSnapshot) were never flag-gated:
 * we always collect consent data and freeze snapshots at session creation.
 *
 * Log prefix: [cns] (see AGENTS.md § Conventions)
 *
 * SERVER-ONLY: never import on the client.
 */

import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentPermission =
  | "allowAudioRecording"
  | "allowWhiteboardRecording"
  /** Dormant — schema retained; not enforced in product paths pending WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME. */
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
// Permissions that are not shipping in V1 — always pass
// ---------------------------------------------------------------------------

const NOT_SHIPPING_PERMISSIONS = new Set<ConsentPermission>([
  "allowMessaging",
  "allowVideoRecording",
]);

// ---------------------------------------------------------------------------
// assertEffectiveConsent (session-scoped)
// ---------------------------------------------------------------------------

/**
 * Assert that the required consent permission is granted for the given session.
 *
 * Fast-path exits (return void without throwing):
 *   1. Permission is allowMessaging or allowVideoRecording — not shipping in V1.
 *   2. No snapshot (unclaimed learner / pre-B2 session) — tutor-acknowledged fallback.
 *   3. Self-learner (adult, outside COPPA) — auto-pass (D-5).
 *
 * Throw path:
 *   - Snapshot exists + relevant Boolean is false → ConsentError.
 *
 * Reliability contract: MUST NOT block session continuation even if consent
 * cannot be verified. Unclaimed / pre-consent sessions always get the
 * tutor-acknowledged fallback.
 */
export async function assertEffectiveConsent(
  whiteboardSessionId: string,
  permission: ConsentPermission
): Promise<void> {
  if (NOT_SHIPPING_PERMISSIONS.has(permission)) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=consent_check permission=${permission} result=not_shipping`
    );
    return;
  }

  const snapshot = await withDbRetry(
    () =>
      db.sessionConsentSnapshot.findUnique({
        where: { whiteboardSessionId },
      }),
    { label: "assertEffectiveConsent.snapshot" }
  );

  if (!snapshot) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=consent_check permission=${permission} result=no_snapshot`
    );
    return;
  }

  // D-5: self-learner auto-pass — check via the session's student + learnerProfile.
  // We do this lazily only when there IS a snapshot (claimed session).
  if (snapshot.consentRecordId) {
    const record = await withDbRetry(
      () =>
        db.consentRecord.findUnique({
          where: { id: snapshot.consentRecordId! },
          include: {
            learnerProfile: { select: { isSelfLearner: true } },
          },
        }),
      { label: "assertEffectiveConsent.record" }
    );
    if (record?.learnerProfile?.isSelfLearner) {
      console.log(
        `[cns] wbsid=${whiteboardSessionId} action=consent_check permission=${permission} result=self_learner_pass`
      );
      return;
    }
  }

  const granted = snapshot[permission as keyof typeof snapshot] as boolean | undefined;

  if (granted === false) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=consent_check permission=${permission} result=denied`
    );
    throw new ConsentError(
      permission,
      `This session does not have consent for ${permission}.`
    );
  }

  console.log(
    `[cns] wbsid=${whiteboardSessionId} action=consent_check permission=${permission} result=granted`
  );
}

// ---------------------------------------------------------------------------
// createSessionConsentSnapshot
// ---------------------------------------------------------------------------

/**
 * Compute and insert a SessionConsentSnapshot for the given session.
 *
 * Must be called INSIDE the same db.$transaction as the WhiteboardSession row
 * insert so the session and snapshot are atomic.
 *
 * Returns the snapshot row, or null if it was skipped (unclaimed / no record).
 *
 * effective = parent_ceiling AND NOT child_restriction
 * Self-learner (D-5): all effective = true.
 */
export async function createSessionConsentSnapshot(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  whiteboardSessionId: string,
  learnerProfileId: string | null,
  adminUserId: string
): Promise<void> {
  if (!learnerProfileId) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=snapshot_skipped reason=unclaimed`
    );
    return;
  }

  // Find latest ConsentRecord for (learnerProfileId, adminUserId).
  const latestRecord = await tx.consentRecord.findFirst({
    where: { learnerProfileId, adminUserId },
    orderBy: { version: "desc" },
    include: {
      learnerProfile: { select: { isSelfLearner: true } },
    },
  });

  if (!latestRecord) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=snapshot_skipped reason=no_record`
    );
    return;
  }

  // D-5: self-learner auto-passes all consent
  if (latestRecord.learnerProfile.isSelfLearner) {
    await tx.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        consentRecordId: latestRecord.id,
        consentRecordVersion: latestRecord.version,
      },
    });
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=consent_frozen consentRecordId=${latestRecord.id} version=${latestRecord.version} learnerProfileId=${learnerProfileId} self_learner=true`
    );
    return;
  }

  // Load child restriction (may not exist — defaults all-false = no restrictions)
  const restriction = await tx.consentRestriction.findUnique({
    where: { learnerProfileId },
  });

  // effective = parent AND NOT child_restriction
  const allowLiveSession = latestRecord.allowLiveSession;
  const allowAudioRecording =
    latestRecord.allowAudioRecording &&
    !(restriction?.restrictAudioRecording ?? false);
  const allowWhiteboardRecording =
    latestRecord.allowWhiteboardRecording &&
    !(restriction?.restrictWhiteboardRecording ?? false);
  const allowNoteSending =
    latestRecord.allowNoteSending &&
    !(restriction?.restrictNoteSending ?? false);

  await tx.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId,
      allowLiveSession,
      allowAudioRecording,
      allowWhiteboardRecording,
      allowNoteSending,
      consentRecordId: latestRecord.id,
      consentRecordVersion: latestRecord.version,
    },
  });

  console.log(
    `[cns] wbsid=${whiteboardSessionId} action=consent_frozen consentRecordId=${latestRecord.id} version=${latestRecord.version} learnerProfileId=${learnerProfileId} allowLiveSession=${allowLiveSession} allowAudio=${allowAudioRecording} allowWB=${allowWhiteboardRecording} allowNotes=${allowNoteSending}`
  );
}

// ---------------------------------------------------------------------------
// assertConsentFromLiveRecord (session-less path — for sendUpdateEmail)
// ---------------------------------------------------------------------------

/**
 * Assert that the given student has current consent for the given permission.
 * Used for the session-less notes-email send path.
 *
 * Uses the latest ConsentRecord (not a snapshot) because there is no specific
 * session to anchor against.
 *
 * Fast-path exits (return void):
 *   1. Unclaimed student (no learnerProfileId)
 *   2. Self-learner (D-5)
 *
 * Throw path:
 *   - Claimed + no record → ConsentError (explicit consent required)
 *   - Record exists + permission false → ConsentError
 */
export async function assertConsentFromLiveRecord(
  studentId: string,
  adminUserId: string,
  permission: Extract<ConsentPermission, "allowNoteSending">
): Promise<void> {
  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { learnerProfileId: true },
      }),
    { label: "assertConsentFromLiveRecord.student" }
  );

  const learnerProfileId = student?.learnerProfileId;
  if (!learnerProfileId) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=unclaimed`
    );
    return;
  }

  const profile = await withDbRetry(
    () =>
      db.learnerProfile.findUnique({
        where: { id: learnerProfileId },
        select: { isSelfLearner: true },
      }),
    { label: "assertConsentFromLiveRecord.profile" }
  );

  if (profile?.isSelfLearner) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=self_learner`
    );
    return;
  }

  const latestRecord = await withDbRetry(
    () =>
      db.consentRecord.findFirst({
        where: { learnerProfileId, adminUserId },
        orderBy: { version: "desc" },
      }),
    { label: "assertConsentFromLiveRecord.record" }
  );

  if (!latestRecord) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=denied reason=no_record`
    );
    throw new ConsentError(
      permission,
      "Parental consent is required before sending notes updates."
    );
  }

  const granted = latestRecord[permission];
  if (!granted) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=denied`
    );
    throw new ConsentError(
      permission,
      "Parental consent for notes updates has not been granted."
    );
  }

  console.log(
    `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=granted`
  );
}

// ---------------------------------------------------------------------------
// assertOwnsConsentRecord
// ---------------------------------------------------------------------------

/**
 * Assert that the AccountHolder owns the given ConsentRecord.
 * Returns the ConsentRecord on success; calls notFound() on failure.
 *
 * Cross-tenant guard: setByAccountHolderId must equal the requesting
 * AccountHolder's id.
 */
export async function assertOwnsConsentRecord(
  accountHolderId: string,
  consentRecordId: string
) {
  const record = await withDbRetry(
    () =>
      db.consentRecord.findUnique({
        where: { id: consentRecordId },
        include: {
          learnerProfile: {
            select: { accountHolderId: true, tombstonedAt: true },
          },
        },
      }),
    { label: "assertOwnsConsentRecord" }
  );

  if (
    !record ||
    record.learnerProfile.accountHolderId !== accountHolderId ||
    record.learnerProfile.tombstonedAt
  ) {
    console.error(
      `[cns] cns=${consentRecordId} action=assert_owns_denied accountHolderId=${accountHolderId}`
    );
    notFound();
  }

  return record;
}
