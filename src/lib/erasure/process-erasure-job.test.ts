/**
 * @jest-environment node
 *
 * E4 erasure orchestrator — unit/integration tests.
 *
 * Coverage:
 *   Grace gate — future purgeEligibleAt blocks blob delete
 *   Full happy path — completed, blobs deleted, content scrubbed
 *   Business data preserved — WhiteboardSession billing + CostEvent
 *   Idempotent retry — double processErasureJob
 *   Crash resume — partial blobsDeletedJson resumes remainder
 *   Cancel — requested-only
 *   No-PII assertion after completion
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 * Blob: mocked — no real Vercel Blob store calls.
 */

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

import { db } from "@/lib/db";
import {
  WB_EVENT_LOG_SCHEMA_VERSION,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  cancelErasureJob,
  processErasureJob,
} from "@/lib/erasure/process-erasure-job";

const DELETED_LEARNER_NAME = "[Deleted learner]";

let uniqueSuffix = 0;
function uniq(prefix = "ers-e4") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
}

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
    },
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

async function createErasureJob(
  scopeKind: "learner_profile" | "account_holder",
  scopeId: string,
  opts?: { purgeEligibleAt?: Date; status?: "requested" | "blobs_purging" | "db_scrubbing" | "completed" | "canceled" | "failed"; blobsDeletedJson?: string[] }
) {
  const now = new Date();
  return db.erasureJob.create({
    data: {
      scopeKind,
      scopeId,
      status: opts?.status ?? "requested",
      requestedByPrincipal: `admin:${uniq("principal")}`,
      purgeEligibleAt: opts?.purgeEligibleAt ?? new Date(now.getTime() - 60_000),
      blobsDeletedJson: opts?.blobsDeletedJson ?? undefined,
    },
  });
}

type FullFixture = {
  tutor: { id: string };
  ah: { id: string };
  lp: { id: string };
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
    tutorNoteContent: string;
  };
};

async function createFullErasureFixture(): Promise<FullFixture> {
  const tutor = await createTutor();
  const ah = await createAccountHolder();
  const lp = await createLearnerProfile(ah.id);
  const student = await createStudent(tutor.id, lp.id, {
    name: "Alice SecretName",
    parentEmail: `secret-parent-${uniq()}@example.com`,
  });

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

  await db.tutorNote.create({
    data: {
      sessionId: session.id,
      status: "done",
      content: "Secret tutor note about Alice",
    },
  });

  await db.sessionParticipant.create({
    data: {
      whiteboardSessionId: session.id,
      learnerProfileId: lp.id,
    },
  });

  await db.whiteboardJoinToken.create({
    data: {
      whiteboardSessionId: session.id,
      token: uniq("join-token"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });

  const shareLink = await db.shareLink.create({
    data: {
      studentId: student.id,
      token: uniq("share"),
    },
  });

  await db.noteView.create({
    data: {
      shareToken: shareLink.token,
      noteId: note.id,
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
    lp,
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
      tutorNoteContent: "Secret tutor note about Alice",
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
  mockDeleteBlob.mockResolvedValue(undefined);
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

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ blobs: [], hasMore: false, cursor: undefined });
  mockDeleteBlob.mockResolvedValue(undefined);
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Grace gate
// ---------------------------------------------------------------------------

describe("processErasureJob — grace gate", () => {
  it("leaves status requested and calls deleteBlob zero times when purgeEligibleAt is in the future", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const futureEligible = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      purgeEligibleAt: futureEligible,
    });

    const result = await processErasureJob(job.id);

    expect(result.status).toBe("requested");
    expect(mockDeleteBlob).not.toHaveBeenCalled();

    const row = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(row!.status).toBe("requested");
  });

  it("advances and purges when purgeEligibleAt is in the past", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      purgeEligibleAt: new Date(Date.now() - 1000),
    });

    const result = await processErasureJob(job.id);

    expect(result.status).toBe("completed");
    expect(mockDeleteBlob).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Full happy path + no-PII (Test 1)
// ---------------------------------------------------------------------------

describe("processErasureJob — happy path", () => {
  it("completes erasure: blobs deleted, content scrubbed, Student.erasedAt set", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id);

    const result = await processErasureJob(job.id);
    expect(result.status).toBe("completed");

    const expectedUrls = [
      fixture.recordingBlobUrl,
      fixture.eventsBlobUrl,
      fixture.snapshotBlobUrl,
      fixture.chunkBlobUrl,
    ];
    for (const url of expectedUrls) {
      expect(mockDeleteBlob).toHaveBeenCalledWith(url);
    }

    const note = await db.sessionNote.findUnique({ where: { id: fixture.note.id } });
    expect(note).not.toBeNull();
    expect(note!.topics).toBe("");
    expect(note!.homework).toBe("");
    expect(note!.assessment).toBe("");
    expect(note!.nextSteps).toBe("");
    expect(note!.linksJson).toBe("[]");

    expect(await db.sessionRecording.count({ where: { studentId: fixture.student.id } })).toBe(0);
    expect(await db.transcriptChunk.count({ where: { sessionId: fixture.session.id } })).toBe(0);
    expect(await db.tutorNote.count({ where: { sessionId: fixture.session.id } })).toBe(0);
    expect(await db.sessionParticipant.count({ where: { whiteboardSessionId: fixture.session.id } })).toBe(0);
    expect(await db.whiteboardJoinToken.count({ where: { whiteboardSessionId: fixture.session.id } })).toBe(0);
    expect(await db.noteView.count({ where: { noteId: fixture.note.id } })).toBe(0);

    const session = await db.whiteboardSession.findUnique({ where: { id: fixture.session.id } });
    expect(session).not.toBeNull();
    expect(session!.eventsBlobUrl).toBe("");
    expect(session!.snapshotBlobUrl).toBeNull();
    expect(session!.activeMs).toBe(42_000);
    expect(session!.durationSeconds).toBe(120);

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.name).toBe(DELETED_LEARNER_NAME);
    expect(student!.parentEmail).toBeNull();
    expect(student!.erasedAt).not.toBeNull();

    const lp = await db.learnerProfile.findUnique({ where: { id: fixture.lp.id } });
    expect(lp!.displayName).toBe("Deleted learner");
    expect(
      await db.learnerCredential.count({ where: { learnerProfileId: fixture.lp.id } })
    ).toBe(0);

    const shareLink = await db.shareLink.findFirst({ where: { studentId: fixture.student.id } });
    expect(shareLink!.revokedAt).not.toBeNull();

    const jobRow = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(jobRow!.status).toBe("completed");
    expect(jobRow!.completedAt).not.toBeNull();
  });

  it("Test 1 — no PII remains in scrubbed fields after completion", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id);
    await processErasureJob(job.id);

    const note = await db.sessionNote.findUnique({ where: { id: fixture.note.id } });
    const fields = [note!.topics, note!.homework, note!.assessment, note!.nextSteps, note!.linksJson];
    for (const field of fields) {
      expect(field).not.toContain("Alice");
      expect(field).not.toContain("Secret");
    }

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.name).not.toContain("Alice");
    expect(student!.name).not.toContain("Secret");
    expect(student!.parentEmail).toBeNull();

    const lp = await db.learnerProfile.findUnique({ where: { id: fixture.lp.id } });
    expect(lp!.displayName).toBe("Deleted learner");
  });
});

// ---------------------------------------------------------------------------
// Business data preserved (Test 3)
// ---------------------------------------------------------------------------

describe("processErasureJob — business data preserved", () => {
  it("keeps WhiteboardSession billing columns and CostEvent rows", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const beforeSession = await db.whiteboardSession.findUnique({
      where: { id: fixture.session.id },
    });

    const job = await createErasureJob("learner_profile", fixture.lp.id);
    await processErasureJob(job.id);

    const afterSession = await db.whiteboardSession.findUnique({
      where: { id: fixture.session.id },
    });
    expect(afterSession).not.toBeNull();
    expect(afterSession!.activeMs).toBe(beforeSession!.activeMs);
    expect(afterSession!.durationSeconds).toBe(beforeSession!.durationSeconds);
    expect(afterSession!.startedAt.getTime()).toBe(beforeSession!.startedAt.getTime());
    expect(afterSession!.bothConnectedAt!.getTime()).toBe(
      beforeSession!.bothConnectedAt!.getTime()
    );
    expect(afterSession!.activatedAt!.getTime()).toBe(
      beforeSession!.activatedAt!.getTime()
    );

    const costEvents = await db.costEvent.findMany({
      where: { whiteboardSessionId: fixture.session.id },
    });
    expect(costEvents.length).toBe(1);

    const consentRecords = await db.consentRecord.count({
      where: { learnerProfileId: fixture.lp.id },
    });
    expect(consentRecords).toBe(1);

    const snapshots = await db.sessionConsentSnapshot.count({
      where: { whiteboardSessionId: fixture.session.id },
    });
    expect(snapshots).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Idempotent retry (Test 5)
// ---------------------------------------------------------------------------

describe("processErasureJob — idempotent retry", () => {
  it("running twice on the same job completes without error or double-delete side effects", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id);

    const first = await processErasureJob(job.id);
    expect(first.status).toBe("completed");
    const deleteCountAfterFirst = mockDeleteBlob.mock.calls.length;

    const second = await processErasureJob(job.id);
    expect(second.status).toBe("completed");
    expect(mockDeleteBlob.mock.calls.length).toBe(deleteCountAfterFirst);

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.erasedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Crash resume (Test 6)
// ---------------------------------------------------------------------------

describe("processErasureJob — crash resume", () => {
  it("resumes blobs_purging from partial blobsDeletedJson and completes", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      status: "blobs_purging",
      blobsDeletedJson: [fixture.recordingBlobUrl, fixture.eventsBlobUrl],
    });

    const result = await processErasureJob(job.id);
    expect(result.status).toBe("completed");

    expect(mockDeleteBlob).toHaveBeenCalledWith(fixture.snapshotBlobUrl);
    expect(mockDeleteBlob).toHaveBeenCalledWith(fixture.chunkBlobUrl);

    const callCount = (url: string) =>
      mockDeleteBlob.mock.calls.filter((c) => c[0] === url).length;
    // Inventory-1 URLs already in blobsDeletedJson — skipped in blobs_purging resume,
    // then purged once in H-2 second pass (row still present for enumeration).
    expect(callCount(fixture.recordingBlobUrl)).toBe(1);
    expect(callCount(fixture.eventsBlobUrl)).toBe(1);
    // Remaining inventory-1 URLs deleted in blobs_purging resume, then idempotently in H-2.
    expect(callCount(fixture.snapshotBlobUrl)).toBe(2);
    expect(callCount(fixture.chunkBlobUrl)).toBe(2);

    const student = await db.student.findUnique({ where: { id: fixture.student.id } });
    expect(student!.erasedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// H-2 second pass ordering (in-flight upload straggler)
// ---------------------------------------------------------------------------

describe("processErasureJob — H-2 straggler purge before DB scrub", () => {
  it("purges in-flight recording blob via H-2 second pass while DB row still exists", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    // Simulate blobs_purging completed for inventory-1 but missed an in-flight upload.
    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      status: "db_scrubbing",
      blobsDeletedJson: [
        fixture.eventsBlobUrl,
        fixture.snapshotBlobUrl,
        fixture.chunkBlobUrl,
      ],
    });

    const rowExistedAtH2Delete = new Map<string, boolean>();
    mockDeleteBlob.mockImplementation(async (url: string) => {
      if (url === fixture.recordingBlobUrl) {
        const count = await db.sessionRecording.count({
          where: { studentId: fixture.student.id, blobUrl: url },
        });
        rowExistedAtH2Delete.set(url, count > 0);
      }
    });

    const result = await processErasureJob(job.id);
    expect(result.status).toBe("completed");

    expect(mockDeleteBlob).toHaveBeenCalledWith(fixture.recordingBlobUrl);
    expect(rowExistedAtH2Delete.get(fixture.recordingBlobUrl)).toBe(true);

    expect(
      await db.sessionRecording.count({ where: { studentId: fixture.student.id } })
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

describe("cancelErasureJob", () => {
  it("cancels a requested job during grace window and restores tombstone + credentials", async () => {
    const fixture = await createFullErasureFixture();
    await db.learnerCredential.create({
      data: {
        learnerProfileId: fixture.lp.id,
        accountHolderId: fixture.ah.id,
        username: `cancel_${uniq()}`,
        secretHash: "not-used",
        disabled: true,
      },
    });
    await db.learnerProfile.update({
      where: { id: fixture.lp.id },
      data: { tombstonedAt: new Date() },
    });

    const futureEligible = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      purgeEligibleAt: futureEligible,
    });

    const result = await cancelErasureJob(job.id);
    expect(result.status).toBe("canceled");

    const row = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(row!.status).toBe("canceled");
    expect(row!.canceledAt).not.toBeNull();

    const lp = await db.learnerProfile.findUnique({ where: { id: fixture.lp.id } });
    expect(lp!.tombstonedAt).toBeNull();

    const cred = await db.learnerCredential.findFirst({
      where: { learnerProfileId: fixture.lp.id },
    });
    expect(cred!.disabled).toBe(false);
  });

  it("rejects cancel for blobs_purging job", async () => {
    const fixture = await createFullErasureFixture();
    const job = await createErasureJob("learner_profile", fixture.lp.id, {
      status: "blobs_purging",
    });

    await expect(cancelErasureJob(job.id)).rejects.toThrow(/Cannot cancel/);

    const row = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(row!.status).toBe("blobs_purging");
  });

  it("rejects cancel for completed job", async () => {
    const fixture = await createFullErasureFixture();
    setupBlobMocks(fixture.session.id);

    const job = await createErasureJob("learner_profile", fixture.lp.id);
    await processErasureJob(job.id);

    await expect(cancelErasureJob(job.id)).rejects.toThrow(/Cannot cancel/);

    const row = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(row!.status).toBe("completed");
  });
});
