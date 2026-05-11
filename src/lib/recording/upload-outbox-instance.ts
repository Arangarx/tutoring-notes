"use client";

/**
 * Lazy, browser-only singleton wrapper around `createUploadOutbox`.
 *
 * Why a singleton:
 *   - The whole point of the outbox is to survive page refresh and
 *     tab navigation. Multiple in-memory instances per page would
 *     each open their own IDB connection to the same store, double-
 *     subscribe, and confuse the worker. One instance per origin is
 *     the correct shape.
 *   - The workspace mounts and unmounts repeatedly (tutor opens
 *     review then re-opens workspace, or navigates inside the
 *     admin tab); the outbox state must persist across those
 *     remounts. A module-level singleton is the simplest way.
 *
 * Why lazy:
 *   - IndexedDB only exists in the browser. Importing this module
 *     during SSR (Next.js builds) must not throw. We construct the
 *     instance only on first access AND only when
 *     `globalThis.indexedDB` is available.
 *
 * Production uploader:
 *   The default uploader wraps `uploadAudioWithRetry(uploadAudioDirect, …)`
 *   which is the same upload pipeline `useAudioRecorder.onstop` already
 *   exercises in production. Sharing the pipeline means the outbox
 *   inherits the same retry semantics, the same Vercel Blob auth
 *   handshake, and the same surfaced error copy. Tests + ops can
 *   replace this via `setUploadOutboxForTests(...)`.
 *
 * Tests inject their own outbox via `setUploadOutboxForTests` and
 * later `resetUploadOutboxForTests()` so the production module path
 * doesn't get touched.
 */

import {
  createUploadOutbox,
  type DrainResult,
  type OutboxObserverState,
  type OutboxRow,
  type OutboxUploadResult,
  type UploadOutbox,
} from "@/lib/recording/upload-outbox";
import { uploadAudioDirect, uploadAudioWithRetry } from "@/lib/recording/upload";
import type { EndSessionSegment } from "@/app/admin/students/[id]/whiteboard/actions";

export type { OutboxObserverState };

let singleton: UploadOutbox | null = null;
/**
 * Per-session studentId mapping. The outbox row doesn't carry the
 * studentId today because the row is scoped by `sessionId`
 * (whiteboard session id) and the production `uploadAudioDirect`
 * helper requires `studentId` to scope the Vercel Blob pathname.
 * The workspace registers its (sessionId -> studentId) pair when it
 * boots; the uploader looks it up at upload time.
 *
 * Could be folded into OutboxRow as a separate field, but keeping it
 * outside the schema avoids a downstream Prisma-style migration just
 * for a piece of routing context.
 */
const sessionStudentIds = new Map<string, string>();

export function registerSessionStudentId(
  sessionId: string,
  studentId: string
): void {
  sessionStudentIds.set(sessionId, studentId);
}

export function getOrCreateUploadOutbox(): UploadOutbox {
  if (singleton) return singleton;
  if (typeof window === "undefined" || !globalThis.indexedDB) {
    throw new Error(
      "getOrCreateUploadOutbox called outside the browser. Guard call sites with `typeof window !== 'undefined'`."
    );
  }
  singleton = createUploadOutbox({
    upload: defaultUploader,
  });
  return singleton;
}

async function defaultUploader(
  row: OutboxRow,
  blob: Blob
): Promise<OutboxUploadResult> {
  const studentId = sessionStudentIds.get(row.sessionId);
  if (!studentId) {
    return {
      ok: false,
      // Per AGENTS.md: include the per-session ID logging context in
      // surfaced errors so prod debug sessions can grep one row's
      // full lifecycle.
      error: `Cannot upload — workspace did not register studentId for sessionId=${row.sessionId}`,
    };
  }
  // Pathname matches `uploadAudioDirect`'s safeName scheme; the only
  // semantic carryover is the segmentId, which lets a tutor or ops
  // engineer correlate a Blob URL with its outbox row by URL inspection.
  const filename = `wb-${row.sessionId}-${row.segmentId}.${extForMime(row.mimeType)}`;
  const result = await uploadAudioWithRetry(
    uploadAudioDirect,
    studentId,
    blob,
    filename,
    row.mimeType
  );
  if (result.ok) {
    return { ok: true, blobUrl: result.blobUrl };
  }
  return { ok: false, error: result.error };
}

function extForMime(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base === "audio/webm") return "webm";
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a")
    return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg") return "mp3";
  if (base === "audio/wav") return "wav";
  return base.split("/")[1] ?? "bin";
}

// ----------------------------------------------------------------
// End-session helpers (Phase 1b — Pillar 3 client-side glue)
// ----------------------------------------------------------------

/**
 * Default drain budget used by the End-session flow. The plan
 * recommends 15s (long enough to land a few retries on a 30s
 * cellular hiccup, short enough that a tutor doesn't sit on a
 * spinner) — surfaced as a constant so tests can override it.
 */
export const DEFAULT_END_SESSION_DRAIN_TIMEOUT_MS = 15_000;

/**
 * Wrap `outbox.drainAndAwait` with logging and a sensible default
 * timeout. The End-session flow calls this exactly once before
 * uploading events.json and calling the atomic end-session action.
 *
 * Returns the same `DrainResult` the outbox returns:
 *   - `timedOut`     — true if rows are still uploading at deadline
 *   - `remainingCount` / `remainingByStream` — for tutor-facing copy
 *   - `lastError`    — most recent upload error, if any
 */
export async function drainOutboxOrTimeout(
  whiteboardSessionId: string,
  timeoutMs: number = DEFAULT_END_SESSION_DRAIN_TIMEOUT_MS
): Promise<DrainResult> {
  if (typeof window === "undefined" || !globalThis.indexedDB) {
    // No outbox available — treat as already-drained. Workspace SSR
    // never reaches this path; this branch is a defensive no-op for
    // anything that imports this module from a Node context.
    return {
      timedOut: false,
      remainingCount: 0,
      remainingByStream: new Map<string, number>(),
      lastError: null,
    };
  }
  const outbox = getOrCreateUploadOutbox();
  const result = await outbox.drainAndAwait(whiteboardSessionId, { timeoutMs });
  if (result.timedOut) {
    console.warn(
      `[upload-outbox-instance] wbsid=${whiteboardSessionId} drainOutboxOrTimeout TIMED OUT remaining=${result.remainingCount} lastError=${result.lastError ?? "<none>"}`
    );
  } else {
    console.log(
      `[upload-outbox-instance] wbsid=${whiteboardSessionId} drainOutboxOrTimeout ok`
    );
  }
  return result;
}

/**
 * Read every uploaded outbox row for `whiteboardSessionId` and
 * convert it into the `EndSessionSegment` payload the atomic
 * `endWhiteboardSession` action consumes.
 *
 * Trust posture: the SERVER re-validates each `blobUrl` against the
 * Vercel Blob namespace before any DB write (see `actions.ts`
 * `validateEndSessionSegments`). This helper just shapes the payload.
 *
 * Rows without a `blobRemoteUrl` (i.e. uploads that never landed) are
 * skipped — drainOutboxOrTimeout's caller already decided whether to
 * abort or proceed in that case.
 */
export async function assembleEndSessionSegments(
  whiteboardSessionId: string
): Promise<EndSessionSegment[]> {
  if (typeof window === "undefined" || !globalThis.indexedDB) return [];
  const outbox = getOrCreateUploadOutbox();
  const rows = await outbox.listUploadedSegments(whiteboardSessionId);
  return rows
    .filter((r): r is OutboxRow & { blobRemoteUrl: string } =>
      typeof r.blobRemoteUrl === "string" && r.blobRemoteUrl.length > 0
    )
    .map((r) => ({
      blobUrl: r.blobRemoteUrl,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      audioStartedAtMs: r.audioStartedAtMs,
      streamId: r.streamId,
      segmentId: r.segmentId,
    }));
}

/**
 * Delete every outbox row for the session — called after the atomic
 * `endWhiteboardSession` action returns success. Wraps the outbox's
 * `finalize` with the same "no outbox in this environment is OK"
 * guard as the other helpers.
 */
export async function finalizeOutboxAfterEnd(
  whiteboardSessionId: string
): Promise<void> {
  if (typeof window === "undefined" || !globalThis.indexedDB) return;
  const outbox = getOrCreateUploadOutbox();
  await outbox.finalize(whiteboardSessionId);
  console.log(
    `[upload-outbox-instance] wbsid=${whiteboardSessionId} finalizeOutboxAfterEnd ok`
  );
}

// ----------------------------------------------------------------
// Test hooks (only meaningful in jest)
// ----------------------------------------------------------------

/**
 * Replace the production singleton with a test instance. Pair with
 * `resetUploadOutboxForTests()` in afterEach so tests don't bleed
 * state into each other.
 */
export function setUploadOutboxForTests(outbox: UploadOutbox): void {
  singleton = outbox;
}

export function resetUploadOutboxForTests(): void {
  singleton = null;
  sessionStudentIds.clear();
}
