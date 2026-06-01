/**
 * assertIsSessionParticipant — learner-session join guard (§7.2).
 *
 * P2a STUB: SessionParticipant model is not yet implemented (Phase 3).
 * Until Phase 3 wires the model and creates participant rows, all join
 * attempts return 404 (not_participant). This is the safe default —
 * it prevents any learner from joining a session that has no participant
 * authorization row.
 *
 * Phase 3 executor: replace this stub with the real implementation
 * using `db.sessionParticipant.findUnique(...)`. The function signature
 * must remain identical so call sites need no changes.
 *
 * SessionParticipant model shape (Phase 3):
 *   id: string
 *   whiteboardSessionId: string
 *   learnerProfileId: string
 *   @@unique([whiteboardSessionId, learnerProfileId])
 */

import { notFound } from "next/navigation";

/** Stub type matching the Phase 3 SessionParticipant model. */
export interface SessionParticipantStub {
  id: string;
  whiteboardSessionId: string;
  learnerProfileId: string;
}

/**
 * Assert that the learner is an authorized participant in the given session.
 * Returns the SessionParticipant row on success; calls notFound() on failure.
 *
 * P2a: always denies (SessionParticipant model not yet in schema).
 */
export async function assertIsSessionParticipant(
  learnerProfileId: string,
  whiteboardSessionId: string
): Promise<SessionParticipantStub> {
  // P2a stub: SessionParticipant model ships in Phase 3.
  // Log + deny — never returns a value in P2a.
  console.error(
    `[lpr] lpr=${learnerProfileId} action=join_denied sessionId=${whiteboardSessionId} reason=not_participant`
  );
  notFound();
  // notFound() throws NEXT_NOT_FOUND — TypeScript needs this for the return type.
  throw new Error("unreachable");
}
