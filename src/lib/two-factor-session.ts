/**
 * 2FA session helper — Identity Phase 1.
 *
 * mintTwoFactorVerifiedSession(): overwrites the current session cookie with
 * a fresh JWT that carries twoFactorVerified=true. Must only be called after
 * the user has successfully verified their TOTP or backup code.
 *
 * Pattern mirrors mintImpersonationSession() in src/lib/impersonation.ts.
 *
 * Log prefix: tfa= (AGENTS.md § Conventions)
 */

import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

const SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 hours

/**
 * Overwrites the session cookie to mark 2FA as verified for the current session.
 * Reads the current token, adds twoFactorVerified=true, re-encodes, and sets cookie.
 *
 * @param currentToken - The current decoded JWT token (from getToken() in middleware / server action).
 */
export async function mintTwoFactorVerifiedSession(
  currentToken: Record<string, unknown>
): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("[tfa] NEXTAUTH_SECRET is not set");
  }

  const newToken = await encode({
    token: {
      ...currentToken,
      twoFactorVerified: true,
    },
    secret,
    maxAge: SESSION_MAX_AGE_S,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}
