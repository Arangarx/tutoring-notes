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
  type OutboxRow,
  type OutboxUploadResult,
  type UploadOutbox,
} from "@/lib/recording/upload-outbox";
import { uploadAudioDirect, uploadAudioWithRetry } from "@/lib/recording/upload";

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
