/**
 * Impersonation helpers — SEC-1 Dispatch A (foundation).
 *
 * Log prefix: imp=<logId>  (registered in AGENTS.md § Conventions)
 *
 * Key log lines:
 *   [imp] imp=<logId> admin=<adminId> impersonating=<targetId> start
 *   [imp] imp=<logId> exit admin=<adminId>
 *   [imp] imp=<logId> exit-log-update-failed (swallowed)
 *
 * Dispatch A ships:
 *   - ImpersonationForbiddenError
 *   - assertIsRealAdmin()   — mutation-boundary auth guard
 *   - mintImpersonationSession()  — mints test-account cookie
 *   - mintAdminSession()    — restores real-admin cookie on exit
 *
 * Dispatch B completes: startImpersonation(), exitImpersonation()
 * Dispatch C completes: admin dashboard UI ("Log in as" button)
 */

import { redirect } from "next/navigation";
import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireStudentScope } from "@/lib/student-scope";
import { env } from "@/lib/env";

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
 *   - Caller is a test account
 *
 * Pattern mirrors assertOwnsStudent() in student-scope.ts.
 */
export async function assertIsRealAdmin(): Promise<{ adminId: string; email: string }> {
  const scope = await requireStudentScope();
  // requireStudentScope() already redirects to /login when kind === "none";
  // the return type excludes { kind: "none" }.

  if (scope.kind === "env") {
    throw new ImpersonationForbiddenError(
      "Env-only admin cannot use impersonation. Create a DB-backed admin via Google OAuth first."
    );
  }

  // scope.kind === "admin" — verify the DB row is a real admin.
  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { id: true, email: true, isTestAccount: true },
  });

  if (!admin || admin.isTestAccount) {
    throw new ImpersonationForbiddenError(
      "Test accounts cannot impersonate other users."
    );
  }

  return { adminId: admin.id, email: admin.email };
}

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
 */
export async function mintImpersonationSession(opts: {
  targetId: string;
  targetEmail: string;
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
 * The restored token has no impersonation fields and a fresh iat.
 */
export async function mintAdminSession(opts: {
  adminId: string;
  adminEmail: string;
}): Promise<void> {
  const token = await encode({
    token: {
      sub: opts.adminId,
      email: opts.adminEmail,
      name: "Admin",
      isTestAccount: false,
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
