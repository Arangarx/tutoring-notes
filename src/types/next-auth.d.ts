// Type augmentation for NextAuth v4 — SEC-1 impersonation fields + role (follow-up).
//
// These extend the built-in Session and JWT interfaces so TypeScript
// knows about the custom fields we write in auth-options.ts callbacks
// and src/lib/impersonation.ts token-minting helpers.
import "next-auth";
import type { AdminRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      /** True for test-account impersonation targets; false for real admins. */
      isTestAccount?: boolean;
      /** True when the current cookie was minted by mintImpersonationSession(). */
      isImpersonating?: boolean;
      /** The real admin's DB id; set during impersonation, null otherwise. */
      originalAdminId?: string | null;
      /** The real admin's email; set during impersonation, null otherwise. */
      originalAdminEmail?: string | null;
      /** The ImpersonationLog row id for the active session; null otherwise. */
      impersonationLogId?: string | null;
      /**
       * Role for this account (SEC-1 follow-up).
       * ADMIN: dashboard + impersonation.
       * TUTOR: workspace only (students, outbox, whiteboard) — cannot impersonate.
       * Impersonation sessions carry the TARGET's role (TUTOR).
       */
      role?: AdminRole;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isTestAccount?: boolean;
    isImpersonating?: boolean;
    originalAdminId?: string | null;
    originalAdminEmail?: string | null;
    impersonationLogId?: string | null;
    /** AdminRole enum value — persisted in JWT so middleware reads without a DB call. */
    role?: AdminRole;
  }
}
