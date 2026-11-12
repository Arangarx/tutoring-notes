/**
 * The tutor device's local copies of a board (IndexedDB checkpoint + this tab's sessionStorage scene draft) and
 * the server's answer to "is this session over, and was its board kept?".
 *
 * Consent Q6: a whiteboard-off session keeps its device copy while it runs (crash recovery) and loses it once the
 * session has ended, including sessions ended elsewhere. A copy is only deleted on an explicit `persist: false`;
 * an unreadable answer keeps it.
 */
import { clearCheckpoint, listCheckpointsForTutor, whiteboardOwnerKey } from "@/lib/whiteboard/checkpoint-store";
import { clearSessionSceneDraft, listSessionSceneDraftIds } from "@/lib/whiteboard/session-scene-draft";

export type SessionEndStatus = { ended: boolean; persist: boolean | null };

const UNKNOWN: SessionEndStatus = { ended: false, persist: null };

/** GET `/api/whiteboard/[id]/session-ended`. Any failure reads as "not ended, unknown". */
export async function fetchSessionEndStatus(sessionId: string): Promise<SessionEndStatus> {
  try {
    const res = await fetch(`/api/whiteboard/${encodeURIComponent(sessionId)}/session-ended`, {
      credentials: "same-origin",
    });
    if (!res.ok) return UNKNOWN;
    const j = (await res.json()) as { ended?: unknown; persist?: unknown };
    return {
      ended: j.ended === true,
      persist: typeof j.persist === "boolean" ? j.persist : null,
    };
  } catch {
    return UNKNOWN;
  }
}

/**
 * Load-time sweep across every student of this tutor: delete the device copies of ended sessions whose board was
 * not kept. The current session is skipped (its own mount logic owns it).
 */
export async function clearEndedUnkeptBoardCopies(
  adminUserId: string,
  currentSessionId: string,
  isCancelled: () => boolean
): Promise<void> {
  const checkpoints = await listCheckpointsForTutor("whiteboard", adminUserId);
  const studentBySession = new Map(checkpoints.map((c) => [c.sessionId, c.studentId] as const));
  const sessionIds = new Set([...studentBySession.keys(), ...listSessionSceneDraftIds()]);
  sessionIds.delete(currentSessionId);

  for (const sessionId of sessionIds) {
    if (isCancelled()) return;
    const status = await fetchSessionEndStatus(sessionId);
    if (!status.ended || status.persist !== false) continue;
    const studentId = studentBySession.get(sessionId);
    if (studentId) {
      await clearCheckpoint("whiteboard", whiteboardOwnerKey(adminUserId, studentId, sessionId));
    }
    clearSessionSceneDraft(sessionId);
    console.info(
      `[wbr] wbr=${sessionId} action=device_copy_cleared reason=whiteboard_off_ended checkpoint=${studentId ? "yes" : "no"}`
    );
  }
}
