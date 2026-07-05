import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";
import { env } from "@/lib/env";
import { isBlobHarnessActive } from "@/lib/blob-harness";

/**
 * Tutor-authenticated proxy for the WS-G canonical concat replay blob.
 *
 * GET /api/whiteboard/[sessionId]/concat-audio
 *
 * Reads `concatBlobUrl` from the session row (never accepts a raw blob URL
 * from the client). Ownership + erasure checks mirror `/api/audio/admin/…`.
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

  const session = await assertOwnsWhiteboardSession(sessionId);

  const erasureBlocked = await assertStudentNotErasedApi(session.studentId);
  if (erasureBlocked) return erasureBlocked;

  const row = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { concatBlobUrl: true },
  });

  const blobUrl = row?.concatBlobUrl;
  if (!blobUrl) {
    return new NextResponse("Not found.", { status: 404 });
  }

  return streamBlobWithRangeSupport(req, blobUrl, "audio/webm");
}
