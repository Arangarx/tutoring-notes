import { PrismaClient } from "@prisma/client";

import { hashLearnerPin } from "@/lib/account-holder-auth";
import {
  cancelErasureJob,
  processErasureJob,
} from "@/lib/erasure/process-erasure-job";
import { requestErasureByAdmin } from "@/lib/erasure/request-erasure-by-admin";
import { generateShareToken } from "@/lib/security";
import { seedTestAdmin } from "../../visual/helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

import { seedTestAdminWithRole } from "./identity.helpers";

let indexEnsured = false;

export async function ensureErasureJobActiveScopeIndex(): Promise<void> {
  if (indexEnsured) return;
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "erasure_job_active_scope"
        ON "ErasureJob"("scopeKind", "scopeId")
        WHERE "status" NOT IN ('completed', 'failed', 'canceled')
    `);
    indexEnsured = true;
  } finally {
    await prisma.$disconnect();
  }
}

function uniq(prefix = "pw-ers") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export type ErasureFamilyFixture = {
  adminUserId: string;
  erasureAdminUserId: string;
  accountHolderId: string;
  learnerProfileId: string;
  studentId: string;
  learnerDisplayName: string;
};

/**
 * Fresh family + tutor-linked student for per-learner erasure tests.
 * Tutor defaults to Playwright TEST_ADMIN (tutor storageState).
 */
export async function seedErasureFamilyFixture(opts?: {
  tutorAdminUserId?: string;
  learnerDisplayName?: string;
}): Promise<ErasureFamilyFixture> {
  await ensureErasureJobActiveScopeIndex();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const learnerDisplayName = opts?.learnerDisplayName ?? `E2E Erasure Child ${uniq()}`;

  try {
    const tutorAdminUserId = opts?.tutorAdminUserId ?? (await seedTestAdmin());
    const erasureAdminUserId = await seedTestAdminWithRole("ADMIN");

    const ah = await prisma.accountHolder.create({
      data: {
        email: `${uniq("ah")}@test.local`,
        emailVerifiedAt: new Date(),
        familyId: `fam_${uniq()}`,
        displayName: `Parent ${uniq()}`,
      },
      select: { id: true },
    });

    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: learnerDisplayName,
        accessMode: "child_pin_required",
        isSelfLearner: false,
      },
      select: { id: true },
    });

    const student = await prisma.student.create({
      data: {
        name: learnerDisplayName,
        adminUserId: tutorAdminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });

    await prisma.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutorAdminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
      },
    });

    await prisma.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: ah.id,
        username: `kid_${uniq()}`,
        secretHash: await hashLearnerPin("123456"),
      },
    });

    return {
      adminUserId: tutorAdminUserId,
      erasureAdminUserId,
      accountHolderId: ah.id,
      learnerProfileId: profile.id,
      studentId: student.id,
      learnerDisplayName,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export type ShareErasureFixture = ErasureFamilyFixture & {
  shareToken: string;
  sessionId: string;
  recordingId: string;
};

/** Vercel-shaped URLs so purge `deleteBlob` can swallow 404 in the Playwright harness. */
function purgeSafeBlobUrl(suffix: string): string {
  return `https://e2e-erasure-purge.blob.vercel-storage.com/${uniq()}-${suffix}`;
}

export type PostGracePurgeFixture = ShareErasureFixture & {
  noteId: string;
  originalTopics: string;
  originalStudentName: string;
};

/** Share-link + ended whiteboard session + recording for denial/restore e2e. */
export async function seedShareErasureFixture(): Promise<ShareErasureFixture> {
  await ensureErasureJobActiveScopeIndex();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const base = await seedErasureFamilyFixture({
    learnerDisplayName: `Share ER Learner ${uniq()}`,
  });

  try {
    const shareToken = generateShareToken();
    await prisma.shareLink.create({
      data: { studentId: base.studentId, token: shareToken },
    });

    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: base.adminUserId,
        studentId: base.studentId,
        consentAcknowledged: true,
        // Local dev-server URLs so public-* routes return 200 without Vercel Blob.
        eventsBlobUrl: "http://127.0.0.1:3100/api/setup-required",
        snapshotBlobUrl: "http://127.0.0.1:3100/api/setup-required",
        eventsSchemaVersion: 1,
        endedAt: new Date("2026-06-01T18:00:00Z"),
      },
      select: { id: true },
    });

    const note = await prisma.sessionNote.create({
      data: {
        studentId: base.studentId,
        date: new Date("2026-06-01T00:00:00Z"),
        topics: "Share topics",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
        shareRecordingInEmail: true,
      },
      select: { id: true },
    });

    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId: base.adminUserId,
        studentId: base.studentId,
        noteId: note.id,
        whiteboardSessionId: session.id,
        blobUrl: "http://127.0.0.1:3100/api/setup-required",
        mimeType: "audio/webm",
        sizeBytes: 1024,
      },
      select: { id: true },
    });

    return {
      ...base,
      shareToken,
      sessionId: session.id,
      recordingId: recording.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Share fixture with purge-safe blob URLs + note PII oracle fields for P1-ID-3.
 * Uses vercel-storage-shaped URLs so `processErasureJob` blob phase can 404-skip
 * in the Playwright harness (no real Vercel store required).
 */
export async function seedPostGracePurgeFixture(): Promise<PostGracePurgeFixture> {
  await ensureErasureJobActiveScopeIndex();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const originalTopics = `Secret purge topics ${uniq()}`;
  const base = await seedErasureFamilyFixture({
    learnerDisplayName: `Purge ER Learner ${uniq()}`,
  });

  try {
    const shareToken = generateShareToken();
    await prisma.shareLink.create({
      data: { studentId: base.studentId, token: shareToken },
    });

    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: base.adminUserId,
        studentId: base.studentId,
        consentAcknowledged: true,
        eventsBlobUrl: purgeSafeBlobUrl("events.json"),
        snapshotBlobUrl: purgeSafeBlobUrl("snapshot.png"),
        eventsSchemaVersion: 1,
        endedAt: new Date("2026-06-01T18:00:00Z"),
      },
      select: { id: true },
    });

    const note = await prisma.sessionNote.create({
      data: {
        studentId: base.studentId,
        date: new Date("2026-06-01T00:00:00Z"),
        topics: originalTopics,
        homework: "Secret homework",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
        shareRecordingInEmail: true,
      },
      select: { id: true },
    });

    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId: base.adminUserId,
        studentId: base.studentId,
        noteId: note.id,
        whiteboardSessionId: session.id,
        blobUrl: purgeSafeBlobUrl("recording.webm"),
        mimeType: "audio/webm",
        sizeBytes: 1024,
        transcript: "Secret transcript for purge oracle",
      },
      select: { id: true },
    });

    const studentRow = await prisma.student.findUniqueOrThrow({
      where: { id: base.studentId },
      select: { name: true },
    });

    return {
      ...base,
      shareToken,
      sessionId: session.id,
      recordingId: recording.id,
      noteId: note.id,
      originalTopics,
      originalStudentName: studentRow.name,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function requestErasureForLearner(opts: {
  adminUserId: string;
  learnerProfileId: string;
  confirmPhrase: string;
}): Promise<{ jobId: string }> {
  await ensureErasureJobActiveScopeIndex();
  return requestErasureByAdmin(
    opts.adminUserId,
    { kind: "learner_profile", learnerProfileId: opts.learnerProfileId },
    opts.confirmPhrase
  );
}

export async function cancelErasure(jobId: string): Promise<{ status: string }> {
  const result = await cancelErasureJob(jobId);
  return { status: result.status };
}

/** Test seam: move purge eligibility into the past so the worker may hard-purge. */
export async function advanceErasureGracePastDeadline(jobId: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.erasureJob.update({
      where: { id: jobId },
      data: { purgeEligibleAt: new Date(Date.now() - 60_000) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Test harness: mark enumerated blobs as deleted when Vercel store is unavailable. */
async function markErasureBlobsPurgedForHarness(jobId: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const job = await prisma.erasureJob.findUnique({
      where: { id: jobId },
      select: { blobInventoryJson: true, blobsDeletedJson: true, status: true },
    });
    if (!job || job.status !== "blobs_purging") return;

    const inventory = Array.isArray(job.blobInventoryJson) ? job.blobInventoryJson : [];
    const existing = Array.isArray(job.blobsDeletedJson) ? job.blobsDeletedJson : [];
    const merged = [
      ...new Set([
        ...existing.filter((x): x is string => typeof x === "string" && x.length > 0),
        ...inventory.filter((x): x is string => typeof x === "string" && x.length > 0),
      ]),
    ];

    await prisma.erasureJob.update({
      where: { id: jobId },
      data: { blobsDeletedJson: merged, lastError: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Test harness: clear in-scope blob URL columns so H-2 straggler delete can no-op
 * when the Playwright runner lacks a real Vercel Blob token (jest mocks this path).
 */
async function clearErasureBlobRefsForHarness(jobId: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const job = await prisma.erasureJob.findUnique({
      where: { id: jobId },
      select: { status: true, scopeKind: true, scopeId: true },
    });
    if (!job || job.status !== "db_scrubbing") return;

    let studentIds: string[] = [];
    if (job.scopeKind === "learner_profile") {
      const students = await prisma.student.findMany({
        where: { learnerProfileId: job.scopeId },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    } else {
      const profiles = await prisma.learnerProfile.findMany({
        where: { accountHolderId: job.scopeId },
        select: { id: true },
      });
      const profileIds = profiles.map((p) => p.id);
      if (profileIds.length > 0) {
        const students = await prisma.student.findMany({
          where: { learnerProfileId: { in: profileIds } },
          select: { id: true },
        });
        studentIds = students.map((s) => s.id);
      }
    }

    if (studentIds.length === 0) {
      await prisma.erasureJob.update({
        where: { id: jobId },
        data: { lastError: null },
      });
      return;
    }

    const sessions = await prisma.whiteboardSession.findMany({
      where: { studentId: { in: studentIds } },
      select: { id: true },
    });
    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      await prisma.transcriptChunk.deleteMany({
        where: { sessionId: { in: sessionIds } },
      });
      await prisma.whiteboardSession.updateMany({
        where: { id: { in: sessionIds } },
        data: {
          eventsBlobUrl: "",
          snapshotBlobUrl: null,
          concatBlobUrl: null,
        },
      });
    }

    await prisma.sessionRecording.deleteMany({
      where: { studentId: { in: studentIds } },
    });

    await prisma.erasureJob.update({
      where: { id: jobId },
      data: { lastError: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** On-demand purge worker (same entry point as `scripts/erasure-resume.ts`). */
export async function runErasurePurge(jobId: string): Promise<{ status: string }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    process.env.BLOB_READ_WRITE_TOKEN = "playwright-harness";
  }

  const terminal = new Set(["completed", "canceled", "failed"]);
  let result = await processErasureJob(jobId);
  let attempts = 0;
  while (!terminal.has(result.status) && attempts < 8) {
    if (result.status === "requested") {
      break;
    }
    if (result.status === "blobs_purging") {
      await markErasureBlobsPurgedForHarness(jobId);
    } else if (result.status === "db_scrubbing") {
      await clearErasureBlobRefsForHarness(jobId);
    }
    result = await processErasureJob(jobId);
    attempts += 1;
  }
  return { status: result.status };
}

export type ErasureJobOracle = {
  status: string;
  purgeEligibleAt: Date;
  requestedByPrincipal: string;
  canceledAt: Date | null;
};

export async function readErasureJobOracle(jobId: string): Promise<ErasureJobOracle | null> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return prisma.erasureJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        purgeEligibleAt: true,
        requestedByPrincipal: true,
        canceledAt: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export type LearnerErasureOracle = {
  tombstonedAt: Date | null;
  credentialDisabled: boolean | null;
  studentErasedAt: Date | null;
};

export async function readLearnerErasureOracle(
  learnerProfileId: string,
  studentId: string
): Promise<LearnerErasureOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const [profile, credential, student] = await Promise.all([
      prisma.learnerProfile.findUnique({
        where: { id: learnerProfileId },
        select: { tombstonedAt: true },
      }),
      prisma.learnerCredential.findFirst({
        where: { learnerProfileId },
        select: { disabled: true },
      }),
      prisma.student.findUnique({
        where: { id: studentId },
        select: { erasedAt: true },
      }),
    ]);
    return {
      tombstonedAt: profile?.tombstonedAt ?? null,
      credentialDisabled: credential?.disabled ?? null,
      studentErasedAt: student?.erasedAt ?? null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

const DELETED_LEARNER_NAME = "[Deleted learner]";

export type ContentIntegrityOracle = {
  jobStatus: string;
  studentErasedAt: Date | null;
  studentName: string;
  noteTopics: string;
  recordingCount: number;
  credentialCount: number;
  shareLinkRevokedAt: Date | null;
  sessionEventsBlobUrl: string;
};

/** Independent DB oracle: learner content + erasure job phase before/after purge. */
export async function readContentIntegrityOracle(opts: {
  jobId: string;
  studentId: string;
  learnerProfileId: string;
  noteId: string;
  shareToken: string;
  sessionId: string;
}): Promise<ContentIntegrityOracle> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const [job, student, note, recordingCount, credentialCount, shareLink, session] =
      await Promise.all([
        prisma.erasureJob.findUnique({
          where: { id: opts.jobId },
          select: { status: true },
        }),
        prisma.student.findUnique({
          where: { id: opts.studentId },
          select: { erasedAt: true, name: true },
        }),
        prisma.sessionNote.findUnique({
          where: { id: opts.noteId },
          select: { topics: true },
        }),
        prisma.sessionRecording.count({
          where: { studentId: opts.studentId },
        }),
        prisma.learnerCredential.count({
          where: { learnerProfileId: opts.learnerProfileId },
        }),
        prisma.shareLink.findFirst({
          where: { token: opts.shareToken },
          select: { revokedAt: true },
        }),
        prisma.whiteboardSession.findUnique({
          where: { id: opts.sessionId },
          select: { eventsBlobUrl: true },
        }),
      ]);

    return {
      jobStatus: job?.status ?? "missing",
      studentErasedAt: student?.erasedAt ?? null,
      studentName: student?.name ?? "",
      noteTopics: note?.topics ?? "",
      recordingCount,
      credentialCount,
      shareLinkRevokedAt: shareLink?.revokedAt ?? null,
      sessionEventsBlobUrl: session?.eventsBlobUrl ?? "",
    };
  } finally {
    await prisma.$disconnect();
  }
}

export { DELETED_LEARNER_NAME };
