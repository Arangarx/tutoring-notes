import { db, withDbRetry } from "@/lib/db";
import { sanitizeReplayLogId } from "@/lib/share/learner-replay-access";
import { isReplayVisibleNoteStatus } from "@/lib/share/loadWhiteboardReplayIdsForNotes";

/**
 * Share-token whiteboard replay note gate.
 *
 * A parent share link may open an ended session that belongs to the share's
 * student only when {@link isReplayVisibleNoteStatus} passes — the same
 * non-DRAFT rule as the learner replay and the `/s/[token]` note list.
 * Consent stays on the card loaders; this gate does not re-apply it, so a
 * READY or SENT note that the share page links still opens.
 *
 * Missing, other-student, and still-live sessions return hidden=false so the
 * caller's existing ownership and ended-session responses stay in place.
 *
 * `[sal] sal=<token:8> action=access_denied ... reason=note_not_visible`.
 * The full token is never logged.
 */
export async function parentShareReplayNoteIsHidden(args: {
  shareToken: string;
  studentId: string;
  whiteboardSessionId: string;
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

  if (!session || session.studentId !== args.studentId || !session.endedAt) {
    return false;
  }
  if (isReplayVisibleNoteStatus(session.note?.status)) {
    return false;
  }

  const sal = sanitizeReplayLogId(args.shareToken).slice(0, 8);
  console.error(
    `[sal] sal=${sal} wbsid=${sanitizeReplayLogId(args.whiteboardSessionId)} action=access_denied studentId=${sanitizeReplayLogId(args.studentId)} reason=note_not_visible`
  );
  return true;
}
