import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isBlobHarnessActive } from "@/lib/blob-harness";
import { env } from "@/lib/env";
import {
  assertShareProxyAccess,
  gatePublicWbSessionBlob,
  streamShareBlobWithRange,
} from "@/lib/share/proxy-share-resource";

/**
 * Share-token gated proxy for the WS-G canonical concat replay blob.
 *
 * GET /api/whiteboard/[sessionId]/public-concat-audio?token=<shareToken>
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  if (!env.BLOB_READ_WRITE_TOKEN && !isBlobHarnessActive()) {
    return new NextResponse("Blob storage is not configured.", { status: 503 });
  }

  const shareToken = new URL(req.url).searchParams.get("token");

  const access = await assertShareProxyAccess(
    req,
    shareToken,
    `/api/whiteboard/${sessionId}/public-concat-audio?token=${shareToken}`
  );
  if (!access.ok) return access.response;

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: {
      studentId: true,
      endedAt: true,
      concatBlobUrl: true,
    },
  });

  const gated = gatePublicWbSessionBlob(
    session
      ? {
          studentId: session.studentId,
          endedAt: session.endedAt,
          blobUrl: session.concatBlobUrl,
        }
      : null,
    access.studentId,
    { requireEnded: true, plainTextErrors: true }
  );
  if (!gated.ok) return gated.response;

  return streamShareBlobWithRange(req, gated.blobUrl, "audio/webm");
}
