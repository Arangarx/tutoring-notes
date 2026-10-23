import { db, withDbRetry } from "@/lib/db";
import { sanitizeReplayLogId } from "@/lib/share/learner-replay-access";
import { isReplayVisibleNoteStatus } from "@/lib/share/loadWhiteboardReplayIdsForNotes";

function logNoteNotVisible(args: {
  shareToken: string;
  studentId: string;
  whiteboardSessionId?: string | null;
}): void {
  const sal = sanitizeReplayLogId(args.shareToken).slice(0, 8);
  const wbsid = args.whiteboardSessionId
    ? ` wbsid=${sanitizeReplayLogId(args.whiteboardSessionId)}`
    : "";
  console.error(
    `[sal] sal=${sal}${wbsid} action=access_denied studentId=${sanitizeReplayLogId(args.studentId)} reason=note_not_visible`
  );
}

/**
 * Share-token whiteboard replay note gate.
 *
 * A parent share link may open an ended session that belongs to the share's
 * student only when {@link isReplayVisibleNoteStatus} passes — the same
 * non-DRAFT rule as the learner replay and the `/s/[token]` note list.
 * Consent stays on the card loaders; this gate does not re-apply it, so a
 * READY or SENT note that the share page links still opens.
 *
 * Missing and other-student sessions return hidden=false so the caller's
 * ownership response stays in place. A still-live session does too, unless
 * `denyLiveSession` is set — the audio proxy has no separate "not ended"
 * response, so that path hides the live session with the same log.
 *
 * `[sal] sal=<token:8> action=access_denied ... reason=note_not_visible`.
 * The full token is never logged.
 */
export async function parentShareReplayNoteIsHidden(args: {
  shareToken: string;
  studentId: string;
  whiteboardSessionId: string;
  denyLiveSession?: boolean;
}): Promise<boolean> {
  const session = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: args.whiteboardSessionId },
        select: {
          studentId: true,
          endedAt: true,
          note: { select: { status: true } },
        },
      }),
    { label: "parentShareReplay.note" }
  );

  if (!session || session.studentId !== args.studentId) {
    return false;
  }
  if (!session.endedAt) {
    if (!args.denyLiveSession) return false;
    logNoteNotVisible(args);
    return true;
  }
  if (isReplayVisibleNoteStatus(session.note?.status)) {
    return false;
  }

  logNoteNotVisible(args);
  return true;
}

/**
 * Share-token audio note gate.
 *
 * Audio is served only when the note is replay-visible ({@link isReplayVisibleNoteStatus})
 * and, if the recording or its note is tied to a whiteboard session, that
 * session has ended. A still-live session is hidden here because this path
 * has no separate "not ended" response. Email-only audio (no session on the
 * recording and none on the note) follows the same note-status rule.
 */
export async function parentShareAudioNoteIsHidden(args: {
  shareToken: string;
  studentId: string;
  whiteboardSessionId: string | null;
  note: { status: string; whiteboardSessionId: string | null } | null;
}): Promise<boolean> {
  if (args.whiteboardSessionId) {
    return parentShareReplayNoteIsHidden({
      shareToken: args.shareToken,
      studentId: args.studentId,
      whiteboardSessionId: args.whiteboardSessionId,
      denyLiveSession: true,
    });
  }

  if (!isReplayVisibleNoteStatus(args.note?.status)) {
    logNoteNotVisible({
      shareToken: args.shareToken,
      studentId: args.studentId,
      whiteboardSessionId: args.note?.whiteboardSessionId,
    });
    return true;
  }

  const noteSessionId = args.note?.whiteboardSessionId;
  if (!noteSessionId) return false;

  return parentShareReplayNoteIsHidden({
    shareToken: args.shareToken,
    studentId: args.studentId,
    whiteboardSessionId: noteSessionId,
    denyLiveSession: true,
  });
}
