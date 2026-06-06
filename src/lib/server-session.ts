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
 *   Fix: read the AH session cookie directly via the cookies() Map API (last
 *   value) and pass the raw token straight to validateAccountHolderSessionFromRawToken,
 *   removing the intermediate fake-Request + linear-scan path entirely.
 *
 * SERVER-ONLY: never import on the client.
 */

import { cookies } from "next/headers";
import {
  AH_SESSION_COOKIE,
  validateAccountHolderSessionFromRawToken,
  type AccountHolderSessionData,
} from "@/lib/account-holder-session";
import { getLearnerSession, type LearnerSessionData } from "@/lib/learner-session";

/** Build a minimal Request from the current server-component cookies (learner realm). */
async function buildRequestFromHeaders(): Promise<Request> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return new Request("http://localhost/", {
    headers: { cookie: cookieHeader },
  });
}

/**
 * Get the AccountHolder session in a server component.
 * Uses the cookies() Map API (last-value) to read the AH session cookie,
 * aligning server-component resolution with route-handler resolution (Q3-A fix).
 * Returns null if no valid session exists.
 */
export async function getAccountHolderSessionFromHeaders(): Promise<AccountHolderSessionData | null> {
  const cookieStore = await cookies();
  // Map API: if duplicate cookie names are present, .get() returns the last value —
  // consistent with the @edge-runtime/cookies behaviour used in NextRequest route handlers.
  const rawToken = cookieStore.get(AH_SESSION_COOKIE)?.value ?? null;
  if (!rawToken) return null;
  return validateAccountHolderSessionFromRawToken(rawToken);
}

/**
 * Get the Learner session in a server component.
 * Returns null if no valid session exists.
 */
export async function getLearnerSessionFromHeaders(): Promise<LearnerSessionData | null> {
  const req = await buildRequestFromHeaders();
  return getLearnerSession(req);
}
