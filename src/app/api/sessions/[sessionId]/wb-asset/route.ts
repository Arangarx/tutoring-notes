import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import { getLearnerSession } from "@/lib/learner-session";
import { getAccountHolderSession } from "@/lib/account-holder-session";
import { verifyIsSessionParticipant } from "@/lib/session-participant-scope";
import { resolveAhJoinLearnerProfileId } from "@/lib/join-scope";
import {
  isWbAssetUrlInSessionScope,
  parseWbAssetUrlFromSearchParams,
  streamPrivateWbAsset,
} from "@/lib/whiteboard/proxy-blob-asset";

/**
 * Learner-session-authed Vercel Blob read proxy for whiteboard assets.
 *
 * GET /api/sessions/[sessionId]/wb-asset?u=<encodedBlobUrl>
 *
 * Auth: `mynk_learner_session` cookie + active SessionParticipant row.
 * This is the authenticated-student counterpart of /api/w/[joinToken]/wb-asset
 * (which uses join-token auth for the legacy anonymous path). Both routes
 * stream private Blob objects to the student browser for image hydration.
 *
 * The anonymous /api/w/[joinToken]/wb-asset route is kept intact for
 * in-flight old links that go through the /w redirect bridge.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;

  if (!env.BLOB_READ_WRITE_TOKEN) {
    return new NextResponse("Blob storage is not configured.", { status: 503 });
  }

  const parsed = parseWbAssetUrlFromSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) return parsed.response;
  const { publicUrl } = parsed;

  // Auth: learner session OR account-holder session for a self-learner
  // (WB-JOIN-ADULT-LEARNER). Fail closed on any auth gap.
  let effectiveLearnerProfileId: string | null = null;

  const learnerSession = await getLearnerSession(request);
  if (learnerSession) {
    effectiveLearnerProfileId = learnerSession.learnerProfileId;
  } else {
    const ahSession = await getAccountHolderSession(request);
    if (ahSession) {
      const resolved = await resolveAhJoinLearnerProfileId(
        sessionId,
        ahSession.accountHolderId
      );
      if (resolved) effectiveLearnerProfileId = resolved.learnerProfileId;
    }
  }

  if (!effectiveLearnerProfileId) {
    return new NextResponse("Unauthorized.", { status: 401 });
  }

  // Participant gate: learner must be an active participant.
  const isParticipant = await verifyIsSessionParticipant(
    effectiveLearnerProfileId,
    sessionId
  );
  if (!isParticipant) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { id: true, studentId: true, endedAt: true },
      }),
    { label: "sessions-wb-asset.findSession" }
  );

  if (!session) {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (session.endedAt) {
    return new NextResponse("Session ended.", { status: 410 });
  }

  if (
    !isWbAssetUrlInSessionScope(publicUrl, {
      studentId: session.studentId,
      whiteboardSessionId: sessionId,
    })
  ) {
    return new NextResponse("Not found.", { status: 404 });
  }

  return streamPrivateWbAsset(publicUrl, { cacheMaxAge: 3600 });
}
