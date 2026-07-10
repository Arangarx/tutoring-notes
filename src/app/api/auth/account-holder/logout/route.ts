/**
 * POST /api/auth/account-holder/logout
 *
 * Revokes the current AccountHolder session and clears the cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAccountHolderSession,
  revokeAccountHolderSession,
  clearAhSessionCookie,
} from "@/lib/account-holder-session";

export async function POST(req: NextRequest) {
  const session = await getAccountHolderSession(req);

  if (session) {
    await revokeAccountHolderSession(session.sessionId);
    console.log(`[ahx] ahx=${session.accountHolderId} action=logout session=${session.sessionId}`);
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": clearAhSessionCookie() } }
  );
}
