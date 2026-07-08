"use client";

/**
 * Gate/roster End-and-review outbox drain → finalize glue (WS-N4).
 *
 * Intentionally mirrors `WhiteboardWorkspaceClient.handleEndSession` steps
 * 3 → 4 → 6 → 7 (drain → assemble → finalizeWhiteboardSessionFromBackend →
 * finalizeOutboxAfterEnd). Consolidating the in-live End path onto this
 * helper is deferred tracked debt — the live workspace path is fragile and
 * must not be refactored in the same change.
 */

import {
  finalizeWhiteboardSessionFromBackend,
  type FinalizeWhiteboardSessionFromBackendResult,
} from "@/app/admin/students/[id]/whiteboard/actions";
import {
  assembleEndSessionSegments,
  drainOutboxOrTimeout,
  finalizeOutboxAfterEnd,
  registerSessionStudentId,
} from "@/lib/recording/upload-outbox-instance";

export type FinalizeWhiteboardSessionWithOutboxOpts = {
  finalEventsBlobUrl?: string;
  snapshotBlobUrl?: string | null;
};

export type FinalizeWhiteboardSessionWithOutboxResult =
  | {
      ok: false;
      timedOut: true;
      remainingCount: number;
      lastError: string | null;
      error: string;
    }
  | FinalizeWhiteboardSessionFromBackendResult;

function buildDrainTimeoutError(
  remainingCount: number,
  lastError: string | null
): string {
  return lastError
    ? `Couldn't finalize — ${remainingCount} audio segment${remainingCount === 1 ? "" : "s"} still saving. Last error: ${lastError}. Try again once your connection is healthy — your data isn't lost.`
    : `Couldn't finalize — ${remainingCount} audio segment${remainingCount === 1 ? "" : "s"} still saving. Try again in a moment, your data isn't lost.`;
}

/**
 * Drain the upload outbox, assemble orphan segments, and finalize the session
 * from the backend — the contract gate/roster End-and-review must match
 * in-live End (without events/snapshot upload steps 5/5b).
 */
export async function finalizeWhiteboardSessionWithOutbox(
  whiteboardSessionId: string,
  studentId: string,
  opts?: FinalizeWhiteboardSessionWithOutboxOpts
): Promise<FinalizeWhiteboardSessionWithOutboxResult> {
  registerSessionStudentId(whiteboardSessionId, studentId);

  const drainResult = await drainOutboxOrTimeout(whiteboardSessionId);
  if (drainResult.timedOut) {
    const remaining = drainResult.remainingCount;
    console.warn(
      `[finalize-whiteboard-session-client] wbsid=${whiteboardSessionId} finalize aborted: outbox drain timed out remaining=${remaining} lastError=${drainResult.lastError ?? "<none>"}`
    );
    return {
      ok: false,
      timedOut: true,
      remainingCount: remaining,
      lastError: drainResult.lastError,
      error: buildDrainTimeoutError(remaining, drainResult.lastError),
    };
  }

  const segments = await assembleEndSessionSegments(whiteboardSessionId);

  const finalizeResult = await finalizeWhiteboardSessionFromBackend(
    whiteboardSessionId,
    {
      ...opts,
      extraSegments: segments,
    }
  );

  if (!finalizeResult.ok) {
    return finalizeResult;
  }

  try {
    await finalizeOutboxAfterEnd(whiteboardSessionId);
  } catch (finalizeErr) {
    console.warn(
      `[finalize-whiteboard-session-client] wbsid=${whiteboardSessionId} finalizeOutboxAfterEnd:`,
      (finalizeErr as Error)?.message ?? finalizeErr
    );
  }

  return finalizeResult;
}
