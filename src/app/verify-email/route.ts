/**
 * GET /verify-email?token=<rawToken>&type=ah[&returnTo=<path>]
 *
 * Verifies an AccountHolder email (signup or email-change).
 * On success: marks emailVerifiedAt, creates a session, redirects to returnTo or dashboard.
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
  buildAhSessionCookie,
  AH_SESSION_TTL_MS,
} from "@/lib/account-holder-session";
const isDev = process.env.NODE_ENV === "development";

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

  // Auto-login after verification
  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;
  const { rawToken: sessionToken } = await createAccountHolderSession(
    accountHolder.id,
    deviceInfo
  );

  const expiresAt = new Date(Date.now() + AH_SESSION_TTL_MS);
  const cookie = buildAhSessionCookie(sessionToken, expiresAt, isDev);

  // Sanitize returnTo: only relative paths starting with /
  const safeReturn =
    returnToRaw && /^\/[a-zA-Z0-9\-/_?=&%]*$/.test(returnToRaw) ? returnToRaw : null;
  const redirectUrl = safeReturn ? `${origin}${safeReturn}` : `${origin}/account/dashboard`;

  return NextResponse.redirect(redirectUrl, {
    headers: { "Set-Cookie": cookie },
  });
}
