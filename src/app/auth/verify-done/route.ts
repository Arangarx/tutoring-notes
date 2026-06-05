/**
 * GET /auth/verify-done?t=<handoffToken>
 *
 * Same-site intermediate page that completes AccountHolder session establishment
 * after email verification (Q1-A fix — session-wrong-identity-fix-design-2026-06-05.md).
 *
 * WHY THIS EXISTS (RC-B fix):
 *   /verify-email is reached from an email client click — a cross-site navigation.
 *   With SameSite=Strict, the browser does not send the existing AH session cookie
 *   on that request, AND some browsers (Edge, Chromium variants) may not commit a
 *   Set-Cookie header on a redirect response before dispatching the next request.
 *   This causes stale-cookie races where the wrong account's session survives.
 *
 *   By having /verify-email redirect here (same-site) and setting the cookie on
 *   THIS response — a clean top-level same-site GET — the Set-Cookie is applied
 *   before any subsequent navigation. The handoff token carries the raw session
 *   token and is HMAC-signed with a 90-second TTL.
 *
 * Security properties:
 *   - Handoff token is HMAC-signed; tampering yields null from consumeHandoffToken.
 *   - 90-second TTL; replaying within the window sets the same session (harmless).
 *   - No plaintext secret egress — token is signed server-side.
 *   - returnTo is re-validated here before redirect (defence-in-depth).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildAhSessionCookie,
  AH_SESSION_TTL_MS,
} from "@/lib/account-holder-session";
import { consumeHandoffToken } from "@/lib/crypto/handoff-token";

const isDev = process.env.NODE_ENV === "development";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const handoffParam = req.nextUrl.searchParams.get("t") ?? "";

  if (!handoffParam) {
    console.log(`[ahx] ahx=unknown action=verify_done_missing_token`);
    return NextResponse.redirect(`${origin}/account/login?error=link_invalid`);
  }

  const handoffSecret =
    process.env.AH_SESSION_HMAC_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!handoffSecret) {
    console.error(`[ahx] ahx=unknown action=verify_done_error reason=no_secret`);
    return NextResponse.redirect(`${origin}/account/login?error=internal`);
  }

  const payload = consumeHandoffToken(handoffParam, handoffSecret);
  if (!payload) {
    console.log(`[ahx] ahx=unknown action=verify_done_invalid_token`);
    return NextResponse.redirect(`${origin}/account/login?error=link_expired`);
  }

  console.log(
    `[ahx] ahx=${payload.accountHolderId} action=verify_done_set_cookie`
  );

  const expiresAt = new Date(Date.now() + AH_SESSION_TTL_MS);
  const cookie = buildAhSessionCookie(payload.rawSessionToken, expiresAt, isDev);

  // Re-validate returnTo defensively
  const safeReturn =
    payload.returnTo && /^\/[a-zA-Z0-9\-/_?=&%]*$/.test(payload.returnTo)
      ? payload.returnTo
      : null;
  const redirectUrl = safeReturn
    ? `${origin}${safeReturn}`
    : `${origin}/account/dashboard`;

  // Set-Cookie on a clean same-site response — fixes RC-B redirect timing race.
  return NextResponse.redirect(redirectUrl, {
    headers: { "Set-Cookie": cookie },
  });
}
