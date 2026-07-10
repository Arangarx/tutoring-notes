import { type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/**
 * Test admin credentials and seed helpers for Playwright tests.
 *
 * Playwright globalSetup + webServer force local Docker Postgres; the host
 * guard below aborts if DATABASE_URL ever points at a non-local host.
 *
 * Credentials are fixed so tests are reproducible and don't rely on env vars.
 * Change them here if the test DB is reset and you need a fresh admin.
 */
export const TEST_ADMIN = {
  email: "playwright@test.local",
  password: "PlaywrightTest123!",
  displayName: "Playwright Test Admin",
};

/**
 * Test learner credentials for the authenticated /join/ path (workstream 1).
 *
 * familyId:  `pwfamily`  — globally unique family identifier (username@familyId login handle).
 * username:  `pwstudent` — child username within the family.
 * pin:       `Pw!Lab456`  — learner PIN (bcrypt-hashed in DB).
 * handle:    `pwstudent@pwfamily` — full login handle passed to /api/auth/learner/login.
 *
 * The AccountHolder (parent) row uses a separate test email so it does not
 * collide with TEST_ADMIN.
 */
export const TEST_LEARNER = {
  parentEmail: "playwright-parent@test.local",
  familyId: "pwfamily",
  username: "pwstudent",
  pin: "Pw!Lab456",
  displayName: "Playwright Learner",
  /** Full login handle for /api/auth/learner/login body. */
  get handle() {
    return `${this.username}@${this.familyId}`;
  },
} as const;

/**
 * Ensure the test admin user exists in the test database.
 * Idempotent — safe to call at the start of every test or in global setup.
 */
export async function seedTestAdmin(): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
    const user = await prisma.adminUser.upsert({
      where: { email: TEST_ADMIN.email },
      create: {
        email: TEST_ADMIN.email,
        passwordHash: hash,
        displayName: TEST_ADMIN.displayName,
        approvalStatus: "APPROVED",
      },
      update: {
        approvalStatus: "APPROVED",
        // Harness admin should always reflect current app billing defaults (null → DEFAULT_*).
        defaultRoundingMode: null,
        defaultRoundingIncrementMin: null,
      },
    });
    return user.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seed a student + one session note for the test admin.
 * Returns { studentId, noteId } for use in test URLs.
 * Idempotent by student name within the same admin user.
 */
export async function seedTestStudent(adminUserId: string): Promise<{
  studentId: string;
  noteId: string;
  shareToken: string;
}> {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.student.findFirst({
      where: { adminUserId, name: "Playwright Student" },
      include: { notes: true, shareLinks: true },
    });
    if (existing && existing.notes.length > 0 && existing.shareLinks.length > 0) {
      return {
        studentId: existing.id,
        noteId: existing.notes[0].id,
        shareToken: existing.shareLinks[0].token,
      };
    }

    const student = existing ?? await prisma.student.create({
      data: { name: "Playwright Student", adminUserId, parentEmail: "parent@test.local" },
    });

    const note = existing?.notes[0] ?? await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-01-15"),
        topics: "Quadratic equations and factoring",
        homework: "Complete worksheet pages 4-6",
        nextSteps: "Review negative coefficient problems",
        status: "READY",
      },
    });

    const shareLink = existing?.shareLinks[0] ?? await prisma.shareLink.create({
      data: {
        studentId: student.id,
        token: `playwright-test-token-${student.id.slice(0, 8)}`,
      },
    });

    return { studentId: student.id, noteId: note.id, shareToken: shareLink.token };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Insert an open whiteboard session row for E2E (Excalidraw mount smoke).
 * Avoids Vercel Blob — uses a placeholder `eventsBlobUrl` (not fetched on workspace mount).
 *
 * Defaults to ACTIVE phase so existing tutor-only tests are unaffected by the
 * new waiting-room overlay (workstream 1). Pass `sessionPhase: 'PENDING'` for
 * tests that exercise the waiting room / Start flow.
 */
export async function seedOpenWhiteboardSession(args: {
  adminUserId: string;
  studentId: string;
  /** @default 'ACTIVE' */
  sessionPhase?: "PENDING" | "ACTIVE";
  /** @default 'LIVE' */
  sessionMode?: "LIVE" | "IN_PERSON";
}): Promise<string> {
  const prisma = new PrismaClient();
  const phase = args.sessionPhase ?? "ACTIVE";
  const mode = args.sessionMode ?? "LIVE";
  try {
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: args.adminUserId,
        studentId: args.studentId,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
        sessionPhase: phase,
        sessionMode: mode,
        // activatedAt mirrors what startWhiteboardSession writes for ACTIVE sessions.
        activatedAt: phase === "ACTIVE" ? new Date() : undefined,
      },
      select: { id: true },
    });
    return session.id;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Seed the test learner identity (AccountHolder + LearnerProfile + LearnerCredential)
 * and link it to the given student row.
 *
 * Idempotent — safe to call at global setup time and per-test.
 * Returns the learnerProfileId so callers can create SessionParticipant rows.
 *
 * Uses TEST_LEARNER constants so credentials are stable across test runs.
 */
export async function seedTestLearner(
  _adminUserId: string,
  studentId: string
): Promise<{ learnerProfileId: string; accountHolderId: string }> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const pinHash = await bcrypt.hash(TEST_LEARNER.pin, 10);

    // 1. AccountHolder (parent) — upsert by unique email
    const accountHolder = await prisma.accountHolder.upsert({
      where: { email: TEST_LEARNER.parentEmail },
      create: {
        email: TEST_LEARNER.parentEmail,
        displayName: "Playwright Parent",
        familyId: TEST_LEARNER.familyId,
        // emailVerifiedAt must be non-null for the login guard.
        emailVerifiedAt: new Date("2026-01-01"),
      },
      update: {
        familyId: TEST_LEARNER.familyId,
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });

    // 2. LearnerProfile — find existing via credential or create fresh
    const existingCred = await prisma.learnerCredential.findUnique({
      where: {
        accountHolderId_username: {
          accountHolderId: accountHolder.id,
          username: TEST_LEARNER.username,
        },
      },
      select: { learnerProfileId: true },
    });

    let learnerProfileId: string;
    if (existingCred) {
      learnerProfileId = existingCred.learnerProfileId;
      // Keep credential PIN hash current (idempotent update)
      await prisma.learnerCredential.update({
        where: {
          accountHolderId_username: {
            accountHolderId: accountHolder.id,
            username: TEST_LEARNER.username,
          },
        },
        data: { secretHash: pinHash },
      });
    } else {
      // Create LearnerProfile then Credential
      const profile = await prisma.learnerProfile.create({
        data: {
          accountHolderId: accountHolder.id,
          displayName: TEST_LEARNER.displayName,
          accessMode: "child_pin_required",
        },
        select: { id: true },
      });
      learnerProfileId = profile.id;
      await prisma.learnerCredential.create({
        data: {
          learnerProfileId,
          accountHolderId: accountHolder.id,
          username: TEST_LEARNER.username,
          secretHash: pinHash,
        },
      });
    }

    // 3. Link student row to the learner profile (idempotent)
    await prisma.student.update({
      where: { id: studentId },
      data: { learnerProfileId },
    });

    return { learnerProfileId, accountHolderId: accountHolder.id };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Test self-learner credentials — an adult who IS the account holder.
 *
 * [WB-JOIN-ADULT-LEARNER]: used by tests that exercise account-holder-session
 * join access (the authenticated adult self-learner path).
 *
 * Separate email + password so it can authenticate via /api/auth/account-holder/login.
 * LearnerProfile is seeded with isSelfLearner=true + accessMode=account_holder_session.
 */
export const TEST_SELF_LEARNER = {
  email: "playwright-self-learner@test.local",
  password: "SelfLearnerPw!789",
  displayName: "Playwright Self-Learner",
} as const;

/**
 * Seed the test self-learner identity (AccountHolder + LearnerProfile with
 * isSelfLearner=true) and link it to the given student row.
 *
 * Idempotent — safe to call at global setup time and per-test.
 * Returns { learnerProfileId, accountHolderId } for participant row creation.
 *
 * [WB-JOIN-ADULT-LEARNER]
 */
export async function seedSelfLearner(
  studentId: string
): Promise<{ learnerProfileId: string; accountHolderId: string }> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TEST_SELF_LEARNER.password, 10);

    // AccountHolder — upsert by unique email.
    const accountHolder = await prisma.accountHolder.upsert({
      where: { email: TEST_SELF_LEARNER.email },
      create: {
        email: TEST_SELF_LEARNER.email,
        displayName: TEST_SELF_LEARNER.displayName,
        passwordHash,
        emailVerifiedAt: new Date("2026-01-01"),
        isSelfLearner: true,
      },
      update: {
        passwordHash,
        emailVerifiedAt: new Date("2026-01-01"),
        isSelfLearner: true,
      },
      select: { id: true },
    });

    // LearnerProfile — find via accountHolderId unique constraint or create.
    const existingProfile = await prisma.learnerProfile.findFirst({
      where: { accountHolderId: accountHolder.id, isSelfLearner: true },
      select: { id: true },
    });

    let learnerProfileId: string;
    if (existingProfile) {
      learnerProfileId = existingProfile.id;
      // Keep isSelfLearner flag + accessMode current (idempotent).
      await prisma.learnerProfile.update({
        where: { id: learnerProfileId },
        data: { isSelfLearner: true, accessMode: "account_holder_session", tombstonedAt: null },
      });
    } else {
      const profile = await prisma.learnerProfile.create({
        data: {
          accountHolderId: accountHolder.id,
          displayName: TEST_SELF_LEARNER.displayName,
          accessMode: "account_holder_session",
          isSelfLearner: true,
        },
        select: { id: true },
      });
      learnerProfileId = profile.id;
    }

    // Link student to the self-learner profile (idempotent).
    await prisma.student.update({
      where: { id: studentId },
      data: { learnerProfileId },
    });

    return { learnerProfileId, accountHolderId: accountHolder.id };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Log in as the test admin via the login form.
 * Navigates to /login, fills credentials, submits, waits for redirect to /admin.
 */
export async function loginAsTestAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(TEST_ADMIN.email);
  await page.getByLabel(/password/i).fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/admin") &&
      !url.pathname.startsWith("/admin/settings/2fa") &&
      url.pathname !== "/admin/pending-approval",
    { timeout: 15_000 }
  );
}
