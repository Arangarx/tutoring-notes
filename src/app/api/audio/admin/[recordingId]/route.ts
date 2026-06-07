import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStudentScope } from "@/lib/student-scope";
import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";
import { logBlobEgressEvent } from "@/lib/observability/cost-events";

/**
 * Proxy private Vercel Blob audio for authenticated admin/tutor users.
 * Unlike /api/audio/[recordingId] (share-token), this requires an active session.
 *
 * GET /api/audio/admin/[recordingId]
 *
 * Validates:
 *   1. The request has a valid admin session.
 *   2. The recording belongs to that admin (adminUserId matches).
 *
 * Range support: forwards the inbound `Range` header to Vercel Blob
 * via `streamBlobWithRangeSupport`. Without this, the whiteboard
 * replay scrubber is non-draggable on first load — see the helper
 * docs for the full background (Sarah-pilot scrubber regression).
 *
 * BLOB_EGRESS: logs optimistic egress cost when Content-Length is known (design §3.3.1).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ recordingId: string }> }
): Promise<Response> {
  const { recordingId } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recording = await db.sessionRecording.findFirst({
    where:
      scope.kind === "admin"
        ? { id: recordingId, adminUserId: scope.adminId }
        : { id: recordingId, student: { adminUserId: null } },
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

  const { blobUrl, mimeType: rawMime } = recording;
  const mimeBase =
    rawMime.split(";")[0].trim().toLowerCase() || "audio/mpeg";
  const contentType =
    mimeBase.startsWith("audio/") && mimeBase.includes("/")
      ? mimeBase
      : "audio/mpeg";

  const response = await streamBlobWithRangeSupport(req, blobUrl, contentType);

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
        metadata: { route: "admin-audio-proxy" },
      });
    }
  }

  return response;
}
