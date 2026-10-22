import { db, withDbRetry } from "@/lib/db";
import { createActionCorrelationId } from "@/lib/action-correlation";
import {
  assertWhiteboardReplayRequestAccess,
  fetchShareBlobWithBearer,
  gatePublicWbSessionBlob,
} from "@/lib/share/proxy-share-resource";

/**
 * Share-token gated proxy for the whiteboard final-snapshot PNG.
 *
 * GET /api/whiteboard/[sessionId]/public-snapshot?token=<shareToken>
 *
 * Same trust model as public-events: valid ShareLink whose student
 * matches the session and whose linked note is replay-visible (not
 * DRAFT), or a learner session that may view this replay. Only ended
 * sessions are accessible.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;
  const shareToken = new URL(req.url).searchParams.get("token");

  console.log(
    `[wbPublicSnapshot.route] GET wbsid=${sessionId} rid=${rid}`
  );

  const access = await assertWhiteboardReplayRequestAccess(
    req,
    sessionId,
    shareToken,
    shareToken
      ? `/api/whiteboard/${sessionId}/public-snapshot?token=${shareToken}`
      : `/api/whiteboard/${sessionId}/public-snapshot`
  );
  if (!access.ok) return access.response;

  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          studentId: true,
          snapshotBlobUrl: true,
          endedAt: true,
        },
      }),
    { label: "wbPublicSnapshot.route.session" }
  );

  const gated = gatePublicWbSessionBlob(
    session
      ? {
          studentId: session.studentId,
          endedAt: session.endedAt,
          blobUrl: session.snapshotBlobUrl,
        }
      : null,
    access.studentId,
    {
      requireEnded: true,
      notEndedJsonError: "Session recording not yet available.",
      missingBlobJsonError: "No snapshot for this session.",
    }
  );
  if (!gated.ok) return gated.response;

  const res = await fetchShareBlobWithBearer(gated.blobUrl, {
    contentType: "image/png",
    cacheMaxAge: 3600,
    unavailableJsonError: "Snapshot unavailable.",
    logTag: "wbPublicSnapshot.route",
    sessionId,
    rid,
  });

  if (res.ok) {
    console.log(`[wbPublicSnapshot.route] wbsid=${sessionId} rid=${rid} ok`);
  }

  return res;
}
