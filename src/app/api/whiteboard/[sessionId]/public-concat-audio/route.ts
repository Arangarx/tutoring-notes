import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { checkApiShareAccess } from "@/lib/share-access-scope";
import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";
import { env } from "@/lib/env";
import { isBlobHarnessActive } from "@/lib/blob-harness";

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
  if (!shareToken) {
    return NextResponse.json({ error: "Missing token." }, { status: 401 });
  }

  const access = await checkApiShareAccess(
    req,
    shareToken,
    `/api/whiteboard/${sessionId}/public-concat-audio?token=${shareToken}`
  );
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Access denied." },
      { status: access.status }
    );
  }

  const erasureBlocked = await assertStudentNotErasedApi(access.studentId, {
    salToken: shareToken,
  });
  if (erasureBlocked) return erasureBlocked;

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: {
      studentId: true,
      endedAt: true,
      concatBlobUrl: true,
    },
  });

  if (!session || session.studentId !== access.studentId) {
    return new NextResponse("Not found.", { status: 404 });
  }

  if (!session.endedAt) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const blobUrl = session.concatBlobUrl;
  if (!blobUrl) {
    return new NextResponse("Not found.", { status: 404 });
  }

  return streamBlobWithRangeSupport(req, blobUrl, "audio/webm");
}
