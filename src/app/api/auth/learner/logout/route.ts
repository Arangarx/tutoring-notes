/**
 * POST /api/auth/learner/logout
 *
 * Revokes the current learner device session and clears the cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLearnerSession, clearLearnerSessionCookie } from "@/lib/learner-session";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getLearnerSession(req);

  if (session) {
    await db.learnerDeviceSession.update({
      where: { id: session.sessionId },
      data: { revokedAt: new Date() },
    });
    console.log(
      `[lpr] lpr=${session.learnerProfileId} action=device_revoked session=${session.sessionId} revokedBy=self`
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Set-Cookie": clearLearnerSessionCookie() } }
  );
}
