/**
 * POST /api/auth/account-holder/login
 *
 * Authenticates an AccountHolder via email + password.
 * Always runs bcrypt.compare to prevent timing side-channels.
 * Anti-enumeration: responds 401 for both "not found" and "wrong password".
 *
 * BLOCKER-P2-S1: issues a FRESH AccountHolderSession on every successful login.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyAccountHolderPassword,
  dummyHashCompare,
} from "@/lib/account-holder-auth";
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

  const { email, password } = body as { email?: string; password?: string };

  const normalizedEmail = (email ?? "").trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const row = await db.accountHolder.findUnique({
    where: { email: normalizedEmail },
  });

  // Always run bcrypt (even if no row) to prevent timing side-channel
  let matched: boolean;
  if (row) {
    matched = await verifyAccountHolderPassword(password, row.passwordHash);
  } else {
    await dummyHashCompare();
    matched = false;
  }

  if (!matched) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  // Safe to reveal email-not-verified only AFTER password matches
  if (!row!.emailVerifiedAt) {
    return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
  }

  if (row!.tombstonedAt) {
    // Treat tombstoned account same as invalid (no enumeration)
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const deviceInfo = req.headers.get("user-agent")?.substring(0, 128) ?? null;
  const { rawToken, sessionId } = await createAccountHolderSession(row!.id, deviceInfo);

  const expiresAt = new Date(Date.now() + AH_SESSION_TTL_MS);
  const cookie = buildAhSessionCookie(rawToken, expiresAt, isDev);

  // Phase 6: AccountHolder2FA enrollment check will gate on twoFactorVerified here.
  // For Phase 2, no AccountHolder 2FA is enrolled — always route to dashboard.
  const has2FA = false;

  console.log(
    `[ahx] ahx=${row!.id} action=login session=${sessionId} twoFactorRequired=${has2FA}`
  );

  return NextResponse.json(
    { next: "dashboard" },
    { headers: { "Set-Cookie": cookie } }
  );
}
