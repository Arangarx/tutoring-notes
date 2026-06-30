import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { getLearnerSession } from "@/lib/learner-session";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { findSessionParticipantRow } from "@/lib/session-participant-scope";
import { resolveAhJoinLearnerProfileId } from "@/lib/join-scope";

/**
 * Read-only live timer for the student join page.
 *
 * GET /api/whiteboard/[sessionId]/join-timer?token=<joinToken>
 * GET /api/whiteboard/[sessionId]/join-timer  (learner-session cookie auth)
 *
 * Auth (two branches, both gate on same session):
 *   - Token branch: `?token=<joinToken>` query parameter (legacy anonymous path
 *     and /w/[joinToken] redirect bridge). Validates the join token is live,
 *     not revoked, and belongs to this session.
 *   - Learner-session branch: `mynk_learner_session` cookie. Validates the
 *     learner has an active SessionParticipant row for this session. Used by
 *     the authenticated /join/[sessionId] path. No `?token=` required.
 *
 * Response includes `sessionPhase` ("PENDING"|"ACTIVE") in the live:true body
 * so the student client can detect the PENDING→ACTIVE transition.
 *
 * **Session end / revoke:** closed states respond with 200 + `{ live: false,
 * reason }` so the SPA can disconnect sync + show tutor-ended copy without
 * weakening the gate for genuinely unknown tokens (still 404).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  // -------------------------------------------------------------------------
  // Token branch (legacy + /w redirect bridge)
  // -------------------------------------------------------------------------
  if (token) {
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
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (sessionEnded) {
      return NextResponse.json(
        { live: false as const, reason: "session_ended" as const },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (tokenRevoked) {
      return NextResponse.json(
        { live: false as const, reason: "token_revoked" as const },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const row = await withDbRetry(
      () =>
        db.whiteboardSession.findUnique({
          where: { id: sessionId },
          select: { activeMs: true, lastActiveAt: true, sessionPhase: true },
        }),
      { label: "joinTimer.findSession" }
    );

    return NextResponse.json(
      {
        live: true as const,
        activeMs: row?.activeMs ?? 0,
        lastActiveAt: row?.lastActiveAt?.toISOString() ?? null,
        sessionPhase: (row?.sessionPhase as "PENDING" | "ACTIVE" | undefined) ?? "ACTIVE",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // -------------------------------------------------------------------------
  // Learner-session branch (/join/[sessionId] authenticated path)
  // -------------------------------------------------------------------------

  // Resolve which learnerProfileId has access: learner session OR account-holder
  // session for a self-learner (WB-JOIN-ADULT-LEARNER).
  let effectiveLearnerProfileId: string | null = null;

  const learnerSession = await getLearnerSession(req);
  if (learnerSession) {
    effectiveLearnerProfileId = learnerSession.learnerProfileId;
  } else {
    // Account-holder self-learner path.
    const ahSession = await getAccountHolderSession(req);
    if (ahSession) {
      const resolved = await resolveAhJoinLearnerProfileId(
        sessionId,
        ahSession.accountHolderId
      );
      if (resolved) effectiveLearnerProfileId = resolved.learnerProfileId;
    }
  }

  if (!effectiveLearnerProfileId) {
    return NextResponse.json(
      { error: "Missing authentication. Provide ?token= or a valid session cookie." },
      { status: 400 }
    );
  }

  // Step 1: Verify the learner was EVER a participant (existence check, leftAt ignored).
  // Security boundary: a learner who was NEVER a participant gets 404 — same as before.
  const participantRow = await findSessionParticipantRow(
    effectiveLearnerProfileId,
    sessionId
  );
  if (!participantRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Step 2: Load the session to check endedAt BEFORE consulting leftAt.
  // This is the key fix: endWhiteboardSession atomically stamps leftAt on all
  // participant rows AND sets endedAt. We must check endedAt first so that
  // a just-ended session returns session_ended rather than 404 → link_invalid.
  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { activeMs: true, lastActiveAt: true, sessionPhase: true, endedAt: true },
      }),
    { label: "joinTimer.findSessionLearner" }
  );

  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (row.endedAt) {
    return NextResponse.json(
      { live: false as const, reason: "session_ended" as const },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Step 3: Session is still live. If the participant left mid-session (leftAt
  // set but endedAt not yet set), they are no longer in the room — deny.
  if (participantRow.leftAt != null) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      live: true as const,
      activeMs: row.activeMs ?? 0,
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
      sessionPhase: (row.sessionPhase as "PENDING" | "ACTIVE" | undefined) ?? "ACTIVE",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
