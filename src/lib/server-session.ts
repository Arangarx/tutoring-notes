/**
 * Server-component session helpers.
 *
 * These wrap the request-based session helpers for use in Next.js App Router
 * server components. We use `cookies()` from `next/headers` (the idiomatic
 * RSC cookie API) rather than `headers().get("cookie")` because `cookies()`
 * is typed and more reliably populated in Next.js 15 RSC context.
 *
 * SERVER-ONLY: never import on the client.
 */

import { cookies } from "next/headers";
import {
  getAccountHolderSession,
  type AccountHolderSessionData,
} from "@/lib/account-holder-session";
import { getLearnerSession, type LearnerSessionData } from "@/lib/learner-session";

/** Build a minimal Request from the current server-component cookies. */
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
 * Returns null if no valid session exists.
 */
export async function getAccountHolderSessionFromHeaders(): Promise<AccountHolderSessionData | null> {
  const req = await buildRequestFromHeaders();
  return getAccountHolderSession(req);
}

/**
 * Get the Learner session in a server component.
 * Returns null if no valid session exists.
 */
export async function getLearnerSessionFromHeaders(): Promise<LearnerSessionData | null> {
  const req = await buildRequestFromHeaders();
  return getLearnerSession(req);
}
