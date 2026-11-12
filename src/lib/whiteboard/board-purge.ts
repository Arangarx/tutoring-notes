import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { after } from "next/server";
import { deleteBlob } from "@/lib/blob";
import { listBlobsByPrefix } from "@/lib/blob-list";
import { resolveFrozenSessionCapabilities } from "@/lib/consent-scope";
import { db, withDbRetry } from "@/lib/db";
import {
  BOARD_PURGE_SECOND_PASS_DELAY_MS,
  BOARD_PURGE_STUCK_AFTER_MS,
  BOARD_PURGE_SWEEP_BATCH_LIMIT,
} from "@/lib/session-cleanup-config";
import { faultPoint, holdPoint } from "@/lib/test-seams";

/**
 * Board purge for a whiteboard-off session (consent wave C4b, plan §§ 3.2–3.3).
 *
 * The End transaction (and the shared stale stamp) writes an INTENT when the frozen capability says the
 * board is not kept. The purge then runs from that intent, after the response (`after()`) and from the
 * session-cleanup cron, in two passes: pass 2 is due `BOARD_PURGE_SECOND_PASS_DELAY_MS` after pass 1 so
 * a write that was in flight at End (an upload token minted before End) is caught.
 *
 * Deletes go by PREFIX ONLY. Nothing is deleted by a URL taken from a row, a request or a column, so a
 * tampered events URL can never point the purge at someone else's blob (R2).
 */

/** Who ended the session; logged on the intent. */
export type BoardPurgeIntentSource = "end" | "stale" | "forced" | "reaper";

/**
 * Every board blob a client can upload for this session. Trailing slash required, so session `abc` never
 * matches `abcd…`. The concat audio, the placeholder events blob and the server-assembled log live at
 * `whiteboard-sessions/<adminUserId>/<studentId>/<file>` and so are never under it.
 */
export function boardPurgeSessionPrefix(studentId: string, whiteboardSessionId: string): string {
  return `whiteboard-sessions/${studentId}/${whiteboardSessionId}/`;
}

/** Legacy recovery checkpoints the checkpoint route writes for the session. */
export function boardPurgeCheckpointPrefix(whiteboardSessionId: string): string {
  return `whiteboard-checkpoints/${whiteboardSessionId}/`;
}

/**
 * Call inside the End / stale-stamp transaction, after the conditional `endedAt` update won and after the
 * PENDING snapshot freeze. Reads the frozen capability; when the board is not kept, optionally deletes the
 * batch rows (End only: the org stamp loops must stay O(1) per session) and sets `boardPurgeRequestedAt`
 * once. Returns `purge: true` when the board is not kept, so End can put the URL columns back.
 * Takes no URL: the purge never needs one.
 */
export async function stampBoardPurgeIntent(
  tx: Prisma.TransactionClient,
  whiteboardSessionId: string,
  opts: { deleteRows: boolean; source: BoardPurgeIntentSource }
): Promise<{ purge: boolean }> {
  const capabilities = await resolveFrozenSessionCapabilities(whiteboardSessionId, tx);
  if (!capabilities || capabilities.whiteboard.persist) return { purge: false };
  if (opts.deleteRows) {
    await tx.whiteboardEventBatch.deleteMany({ where: { whiteboardSessionId } });
  }
  const serverNow = new Date();
  const stamped = await tx.whiteboardSession.updateMany({
    where: { id: whiteboardSessionId, boardPurgeRequestedAt: null },
    data: { boardPurgeRequestedAt: serverNow },
  });
  if (stamped.count === 1) {
    console.info(`[slc] wbsid=${whiteboardSessionId} action=board_purge_intent source=${opts.source}`);
  }
  return { purge: true };
}

export type BoardPurgeOutcome =
  | "no_intent"
  | "already_purged"
  | "skipped_unreadable"
  | "skipped_persist"
  | "not_due"
  | "blob_failed"
  | "pass1_done"
  | "pass2_done";

function urlHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

/** Deletes every blob under the two prefixes, then the batch rows. Returns false when any blob delete failed. */
async function deleteBoardByPrefix(
  whiteboardSessionId: string,
  studentId: string
): Promise<{ ok: boolean; blobs: number; rows: number }> {
  let ok = true;
  let blobs = 0;
  for (const prefix of [
    boardPurgeSessionPrefix(studentId, whiteboardSessionId),
    boardPurgeCheckpointPrefix(whiteboardSessionId),
  ]) {
    for (const blob of await listBlobsByPrefix(prefix)) {
      try {
        await deleteBlob(blob.url);
        blobs += 1;
      } catch {
        ok = false;
        console.warn(
          `[slc] wbsid=${whiteboardSessionId} action=board_purge_blob_failed urlHash=${urlHash(blob.pathname)}`
        );
      }
    }
  }
  const deleted = await withDbRetry(
    () => db.whiteboardEventBatch.deleteMany({ where: { whiteboardSessionId } }),
    { label: "boardPurge.batchDelete" }
  );
  return { ok, blobs, rows: deleted.count };
}

/**
 * One purge attempt for one session. Safe to run twice at once (the `after()` and the sweep): deletes are
 * idempotent and each stamp is written only where it is still null, so the first writer's stamp stands.
 */
export async function runBoardPurge(whiteboardSessionId: string): Promise<BoardPurgeOutcome> {
  const row = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: {
          studentId: true,
          boardPurgeRequestedAt: true,
          boardPurgeFirstPassAt: true,
          boardPurgedAt: true,
        },
      }),
    { label: "boardPurge.row" }
  );
  if (!row?.boardPurgeRequestedAt) return "no_intent";
  if (row.boardPurgedAt) return "already_purged";

  await withDbRetry(
    () =>
      db.whiteboardSession.update({
        where: { id: whiteboardSessionId },
        data: { boardPurgeAttemptedAt: new Date() },
      }),
    { label: "boardPurge.attempted" }
  );

  let capabilities: Awaited<ReturnType<typeof resolveFrozenSessionCapabilities>>;
  try {
    capabilities = await resolveFrozenSessionCapabilities(whiteboardSessionId);
  } catch {
    capabilities = null;
  }
  if (!capabilities) {
    console.warn(`[slc] wbsid=${whiteboardSessionId} action=board_purge_skipped reason=capability_unreadable`);
    return "skipped_unreadable";
  }
  if (capabilities.whiteboard.persist) {
    console.warn(`[slc] wbsid=${whiteboardSessionId} action=board_purge_skipped reason=capability_persist`);
    return "skipped_persist";
  }

  const firstPassAt = row.boardPurgeFirstPassAt;
  if (firstPassAt && Date.now() < firstPassAt.getTime() + BOARD_PURGE_SECOND_PASS_DELAY_MS) {
    return "not_due";
  }

  const result = await deleteBoardByPrefix(whiteboardSessionId, row.studentId);
  if (!result.ok) return "blob_failed";

  if (!firstPassAt) {
    await holdPoint("purge:pass1:after_delete_before_stamp", whiteboardSessionId);
    await withDbRetry(
      () =>
        db.whiteboardSession.updateMany({
          where: { id: whiteboardSessionId, boardPurgeFirstPassAt: null },
          data: { boardPurgeFirstPassAt: new Date() },
        }),
      { label: "boardPurge.pass1Stamp" }
    );
    console.info(
      `[slc] wbsid=${whiteboardSessionId} action=board_purge_pass1_done rows=${result.rows} blobs=${result.blobs}`
    );
    return "pass1_done";
  }

  await withDbRetry(
    () =>
      db.whiteboardSession.updateMany({
        where: { id: whiteboardSessionId, boardPurgedAt: null },
        data: { boardPurgedAt: new Date() },
      }),
    { label: "boardPurge.pass2Stamp" }
  );
  console.info(
    `[slc] wbsid=${whiteboardSessionId} action=board_purge_pass2_done rows=${result.rows} blobs=${result.blobs}`
  );
  console.info(`[slc] wbsid=${whiteboardSessionId} action=board_purge_done`);
  return "pass2_done";
}

/**
 * Runs the purge for these sessions after the response is sent. Best effort: the sweep is the backstop,
 * so a failure here (or no request scope) only logs.
 */
export function scheduleBoardPurgeAfterResponse(whiteboardSessionIds: readonly string[]): void {
  if (whiteboardSessionIds.length === 0) return;
  const ids = [...whiteboardSessionIds];
  try {
    after(async () => {
      for (const id of ids) {
        try {
          faultPoint("end:after_purge", id);
          await runBoardPurge(id);
        } catch (err) {
          console.warn(
            `[slc] wbsid=${id} action=board_purge_after_failed err=${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
  } catch (err) {
    console.warn(
      `[slc] action=board_purge_after_failed sessions=${ids.length} err=${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export type BoardPurgeSweepResult = {
  candidates: number;
  pass1: number;
  pass2: number;
  failed: number;
  skipped: number;
  stuck: number;
  stoppedAtDeadline: boolean;
};

/**
 * The purge sweep. Selects only rows that can make progress now (intent set, not purged, a snapshot that
 * says whiteboard off, pass 2 due if pass 1 ran), oldest attempt first so a row that keeps failing rotates
 * to the back. Checks `deadline` (an absolute time from the route's start) between candidates; starts no
 * clock of its own.
 */
export async function runBoardPurgeSweep(opts: { now?: Date; deadline: number }): Promise<BoardPurgeSweepResult> {
  faultPoint("cleanup:purge");
  const now = opts.now ?? new Date();

  const stuckBefore = new Date(now.getTime() - BOARD_PURGE_STUCK_AFTER_MS);
  const stuck = await db.$queryRaw<{ id: string; requestedAt: Date }[]>`
    SELECT id, "boardPurgeRequestedAt" AS "requestedAt" FROM "WhiteboardSession"
    WHERE "boardPurgeRequestedAt" IS NOT NULL
      AND "boardPurgedAt" IS NULL
      AND "boardPurgeRequestedAt" < ${stuckBefore}
    ORDER BY "boardPurgeRequestedAt" ASC
    LIMIT 50`;
  for (const s of stuck) {
    const ageMin = Math.floor((now.getTime() - s.requestedAt.getTime()) / 60_000);
    console.warn(`[slc] wbsid=${s.id} action=board_purge_stuck ageMin=${ageMin}`);
  }

  const secondPassDueBefore = new Date(now.getTime() - BOARD_PURGE_SECOND_PASS_DELAY_MS);
  const candidates = await db.$queryRaw<{ id: string }[]>`
    SELECT ws.id FROM "WhiteboardSession" ws
    JOIN "SessionConsentSnapshot" s ON s."whiteboardSessionId" = ws.id
    WHERE ws."boardPurgeRequestedAt" IS NOT NULL
      AND ws."boardPurgedAt" IS NULL
      AND s."allowWhiteboardRecording" = false
      AND (ws."boardPurgeFirstPassAt" IS NULL OR ws."boardPurgeFirstPassAt" <= ${secondPassDueBefore})
    ORDER BY ws."boardPurgeAttemptedAt" ASC NULLS FIRST, ws."boardPurgeRequestedAt" ASC
    LIMIT ${BOARD_PURGE_SWEEP_BATCH_LIMIT}`;

  const result: BoardPurgeSweepResult = {
    candidates: candidates.length,
    pass1: 0,
    pass2: 0,
    failed: 0,
    skipped: 0,
    stuck: stuck.length,
    stoppedAtDeadline: false,
  };
  for (const { id } of candidates) {
    if (Date.now() >= opts.deadline) {
      result.stoppedAtDeadline = true;
      break;
    }
    let outcome: BoardPurgeOutcome;
    try {
      outcome = await runBoardPurge(id);
    } catch (err) {
      console.error(
        `[slc] wbsid=${id} action=board_purge_sweep_error err=${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
    if (outcome === "pass1_done") result.pass1 += 1;
    else if (outcome === "pass2_done") result.pass2 += 1;
    else if (outcome === "blob_failed") result.failed += 1;
    else result.skipped += 1;
  }
  return result;
}
