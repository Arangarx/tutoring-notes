/**
 * Consent enforcement guards — Gate B2 parent privacy consent.
 *
 * Enforcement is UNCONDITIONAL (the `CONSENT_ENFORCEMENT` flag has been
 * removed). assertEffectiveConsent always enforces: session-scoped snapshot
 * read, permission check, ConsentError throw on denial. A self-learner uses
 * the same effective toggles as everyone else.
 *
 * Schema writes (ConsentRecord, SessionConsentSnapshot) were never flag-gated:
 * we always collect consent data and freeze snapshots at session creation.
 *
 * Log prefix: [cns] (see AGENTS.md § Conventions)
 *
 * SERVER-ONLY: never import on the client.
 */

import type { Prisma } from "@prisma/client";
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
  | "allowLiveSession"
  /** CC-1 — a ConsentRecord must exist before session create/start (record existence, not permission value). */
  | "consentRecord";

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
 *
 * Throw path:
 *   - Snapshot exists + relevant Boolean is false → ConsentError.
 *     Self-learners are included. The snapshot stores effective toggles.
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
// resolveModeAwareAudioRecordingConsent (Block B server gates — B-5/B-6/H-6/M-6)
// ---------------------------------------------------------------------------

export type ModeAwareAudioConsentDenyReason =
  | "consent_denied_inperson"
  | "no_snapshot_fail_closed";

export type ModeAwareAudioConsentDecision =
  | { allow: true }
  | { allow: false; reason: ModeAwareAudioConsentDenyReason };

/**
 * Mode-aware allow/deny for audio recording, transcription, and segment
 * registration. Single source of truth for server-side Block B gates.
 *
 * Semantics (session's frozen snapshot + activated sessionMode):
 *   - allowAudioRecording=true → allow (any mode)
 *   - allowAudioRecording=false + IN_PERSON → deny (inseparable mic)
 *   - allowAudioRecording=false + LIVE → allow (tutor-only mixdown)
 *   - no snapshot + unclaimed → allow (legacy compat)
 *   - no snapshot + claimed, including a self-learner → read the latest
 *     effective record. Missing snapshot is not itself allow or deny.
 *     No ConsentRecord at all → deny.
 *
 * Does NOT throw ConsentError — callers log and skip/early-return.
 * Generic assertEffectiveConsent no_snapshot→PASS is unchanged.
 */
function modeAwareAudioDecision(
  whiteboardSessionId: string,
  allowAudioRecording: boolean,
  sessionMode: string
): ModeAwareAudioConsentDecision {
  if (allowAudioRecording) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=allow reason=granted`
    );
    return { allow: true };
  }

  if (sessionMode === "IN_PERSON") {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=deny reason=consent_denied_inperson mode=${sessionMode}`
    );
    return { allow: false, reason: "consent_denied_inperson" };
  }

  console.log(
    `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=allow reason=live_tutor_only mode=${sessionMode}`
  );
  return { allow: true };
}

export async function resolveModeAwareAudioRecordingConsent(
  whiteboardSessionId: string
): Promise<ModeAwareAudioConsentDecision> {
  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          sessionMode: true,
          consentSnapshot: {
            select: {
              allowAudioRecording: true,
            },
          },
          student: {
            select: {
              adminUserId: true,
              organizationId: true,
              learnerProfileId: true,
            },
          },
        },
      }),
    { label: "resolveModeAwareAudioRecordingConsent" }
  );

  if (!row) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=deny reason=no_snapshot_fail_closed detail=session_not_found`
    );
    return { allow: false, reason: "no_snapshot_fail_closed" };
  }

  const { sessionMode, consentSnapshot, student } = row;
  const learnerProfileId = student?.learnerProfileId ?? null;

  if (consentSnapshot) {
    return modeAwareAudioDecision(
      whiteboardSessionId,
      consentSnapshot.allowAudioRecording,
      sessionMode
    );
  }

  if (!learnerProfileId) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=allow reason=no_snapshot_unclaimed`
    );
    return { allow: true };
  }

  const effective = await resolveEffectiveConsentForStudent(
    learnerProfileId,
    student,
    null,
    undefined,
    "resolveModeAwareAudioRecordingConsent.record"
  );

  if (!effective) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=mode_aware_audio result=deny reason=no_snapshot_fail_closed`
    );
    return { allow: false, reason: "no_snapshot_fail_closed" };
  }

  return modeAwareAudioDecision(
    whiteboardSessionId,
    effective.allowAudioRecording,
    sessionMode
  );
}

// ---------------------------------------------------------------------------
// effectiveConsentToggles
// ---------------------------------------------------------------------------

/** Parent or self-learner ceiling. */
export type ConsentToggleCeiling = {
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

/** Child floor. A missing field is not a restriction. */
export type ConsentToggleRestriction = {
  restrictLiveSession?: boolean | null;
  restrictAudioRecording?: boolean | null;
  restrictWhiteboardRecording?: boolean | null;
  restrictNoteSending?: boolean | null;
};

/**
 * effective = ceiling AND NOT restriction.
 * createSessionConsentSnapshot freezes this combination for every learner,
 * including a self-learner.
 */
export function effectiveConsentToggles(
  record: ConsentToggleCeiling,
  restriction: ConsentToggleRestriction | null | undefined
): ConsentToggleCeiling {
  return {
    allowLiveSession:
      record.allowLiveSession && !(restriction?.restrictLiveSession ?? false),
    allowAudioRecording:
      record.allowAudioRecording && !(restriction?.restrictAudioRecording ?? false),
    allowWhiteboardRecording:
      record.allowWhiteboardRecording &&
      !(restriction?.restrictWhiteboardRecording ?? false),
    allowNoteSending:
      record.allowNoteSending && !(restriction?.restrictNoteSending ?? false),
  };
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
 * effective = ceiling AND NOT child_restriction, including a self-learner.
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

  const sessionRow = await tx.whiteboardSession.findUnique({
    where: { id: whiteboardSessionId },
    select: {
      student: { select: { adminUserId: true, organizationId: true } },
    },
  });
  const effective = await resolveEffectiveConsentForStudent(
    learnerProfileId,
    sessionRow?.student ?? null,
    adminUserId,
    tx
  );

  if (!effective) {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=snapshot_skipped reason=no_record`
    );
    return;
  }

  await tx.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId,
      allowLiveSession: effective.allowLiveSession,
      allowAudioRecording: effective.allowAudioRecording,
      allowWhiteboardRecording: effective.allowWhiteboardRecording,
      allowNoteSending: effective.allowNoteSending,
      consentRecordId: effective.id,
      consentRecordVersion: effective.version,
    },
  });

  console.log(
    `[cns] wbsid=${whiteboardSessionId} action=consent_frozen consentRecordId=${effective.id} version=${effective.version} learnerProfileId=${learnerProfileId} allowLiveSession=${effective.allowLiveSession} allowAudio=${effective.allowAudioRecording} allowWB=${effective.allowWhiteboardRecording} allowNotes=${effective.allowNoteSending}`
  );
}

const CONSENT_RECORD_REQUIRED_MESSAGE =
  "Parent privacy preferences must be set before starting a session. Ask the parent to complete claim setup or update consent from their account.";

// ---------------------------------------------------------------------------
// assertConsentRecordExists (CC-1 — record existence gate)
// ---------------------------------------------------------------------------

/**
 * Assert that a ConsentRecord exists for the student's real owner.
 * CC-1 gate — record existence, not permission value. A self-learner
 * with no record throws the same consent-required error as a child.
 *
 * Throw:
 *   - learnerProfileId is null → ConsentError (unclaimed; no record possible)
 *   - Claimed learner + no ConsentRecord → ConsentError
 */
export async function assertConsentRecordExists(
  learnerProfileId: string | null,
  adminUserId: string,
  opts?: { studentId?: string }
): Promise<void> {
  if (learnerProfileId === null) {
    console.log(
      `[cns] learnerProfileId=null adminUserId=${adminUserId} action=record_exists_check result=unclaimed`
    );
    throw new ConsentError("consentRecord", CONSENT_RECORD_REQUIRED_MESSAGE);
  }

  const studentId = opts?.studentId;
  const student = studentId
    ? await withDbRetry(
        () =>
          db.student.findUnique({
            where: { id: studentId },
            select: { adminUserId: true, organizationId: true },
          }),
        { label: "consentOwnerForLearner.student" }
      )
    : null;
  const effective = await resolveEffectiveConsentForStudent(
    learnerProfileId,
    student,
    adminUserId,
    undefined,
    "assertConsentRecordExists.record"
  );

  if (!effective) {
    console.log(
      `[cns] learnerProfileId=${learnerProfileId} adminUserId=${adminUserId} action=record_exists_check result=denied`
    );
    throw new ConsentError("consentRecord", CONSENT_RECORD_REQUIRED_MESSAGE);
  }

  console.log(
    `[cns] learnerProfileId=${learnerProfileId} adminUserId=${adminUserId} action=record_exists_check result=granted`
  );
}

// ---------------------------------------------------------------------------
// assertConsentFromLiveRecord (session-less path — for sendUpdateEmail)
// ---------------------------------------------------------------------------

const LIVE_RECORD_DENIAL_COPY = {
  allowNoteSending: {
    noRecord: "Parental consent is required before sending notes updates.",
    notGranted: "Parental consent for notes updates has not been granted.",
  },
  allowLiveSession: {
    noRecord: "Parental consent is required before joining live sessions.",
    notGranted: "Parental consent for live sessions has not been granted.",
  },
} as const;

/**
 * Assert that the given student has current consent for the given permission.
 * Used for the session-less notes-email send path.
 *
 * Uses the latest ConsentRecord (not a snapshot) because there is no specific
 * session to anchor against.
 *
 * Fast-path exits (return void):
 *   1. Unclaimed student (no learnerProfileId)
 *
 * Throw path:
 *   - Claimed + no record → ConsentError (explicit consent required)
 *   - Record exists + effective permission false → ConsentError
 *     A self-learner is included.
 *
 * `allowLiveSession` is checked here by the schedule bridge, before the
 * session (and its snapshot) exists.
 */
export async function assertConsentFromLiveRecord(
  studentId: string,
  adminUserId: string,
  permission: Extract<ConsentPermission, "allowNoteSending" | "allowLiveSession">
): Promise<void> {
  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { learnerProfileId: true, adminUserId: true, organizationId: true },
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

  const effective = await resolveEffectiveConsentForStudent(
    learnerProfileId,
    student,
    adminUserId,
    undefined,
    "assertConsentFromLiveRecord.record"
  );

  if (!effective) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=denied reason=no_record`
    );
    throw new ConsentError(permission, LIVE_RECORD_DENIAL_COPY[permission].noRecord);
  }

  const granted = effective[permission];
  if (!granted) {
    console.log(
      `[cns] studentId=${studentId} action=live_record_check permission=${permission} result=denied`
    );
    throw new ConsentError(permission, LIVE_RECORD_DENIAL_COPY[permission].notGranted);
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

export type ConsentOwner = {
  adminUserId: string | null;
  organizationId: string | null;
};

/** One owner rule. Organization wins when set; otherwise the tutor on the student. */
export function consentOwnerFromStudent(student: {
  adminUserId: string | null;
  organizationId: string | null;
}): ConsentOwner | null {
  if (student.organizationId) {
    return { adminUserId: null, organizationId: student.organizationId };
  }
  if (student.adminUserId) {
    return { adminUserId: student.adminUserId, organizationId: null };
  }
  return null;
}

function consentRecordOwnerWhere(
  learnerProfileId: string,
  owner: { adminUserId?: string | null; organizationId?: string | null }
) {
  const adminUserId = owner.adminUserId ?? null;
  const organizationId = owner.organizationId ?? null;
  if ((adminUserId && organizationId) || (!adminUserId && !organizationId)) {
    throw new Error("consent_owner_required");
  }
  if (organizationId) {
    return {
      learnerProfileId,
      organizationId,
      adminUserId: null,
    };
  }
  return {
    learnerProfileId,
    adminUserId,
  };
}

type ConsentReadClient = Prisma.TransactionClient;

type ConsentRecordLookup = {
  learnerProfileId: string;
  adminUserId?: string | null;
  organizationId?: string | null;
};

type LatestConsentRecord = ConsentToggleCeiling & { id: string; version: number };

/** The one ConsentRecord read. Both resolvers below call this. */
async function findLatestConsentRecord(
  input: ConsentRecordLookup,
  client: ConsentReadClient
): Promise<LatestConsentRecord | null> {
  return client.consentRecord.findFirst({
    where: consentRecordOwnerWhere(input.learnerProfileId, input),
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    },
  });
}

/**
 * Owner on the student when one is set, otherwise the fallback tutor.
 * Then the latest effective consent for that owner.
 * Pass `client` inside a transaction. Otherwise the read is retried.
 */
async function resolveEffectiveConsentForStudent(
  learnerProfileId: string,
  student: {
    adminUserId: string | null;
    organizationId: string | null;
  } | null,
  fallbackAdminUserId: string | null,
  client?: ConsentReadClient,
  label?: string
): Promise<LatestConsentRecord | null> {
  const owner =
    (student ? consentOwnerFromStudent(student) : null) ??
    (fallbackAdminUserId ? { adminUserId: fallbackAdminUserId, organizationId: null } : null);
  if (!owner) return null;

  const input: ConsentRecordLookup = {
    learnerProfileId,
    adminUserId: owner.adminUserId,
    organizationId: owner.organizationId,
  };
  if (client) return resolveEffectiveRecordedConsent(input, client);
  return withDbRetry(() => resolveEffectiveRecordedConsent(input), {
    label: label ?? "resolveEffectiveConsentForStudent",
  });
}

/**
 * Latest ConsentRecord for exactly one owner, combined with ConsentRestriction.
 * Returns id and version so a snapshot can point at the row it froze.
 */
export async function resolveEffectiveRecordedConsent(
  input: ConsentRecordLookup,
  client: ConsentReadClient = db as unknown as ConsentReadClient
): Promise<LatestConsentRecord | null> {
  const record = await findLatestConsentRecord(input, client);
  if (!record) return null;
  const restriction = await client.consentRestriction.findUnique({
    where: { learnerProfileId: input.learnerProfileId },
  });
  return {
    id: record.id,
    version: record.version,
    ...effectiveConsentToggles(record, restriction),
  };
}

/**
 * Latest raw toggles for exactly one owner. Does not apply ConsentRestriction.
 * Exactly one of adminUserId or organizationId.
 */
export async function resolveRecordedConsent(
  input: ConsentRecordLookup
): Promise<ConsentToggleCeiling | null> {
  const record = await findLatestConsentRecord(
    input,
    db as unknown as ConsentReadClient
  );
  if (!record) return null;
  return {
    allowLiveSession: record.allowLiveSession,
    allowAudioRecording: record.allowAudioRecording,
    allowWhiteboardRecording: record.allowWhiteboardRecording,
    allowNoteSending: record.allowNoteSending,
  };
}
