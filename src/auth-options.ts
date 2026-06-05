import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import type { AdminRole } from "@prisma/client";
import { env } from "@/lib/env";
import { getAdminByEmail, hasAdminUsers, verifyPassword } from "@/lib/auth-db";
import {
  isPlaywrightHarnessActive,
  isPlaywrightHarnessAdminEmail,
} from "@/lib/playwright-harness";

// Google OAuth provider is only included when both credentials are present.
// CredentialsProvider remains available at all times for password logins and
// the env-only fallback. This means tsc passes cleanly with Google creds absent
// (Blocker #7).
const googleProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [
        GoogleProvider({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          authorization: {
            // Strictly openid + email + profile — NOT gmail.send.
            // The existing Gmail-send OAuth is a separate custom flow
            // (OAuthEmailConnection) and is unrelated to this provider.
            params: { scope: "openid email profile" },
          },
        }),
      ]
    : [];

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email ?? "").trim();
        const password = credentials?.password ?? "";

        if (!email || !password) return null;

        const hasDbAdmins = await hasAdminUsers();

        if (hasDbAdmins) {
          const admin = await getAdminByEmail(email);
          if (!admin) return null;
          // Blocker #1: test accounts cannot log in via password.
          if (admin.isTestAccount) return null;
          // Blocker #2 (via verifyPassword): Google-OAuth-only real admins
          // have null passwordHash; verifyPassword returns false for null.
          const ok = await verifyPassword(password, admin.passwordHash);
          if (!ok) return null;
          return {
            id: admin.id,
            email: admin.email,
            name: admin.displayName ?? "Admin",
            isTestAccount: admin.isTestAccount,
            role: admin.role,
          };
        }

        if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) {
          if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD)
            return null;
          // Legacy env-only admin: map to ADMIN role so it keeps its existing
          // tutor-experience access (sub=admin path in getAdminSessionMode).
          return {
            id: "admin",
            email: env.ADMIN_EMAIL,
            name: "Admin",
            isTestAccount: false,
            role: "ADMIN" as AdminRole,
          };
        }

        return null;
      },
    }),
    ...googleProviders,
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Redirect all NextAuth error pages to /login?error=... so they render
    // the inline error banner instead of NextAuth's standalone "Error" card
    // at /api/auth/error.
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Blocker #3 + #4: Google sign-in is restricted to existing DB rows
      // that are real admins. No auto-provisioning.
      if (account?.provider === "google") {
        if (!user.email) return false;
        const admin = await getAdminByEmail(user.email);
        if (!admin) return "/login?error=not_authorized";
        // Test accounts cannot authenticate via Google OAuth.
        if (admin.isTestAccount) return "/login?error=not_authorized";
        return true;
      }
      // CredentialsProvider: handled in authorize() above.
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        // CredentialsProvider: authorize() sets isTestAccount + role on the returned user.
        const u = user as {
          isTestAccount?: boolean;
          role?: AdminRole;
          email?: string;
        };
        token.isTestAccount = u.isTestAccount ?? false;
        if (u.role !== undefined) token.role = u.role;
        // Fresh login: 2FA not yet verified this session (non-test accounts must pass the gate).
        // isTestAccount accounts are exempt — we mark them pre-verified so middleware skips them.
        // Playwright wb-regression harness: credentials login for playwright@test.local
        // under NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1 (local Docker Postgres only).
        const playwrightHarnessLogin =
          isPlaywrightHarnessActive() && isPlaywrightHarnessAdminEmail(u.email);
        if (u.isTestAccount || playwrightHarnessLogin) {
          token.twoFactorVerified = true;
        } else {
          token.twoFactorVerified = false;
        }
      }
      if (account?.provider === "google" && user?.email) {
        // Google sign-in: resolve the DB row to get the canonical id + flags.
        const admin = await getAdminByEmail(user.email);
        if (admin) {
          token.sub = admin.id;
          token.isTestAccount = admin.isTestAccount;
          token.role = admin.role;
          // Google login: same 2FA gate — not verified yet.
          // isTestAccount exempts (Google path can't produce test accounts per signIn callback,
          // but guard anyway for safety).
          token.twoFactorVerified = admin.isTestAccount ? true : false;
        }
      }
      // Impersonation fields (isImpersonating, originalAdminId, originalAdminEmail,
      // impersonationLogId, role) are already in the token when set by
      // mintImpersonationSession() in src/lib/impersonation.ts; they persist
      // across token refreshes without any extra logic here.
      //
      // twoFactorVerified: once set to true by mintTwoFactorVerifiedSession(),
      // it persists across refreshes here (no code clears it — the flag is only
      // cleared by a full sign-out which issues a new session).
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string | undefined;
        session.user.isTestAccount = (token.isTestAccount as boolean | undefined) ?? false;
        session.user.isImpersonating =
          (token.isImpersonating as boolean | undefined) ?? false;
        session.user.originalAdminId =
          (token.originalAdminId as string | null | undefined) ?? null;
        session.user.originalAdminEmail =
          (token.originalAdminEmail as string | null | undefined) ?? null;
        session.user.impersonationLogId =
          (token.impersonationLogId as string | null | undefined) ?? null;
        session.user.role = (token.role as AdminRole | undefined);
        session.user.twoFactorVerified =
          (token.twoFactorVerified as boolean | undefined) ?? false;
      }
      return session;
    },
  },
};
