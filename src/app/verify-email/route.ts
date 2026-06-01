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
import { getPublicBaseUrl } from "@/lib/public-url";

const isDev = process.env.NODE_ENV === "development";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const rawToken = searchParams.get("token") ?? "";
  const type = searchParams.get("type") ?? "";
  const returnToRaw = searchParams.get("returnTo") ?? "";

  if (type !== "ah" || !rawToken) {
    const base = getPublicBaseUrl();
    return NextResponse.redirect(`${base}/account/signup?error=link_invalid`);
  }

  const tokenHash = hashToken(rawToken.trim());
  const now = new Date();

  const tokenRow = await db.accountHolderEmailToken.findUnique({
    where: { tokenHash },
    include: { accountHolder: true },
  });

  if (
    !tokenRow ||
    tokenRow.purpose !== "SIGNUP_VERIFY" ||
    tokenRow.consumedAt ||
    tokenRow.expiresAt < now
  ) {
    if (tokenRow && tokenRow.expiresAt < now) {
      console.log(`[ahx] ahx=${tokenRow.accountHolderId} action=verify_email_expired`);
    }
    const base = getPublicBaseUrl();
    return NextResponse.redirect(`${base}/account/signup?error=link_expired`);
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
  const base = getPublicBaseUrl();
  const redirectUrl = safeReturn ? `${base}${safeReturn}` : `${base}/account/dashboard`;

  return NextResponse.redirect(redirectUrl, {
    headers: { "Set-Cookie": cookie },
  });
}
