/**
 * SEC-1 Dispatch C — post-login routing for real admin vs tutor experience.
 *
 * Real DB-backed admin (not impersonating) → minimal dashboard at `/admin`.
 * Tutor workspace (`/admin/students`, outbox, etc.) → only while impersonating
 * or on the legacy env-only admin login (`sub === "admin"`).
 */

export type AdminSessionMode = "real-admin-home" | "tutor-experience" | "unauthenticated";

/** Minimal session fields used for admin routing (JWT or NextAuth session). */
export type AdminRoutingSession = {
  sub?: string;
  isImpersonating?: boolean;
  isTestAccount?: boolean;
};

/** Paths that belong to the tutor experience; blocked for real-admin-home sessions. */
export const TUTOR_EXPERIENCE_PATH_PREFIXES = [
  "/admin/students",
  "/admin/outbox",
] as const;

export function getAdminSessionMode(token: AdminRoutingSession | null): AdminSessionMode {
  if (!token?.sub) return "unauthenticated";
  if (token.isImpersonating === true || token.isTestAccount === true) {
    return "tutor-experience";
  }
  // Legacy env-only Credentials login (no DB row, cannot impersonate).
  if (token.sub === "admin") return "tutor-experience";
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
