// Type augmentation for NextAuth v4 — SEC-1 impersonation fields + role + Identity Phase 1 2FA.
//
// These extend the built-in Session and JWT interfaces so TypeScript
// knows about the custom fields we write in auth-options.ts callbacks,
// src/lib/impersonation.ts token-minting helpers, and 2FA verify action.
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
      /**
       * Identity Phase 1 — TOTP 2FA.
       * True when the user has completed TOTP (or backup-code) verification
       * in the current session. False or undefined = must verify before /admin access.
       * isTestAccount accounts are exempt and always treated as verified.
       */
      twoFactorVerified?: boolean;
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
    /**
     * Identity Phase 1 — 2FA verification state.
     * Set to true by mintTwoFactorVerifiedSession() after successful TOTP/backup-code verify.
     * Absent or false means the user must complete 2FA before accessing /admin.
     */
    twoFactorVerified?: boolean;
  }
}
