import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";
import { logBlobEgressEvent } from "@/lib/observability/cost-events";

/**
 * Proxy private Vercel Blob audio to browsers on the share page.
 * Private blobs require a Bearer token — browsers can't fetch them directly.
 *
 * GET /api/audio/[recordingId]?token=<shareToken>
 *
 * Validates:
 *   1. The share link exists and is not revoked.
 *   2. The recording belongs to the share link's student.
 *   3. One of these sharing gates passes:
 *      - `shareRecordingInEmail` on the note; or
 *      - the note has any linked WhiteboardSession; or
 *      - audio was captured against a WB session (`SessionRecording.whiteboardSessionId`).
 *
 * Range support: forwards the inbound `Range` header to Vercel Blob
 * via `streamBlobWithRangeSupport` so parents can scrub the share
 * page audio. See helper docs for the full background.
 *
 * BLOB_EGRESS: logs optimistic egress cost when Content-Length is known (design §3.3.1).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ recordingId: string }> }
): Promise<Response> {
  const { recordingId } = await params;
  const url = new URL(req.url);
  const shareToken = url.searchParams.get("token");

  if (!shareToken) {
    return NextResponse.json({ error: "Missing token" }, { status: 401 });
  }

  const link = await db.shareLink.findUnique({
    where: { token: shareToken },
    select: { revokedAt: true, studentId: true },
  });
  if (!link || link.revokedAt) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  const recording = await db.sessionRecording.findFirst({
    where: {
      id: recordingId,
      studentId: link.studentId,
      OR: [
        { note: { shareRecordingInEmail: true } },
        {
          note: {
            whiteboardSessions: { some: { studentId: link.studentId } },
          },
        },
        {
          whiteboardSession: {
            studentId: link.studentId,
          },
        },
      ],
    },
    select: {
      blobUrl: true,
      mimeType: true,
      adminUserId: true,
      studentId: true,
      whiteboardSessionId: true,
    },
  });

  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const { blobUrl, mimeType } = recording;
  const response = await streamBlobWithRangeSupport(
    req,
    blobUrl,
    mimeType || "audio/mpeg"
  );

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    if (!Number.isNaN(bytes) && bytes > 0) {
      void logBlobEgressEvent({
        bytesTransferred: bytes,
        sessionRecordingId: recordingId,
        adminUserId: recording.adminUserId,
        studentId: recording.studentId,
        whiteboardSessionId: recording.whiteboardSessionId,
        sessionId: recording.whiteboardSessionId,
        metadata: { route: "share-audio-proxy" },
      });
    }
  }

  return response;
}
