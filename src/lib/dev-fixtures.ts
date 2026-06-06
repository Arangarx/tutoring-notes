/**
 * Dev-tools fixture helpers (feat/admin-dev-dashboard).
 *
 * Creates and destroys test fixtures for local / preview environments.
 * PRODUCTION-INERT: all exports call isDevToolsEnabled() and throw if
 * VERCEL_ENV === 'production'.
 *
 * Safety invariant: the delete path ALWAYS includes `isTestFixture: true`
 * in every WHERE clause. It is physically incapable of deleting a real
 * (non-fixture) user even if its id is passed directly.
 *
 * Log prefix: dvt (registered in AGENTS.md § Conventions)
 *   [dvt] dvt=<fixtureId|id> action=<action> ...
 */

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  generateRawToken,
  hashToken,
  CLAIM_INVITE_TTL_MS,
} from "@/lib/crypto/session-tokens";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { getPublicBaseUrl } from "@/lib/public-url";

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

/**
 * Returns true in local dev and Vercel PREVIEW environments.
 * Returns false (and the entire dev-tools surface returns 404) in PRODUCTION.
 *
 * Documented in docs/PLATFORM-ASSUMPTIONS.md §10.9.
 */
export function isDevToolsEnabled(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

/**
 * Throw if called in production. Call this at the top of every exported
 * fixture function so the guard is in the business logic, not just the UI.
 */
function assertDevToolsEnabled(): void {
  if (!isDevToolsEnabled()) {
    throw new Error("[dvt] dev-tools are disabled in production");
  }
}

// ---------------------------------------------------------------------------
// Known fixture credentials (deterministic, easy for Andrew to copy-paste)
// ---------------------------------------------------------------------------

export const FIXTURE_TUTOR_PASSWORD = "DevFixture!Tutor#1";
export const FIXTURE_PARENT_PASSWORD = "DevFixture!Parent#1";
export const FIXTURE_CHILD_PIN = "12345678";

// ---------------------------------------------------------------------------
// Types returned to the dashboard UI
// ---------------------------------------------------------------------------

export type TutorFixture = {
  type: "tutor";
  adminUserId: string;
  email: string;
  password: string;
};

export type FamilyFixture = {
  type: "family";
  accountHolderId: string;
  parentEmail: string;
  parentPassword: string;
  familyId: string;
  learnerProfileId: string;
  learnerDisplayName: string;
  studentId: string;
  studentName: string;
  /** Raw (unhashed) PIN shown to the developer for the learner login. */
  childPin: string;
  /** Raw claim token (use /claim/<token> URL). */
  claimToken: string;
  claimLink: string;
  /** The tutor AdminUser id this student is attached to. */
  tutorAdminUserId: string;
};

export type DevFixture = TutorFixture | FamilyFixture;

// ---------------------------------------------------------------------------
// Create fixtures
// ---------------------------------------------------------------------------

/**
 * Create a throwaway tutor/operator fixture account.
 *
 * The resulting AdminUser has:
 *   isTestAccount = true  (enables impersonation via existing SEC-1 flow)
 *   isTestFixture = true  (marks it as dev-tools-deletable)
 *   role = TUTOR
 *
 * Returns the tutor fixture, including the plaintext password for display.
 */
export async function createTutorFixture(): Promise<TutorFixture> {
  assertDevToolsEnabled();

  const suffix = Date.now().toString(36);
  const email = `fixture-tutor-${suffix}@dev.local`;
  const password = FIXTURE_TUTOR_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.adminUser.create({
    data: {
      email,
      passwordHash,
      displayName: `Fixture Tutor (${suffix})`,
      isTestAccount: true,
      isTestFixture: true,
      role: "TUTOR",
    },
    select: { id: true, email: true },
  });

  console.log(
    `[dvt] dvt=${user.id} action=tutor_fixture_created adminUserId=${user.id} email=${email}`
  );

  return { type: "tutor", adminUserId: user.id, email: user.email, password };
}

/**
 * Create a full fixture family:
 *   - AccountHolder (parent, email pre-verified, known password)
 *   - LearnerProfile (child)
 *   - LearnerCredential (PIN)
 *   - Student linked to the given tutor
 *   - StudentClaimInvite with a raw claim token
 *
 * All rows are marked isTestFixture=true.
 */
export async function createFamilyFixture(tutorAdminUserId: string): Promise<FamilyFixture> {
  assertDevToolsEnabled();

  const suffix = Date.now().toString(36);
  const parentEmail = `fixture-parent-${suffix}@dev.local`;
  const parentPassword = FIXTURE_PARENT_PASSWORD;
  const childPin = FIXTURE_CHILD_PIN;
  const learnerUsername = `child${suffix}`;
  const familyId = `devfamily${suffix}`;

  const passwordHash = await hashAccountHolderPassword(parentPassword);
  const pinHash = await hashLearnerPin(childPin);

  // Verify the tutor exists and is a test fixture (we won't create students for real tutors
  // unless this is called from our own create-tutor-and-family flow).
  const tutor = await db.adminUser.findUnique({
    where: { id: tutorAdminUserId },
    select: { id: true, email: true },
  });
  if (!tutor) {
    throw new Error(`[dvt] tutor adminUserId=${tutorAdminUserId} not found`);
  }

  // Use a transaction so the whole family lands atomically.
  const result = await db.$transaction(async (tx) => {
    // AccountHolder (parent) — emailVerifiedAt set so login is immediately available
    const accountHolder = await tx.accountHolder.create({
      data: {
        email: parentEmail,
        passwordHash,
        displayName: `Fixture Parent (${suffix})`,
        emailVerifiedAt: new Date(),
        familyId,
        isTestFixture: true,
      },
      select: { id: true, email: true, familyId: true },
    });

    // LearnerProfile (child)
    const learnerProfile = await tx.learnerProfile.create({
      data: {
        accountHolderId: accountHolder.id,
        displayName: `Fixture Child (${suffix})`,
        accessMode: "child_pin_required",
        isTestFixture: true,
      },
      select: { id: true, displayName: true },
    });

    // LearnerCredential (PIN)
    await tx.learnerCredential.create({
      data: {
        learnerProfileId: learnerProfile.id,
        accountHolderId: accountHolder.id,
        username: learnerUsername,
        secretHash: pinHash,
      },
    });

    // Student (tutor-scoped, linked to learner profile)
    const student = await tx.student.create({
      data: {
        name: learnerProfile.displayName,
        adminUserId: tutorAdminUserId,
        learnerProfileId: learnerProfile.id,
        isTestFixture: true,
      },
      select: { id: true, name: true },
    });

    // StudentClaimInvite (so the parent can "claim" the student — useful for testing the claim flow)
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_MS);

    await tx.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId: tutorAdminUserId,
        tokenHash,
        expiresAt,
      },
    });

    return {
      accountHolder,
      learnerProfile,
      student,
      rawToken,
      familyId: accountHolder.familyId!,
    };
  });

  const base = getPublicBaseUrl();
  const claimLink = `${base}/claim/${result.rawToken}`;

  console.log(
    `[dvt] dvt=${result.accountHolder.id} action=family_fixture_created` +
      ` accountHolderId=${result.accountHolder.id}` +
      ` learnerProfileId=${result.learnerProfile.id}` +
      ` studentId=${result.student.id}` +
      ` tutorAdminUserId=${tutorAdminUserId}`
  );

  return {
    type: "family",
    accountHolderId: result.accountHolder.id,
    parentEmail,
    parentPassword,
    familyId: result.familyId,
    learnerProfileId: result.learnerProfile.id,
    learnerDisplayName: result.learnerProfile.displayName,
    studentId: result.student.id,
    studentName: result.student.name,
    childPin,
    claimToken: result.rawToken,
    claimLink,
    tutorAdminUserId,
  };
}

// ---------------------------------------------------------------------------
// Delete fixtures — HARD SAFETY: isTestFixture=true in every WHERE clause
// ---------------------------------------------------------------------------

/**
 * Delete a fixture AdminUser and all its cascaded data (students, recordings,
 * whiteboard sessions, notes, email messages, claim invites, impersonation logs, etc.).
 *
 * SAFETY: The delete query ALWAYS includes `isTestFixture: true` in the WHERE
 * predicate. If the row is not a fixture (or does not exist), this function
 * throws without performing any deletion.
 */
export async function deleteFixtureAdminUser(adminUserId: string): Promise<void> {
  assertDevToolsEnabled();

  // Hard guard: confirm the row is a fixture before attempting deletion.
  // We findFirst with BOTH id and isTestFixture=true so the confirmation
  // itself cannot be fooled by id alone.
  const row = await db.adminUser.findFirst({
    where: { id: adminUserId, isTestFixture: true },
    select: { id: true, email: true },
  });

  if (!row) {
    throw new Error(
      `[dvt] deleteFixtureAdminUser: adminUserId=${adminUserId} is not a fixture or does not exist — refusing delete`
    );
  }

  // Belt-and-suspenders: include isTestFixture in the delete WHERE too.
  await db.adminUser.deleteMany({
    where: { id: adminUserId, isTestFixture: true },
  });

  console.log(
    `[dvt] dvt=${adminUserId} action=tutor_fixture_deleted adminUserId=${adminUserId} email=${row.email}`
  );
}

/**
 * Delete a fixture AccountHolder and all its cascaded data (learner profiles,
 * credentials, device sessions, email tokens, AH sessions).
 *
 * Because LearnerProfile has onDelete: Restrict on AccountHolder, we must
 * delete LearnerProfiles (and their cascading children) before the AccountHolder.
 *
 * SAFETY: Every delete step includes `isTestFixture: true` in the WHERE clause.
 */
export async function deleteFixtureAccountHolder(accountHolderId: string): Promise<void> {
  assertDevToolsEnabled();

  const row = await db.accountHolder.findFirst({
    where: { id: accountHolderId, isTestFixture: true },
    select: { id: true, email: true },
  });

  if (!row) {
    throw new Error(
      `[dvt] deleteFixtureAccountHolder: accountHolderId=${accountHolderId} is not a fixture or does not exist — refusing delete`
    );
  }

  // Step 1: delete fixture LearnerProfiles under this AccountHolder.
  // LearnerCredential and LearnerDeviceSession cascade from LearnerProfile (Cascade).
  // Student.learnerProfileId becomes null (SetNull on LearnerProfile delete).
  await db.learnerProfile.deleteMany({
    where: { accountHolderId, isTestFixture: true },
  });

  // Step 2: delete the AccountHolder itself (cascades: emailTokens, sessions, learnerCredentials).
  await db.accountHolder.deleteMany({
    where: { id: accountHolderId, isTestFixture: true },
  });

  console.log(
    `[dvt] dvt=${accountHolderId} action=family_fixture_deleted accountHolderId=${accountHolderId} email=${row.email}`
  );
}

/**
 * Delete ALL fixture rows across all entity types.
 *
 * Order of operations chosen to satisfy FK constraints:
 *   1. Fixture LearnerProfiles (cascades credentials + device sessions; nulls Student FK)
 *   2. Fixture AccountHolders (cascades email tokens + AH sessions + learner credentials)
 *   3. Fixture Students (cascades notes, recordings, whiteboard sessions, share links, claim invites)
 *      — AdminUser deletion below cascades Students, but doing Students first makes the
 *        cascade explicit and avoids any ordering dependency.
 *   4. Fixture AdminUsers (cascades remaining students, recordings, whiteboard sessions, etc.)
 *
 * SAFETY: Every deleteMany includes `isTestFixture: true` in the WHERE clause.
 */
export async function deleteAllFixtures(): Promise<{
  deletedLearnerProfiles: number;
  deletedAccountHolders: number;
  deletedStudents: number;
  deletedAdminUsers: number;
}> {
  assertDevToolsEnabled();

  // 1. Fixture LearnerProfiles
  const lpResult = await db.learnerProfile.deleteMany({ where: { isTestFixture: true } });

  // 2. Fixture AccountHolders (LearnerProfile restriction is now clear)
  const ahResult = await db.accountHolder.deleteMany({ where: { isTestFixture: true } });

  // 3. Fixture Students (for students whose tutor is NOT being deleted, or for clean-up)
  const stuResult = await db.student.deleteMany({ where: { isTestFixture: true } });

  // 4. Fixture AdminUsers (cascades any remaining students)
  const auResult = await db.adminUser.deleteMany({ where: { isTestFixture: true } });

  console.log(
    `[dvt] dvt=all action=all_fixtures_deleted` +
      ` learnerProfiles=${lpResult.count}` +
      ` accountHolders=${ahResult.count}` +
      ` students=${stuResult.count}` +
      ` adminUsers=${auResult.count}`
  );

  return {
    deletedLearnerProfiles: lpResult.count,
    deletedAccountHolders: ahResult.count,
    deletedStudents: stuResult.count,
    deletedAdminUsers: auResult.count,
  };
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * List all current fixture AdminUsers (tutor fixtures).
 */
export async function listFixtureTutors() {
  assertDevToolsEnabled();
  return db.adminUser.findMany({
    where: { isTestFixture: true },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * List all current fixture AccountHolders (parent fixtures) with their learner profiles.
 */
export async function listFixtureFamilies() {
  assertDevToolsEnabled();
  return db.accountHolder.findMany({
    where: { isTestFixture: true },
    select: {
      id: true,
      email: true,
      familyId: true,
      createdAt: true,
      learnerProfiles: {
        where: { isTestFixture: true },
        select: {
          id: true,
          displayName: true,
          credential: { select: { username: true } },
          students: {
            where: { isTestFixture: true },
            select: {
              id: true,
              name: true,
              adminUserId: true,
              claimInvites: {
                where: { claimedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
                select: { id: true, tokenHash: true, expiresAt: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
