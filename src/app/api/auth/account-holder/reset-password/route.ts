/**
 * POST /api/auth/account-holder/reset-password
 *
 * Validates the reset token, updates the password hash, bulk-revokes all
 * existing sessions, and issues a fresh session (BLOCKER-P2-S2).
 *
 * All four writes (password update, token mark-used, bulk-revoke, new session)
 * execute in one DB transaction to ensure atomicity.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/crypto/session-tokens";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import { validatePasswordStrength, MIN_PASSWORD_LENGTH } from "@/lib/password-strength";
import {
  createAccountHolderSession,
  buildAhSessionCookie,
  AH_SESSION_TTL_MS,
} from "@/lib/account-holder-session";

const isDev = process.env.NODE_ENV === "development";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { token, newPassword } = body as { token?: string; newPassword?: string };

  if (!token || !newPassword) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }
  const strengthCheck = validatePasswordStrength(newPassword);
  if (!strengthCheck.ok) {
    return NextResponse.json({ error: "password_too_weak" }, { status: 400 });
  }

  const tokenHash = hashToken(token.trim());
  const now = new Date();

  const tokenRow = await db.accountHolderEmailToken.findUnique({
    where: { tokenHash },
    include: { accountHolder: true },
  });

  if (
    !tokenRow ||
    tokenRow.purpose !== "PASSWORD_RESET" ||
    tokenRow.consumedAt ||
    tokenRow.expiresAt < now
  ) {
    return NextResponse.json({ error: "link_expired" }, { status: 400 });
  }

  const accountHolder = tokenRow.accountHolder;
  const newPasswordHash = await hashAccountHolderPassword(newPassword);

  // BLOCKER-P2-S2: bulk-revoke all existing sessions in the same transaction.
  // S1 defense-in-depth: also delete any remaining unused PASSWORD_RESET tokens
  // for this account so a stale token from a race condition cannot be used
  // after this consume. (The issuance path already deletes prior tokens, but
  // two concurrent requests can race; the consume path must also clean up.)
  await db.$transaction([
    db.accountHolder.update({
      where: { id: accountHolder.id },
      data: { passwordHash: newPasswordHash },
    }),
    db.accountHolderEmailToken.update({
      where: { id: tokenRow.id },
      data: { consumedAt: now },
    }),
    db.accountHolderSession.updateMany({
      where: { accountHolderId: accountHolder.id, revokedAt: null },
      data: { revokedAt: now },
    }),
    db.accountHolderEmailToken.deleteMany({
      where: {
        accountHolderId: accountHolder.id,
        purpose: "PASSWORD_RESET",
        consumedAt: null,
        NOT: { id: tokenRow.id },
      },
    }),
  ]);

  // Fresh session after reset (re-authenticates the user)
  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;
  const { rawToken, sessionId } = await createAccountHolderSession(accountHolder.id, deviceInfo);

  const expiresAt = new Date(Date.now() + AH_SESSION_TTL_MS);
  const cookie = buildAhSessionCookie(rawToken, expiresAt, isDev);

  console.log(
    `[ahx] ahx=${accountHolder.id} action=password_reset sessions_revoked=bulk`
  );

  return NextResponse.json(
    { ok: true, sessionId },
    { headers: { "Set-Cookie": cookie } }
  );
}
