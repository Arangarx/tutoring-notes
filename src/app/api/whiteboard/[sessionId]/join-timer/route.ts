import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";

/**
 * Read-only live timer for the anonymous student join page.
 *
 * GET /api/whiteboard/[sessionId]/join-timer?token=<joinToken>
 *
 * Auth: the join token in the query string. Same gate as `GET /w/[token]`.
 * The logged-in timer-anchor route is tutor-only; this exists so the
 * student can display the same billable clock without a session cookie.
 *
 * **Session end / revoke:** when the tutor finishes the room, join tokens
 * are revoked and/or `WhiteboardSession.endedAt` is set. Returning **404**
 * made the student's poll silently ignore failures — tabs stayed “live”.
 * Closed states now respond with **`200`** and `{ live: false, reason }`
 * so the SPA can disconnect sync + show tutor-ended copy **without**
 * weakening the gate for genuinely unknown tokens (still **404**).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { error: "Query parameter 'token' is required." },
      { status: 400 }
    );
  }

  const now = new Date();
  const tokenRow = await withDbRetry(
    () =>
      db.whiteboardJoinToken.findUnique({
        where: { token },
        select: {
          whiteboardSessionId: true,
          expiresAt: true,
          revokedAt: true,
          whiteboardSession: { select: { id: true, endedAt: true } },
        },
      }),
    { label: "joinTimer.findToken" }
  );

  if (!tokenRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (tokenRow.whiteboardSessionId !== sessionId) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const sessionEnded = Boolean(tokenRow.whiteboardSession?.endedAt);
  const tokenExpired = tokenRow.expiresAt.getTime() <= now.getTime();
  const tokenRevoked = Boolean(tokenRow.revokedAt);

  if (tokenExpired) {
    return NextResponse.json(
      { live: false as const, reason: "token_expired" as const },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  if (sessionEnded) {
    return NextResponse.json(
      { live: false as const, reason: "session_ended" as const },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
  if (tokenRevoked) {
    return NextResponse.json(
      { live: false as const, reason: "token_revoked" as const },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { activeMs: true, lastActiveAt: true },
      }),
    { label: "joinTimer.findSession" }
  );

  return NextResponse.json(
    {
      live: true as const,
      activeMs: row?.activeMs ?? 0,
      lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
