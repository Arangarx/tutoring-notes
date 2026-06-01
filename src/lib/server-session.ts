/**
 * Server-component session helpers.
 *
 * These wrap the request-based session helpers for use in Next.js App Router
 * server components, which receive headers via `next/headers` rather than
 * a NextRequest object.
 *
 * SERVER-ONLY: never import on the client.
 */

import { headers } from "next/headers";
import {
  getAccountHolderSession,
  type AccountHolderSessionData,
} from "@/lib/account-holder-session";
import { getLearnerSession, type LearnerSessionData } from "@/lib/learner-session";

/** Build a minimal Request from the current server-component headers. */
async function buildRequestFromHeaders(): Promise<Request> {
  const headersList = await headers();
  const cookieHeader = headersList.get("cookie") ?? "";
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
