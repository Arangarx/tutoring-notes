"use client";

/**
 * Ownership of a recording draft: "is a live recorder still writing this segment?"
 *
 * The draft row is shared per (session, stream), so the mount-time recovery scan can find a draft
 * that belongs to a LIVE recorder — another tab on the same session, or this tab's own new segment
 * once it has checkpointed. Recovering that row would enqueue a partial and delete the live
 * segment's draft (audio duplicated, partial row on the server).
 *
 * Mechanism: the live recorder holds a Web Lock named after (session, stream, segment) for the
 * segment's whole life. The scan only recovers a draft whose lock it can take with `ifAvailable`.
 * A lock is released by the browser the moment its tab dies (crash, kill, close), which is exactly
 * when recovery is wanted, so there is no heartbeat/TTL to tune and no stale-owner state to clean.
 *
 * Fallback where `navigator.locks` is missing: a draft written within the freshness window is
 * treated as live (a live recorder rewrites it at least every {@link DRAFT_TIMESLICE_MS}); the scan
 * retries later. Slower to recover (up to the window), never wrong in the dangerous direction.
 *
 * Tests: `src/__tests__/recording/recording-draft-lock.test.ts`, and the two-tab Playwright spec
 * `tests/integration/wb-recording-draft-live-owner.spec.ts`.
 */

import { DRAFT_TIMESLICE_MS, type DraftSegmentRow } from "@/lib/recording/recording-draft-store";

/**
 * Without Web Locks, a draft checkpointed this recently may belong to a live recorder: about three
 * timeslices. A live recorder rewrites the row at least every {@link DRAFT_TIMESLICE_MS}, so anything
 * newer than this window is left alone and scanned once more after the window (see
 * {@link draftRescanDelayMs}). Older than the window is treated as orphaned.
 */
export const DRAFT_FRESH_WINDOW_MS = DRAFT_TIMESLICE_MS * 3;

export function draftLockName(sessionId: string, streamId: string, segmentId: string): string {
  return `tn-rec-draft:${sessionId}:${streamId}:${segmentId}`;
}

function lockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

export function draftLocksSupported(): boolean {
  return lockManager() !== null;
}

/**
 * How long a scan that just saw a live-looking draft should wait before trying once more.
 * `null` when there is nothing to wait for: Web Locks already answered (a held lock stays held
 * until the recorder releases it; retrying would only race the live owner), or the checkpoint is
 * already older than {@link DRAFT_FRESH_WINDOW_MS}.
 */
export function draftRescanDelayMs(checkpointedAt: number, now: number = Date.now()): number | null {
  if (draftLocksSupported()) return null;
  const age = now - checkpointedAt;
  if (!Number.isFinite(age) || age >= DRAFT_FRESH_WINDOW_MS) return null;
  return DRAFT_FRESH_WINDOW_MS - age;
}

/**
 * Live recorder: hold the segment's lock until the returned `release` is called. Release only after
 * the stop path has finished its enqueue + draft clear, so a recovery scan can never see a
 * half-handed-over segment as orphaned. No-op where Web Locks are unavailable.
 */
export function holdDraftLock(
  sessionId: string,
  streamId: string,
  segmentId: string
): () => void {
  const locks = lockManager();
  if (!locks) return () => {};
  let resolveHeld: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    resolveHeld = resolve;
  });
  locks
    .request(draftLockName(sessionId, streamId, segmentId), { mode: "exclusive" }, () => held)
    .catch((err) => {
      console.warn("[recording-draft-lock] could not hold draft lock:", err);
    });
  return () => resolveHeld();
}

export type RecoverOutcome<T> =
  | { status: "recovered"; value: T }
  /** A live recorder (other tab, or this tab's own newer segment) owns the draft: leave it alone. */
  | { status: "live" };

/**
 * Run `recover` only if no live recorder owns this draft. With Web Locks the check is the lock
 * itself, taken for the duration of `recover` (so two scanning tabs cannot both recover it); without
 * them it is the freshness window.
 */
export async function recoverDraftIfNotLive<T>(
  row: Pick<DraftSegmentRow, "sessionId" | "streamId" | "segmentId" | "checkpointedAt">,
  recover: () => Promise<T>,
  now: number = Date.now()
): Promise<RecoverOutcome<T>> {
  const locks = lockManager();
  if (!locks) {
    if (now - row.checkpointedAt < DRAFT_FRESH_WINDOW_MS) return { status: "live" };
    return { status: "recovered", value: await recover() };
  }
  const outcome = await locks.request(
    draftLockName(row.sessionId, row.streamId, row.segmentId),
    { mode: "exclusive", ifAvailable: true },
    async (lock): Promise<RecoverOutcome<T>> => {
      if (lock === null) return { status: "live" };
      return { status: "recovered", value: await recover() };
    }
  );
  return outcome;
}
