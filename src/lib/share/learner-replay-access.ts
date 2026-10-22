import { db, withDbRetry } from "@/lib/db";
import { loadParentVisibleWhiteboardReplayIds } from "@/lib/share/loadWhiteboardReplayIdsForNotes";

/**
 * Ended, note-linked whiteboard replay a signed-in learner may open.
 *
 * Ownership is the session student's learner profile. Visibility reuses
 * {@link loadParentVisibleWhiteboardReplayIds} (ended, note-linked, and
 * the same consent rules as the parent share card) so the learner sees
 * exactly those replays. A missing share link is irrelevant — this path
 * is authorized by the learner session, not a token.
 *
 * Denials log `[lpr]`. Callers turn `ok: false` into notFound / 404.
 */
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
    `[lpr] lpr=${learnerProfileId} wbsid=${whiteboardSessionId} action=replay_denied reason=${reason}`
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

  return {
    ok: true,
    studentId: session.studentId,
    studentName: session.student.name,
    session,
  };
}
