/**
 * Consent reads and guards — Gate B2 parent privacy consent.
 *
 * This is the one module that reads the ConsentRecord table (guarded by
 * consent-guards.test.ts). Session enforcement asks `resolveSessionCapabilities`;
 * a self-learner uses the same effective toggles as everyone else.
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
import {
  deriveSessionCapabilities,
  type SessionCapabilities,
  type SessionCapabilityInput,
} from "@/lib/recording/session-capabilities";

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
export async function resolveEffectiveConsentForStudent(
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

/** One owner's latest ConsentRecord, raw (ceiling only: ConsentRestriction is not applied). */
export type LatestConsentPerOwnerRow = ConsentToggleCeiling & {
  id: string;
  version: number;
  adminUserId: string | null;
  organizationId: string | null;
};

/**
 * Every ConsentRecord the learner has, reduced to the newest row per tutor and per organization
 * (tutors first, then organizations; ties keep the first row read). The one read behind the child
 * consent screen, which ANDs the ceilings across owners; moved here from child-consent.ts so no
 * file outside this module queries the table (consent single resolver guard, § 6i).
 * Display per owner is C7; this read is behavior-preserving.
 */
export async function readLatestConsentPerOwner(
  learnerProfileId: string,
  client: ConsentReadClient = db as unknown as ConsentReadClient
): Promise<LatestConsentPerOwnerRow[]> {
  const rows = await client.consentRecord.findMany({
    where: { learnerProfileId },
    select: {
      id: true,
      version: true,
      adminUserId: true,
      organizationId: true,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    },
  });
  const byTutor = new Map<string, LatestConsentPerOwnerRow>();
  const byOrg = new Map<string, LatestConsentPerOwnerRow>();
  for (const row of rows) {
    if (row.adminUserId) {
      const prev = byTutor.get(row.adminUserId);
      if (!prev || row.version > prev.version) byTutor.set(row.adminUserId, row);
    } else if (row.organizationId) {
      const prev = byOrg.get(row.organizationId);
      if (!prev || row.version > prev.version) byOrg.set(row.organizationId, row);
    }
  }
  return [...byTutor.values(), ...byOrg.values()];
}

// ---------------------------------------------------------------------------
// resolveSessionCapabilities (server projection of deriveSessionCapabilities)
// ---------------------------------------------------------------------------

/** Where the toggles behind a session's capabilities came from. Logged as `source=`. */
type CapabilitySource = "snapshot" | "live" | "legacy_unclaimed" | "fail_closed";

/** Legacy unclaimed sessions (no snapshot, no learner profile): nothing is restricted, as before. */
const ALL_CONSENT_ON: ConsentToggleCeiling = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

/** Fail closed with no new constant: every switch off, in person, notes forbidden. */
const FAIL_CLOSED_INPUT: SessionCapabilityInput = {
  hasConsentSnapshot: true,
  toggles: { audio: false, whiteboard: false, notes: false },
  sessionMode: "IN_PERSON",
  notesForbidden: true,
};

/**
 * The one server answer to "what may this session capture, transcribe, draft and replay".
 * One read of the session; every server gate calls this instead of reading toggles.
 *
 * Toggles come from:
 *   - the frozen snapshot once the session is past PENDING;
 *   - the LIVE effective record (ceiling AND NOT child restriction) while PENDING, so a parent who
 *     changes a switch after the tutor opened the room is respected immediately (plan § 2.6). If the
 *     live record has gone, a frozen snapshot still answers;
 *   - no snapshot, claimed learner: the live record (a missing snapshot is neither allow nor deny);
 *   - no snapshot, unclaimed learner: everything on (legacy compatibility, as before);
 *   - no record at all, or the session is missing: fail closed.
 *
 * Pass `client` inside a transaction. Otherwise the session read is retried.
 * Does not throw on denial: callers log and skip.
 */
export async function resolveSessionCapabilities(
  whiteboardSessionId: string,
  client?: ConsentReadClient
): Promise<SessionCapabilities> {
  const readSession = (c: ConsentReadClient) =>
    c.whiteboardSession.findUnique({
      where: { id: whiteboardSessionId },
      select: {
        sessionPhase: true,
        sessionMode: true,
        notesForbidden: true,
        consentSnapshot: {
          select: {
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: true,
            allowNoteSending: true,
          },
        },
        student: {
          select: { adminUserId: true, organizationId: true, learnerProfileId: true },
        },
      },
    });
  const row = client
    ? await readSession(client)
    : await withDbRetry(() => readSession(db as unknown as ConsentReadClient), {
        label: "resolveSessionCapabilities.session",
      });

  const log = (capabilities: SessionCapabilities, source: CapabilitySource, online: boolean | "n/a") => {
    console.log(
      `[cns] wbsid=${whiteboardSessionId} action=capabilities_resolved audio=${capabilities.audio.mode} wb=${capabilities.whiteboard.persist} notes=${capabilities.notes.draft} online=${online} mic=${capabilities.mic.acquire} source=${source}`
    );
    return capabilities;
  };

  if (!row) {
    return log(deriveSessionCapabilities(FAIL_CLOSED_INPUT), "fail_closed", "n/a");
  }

  const learnerProfileId = row.student?.learnerProfileId ?? null;
  let toggles: ConsentToggleCeiling | null = null;
  let source: CapabilitySource = "snapshot";

  if (row.consentSnapshot && row.sessionPhase !== "PENDING") {
    toggles = row.consentSnapshot;
  } else if (learnerProfileId) {
    const live = await resolveEffectiveConsentForStudent(
      learnerProfileId,
      row.student,
      null,
      client,
      "resolveSessionCapabilities.record"
    );
    if (live) {
      toggles = live;
      source = "live";
    } else if (row.consentSnapshot) {
      toggles = row.consentSnapshot;
    }
  } else if (row.consentSnapshot) {
    toggles = row.consentSnapshot;
  } else {
    toggles = ALL_CONSENT_ON;
    source = "legacy_unclaimed";
  }

  if (!toggles) {
    return log(deriveSessionCapabilities(FAIL_CLOSED_INPUT), "fail_closed", "n/a");
  }

  const capabilities = deriveSessionCapabilities({
    hasConsentSnapshot: true,
    toggles: {
      audio: toggles.allowAudioRecording,
      whiteboard: toggles.allowWhiteboardRecording,
      notes: toggles.allowNoteSending,
    },
    sessionMode: row.sessionMode === "IN_PERSON" ? "IN_PERSON" : "LIVE",
    notesForbidden: row.notesForbidden,
  });
  return log(capabilities, source, toggles.allowLiveSession);
}