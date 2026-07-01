/**
 * @jest-environment node
 *
 * E8 — cross-module erasure lifecycle integration tests.
 *
 * Exercises the full pipeline across request → tombstone → grace → purge →
 * content guards (not re-testing single-module units covered in E2–E7).
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 * Blob: mocked — no real Vercel Blob store calls.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_e8_lifecycle",
}));

const mockList = jest.fn();
const mockFetchPrivateBlobBytes = jest.fn();
const mockDeleteBlob = jest.fn();

jest.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => mockList(...args),
}));

jest.mock("@/lib/blob", () => ({
  ...jest.requireActual("@/lib/blob"),
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
  fetchPrivateBlobBytes: (...args: unknown[]) => mockFetchPrivateBlobBytes(...args),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { createLearnerSession } from "@/lib/learner-session";
import {
  WB_EVENT_LOG_SCHEMA_VERSION,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  assertStudentNotErased,
  assertStudentNotErasedApi,
  isStudentErased,
  shouldShortCircuitEndSessionForErasure,
} from "@/lib/erasure/assert-student-not-erased";
import { resolveErasureScopeStudents } from "@/lib/erasure/blob-inventory";
import {
  cancelErasureJob,
  processErasureJob,
} from "@/lib/erasure/process-erasure-job";
import { requestErasureByAdmin } from "@/lib/erasure/request-erasure-by-admin";
import {
  endWhiteboardSession,
  type EndSessionSegment,
} from "@/app/admin/students/[id]/whiteboard/actions";

const ADMIN_ID = "00000000-0000-4000-8000-00000000e8a0";
const DELETED_LEARNER_NAME = "[Deleted learner]";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";
const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

let uniqueSuffix = 0;
function uniq(prefix = "ers-e8") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;

  // jest.global-setup uses `prisma db push`, which does not apply raw migration SQL.
  // B-8 partial unique index must exist for concurrent-request integration coverage.
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "erasure_job_active_scope"
      ON "ErasureJob"("scopeKind", "scopeId")
      WHERE "status" NOT IN ('completed', 'failed', 'canceled')
  `);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ blobs: [], hasMore: false, cursor: undefined });
  mockDeleteBlob.mockResolvedValue(undefined);
  assertOwnsWhiteboardSessionMock.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createAccountHolder(opts?: {
  displayName?: string;
  familyId?: string;
}) {
  const email = `${uniq("ah")}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      displayName: opts?.displayName ?? "Parent Test",
      emailVerifiedAt: new Date(),
      familyId: opts?.familyId ?? `fam_${uniq()}`,
    },
  });
}

async function createLearnerProfile(
  accountHolderId: string,
  opts?: { displayName?: string; isTestFixture?: boolean }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: opts?.displayName ?? "Test Learner",
      accessMode: "child_pin_required",
      isTestFixture: opts?.isTestFixture ?? false,
    },
  });
}

async function createLearnerCredential(
  learnerProfileId: string,
  accountHolderId: string,
  username: string
) {
  const secretHash = await hashLearnerPin("123456");
  return db.learnerCredential.create({
    data: { learnerProfileId, accountHolderId, username, secretHash },
  });
}

async function createStudent(
  adminUserId: string,
  learnerProfileId: string,
  opts?: { name?: string; parentEmail?: string }
) {
  return db.student.create({
    data: {
      name: opts?.name ?? "Alice Student",
      parentEmail: opts?.parentEmail ?? `parent-${uniq()}@example.com`,
      adminUserId,
      learnerProfileId,
    },
  });
}

type FullFixture = {
  tutor: { id: string };
  ah: { id: string };
  lp: { id: string; displayName: string };
  student: { id: string };
  session: { id: string };
  note: { id: string };
  recordingBlobUrl: string;
  eventsBlobUrl: string;
  snapshotBlobUrl: string;
  chunkBlobUrl: string;
  originalPii: {
    studentName: string;
    parentEmail: string;
    topics: string;
    transcript: string;
  };
};

async function createFullErasureFixture(opts?: {
  learnerDisplayName?: string;
  withLearnerCredential?: boolean;
}): Promise<FullFixture> {
  const learnerDisplayName = opts?.learnerDisplayName ?? "Alice Lifecycle";
  const tutor = await createTutor();
  const ah = await createAccountHolder({ displayName: "Lifecycle Parent" });
  const lp = await createLearnerProfile(ah.id, { displayName: learnerDisplayName });
  const student = await createStudent(tutor.id, lp.id, {
    name: "Alice SecretName",
    parentEmail: `secret-parent-${uniq()}@example.com`,
  });

  if (opts?.withLearnerCredential !== false) {
    await createLearnerCredential(lp.id, ah.id, `kid_${uniq()}`);
    await createLearnerSession(lp.id, null);
  }

  const eventsBlobUrl = `https://blob.example.com/events/${uniq()}.json`;
  const snapshotBlobUrl = `https://blob.example.com/snapshots/${uniq()}.png`;
  const recordingBlobUrl = `https://blob.example.com/sessions/${student.id}/${uniq()}.webm`;
  const chunkBlobUrl = `https://blob.example.com/chunks/${uniq()}.webm`;

  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl,
      snapshotBlobUrl,
      eventsSchemaVersion: 1,
      activeMs: 42_000,
      durationSeconds: 120,
      bothConnectedAt: new Date("2026-01-15T10:00:00Z"),
      activatedAt: new Date("2026-01-15T10:00:00Z"),
      startedAt: new Date("2026-01-15T10:00:00Z"),
    },
  });

  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-01-15"),
      topics: "Secret topics about Alice",
      homework: "Secret homework",
      assessment: "Secret assessment",
      nextSteps: "Secret next steps",
      linksJson: '["https://secret.example.com"]',
    },
  });

  await db.sessionRecording.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      whiteboardSessionId: session.id,
      blobUrl: recordingBlobUrl,
      mimeType: "audio/webm",
      sizeBytes: 2048,
      transcript: "Secret transcript text about Alice",
    },
  });

  await db.transcriptChunk.create({
    data: {
      sessionId: session.id,
      chunkBlobUrl,
      recordingTimeOffsetMs: 0,
      status: "done",
      transcript: "Secret chunk transcript",
    },
  });

  await db.consentRecord.create({
    data: {
      learnerProfileId: lp.id,
      adminUserId: tutor.id,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.id,
    },
  });

  await db.sessionConsentSnapshot.create({
    data: {
      whiteboardSessionId: session.id,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    },
  });

  await db.costEvent.create({
    data: {
      kind: "WHISPER_TRANSCRIPTION",
      model: "whisper-1",
      adminUserId: tutor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
      audioSeconds: 60,
    },
  });

  return {
    tutor,
    ah,
    lp: { id: lp.id, displayName: learnerDisplayName },
    student,
    session,
    note,
    recordingBlobUrl,
    eventsBlobUrl,
    snapshotBlobUrl,
    chunkBlobUrl,
    originalPii: {
      studentName: "Alice SecretName",
      parentEmail: student.parentEmail!,
      topics: "Secret topics about Alice",
      transcript: "Secret transcript text about Alice",
    },
  };
}

function buildEmptyEventsLog(): WBEventLog {
  return {
    schemaVersion: WB_EVENT_LOG_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    durationMs: 1000,
    events: [],
  };
}

function setupBlobMocks(sessionId: string) {
  mockFetchPrivateBlobBytes.mockResolvedValue({
    buffer: Buffer.from(JSON.stringify(buildEmptyEventsLog()), "utf8"),
    contentType: "application/json",
  });
  mockList.mockImplementation(async (opts: { prefix?: string }) => {
    if (opts.prefix === `whiteboard-checkpoints/${sessionId}/`) {
      return { blobs: [], hasMore: false };
    }
    return { blobs: [], hasMore: false };
  });
}

async function advanceGrace(jobId: string) {
  await db.erasureJob.update({
    where: { id: jobId },
    data: { purgeEligibleAt: new Date(Date.now() - 60_000) },
  });
}

function makeEndSessionSegment(sessionId: string): EndSessionSegment {
  return {
    blobUrl: `https://abc.blob.vercel-storage.com/wb-audio/${sessionId}-late-seg.webm`,
    mimeType: "audio/webm",
    sizeBytes: 2048,
    audioStartedAtMs: 1_700_000_000_000,
    streamId: "tutor:mic",
    segmentId: `seg-late-${sessionId}`,
  };
}

async function wireActiveSessionForEnd(
  fixture: Pick<FullFixture, "tutor" | "student" | "session" | "eventsBlobUrl">
) {
  await db.whiteboardSession.update({
    where: { id: fixture.session.id },
    data: {
      sessionPhase: "ACTIVE",
      startedAt: new Date(Date.now() - 60_000),
      endedAt: null,
    },
  });

  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: fixture.session.id,
    adminUserId: fixture.tutor.id,
    studentId: fixture.student.id,
    consentAcknowledged: true,
    eventsBlobUrl: fixture.eventsBlobUrl,
    endedAt: null,
  });
}

// ---------------------------------------------------------------------------
// 1. Happy path — request → tombstone → grace → purge → guards + billing
// ---------------------------------------------------------------------------

describe("E8 lifecycle — per-learner happy path", () => {
  it("runs request → immediate tombstone → grace gate → purge → 404 guards; billing preserved", async () => {
    const fixture = await createFullErasureFixture({
      learnerDisplayName: "Alice Lifecycle",
    });
    setupBlobMocks(fixture.session.id);

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Alice Lifecycle"
    );

    const jobAfterRequest = await db.erasureJob.findUnique({ where: { id: jobId } });
    expect(jobAfterRequest!.status).toBe("requested");
    expect(jobAfterRequest!.purgeEligibleAt.getTime()).toBeGreaterThan(Date.now());

    const lpRow = await db.learnerProfile.findUnique({ where: { id: fixture.lp.id } });
    expect(lpRow!.tombstonedAt).not.toBeNull();
    expect(lpRow!.displayName).toBe("Deleted learner");
    expect(
      await db.learnerCredential.count({ where: { learnerProfileId: fixture.lp.id } })
    ).toBe(0);
    const deviceSessions = await db.learnerDeviceSession.findMany({
      where: { learnerProfileId: fixture.lp.id },
    });
    expect(deviceSessions.length).toBeGreaterThan(0);
    expect(deviceSessions.every((s) => s.revokedAt != null)).toBe(true);

    const graceBlocked = await processErasureJob(jobId);
    expect(graceBlocked.status).toBe("requested");
    expect(mockDeleteBlob).not.toHaveBeenCalled();

    expect(await isStudentErased(fixture.student.id)).toBe(false);
    await assertStudentNotErased(fixture.student.id);
    expect(await shouldShortCircuitEndSessionForErasure(fixture.student.id)).toBe(
      true
    );

    await advanceGrace(jobId);
    const completed = await processErasureJob(jobId);
    expect(completed.status).toBe("completed");
    expect(mockDeleteBlob).toHaveBeenCalled();

    expect(await isStudentErased(fixture.student.id)).toBe(true);
    await expect(assertStudentNotErased(fixture.student.id)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
    expect(notFound).toHaveBeenCalled();

    const apiRes = await assertStudentNotErasedApi(fixture.student.id);
    expect(apiRes!.status).toBe(404);

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.name).toBe(DELETED_LEARNER_NAME);
    expect(student!.parentEmail).toBeNull();
    expect(student!.erasedAt).not.toBeNull();

    const note = await db.sessionNote.findUnique({ where: { id: fixture.note.id } });
    expect(note!.topics).toBe("");
    expect(note!.topics).not.toContain("Alice");

    const session = await db.whiteboardSession.findUnique({
      where: { id: fixture.session.id },
    });
    expect(session!.activeMs).toBe(42_000);
    expect(session!.durationSeconds).toBe(120);

    const costEvents = await db.costEvent.findMany({
      where: { whiteboardSessionId: fixture.session.id },
    });
    expect(costEvents).toHaveLength(1);

    const consentSnapshots = await db.sessionConsentSnapshot.count({
      where: { whiteboardSessionId: fixture.session.id },
    });
    expect(consentSnapshots).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Full-family path
// ---------------------------------------------------------------------------

describe("E8 lifecycle — full-family erasure", () => {
  it("tombstones AH + all child LPs and purges every family student", async () => {
    const tutor = await createTutor();
    const familyId = `fam_${uniq()}`;
    const ah = await createAccountHolder({
      displayName: "Full Family Parent",
      familyId,
    });
    const lp1 = await createLearnerProfile(ah.id, { displayName: "Child One" });
    const lp2 = await createLearnerProfile(ah.id, { displayName: "Child Two" });
    const student1 = await createStudent(tutor.id, lp1.id, { name: "Kid One" });
    const student2 = await createStudent(tutor.id, lp2.id, { name: "Kid Two" });

    await createAccountHolderSession(ah.id);

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "account_holder", accountHolderId: ah.id },
      "Full Family Parent"
    );

    const job = await db.erasureJob.findUnique({ where: { id: jobId } });
    expect(job!.scopeKind).toBe("account_holder");
    expect(job!.scopeId).toBe(ah.id);

    const updatedAh = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(updatedAh!.tombstonedAt).not.toBeNull();

    for (const lpId of [lp1.id, lp2.id]) {
      const lp = await db.learnerProfile.findUnique({ where: { id: lpId } });
      expect(lp!.tombstonedAt).not.toBeNull();
    }

    const scope = await resolveErasureScopeStudents({
      kind: "account_holder",
      id: ah.id,
    });
    expect(scope.studentIds.sort()).toEqual([student1.id, student2.id].sort());

    await advanceGrace(jobId);
    mockList.mockResolvedValue({ blobs: [], hasMore: false });
    const result = await processErasureJob(jobId);
    expect(result.status).toBe("completed");

    for (const studentId of [student1.id, student2.id]) {
      const row = await db.student.findUnique({ where: { id: studentId } });
      expect(row!.erasedAt).not.toBeNull();
      expect(row!.name).toBe(DELETED_LEARNER_NAME);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Cancel during requested
// ---------------------------------------------------------------------------

describe("E8 lifecycle — cancel during grace", () => {
  it("cancels job; tombstone remains; erasedAt never set; content not 404", async () => {
    const fixture = await createFullErasureFixture({
      learnerDisplayName: "Cancel Child",
    });

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Cancel Child"
    );

    const lpBefore = await db.learnerProfile.findUnique({
      where: { id: fixture.lp.id },
    });
    expect(lpBefore!.tombstonedAt).not.toBeNull();

    const canceled = await cancelErasureJob(jobId);
    expect(canceled.status).toBe("canceled");

    await advanceGrace(jobId);
    const afterCancel = await processErasureJob(jobId);
    expect(afterCancel.status).toBe("canceled");
    expect(mockDeleteBlob).not.toHaveBeenCalled();

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.erasedAt).toBeNull();
    expect(student!.name).toBe(fixture.originalPii.studentName);

    await assertStudentNotErased(fixture.student.id);

    const lpAfter = await db.learnerProfile.findUnique({
      where: { id: fixture.lp.id },
    });
    expect(lpAfter!.tombstonedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. B-8 concurrent requests
// ---------------------------------------------------------------------------

describe("E8 lifecycle — B-8 concurrent duplicate requests", () => {
  it("two concurrent requests for the same scope return one active job", async () => {
    const ah = await createAccountHolder({ displayName: "Race Parent" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Race Child" });

    const [first, second] = await Promise.all([
      requestErasureByAdmin(
        ADMIN_ID,
        { kind: "learner_profile", learnerProfileId: lp.id },
        "Race Child"
      ),
      requestErasureByAdmin(
        ADMIN_ID,
        { kind: "learner_profile", learnerProfileId: lp.id },
        "DELETE"
      ),
    ]);

    expect(second.jobId).toBe(first.jobId);

    const jobs = await db.erasureJob.findMany({
      where: { scopeKind: "learner_profile", scopeId: lp.id },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("requested");
  });
});

// ---------------------------------------------------------------------------
// 5. H-2 straggler purge + end-session short-circuit
// ---------------------------------------------------------------------------

describe("E8 lifecycle — H-2 straggler and end-session short-circuit", () => {
  it("purges a straggler blob via H-2 second pass before DB scrub deletes its row", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const stragglerUrl = `https://blob.example.com/sessions/${fixture.student.id}/${uniq()}-straggler.webm`;

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      fixture.lp.displayName
    );

    await db.erasureJob.update({
      where: { id: jobId },
      data: {
        status: "db_scrubbing",
        blobsDeletedJson: [
          fixture.eventsBlobUrl,
          fixture.snapshotBlobUrl,
          fixture.chunkBlobUrl,
        ],
      },
    });

    await db.sessionRecording.create({
      data: {
        adminUserId: fixture.tutor.id,
        studentId: fixture.student.id,
        noteId: fixture.note.id,
        whiteboardSessionId: fixture.session.id,
        blobUrl: stragglerUrl,
        mimeType: "audio/webm",
        sizeBytes: 1024,
        transcript: "Late straggler transcript",
      },
    });

    const rowExistedAtH2Delete = new Map<string, boolean>();
    mockDeleteBlob.mockImplementation(async (url: string) => {
      if (url === stragglerUrl) {
        const count = await db.sessionRecording.count({
          where: { studentId: fixture.student.id, blobUrl: url },
        });
        rowExistedAtH2Delete.set(url, count > 0);
      }
    });

    const result = await processErasureJob(jobId);
    expect(result.status).toBe("completed");
    expect(mockDeleteBlob).toHaveBeenCalledWith(stragglerUrl);
    expect(rowExistedAtH2Delete.get(stragglerUrl)).toBe(true);
    expect(
      await db.sessionRecording.count({ where: { studentId: fixture.student.id } })
    ).toBe(0);
  });

  it("endWhiteboardSession short-circuits segment registration during active erasure job", async () => {
    const fixture = await createFullErasureFixture({
      learnerDisplayName: "Short Circuit Child",
    });

    await wireActiveSessionForEnd(fixture);

    const recordingsBefore = await db.sessionRecording.count({
      where: { whiteboardSessionId: fixture.session.id },
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Short Circuit Child"
    );

    expect(await shouldShortCircuitEndSessionForErasure(fixture.student.id)).toBe(
      true
    );

    const finalEventsUrl = `https://abc.blob.vercel-storage.com/events/${uniq()}-final.json`;
    const segment = makeEndSessionSegment(fixture.session.id);

    const result = await endWhiteboardSession(fixture.session.id, finalEventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(0);

    const recordingsAfter = await db.sessionRecording.count({
      where: { whiteboardSessionId: fixture.session.id },
    });
    expect(recordingsAfter).toBe(recordingsBefore);

    const session = await db.whiteboardSession.findUnique({
      where: { id: fixture.session.id },
    });
    expect(session!.endedAt).not.toBeNull();
    expect(session!.eventsBlobUrl).toBe(fixture.eventsBlobUrl);
  });
});
