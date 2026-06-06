/**
 * GET /verify-email?token=<rawToken>&type=ah[&returnTo=<path>]
 *
 * Verifies an AccountHolder email (signup or email-change).
 * On success: marks emailVerifiedAt, revokes prior sessions (Q2-A), creates a
 * new session, then redirects SAME-SITE to /auth/verify-done?t=<handoffToken>
 * — that page sets the mynk_ah_session cookie on a clean same-site response,
 * fixing the RC-B redirect-Set-Cookie timing race (Q1-A fix).
 *
 * On failure: redirects to /account/signup?error=link_expired.
 *
 * P2a: only `type=ah` is handled (AccountHolder SIGNUP_VERIFY).
 * The EMAIL_CHANGE purpose with targetLearnerProfileId is Phase 2c.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto/session-tokens";
import {
  createAccountHolderSession,
  revokeAllAccountHolderSessions,
} from "@/lib/account-holder-session";
import { createHandoffToken } from "@/lib/crypto/handoff-token";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawToken = searchParams.get("token") ?? "";
  const type = searchParams.get("type") ?? "";
  const returnToRaw = searchParams.get("returnTo") ?? "";

  // Use req.nextUrl.origin for same-deployment redirects (not getPublicBaseUrl)
  // so preview smoke-testing stays on the preview domain.
  const origin = req.nextUrl.origin;

  if (type !== "ah" || !rawToken) {
    return NextResponse.redirect(`${origin}/account/signup?error=link_invalid`);
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  const tokenRow = await db.accountHolderEmailToken.findUnique({
    where: { tokenHash },
    include: { accountHolder: true },
  });

  if (!tokenRow || tokenRow.purpose !== "SIGNUP_VERIFY") {
    return NextResponse.redirect(`${origin}/account/signup?error=link_invalid`);
  }

  if (tokenRow.consumedAt) {
    // Token already used — account should already be active. Point user at login.
    console.log(`[ahx] ahx=${tokenRow.accountHolderId} action=verify_email_already_used`);
    return NextResponse.redirect(`${origin}/account/login?notice=link_already_used`);
  }

  if (tokenRow.expiresAt < now) {
    console.log(`[ahx] ahx=${tokenRow.accountHolderId} action=verify_email_expired`);
    return NextResponse.redirect(`${origin}/account/signup?error=link_expired`);
  }

  const accountHolder = tokenRow.accountHolder;

  // Mark token consumed and set emailVerifiedAt in one transaction
  await db.$transaction([
    db.accountHolder.update({
      where: { id: accountHolder.id },
      data: { emailVerifiedAt: now },
    }),
    db.accountHolderEmailToken.update({
      where: { id: tokenRow.id },
      data: { consumedAt: now },
    }),
  ]);

  console.log(`[ahx] ahx=${accountHolder.id} action=email_verified`);

  // Q2-A: revoke any prior sessions for this account before creating a new one.
  // This is verify-only hygiene — login does NOT revoke (multi-device friendly).
  const revokedCount = await revokeAllAccountHolderSessions(accountHolder.id);
  if (revokedCount > 0) {
    console.log(
      `[ahx] ahx=${accountHolder.id} action=verify_revoke_prior_sessions count=${revokedCount}`
    );
  }

  // Create new session (Q1-A: no Set-Cookie here — the cookie is set by /auth/verify-done)
  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;
  const { rawToken: sessionToken } = await createAccountHolderSession(
    accountHolder.id,
    deviceInfo
  );

  // Sanitize returnTo: only relative paths starting with /
  const safeReturn =
    returnToRaw && /^\/[a-zA-Z0-9\-/_?=&%]*$/.test(returnToRaw) ? returnToRaw : null;

  // Q1-A: mint a short-lived HMAC-signed handoff token; embed the raw session token
  // so /auth/verify-done can set the cookie on a clean same-site GET response.
  const handoffSecret =
    process.env.AH_SESSION_HMAC_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!handoffSecret) {
    console.error(`[ahx] ahx=${accountHolder.id} action=verify_handoff_error reason=no_secret`);
    return NextResponse.redirect(`${origin}/account/login?error=internal`);
  }

  const handoff = createHandoffToken(
    sessionToken,
    accountHolder.id,
    safeReturn,
    handoffSecret
  );

  // Redirect same-site — NO Set-Cookie on this response.
  // The cookie is established by /auth/verify-done on the next request.
  const verifyDoneUrl = new URL(`${origin}/auth/verify-done`);
  verifyDoneUrl.searchParams.set("t", handoff);

  console.log(`[ahx] ahx=${accountHolder.id} action=verify_redirecting_to_verify_done`);
  return NextResponse.redirect(verifyDoneUrl.toString());
}
