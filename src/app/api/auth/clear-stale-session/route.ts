/**
 * Stale-session cookie-clearing bounce handler.
 *
 * Server components cannot set response headers on a redirect(), so
 * assertCanAccessShareLink routes through this handler when it detects a
 * session cookie that is present but invalid (expired / revoked / stale).
 *
 * This handler:
 *   1. Emits Set-Cookie headers with Max-Age=0 for both session cookies.
 *   2. Redirects to the ?then= URL (validated to a relative path).
 *
 * Typical destination: /account/login?returnTo=...&source=session_expired
 *
 * Security: ?then= is restricted to relative paths (must start with /)
 * to prevent open-redirect. Anything else falls back to /account/login.
 *
 * Log prefix: sal= is not emitted here — the caller already emits
 * action=access_denied_redirect reason=stale_session_cleared before redirecting.
 */

import { NextRequest, NextResponse } from "next/server";
import { AH_SESSION_COOKIE } from "@/lib/account-holder-session";
import { LEARNER_SESSION_COOKIE } from "@/lib/learner-session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const then = searchParams.get("then") ?? "";

  // Open-redirect guard: only allow relative paths.
  const target = then.startsWith("/") ? then : "/account/login";

  const response = NextResponse.redirect(new URL(target, req.url));

  // Emit Set-Cookie clearing both session cookies (Max-Age=0).
  // We use append so both headers survive — setting response.cookies would
  // deduplicate by name.
  response.headers.append(
    "Set-Cookie",
    `${AH_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );
  response.headers.append(
    "Set-Cookie",
    `${LEARNER_SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
  );

  return response;
}
