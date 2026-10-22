import { db, withDbRetry } from "@/lib/db";
import { isStudentContentAccessSuspended } from "@/lib/erasure/active-erasure-scope";
import { loadParentVisibleWhiteboardReplayIds } from "@/lib/share/loadWhiteboardReplayIdsForNotes";

/**
 * Ended, note-linked whiteboard replay a signed-in learner may open.
 *
 * Ownership is the session student's learner profile. Visibility reuses
 * {@link loadParentVisibleWhiteboardReplayIds} (ended, non-DRAFT note, and
 * the same consent rules as the parent share card) so the learner sees
 * exactly those replays. An erased student is not visible. A missing share
 * link is irrelevant — this path is authorized by the learner session, not
 * a token.
 *
 * Logs use `[lpr]`, the same prefix as the denials. `[sal] access_granted
 * principal=learner` stays the share-token line; this path has no token.
 * Callers turn `ok: false` into notFound / 404.
 */

const LOG_ID_MAX = 64;

/** Strip CR/LF and cap length so a route param cannot forge a second log line. */
export function sanitizeReplayLogId(value: string): string {
  return value.replace(/[\r\n]/g, "").slice(0, LOG_ID_MAX);
}

/** No learner session on a replay page or API. Callers that are APIs return 401. */
export function logLearnerReplayNoSession(args: {
  whiteboardSessionId?: string;
  recordingId?: string;
}): void {
  const wbsid = args.whiteboardSessionId
    ? ` wbsid=${sanitizeReplayLogId(args.whiteboardSessionId)}`
    : "";
  const recording = args.recordingId
    ? ` recordingId=${sanitizeReplayLogId(args.recordingId)}`
    : "";
  console.error(
    `[lpr] lpr=unknown${wbsid} action=replay_denied reason=no_session${recording}`
  );
}
const replaySessionSelect = {
  id: true,
  studentId: true,
  noteId: true,
  startedAt: true,
  endedAt: true,
  durationSeconds: true,
  concatBlobUrl: true,
  concatDurationSeconds: true,
  student: {
    select: {
      name: true,
      learnerProfileId: true,
      adminUserId: true,
      organizationId: true,
    },
  },
  audioRecordings: {
    select: {
      id: true,
      mimeType: true,
      durationSeconds: true,
      orderIndex: true,
    },
    orderBy: [{ orderIndex: "asc" as const }, { createdAt: "asc" as const }],
  },
};

export type LearnerReplaySession = NonNullable<
  Awaited<ReturnType<typeof loadReplaySession>>
>;

async function loadReplaySession(whiteboardSessionId: string) {
  return withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: replaySessionSelect,
      }),
    { label: "resolveLearnerWhiteboardReplay.session" }
  );
}

export type LearnerReplayAccess =
  | {
      ok: true;
      studentId: string;
      studentName: string;
      session: LearnerReplaySession;
    }
  | { ok: false; reason: "missing" | "not_owner" | "not_visible" };

function deny(
  learnerProfileId: string,
  whiteboardSessionId: string,
  reason: "missing" | "not_owner" | "not_visible"
): LearnerReplayAccess {
  console.error(
    `[lpr] lpr=${sanitizeReplayLogId(learnerProfileId)} wbsid=${sanitizeReplayLogId(whiteboardSessionId)} action=replay_denied reason=${reason}`
  );
  return { ok: false, reason };
}

export async function resolveLearnerWhiteboardReplay(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<LearnerReplayAccess> {
  const session = await loadReplaySession(whiteboardSessionId);
  if (!session) return deny(learnerProfileId, whiteboardSessionId, "missing");
  if (session.student.learnerProfileId !== learnerProfileId) {
    return deny(learnerProfileId, whiteboardSessionId, "not_owner");
  }
  if (await isStudentContentAccessSuspended(session.studentId)) {
    return deny(learnerProfileId, whiteboardSessionId, "not_visible");
  }
  if (!session.noteId) {
    return deny(learnerProfileId, whiteboardSessionId, "not_visible");
  }

  const visible = await loadParentVisibleWhiteboardReplayIds({
    noteIds: [session.noteId],
    learnerProfileId,
    students: [
      {
        id: session.studentId,
        adminUserId: session.student.adminUserId,
        organizationId: session.student.organizationId,
      },
    ],
  });
  const ids = visible.get(session.noteId) ?? [];
  if (!ids.includes(session.id)) {
    return deny(learnerProfileId, whiteboardSessionId, "not_visible");
  }

  console.log(
    `[lpr] lpr=${sanitizeReplayLogId(learnerProfileId)} wbsid=${sanitizeReplayLogId(whiteboardSessionId)} action=replay_granted principal=learner studentId=${sanitizeReplayLogId(session.studentId)}`
  );

  return {
    ok: true,
    studentId: session.studentId,
    studentName: session.student.name,
    session,
  };
}
