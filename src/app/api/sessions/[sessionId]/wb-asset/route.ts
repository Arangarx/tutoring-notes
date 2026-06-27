import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { db, withDbRetry } from "@/lib/db";
import { env } from "@/lib/env";
import { getLearnerSession } from "@/lib/learner-session";
import { verifyIsSessionParticipant } from "@/lib/session-participant-scope";
import { isBlobUrlForSession } from "@/lib/whiteboard/blob-asset-in-scope";

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

  const { searchParams } = new URL(request.url);
  const u = searchParams.get("u");
  if (!u) {
    return new NextResponse("Missing u query parameter.", { status: 400 });
  }
  let publicUrl: string;
  try {
    publicUrl = decodeURIComponent(u);
    // Validate that it's a real URL before we hand it to @vercel/blob.
    // eslint-disable-next-line no-new
    new URL(publicUrl);
  } catch {
    return new NextResponse("Invalid u parameter.", { status: 400 });
  }

  // Auth: learner-session required.
  const learnerSession = await getLearnerSession(request);
  if (!learnerSession) {
    return new NextResponse("Unauthorized.", { status: 401 });
  }

  // Participant gate: learner must be an active participant.
  const isParticipant = await verifyIsSessionParticipant(
    learnerSession.learnerProfileId,
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

  // Path-namespace check: the URL must be scoped to this session's student.
  if (
    !isBlobUrlForSession(publicUrl, {
      studentId: session.studentId,
      whiteboardSessionId: sessionId,
    })
  ) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const result = await get(publicUrl, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const ct = result.blob.contentType ?? "application/octet-stream";
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
