import { db, withDbRetry } from "@/lib/db";
import { createActionCorrelationId } from "@/lib/action-correlation";
import {
  assertWhiteboardReplayRequestAccess,
  fetchShareBlobWithBearer,
  gatePublicWbSessionBlob,
} from "@/lib/share/proxy-share-resource";

/**
 * Share-token gated proxy for the whiteboard event log.
 *
 * GET /api/whiteboard/[sessionId]/public-events?token=<shareToken>
 *
 * Auth: a valid, non-revoked ShareLink token whose student matches the
 * session, or a learner session that may view this replay (same ended /
 * note-linked / consent rules as the parent share card).
 *
 * Only ended sessions are accessible — we never expose a live in-
 * progress session's event stream on the public share surface.
 *
 * wbsid= logging mirrors the admin events route so share-page
 * event-log fetches appear in the observability log.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;
  const shareToken = new URL(req.url).searchParams.get("token");

  console.log(
    `[wbPublicEvents.route] GET wbsid=${sessionId} rid=${rid}`
  );

  const access = await assertWhiteboardReplayRequestAccess(
    req,
    sessionId,
    shareToken,
    shareToken
      ? `/api/whiteboard/${sessionId}/public-events?token=${shareToken}`
      : `/api/whiteboard/${sessionId}/public-events`
  );
  if (!access.ok) return access.response;

  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { studentId: true, eventsBlobUrl: true, endedAt: true },
      }),
    { label: "wbPublicEvents.route.session" }
  );

  const gated = gatePublicWbSessionBlob(
    session
      ? {
          studentId: session.studentId,
          endedAt: session.endedAt,
          blobUrl: session.eventsBlobUrl,
        }
      : null,
    access.studentId,
    {
      requireEnded: true,
      notEndedJsonError: "Session recording not yet available.",
      missingBlobJsonError: "No event log recorded for this session.",
    }
  );
  if (!gated.ok) return gated.response;

  const res = await fetchShareBlobWithBearer(gated.blobUrl, {
    contentType: "application/json",
    cacheMaxAge: 300,
    unavailableJsonError: "Event log unavailable.",
    logTag: "wbPublicEvents.route",
    sessionId,
    rid,
  });

  if (res.ok) {
    console.log(`[wbPublicEvents.route] wbsid=${sessionId} rid=${rid} ok`);
  }

  return res;
}
