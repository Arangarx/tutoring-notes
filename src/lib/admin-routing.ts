/**
 * SEC-1 follow-up — role-based post-login routing.
 *
 * Role model:
 *   ADMIN, not impersonating  → real-admin-home (/admin dashboard + Log-in-as)
 *   ADMIN, impersonating      → tutor-experience (/admin/students + workspace)
 *   TUTOR (real or test acct) → tutor-experience (/admin/students + workspace)
 *   Legacy env-only (sub=admin) → tutor-experience (unchanged from Dispatch C)
 *   Unauthenticated           → unauthenticated
 *
 * The key change from Dispatch C: session mode is now determined by `role`,
 * NOT by `!isTestAccount`. `isTestAccount` is still load-bearing for the
 * credentials-login gate and the test-account list, but it no longer drives
 * routing.
 */

export type AdminSessionMode = "real-admin-home" | "tutor-experience" | "unauthenticated";

/** Minimal session fields used for admin routing (JWT or NextAuth session). */
export type AdminRoutingSession = {
  sub?: string;
  isImpersonating?: boolean;
  isTestAccount?: boolean;
  /** AdminRole enum value from Prisma. Present on DB-backed sessions after role migration. */
  role?: string;
};

/** Paths that belong to the tutor experience; blocked for real-admin-home sessions. */
export const TUTOR_EXPERIENCE_PATH_PREFIXES = [
  "/admin/students",
  "/admin/outbox",
] as const;

export function getAdminSessionMode(token: AdminRoutingSession | null): AdminSessionMode {
  if (!token?.sub) return "unauthenticated";

  // Impersonating sessions (any role) land in tutor workspace.
  if (token.isImpersonating === true) return "tutor-experience";

  // Legacy env-only Credentials login (no DB row, no role field). Keep existing behaviour.
  if (token.sub === "admin") return "tutor-experience";

  // Role-based routing for DB-backed sessions.
  // A missing role field means the token was minted before this migration
  // (e.g. an existing session cookie). Fall back to isTestAccount-based
  // heuristic for backward compat: a real non-test session without a role
  // is treated as ADMIN (preserving the pre-migration admin behaviour until
  // the token refreshes and picks up the role from the DB).
  if (token.role === "TUTOR") return "tutor-experience";
  if (token.role === "ADMIN") return "real-admin-home";

  // Fallback for tokens minted before the role migration.
  if (token.isTestAccount === true) return "tutor-experience";
  return "real-admin-home";
}

export function isTutorExperiencePath(pathname: string): boolean {
  return TUTOR_EXPERIENCE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function tutorExperienceLandingPath(): string {
  return "/admin/students";
}

export function realAdminHomePath(): string {
  return "/admin";
}
