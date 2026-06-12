/**
 * POST /api/auth/account-holder/forgot-password
 *
 * Anti-enumeration: always returns 200.
 * Creates a PASSWORD_RESET token and stubs the email send.
 * Only sends if account exists AND email is verified.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateRawToken, hashToken, EMAIL_TOKEN_TTL_MS_1H } from "@/lib/crypto/session-tokens";
import { stubSendAccountHolderEmail } from "@/lib/account-holder-email";
import { getPublicBaseUrl } from "@/lib/public-url";

const OK_RESPONSE = {
  message: "If that email is registered, you'll receive a reset link.",
};

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { email } = body as { email?: string };
  const normalizedEmail = (email ?? "").trim().toLowerCase();

  if (!normalizedEmail) {
    return NextResponse.json(OK_RESPONSE);
  }

  const row = await db.accountHolder.findUnique({ where: { email: normalizedEmail } });

  // Only send reset email if account exists AND email is verified
  if (row && row.emailVerifiedAt && !row.tombstonedAt) {
    // Revoke any existing unused reset tokens for this account before creating
    // a new one. Prevents accumulation of valid reset tokens across repeated
    // requests (attacker IP-rotating to bypass the in-memory rate limit).
    await db.accountHolderEmailToken.deleteMany({
      where: {
        accountHolderId: row.id,
        purpose: "PASSWORD_RESET",
        consumedAt: null,
      },
    });

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS_1H);

    await db.accountHolderEmailToken.create({
      data: {
        accountHolderId: row.id,
        tokenHash,
        purpose: "PASSWORD_RESET",
        expiresAt,
      },
    });

    const base = getPublicBaseUrl();
    const resetUrl = `${base}/account/reset-password?token=${encodeURIComponent(rawToken)}`;

    await stubSendAccountHolderEmail({
      to: normalizedEmail,
      subject: "Reset your Mynk password",
      text: `We received a request to reset your Mynk account password.\n\nOpen this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      actionUrl: resetUrl,
    });
  }

  return NextResponse.json(OK_RESPONSE);
}
