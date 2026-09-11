/**
 * POST /api/auth/account-holder/forgot-password
 *
 * Anti-enumeration: always returns 200.
 * Creates a PASSWORD_RESET token and sends via platform SMTP.
 * Only sends if account exists AND email is verified.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateRawToken, hashToken, EMAIL_TOKEN_TTL_MS_1H } from "@/lib/crypto/session-tokens";
import { sendAccountHolderEmail } from "@/lib/account-holder-email";
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

  if (row && row.emailVerifiedAt && !row.tombstonedAt) {
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

    const mailed = await sendAccountHolderEmail(
      {
        to: normalizedEmail,
        subject: "Reset your Mynk password",
        text: `We received a request to reset your Mynk account password.\n\nOpen this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
        actionUrl: resetUrl,
      },
      { accountHolderId: row.id }
    );

    if (!mailed.sent) {
      await db.accountHolderEmailToken.deleteMany({
        where: { tokenHash, consumedAt: null },
      });
      console.error(`[ahx] ahx=${row.id} action=reset_send_fail`);
    }
  }

  return NextResponse.json(OK_RESPONSE);
}
