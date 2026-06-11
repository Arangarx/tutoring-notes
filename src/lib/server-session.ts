/**
 * Server-component session helpers.
 *
 * These wrap the request-based session helpers for use in Next.js App Router
 * server components. We use `cookies()` from `next/headers` (the idiomatic
 * RSC cookie API) rather than `headers().get("cookie")` because `cookies()`
 * is typed and more reliably populated in Next.js 15 RSC context.
 *
 * Q3-A fix (session-wrong-identity-fix-design-2026-06-05.md):
 *   buildRequestFromHeaders() previously joined all cookies into a single
 *   "Cookie" header string and created a plain Request. getCookieFromRequest()
 *   then did a first-match linear scan on that string. If two `mynk_ah_session`
 *   values were ever present (possible after RC-A preview domain split), server
 *   components would resolve a different cookie than route-handlers (which use
 *   the @edge-runtime/cookies Map API — last-value wins).
 *
 *   Fix: use cookieStore.getAll(name) to retrieve ALL candidate values for the
 *   session cookie, then try each in reverse order (last-set first, consistent
 *   with Map-API / @edge-runtime behaviour) and return the FIRST that validates.
 *   This handles both the Q3-A last-value alignment AND the case where the last
 *   value is a stale/revoked token but an earlier value is still valid.
 *
 * Loop-break helpers:
 *   hasAccountHolderSessionCookie() / hasLearnerSessionCookie() detect whether
 *   a session cookie is present (regardless of validity). Used by
 *   assertCanAccessShareLink to distinguish "no cookie" (→ notes_email redirect)
 *   from "cookie present but invalid" (→ clear-stale-session bounce that emits
 *   Set-Cookie Max-Age=0 before redirecting with source=session_expired).
 *
 * SERVER-ONLY: never import on the client.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AH_SESSION_COOKIE,
  validateAccountHolderSessionFromRawToken,
  type AccountHolderSessionData,
} from "@/lib/account-holder-session";
import {
  LEARNER_SESSION_COOKIE,
  validateLearnerSessionFromRawToken,
  type LearnerSessionData,
} from "@/lib/learner-session";

/**
 * Get the AccountHolder session in a server component.
 *
 * Tries all `mynk_ah_session` cookie values in reverse (last-set-first) order
 * and returns the first that validates successfully. Handles duplicate/stale
 * cookies from the RC-A preview-domain split (Q3-A fix).
 *
 * Returns null if no valid session exists.
 */
export async function getAccountHolderSessionFromHeaders(): Promise<AccountHolderSessionData | null> {
  const cookieStore = await cookies();
  // getAll(name) returns every cookie with this name in insertion order.
  // We iterate in reverse so the most-recently-set value is tried first,
  // consistent with the @edge-runtime/cookies Map-API (last-value wins).
  const candidates = cookieStore.getAll(AH_SESSION_COOKIE);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const result = await validateAccountHolderSessionFromRawToken(candidates[i].value);
    if (result) return result;
  }
  return null;
}

/**
 * Get the Learner session in a server component.
 *
 * Tries all `mynk_learner_session` cookie values in reverse (last-set-first)
 * order and returns the first that validates successfully. Mirrors the
 * duplicate-cookie resilience of getAccountHolderSessionFromHeaders.
 *
 * Returns null if no valid session exists.
 */
export async function getLearnerSessionFromHeaders(): Promise<LearnerSessionData | null> {
  const cookieStore = await cookies();
  const candidates = cookieStore.getAll(LEARNER_SESSION_COOKIE);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const result = await validateLearnerSessionFromRawToken(candidates[i].value);
    if (result) return result;
  }
  return null;
}

/**
 * Returns true if any non-empty `mynk_ah_session` cookie is present in the
 * request, regardless of whether the token validates.
 *
 * Used by assertCanAccessShareLink to distinguish:
 *   - cookie present but invalid → stale_session_cleared (loop-break path)
 *   - no cookie at all           → no_session (standard login redirect)
 */
export async function hasAccountHolderSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.getAll(AH_SESSION_COOKIE).some((c) => c.value.length > 0);
}

/**
 * Returns true if any non-empty `mynk_learner_session` cookie is present in
 * the request, regardless of whether the token validates.
 */
export async function hasLearnerSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.getAll(LEARNER_SESSION_COOKIE).some((c) => c.value.length > 0);
}

/**
 * Require an AccountHolder session in a server component.
 *
 * Standard 3-way auth guard for /account/* dashboard pages. Mirrors the
 * stale-cookie handling in share-access-scope.ts assertCanAccessShareLink.
 * Always redirects (never returns null) so callers get a guaranteed non-null
 * result — no `if (!session)` guard needed at the call site.
 *
 *  1. Valid session   → returns the session object.
 *  2. Cookie present but invalid (stale/expired/revoked) → redirects through
 *     /api/auth/clear-stale-session to emit Set-Cookie Max-Age=0, then lands
 *     on /account/login?returnTo=...&source=session_expired so the login page
 *     shows an actionable "session expired" message.
 *  3. No cookie at all → redirects to /account/login?returnTo=... with no
 *     source param (plain first-visit redirect, matching prior behavior).
 *
 * @param returnTo  Decoded path to redirect back to after login
 *                  (e.g. "/account/dashboard"). Encoded internally; do NOT
 *                  pre-encode the value passed in.
 */
export async function requireAccountHolderSession(
  returnTo: string
): Promise<AccountHolderSessionData> {
  const session = await getAccountHolderSessionFromHeaders();
  if (session) return session;

  if (await hasAccountHolderSessionCookie()) {
    // Stale cookie: bounce through the clear-stale-session handler which
    // emits Set-Cookie Max-Age=0 before redirecting. The nested login URL
    // carries source=session_expired for an actionable user message.
    redirect(
      `/api/auth/clear-stale-session?then=${encodeURIComponent(
        `/account/login?returnTo=${encodeURIComponent(returnTo)}&source=session_expired`
      )}`
    );
  }

  // No cookie at all: plain login redirect with no source param.
  redirect(`/account/login?returnTo=${encodeURIComponent(returnTo)}`);
}
