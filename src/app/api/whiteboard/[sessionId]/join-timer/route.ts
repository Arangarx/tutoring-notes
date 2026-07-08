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
  //
  // Auth resolution MIRRORS the join page (src/app/join/[sessionId]/page.tsx):
  //   - A learner cookie is only honored if it is actually a participant of THIS
  //     session. A stale child cookie (e.g. from a prior wrong-PIN attempt) must
  //     NOT shadow the account-holder self-learner path — otherwise the poll binds
  //     to the wrong profile and 404s a legitimate adult self-learner.
  //   - Otherwise fall through to the account-holder self-learner path
  //     (resolveAhJoinLearnerProfileId — the SAME helper the page's Path B relies
  //     on, enforcing ownership + isSelfLearner).
  //   - A principal who is genuinely not a participant of THIS session still 404s.
  // -------------------------------------------------------------------------

  // Resolve which learnerProfileId has access: learner session OR account-holder
  // session for a self-learner (WB-JOIN-ADULT-LEARNER).
  let effectiveLearnerProfileId: string | null = null;
  // Reuse the participant row resolved during the cookie-trust check so the AH
  // path / step 1 below don't re-query it.
  let participantRow: Awaited<ReturnType<typeof findSessionParticipantRow>> = null;
  let learnerCookiePresent = false;

  const learnerSession = await getLearnerSession(req);
  if (learnerSession) {
    learnerCookiePresent = true;
    // Trust the learner cookie ONLY if its profile is a participant of this
    // session. findSessionParticipantRow is leftAt-agnostic so a genuine
    // participant whose session just ended (leftAt stamped by endWhiteboardSession)
    // is still trusted and reaches the endedAt → session_ended branch below.
    const row = await findSessionParticipantRow(
      learnerSession.learnerProfileId,
      sessionId
    );
    if (row) {
      effectiveLearnerProfileId = learnerSession.learnerProfileId;
      participantRow = row;
    }
    // else: stale / non-participant cookie → fall through to the AH path.
  }

  if (!effectiveLearnerProfileId) {
    // Account-holder self-learner path (mirrors join page Path B).
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
    // No usable principal resolved. If a learner cookie WAS present but was not a
    // participant (and the AH path didn't resolve), this is a stale/cross-learner
    // deny → fail closed with 404, matching the page's cross-learner boundary.
    // A genuinely unauthenticated poll (no cookie at all) gets 400.
    if (learnerCookiePresent) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Missing authentication. Provide ?token= or a valid session cookie." },
      { status: 400 }
    );
  }

  // Step 1: Verify the resolved learner was EVER a participant (existence check,
  // leftAt ignored). Already have the row when trusted via the cookie path; look
  // it up for the AH path. Security boundary: never-a-participant → 404.
  if (!participantRow) {
    participantRow = await findSessionParticipantRow(
      effectiveLearnerProfileId,
      sessionId
    );
  }
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
