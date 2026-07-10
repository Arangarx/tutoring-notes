/**
 * assertIsSessionParticipant — learner-session join guard (A7.2).
 *
 * Auth boundary: verifies the learner has an active SessionParticipant row for
 * the given WhiteboardSession. Used by /join/[sessionId] (page) and every
 * API route the student client calls during a live session.
 */

import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export interface SessionParticipantRow {
  id: string;
  whiteboardSessionId: string;
  learnerProfileId: string;
  joinedAt: Date;
  leftAt: Date | null;
}

/**
 * Assert that the learner is an authorized participant in the given session.
 * Returns the SessionParticipant row on success; calls notFound() on failure.
 *
 * Auth boundary (BLOCKER): learner A cannot reach learner B's session —
 * a mismatched learnerProfileId produces not_participant → 404.
 * Participants who have left (leftAt set) are also denied.
 *
 * For use in **server component / page routes** where Next.js can catch
 * notFound(). Use `verifyIsSessionParticipant` in API route handlers instead.
 */
export async function assertIsSessionParticipant(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<SessionParticipantRow> {
  const participant = await db.sessionParticipant.findUnique({
    where: {
      whiteboardSessionId_learnerProfileId: {
        whiteboardSessionId,
        learnerProfileId,
      },
    },
  });

  if (!participant || participant.leftAt != null) {
    console.error(
      `[lpr] lpr=${learnerProfileId} action=join_denied sessionId=${whiteboardSessionId} reason=not_participant`
    );
    notFound();
    // notFound() throws NEXT_NOT_FOUND — unreachable but required for TS return type.
    throw new Error("unreachable");
  }

  console.info(
    `[lpr] lpr=${learnerProfileId} action=session_join_granted sessionId=${whiteboardSessionId}`
  );
  return participant;
}

/**
 * Non-throwing participant check for use in **API route handlers**.
 * Returns true when the learner has an active participant row; false otherwise.
 * Does not emit logs (callers log as appropriate for their context).
 */
export async function verifyIsSessionParticipant(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<boolean> {
  const participant = await db.sessionParticipant.findUnique({
    where: {
      whiteboardSessionId_learnerProfileId: {
        whiteboardSessionId,
        learnerProfileId,
      },
    },
  });
  return !!(participant && participant.leftAt == null);
}

/**
 * Look up a SessionParticipant row by (learnerProfileId, whiteboardSessionId),
 * regardless of leftAt status.
 *
 * Use when you need to distinguish "never a participant" (row absent → 404)
 * from "was a participant but has since left" (row present, leftAt set).
 * Unlike verifyIsSessionParticipant this does NOT require leftAt == null.
 */
export async function findSessionParticipantRow(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<SessionParticipantRow | null> {
  return db.sessionParticipant.findUnique({
    where: {
      whiteboardSessionId_learnerProfileId: {
        whiteboardSessionId,
        learnerProfileId,
      },
    },
  });
}
