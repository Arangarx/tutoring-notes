/**
 * Impersonation helpers — SEC-1 Dispatch A (foundation) + role follow-up.
 *
 * Log prefix: imp=<logId>  (registered in AGENTS.md § Conventions)
 *
 * Key log lines:
 *   [imp] imp=<logId> admin=<adminId> impersonating=<targetId> role=ADMIN start
 *   [imp] imp=<logId> exit admin=<adminId>
 *   [imp] imp=<logId> exit-log-update-failed (swallowed)
 *
 * Dispatch A ships:
 *   - ImpersonationForbiddenError
 *   - assertIsRealAdmin() / assertIsAdmin()  — mutation-boundary auth guard
 *   - mintImpersonationSession()  — mints test-account cookie
 *   - mintAdminSession()    — restores real-admin cookie on exit
 *
 * SEC-1 role follow-up: assertIsAdmin() replaces the old isTestAccount-based
 * guard with an explicit role === ADMIN check. assertIsRealAdmin is kept as an
 * alias so existing callers compile without changes.
 */

import { redirect } from "next/navigation";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireStudentScope } from "@/lib/student-scope";
import { env } from "@/lib/env";
import type { AdminRole } from "@prisma/client";

// ---------------------------------------------------------------------------
// Auth error
// ---------------------------------------------------------------------------

export class ImpersonationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpersonationForbiddenError";
  }
}

// ---------------------------------------------------------------------------
// Mutation-boundary guard
// ---------------------------------------------------------------------------

/**
 * Call at the start of any server action that initiates or manages
 * impersonation. Returns the real admin's id + email.
 *
 * Throws ImpersonationForbiddenError when:
 *   - Caller has no session (redirects to /login via requireStudentScope)
 *   - Caller is an env-only admin (no DB row — impersonation requires a DB-backed admin)
 *   - Caller's role is not ADMIN (TUTOR accounts cannot impersonate anyone)
 *
 * Supersedes the old isTestAccount-based check: a TUTOR with isTestAccount=false
 * (e.g. Sarah's real login) must also be blocked — isTestAccount alone is insufficient.
 *
 * Pattern mirrors assertOwnsStudent() in student-scope.ts.
 */
export async function assertIsAdmin(): Promise<{ adminId: string; email: string }> {
  const scope = await requireStudentScope();
  // requireStudentScope() already redirects to /login when kind === "none";
  // the return type excludes { kind: "none" }.

  if (scope.kind === "env") {
    throw new ImpersonationForbiddenError(
      "Env-only admin cannot use impersonation. Create a DB-backed admin via Google OAuth first."
    );
  }

  // scope.kind === "admin" — verify the DB row has ADMIN role.
  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { id: true, email: true, isTestAccount: true, role: true },
  });

  if (!admin) {
    throw new ImpersonationForbiddenError("Admin account not found.");
  }

  if (admin.role !== "ADMIN") {
    // Covers both TUTOR real-logins (e.g. Sarah) and isTestAccount=true targets.
    throw new ImpersonationForbiddenError(
      "Only ADMIN-role accounts can impersonate. TUTOR accounts cannot impersonate other users."
    );
  }

  return { adminId: admin.id, email: admin.email };
}

/**
 * @deprecated Use assertIsAdmin() — kept as alias so existing callers
 * (startImpersonation, AdminTestAccountsPanel, tests) compile without rename.
 * Will be removed when callers are updated.
 */
export const assertIsRealAdmin = assertIsAdmin;

// ---------------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------------

const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

// 8 hours — matches NextAuth default (Q2=A).
const SESSION_MAX_AGE_S = 8 * 60 * 60;

/**
 * Overwrite the session cookie with a new JWT scoped to the impersonated
 * test account. Called by startImpersonation() (Dispatch B).
 *
 * The new token is a fresh JWT with a new iat; the old admin cookie is
 * overwritten atomically (session-fixation guarantee).
 *
 * The impersonation token carries role=TUTOR (the target's role).
 */
export async function mintImpersonationSession(opts: {
  targetId: string;
  targetEmail: string;
  targetRole?: AdminRole;
  originalAdminId: string;
  originalAdminEmail: string;
  impersonationLogId: string;
}): Promise<void> {
  const token = await encode({
    token: {
      sub: opts.targetId,
      email: opts.targetEmail,
      name: "Test Account",
      isTestAccount: true,
      isImpersonating: true,
      originalAdminId: opts.originalAdminId,
      originalAdminEmail: opts.originalAdminEmail,
      impersonationLogId: opts.impersonationLogId,
      // Impersonation target is always TUTOR — test accounts are TUTOR by default.
      role: opts.targetRole ?? "TUTOR",
    },
    secret: env.NEXTAUTH_SECRET,
    maxAge: SESSION_MAX_AGE_S,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/**
 * Overwrite the session cookie with a fresh JWT for the real admin.
 * Called by exitImpersonation() (Dispatch B).
 *
 * The restored token has no impersonation fields, a fresh iat, and role=ADMIN.
 */
export async function mintAdminSession(opts: {
  adminId: string;
  adminEmail: string;
  adminRole?: AdminRole;
}): Promise<void> {
  const token = await encode({
    token: {
      sub: opts.adminId,
      email: opts.adminEmail,
      name: "Admin",
      isTestAccount: false,
      role: opts.adminRole ?? "ADMIN",
      // No impersonation fields — clean admin session.
    },
    secret: env.NEXTAUTH_SECRET,
    maxAge: SESSION_MAX_AGE_S,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

// Re-export redirect so callers can use the same next/navigation path.
export { redirect };
