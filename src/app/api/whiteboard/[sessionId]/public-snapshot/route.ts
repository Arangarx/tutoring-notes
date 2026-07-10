import { db, withDbRetry } from "@/lib/db";
import { createActionCorrelationId } from "@/lib/action-correlation";
import {
  assertShareProxyAccess,
  fetchShareBlobWithBearer,
  gatePublicWbSessionBlob,
} from "@/lib/share/proxy-share-resource";

/**
 * Share-token gated proxy for the whiteboard final-snapshot PNG.
 *
 * GET /api/whiteboard/[sessionId]/public-snapshot?token=<shareToken>
 *
 * Same trust model as public-events: valid ShareLink whose studentId
 * matches the session's studentId. Only ended sessions are accessible.
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

  const access = await assertShareProxyAccess(
    req,
    shareToken,
    `/api/whiteboard/${sessionId}/public-snapshot?token=${shareToken}`
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
