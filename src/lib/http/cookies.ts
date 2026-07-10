/**
 * Shared HTTP cookie helpers.
 *
 * Canonical home for getCookieFromRequest — previously duplicated in
 * learner-session.ts and account-holder-session.ts (identical behavior).
 *
 * SERVER-ONLY: never import on the client.
 */

import type { NextRequest } from "next/server";

/**
 * Read a named cookie from a NextRequest (cookies.get) or a plain Request
 * (manual Cookie-header parse). First match wins on the header path.
 */
export function getCookieFromRequest(
  req: NextRequest | Request,
  name: string
): string | null {
  if ("cookies" in req && typeof (req as NextRequest).cookies?.get === "function") {
    return (req as NextRequest).cookies.get(name)?.value ?? null;
  }
  const cookieHeader = req.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
