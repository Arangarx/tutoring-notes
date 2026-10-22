import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { logBlobEgressEvent } from "@/lib/observability/cost-events";
import {
  resolveLearnerWhiteboardReplay,
  sanitizeReplayLogId,
} from "@/lib/share/learner-replay-access";
import { getLearnerSessionFromHeaders } from "@/lib/server-session";
import {
  assertShareProxyAccess,
  learnerReplayNoSessionResponse,
  streamShareBlobWithRange,
} from "@/lib/share/proxy-share-resource";

/**
 * Proxy private Vercel Blob audio to browsers on the share page.
 * Private blobs require a Bearer token — browsers can't fetch them directly.
 *
 * GET /api/audio/[recordingId]?token=<shareToken>
 * GET /api/audio/[recordingId] — learner session for a whiteboard replay
 *   the learner may view (same consent rules as the parent share). No token
 *   and no learner session is still 401.
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
    return serveLearnerWhiteboardRecording(req, recordingId);
  }

  const access = await assertShareProxyAccess(
    req,
    shareToken,
    `/api/audio/${recordingId}?token=${shareToken}`
  );
  if (!access.ok) return access.response;

  const recording = await db.sessionRecording.findFirst({
    where: {
      id: recordingId,
      studentId: access.studentId,
      OR: [
        { note: { shareRecordingInEmail: true } },
        {
          note: {
            whiteboardSessions: { some: { studentId: access.studentId } },
          },
        },
        {
          whiteboardSession: {
            studentId: access.studentId,
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

  return streamRecording(req, recordingId, recording, "share-audio-proxy");
}

type StreamableRecording = {
  blobUrl: string;
  mimeType: string | null;
  adminUserId: string | null;
  studentId: string;
  whiteboardSessionId: string | null;
};

async function streamRecording(
  req: Request,
  recordingId: string,
  recording: StreamableRecording,
  route: string
): Promise<Response> {
  const response = await streamShareBlobWithRange(
    req,
    recording.blobUrl,
    recording.mimeType || "audio/mpeg"
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
        route,
      });
    }
  }

  return response;
}

/** Learner-session audio for a whiteboard replay. Blobs stay private. */
async function serveLearnerWhiteboardRecording(
  req: Request,
  recordingId: string
): Promise<Response> {
  const learner = await getLearnerSessionFromHeaders();
  if (!learner) {
    return learnerReplayNoSessionResponse({ recordingId });
  }

  const recording = await db.sessionRecording.findUnique({
    where: { id: recordingId },
    select: {
      blobUrl: true,
      mimeType: true,
      adminUserId: true,
      studentId: true,
      whiteboardSessionId: true,
    },
  });
  if (!recording?.whiteboardSessionId) {
    console.error(
      `[lpr] lpr=${sanitizeReplayLogId(learner.learnerProfileId)} action=replay_denied reason=not_visible recordingId=${sanitizeReplayLogId(recordingId)}`
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const access = await resolveLearnerWhiteboardReplay(
    learner.learnerProfileId,
    recording.whiteboardSessionId
  );
  if (!access.ok) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (access.studentId !== recording.studentId) {
    console.error(
      `[lpr] lpr=${sanitizeReplayLogId(learner.learnerProfileId)} wbsid=${sanitizeReplayLogId(recording.whiteboardSessionId)} action=replay_denied reason=recording_student_mismatch recordingId=${sanitizeReplayLogId(recordingId)} studentId=${sanitizeReplayLogId(recording.studentId)}`
    );
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const erasureBlocked = await assertStudentNotErasedApi(recording.studentId);
  if (erasureBlocked) return erasureBlocked;

  return streamRecording(req, recordingId, recording, "learner-audio-proxy");
}
