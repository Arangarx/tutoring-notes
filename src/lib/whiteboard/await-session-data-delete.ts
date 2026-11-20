"use client";

import { deleteWhiteboardSessionAndDataAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";

/**
 * Await session erasure. Callers navigate only when `ok` is true.
 *
 * Shared by the waiting-room cancel, the review-page delete, the resume
 * gate, and the student-list cancel. Navigating or refreshing first reports
 * a delete that may never commit, so the session row and the student's data
 * survive a delete the UI already called done.
 */
export type SessionDeleteCommit =
  | { ok: true }
  | { ok: false; error: string; threw: boolean; thrown?: unknown };

/**
 * `errLine` logs `console.error(\`${errLine} err=${detail}\`)` on every failure.
 * `thrownLine` logs `console.error(thrownLine, thrown)` only when the action threw.
 * Pass the existing `[nsi] ...` text. Do not include an ` err=` suffix.
 */
export type SessionDeleteLog = { errLine: string } | { thrownLine: string };

function failureDetail(error: string, threw: boolean, thrown: unknown): string {
  if (!threw) return error;
  return thrown instanceof Error ? thrown.message : String(thrown);
}

function logDeleteFailure(
  log: SessionDeleteLog | undefined,
  failure: { error: string; threw: boolean; thrown?: unknown },
): void {
  if (!log) return;
  if ("thrownLine" in log) {
    if (failure.threw) {
      console.error(log.thrownLine, failure.thrown);
    }
    return;
  }
  console.error(
    `${log.errLine} err=${failureDetail(failure.error, failure.threw, failure.thrown)}`,
  );
}

export async function awaitSessionDataDelete(
  whiteboardSessionId: string,
  fallbackError: string,
  log?: SessionDeleteLog,
): Promise<SessionDeleteCommit> {
  try {
    const result = await deleteWhiteboardSessionAndDataAction(whiteboardSessionId);
    if (result.ok) return { ok: true };
    const failure = {
      ok: false as const,
      error: result.error ?? fallbackError,
      threw: false as const,
    };
    logDeleteFailure(log, failure);
    return failure;
  } catch (err: unknown) {
    const failure = {
      ok: false as const,
      error: fallbackError,
      threw: true as const,
      thrown: err,
    };
    logDeleteFailure(log, failure);
    return failure;
  }
}
