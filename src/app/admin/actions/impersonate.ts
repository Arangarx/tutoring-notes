"use server";

/**
 * SEC-1 Dispatch B — impersonation server actions.
 *
 * startImpersonation(targetUserId): mint a test-account session.
 * exitImpersonation():              restore the real-admin session.
 *
 * Log prefix: imp=<logId>  (see AGENTS.md § Conventions)
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import {
  assertIsRealAdmin,
  mintImpersonationSession,
  mintAdminSession,
} from "@/lib/impersonation";
import { tutorExperienceLandingPath } from "@/lib/admin-routing";

// ---------------------------------------------------------------------------
// startImpersonation
// ---------------------------------------------------------------------------

/**
 * Mint a new session as the given test account.
 *
 * Guards (all server-side):
 *  - assertIsRealAdmin(): rejects test accounts and already-impersonating sessions
 *    (during impersonation, scope.adminId = test account id → isTestAccount=true → throw)
 *  - target must be isTestAccount=true
 *  - idempotency: if an open ImpersonationLog row already exists for this
 *    (adminUserId, impersonatedUserId) pair, re-mints and redirects without creating
 *    a second row (Q6=A)
 */
export async function startImpersonation(targetUserId: string): Promise<void> {
  const admin = await assertIsRealAdmin();

  const target = await db.adminUser.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, isTestAccount: true, role: true },
  });
  if (!target?.isTestAccount) {
    throw new Error("Can only impersonate test accounts.");
  }

  // Idempotency guard (Q6=A): return early if an open log row exists.
  const existingLog = await db.impersonationLog.findFirst({
    where: {
      adminUserId: admin.adminId,
      impersonatedUserId: target.id,
      endedAt: null,
    },
  });
  if (existingLog) {
    console.log(
      `[imp] imp=${existingLog.id} admin=${admin.adminId} impersonating=${target.id} role=${target.role} start-idempotent`
    );
    await mintImpersonationSession({
      targetId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      originalAdminId: admin.adminId,
      originalAdminEmail: admin.email,
      impersonationLogId: existingLog.id,
    });
    redirect(tutorExperienceLandingPath());
  }

  const logRow = await db.impersonationLog.create({
    data: {
      adminUserId: admin.adminId,
      impersonatedUserId: target.id,
      startedAt: new Date(),
      vercelDeploymentUrl: process.env.VERCEL_URL ?? null,
    },
  });

  console.log(
    `[imp] imp=${logRow.id} admin=${admin.adminId} impersonating=${target.id} role=${target.role} start`
  );

  await mintImpersonationSession({
    targetId: target.id,
    targetEmail: target.email,
    targetRole: target.role,
    originalAdminId: admin.adminId,
    originalAdminEmail: admin.email,
    impersonationLogId: logRow.id,
  });

  redirect(tutorExperienceLandingPath());
}

// ---------------------------------------------------------------------------
// exitImpersonation
// ---------------------------------------------------------------------------

/**
 * Close the active impersonation session and restore the real admin.
 *
 * Idempotent: if the session is not currently an impersonation session,
 * redirects to /admin without any DB writes.
 *
 * On exit:
 *  - ImpersonationLog.endedAt is set (row stays for audit)
 *  - Session cookie is replaced with a fresh admin JWT (no impersonation fields)
 *  - Redirect to /admin
 */
export async function exitImpersonation(): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isImpersonating) {
    redirect("/admin");
  }

  const { impersonationLogId, originalAdminId, originalAdminEmail } =
    session.user;

  if (impersonationLogId) {
    await db.impersonationLog
      .update({
        where: { id: impersonationLogId },
        data: { endedAt: new Date() },
      })
      .catch(() => {
        console.warn(
          `[imp] imp=${impersonationLogId} exit-log-update-failed (swallowed)`
        );
      });
    console.log(`[imp] imp=${impersonationLogId} exit admin=${originalAdminId}`);
  }

  if (!originalAdminId || !originalAdminEmail) {
    // Safety: admin metadata missing from token — cannot restore session safely.
    console.error(
      `[imp] exit-missing-admin-id imp=${impersonationLogId ?? "unknown"} — redirecting to login`
    );
    redirect("/login");
  }

  // Re-fetch the original admin's current role from the DB so the restored
  // session always carries the up-to-date role, even if it was changed while
  // the impersonation was active.
  const originalAdmin = await db.adminUser.findUnique({
    where: { id: originalAdminId },
    select: { role: true },
  });

  await mintAdminSession({
    adminId: originalAdminId,
    adminEmail: originalAdminEmail,
    adminRole: originalAdmin?.role ?? "ADMIN",
  });

  redirect("/admin");
}
