"use server";

/**
 * Server actions for the dev-tools fixture dashboard.
 *
 * Guardrails:
 *   1. isDevToolsEnabled() — production returns early / never reachable via UI.
 *   2. assertIsAdmin()     — operator-auth required; account holders / students cannot call.
 *   3. isTestFixture guard — delete path includes isTestFixture=true in every WHERE clause.
 *
 * Log prefix: dvt (AGENTS.md § Conventions)
 */

import { revalidatePath } from "next/cache";
import { assertIsAdmin } from "@/lib/impersonation";
import {
  isDevToolsEnabled,
  createTutorFixture,
  createFamilyFixture,
  deleteFixtureAdminUser,
  deleteFixtureAccountHolder,
  deleteAllFixtures,
} from "@/lib/dev-fixtures";

// ---------------------------------------------------------------------------
// Guard helpers
// ---------------------------------------------------------------------------

function assertEnabled(): void {
  if (!isDevToolsEnabled()) {
    throw new Error("[dvt] dev-tools actions are disabled in production");
  }
}

// ---------------------------------------------------------------------------
// Create actions
// ---------------------------------------------------------------------------

/**
 * Create a fixture tutor account (AdminUser with isTestAccount + isTestFixture).
 * Returns serialisable data for display in the dashboard.
 */
export async function actionCreateTutorFixture(): Promise<{
  ok: true;
  adminUserId: string;
  email: string;
  password: string;
} | { ok: false; error: string }> {
  assertEnabled();
  try {
    await assertIsAdmin();
  } catch {
    return { ok: false, error: "Unauthorized — admin session required." };
  }

  try {
    const fixture = await createTutorFixture();
    revalidatePath("/admin/dev-tools");
    return { ok: true, adminUserId: fixture.adminUserId, email: fixture.email, password: fixture.password };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dvt] action=create_tutor_fixture error=${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Create a full fixture family (parent + child + student + claim invite)
 * attached to the given tutor fixture.
 */
export async function actionCreateFamilyFixture(tutorAdminUserId: string): Promise<{
  ok: true;
  accountHolderId: string;
  parentEmail: string;
  parentPassword: string;
  familyId: string;
  learnerProfileId: string;
  learnerDisplayName: string;
  studentId: string;
  studentName: string;
  childPin: string;
  claimLink: string;
} | { ok: false; error: string }> {
  assertEnabled();
  try {
    await assertIsAdmin();
  } catch {
    return { ok: false, error: "Unauthorized — admin session required." };
  }

  try {
    const fixture = await createFamilyFixture(tutorAdminUserId);
    revalidatePath("/admin/dev-tools");
    return {
      ok: true,
      accountHolderId: fixture.accountHolderId,
      parentEmail: fixture.parentEmail,
      parentPassword: fixture.parentPassword,
      familyId: fixture.familyId,
      learnerProfileId: fixture.learnerProfileId,
      learnerDisplayName: fixture.learnerDisplayName,
      studentId: fixture.studentId,
      studentName: fixture.studentName,
      childPin: fixture.childPin,
      claimLink: fixture.claimLink,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dvt] action=create_family_fixture tutorAdminUserId=${tutorAdminUserId} error=${msg}`);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Delete actions
// ---------------------------------------------------------------------------

/**
 * Delete a single fixture tutor (AdminUser where isTestFixture=true).
 * Hard safety: rejects if the row is not a fixture.
 */
export async function actionDeleteFixtureTutor(adminUserId: string): Promise<{ ok: boolean; error?: string }> {
  assertEnabled();
  try {
    await assertIsAdmin();
  } catch {
    return { ok: false, error: "Unauthorized — admin session required." };
  }

  try {
    await deleteFixtureAdminUser(adminUserId);
    revalidatePath("/admin/dev-tools");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dvt] action=delete_tutor_fixture adminUserId=${adminUserId} error=${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Delete a single fixture AccountHolder (and its cascaded family data).
 * Hard safety: rejects if the row is not a fixture.
 */
export async function actionDeleteFixtureFamily(accountHolderId: string): Promise<{ ok: boolean; error?: string }> {
  assertEnabled();
  try {
    await assertIsAdmin();
  } catch {
    return { ok: false, error: "Unauthorized — admin session required." };
  }

  try {
    await deleteFixtureAccountHolder(accountHolderId);
    revalidatePath("/admin/dev-tools");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dvt] action=delete_family_fixture accountHolderId=${accountHolderId} error=${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Delete ALL fixture data (all entities where isTestFixture=true).
 * Hard safety: every deleteMany includes isTestFixture=true in WHERE.
 */
export async function actionDeleteAllFixtures(): Promise<{
  ok: boolean;
  counts?: {
    learnerProfiles: number;
    accountHolders: number;
    students: number;
    adminUsers: number;
  };
  error?: string;
}> {
  assertEnabled();
  try {
    await assertIsAdmin();
  } catch {
    return { ok: false, error: "Unauthorized — admin session required." };
  }

  try {
    const result = await deleteAllFixtures();
    revalidatePath("/admin/dev-tools");
    return {
      ok: true,
      counts: {
        learnerProfiles: result.deletedLearnerProfiles,
        accountHolders: result.deletedAccountHolders,
        students: result.deletedStudents,
        adminUsers: result.deletedAdminUsers,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dvt] action=delete_all_fixtures error=${msg}`);
    return { ok: false, error: msg };
  }
}
