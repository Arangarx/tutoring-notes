"use client";

import { deleteWhiteboardSessionAndDataAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";

/**
 * Await session erasure. Callers navigate only when `ok` is true.
 *
 * Shared by the waiting-room cancel, the review-page delete, and the
 * student-list cancel. Navigating or refreshing first reports a delete that
 * may never commit, so the session row and the student's data survive a
 * delete the UI already called done.
 */
export type SessionDeleteCommit =
  | { ok: true }
  | { ok: false; error: string; thrown: unknown | null };

export async function awaitSessionDataDelete(
  whiteboardSessionId: string,
  fallbackError: string,
): Promise<SessionDeleteCommit> {
  try {
    const result = await deleteWhiteboardSessionAndDataAction(whiteboardSessionId);
    if (result.ok) return { ok: true };
    return {
      ok: false,
      error: result.error ?? fallbackError,
      thrown: null,
    };
  } catch (err: unknown) {
    return { ok: false, error: fallbackError, thrown: err };
  }
}
