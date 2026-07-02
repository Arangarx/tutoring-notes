import { PrismaClient } from "@prisma/client";

import { hashLearnerPin } from "@/lib/account-holder-auth";
import { cancelErasureJob } from "@/lib/erasure/process-erasure-job";
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
