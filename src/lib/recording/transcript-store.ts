/**
 * Data-access helpers for TranscriptChunk / TranscriptChunkExtraction / TutorNote.
 * Recording re-arch Phase 1 — scaffolding only; no pipeline business logic yet.
 *
 * Worker callers (queue consumers) use the *BySessionId helpers directly.
 * Tutor-facing server actions MUST use the *ForAuthorisedSession wrappers
 * so ownership is asserted before reads/writes.
 */

import type { Prisma, TranscriptChunk, TranscriptChunkExtraction, TutorNote } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import {
  type ChunkExtractionPayload,
  serializeChunkExtraction,
  type TranscriptChunkStatus,
  type TutorNoteStatus,
} from "@/lib/recording/transcript-types";

const TXC_LOG = "[txc]";
const TNT_LOG = "[tnt]";

export type UpsertTranscriptChunkInput = {
  sessionId: string;
  chunkBlobUrl: string;
  recordingTimeOffsetMs: number;
  status: TranscriptChunkStatus;
  transcript?: string;
  durationMs?: number | null;
  error?: string | null;
  transcribedAt?: Date | null;
  attempts?: number;
};

export type UpsertChunkExtractionInput = ChunkExtractionPayload & {
  sessionId: string;
  chunkId: string;
};

export type CreateTutorNoteInput = {
  sessionId: string;
  status: TutorNoteStatus;
  content?: string | null;
  isPartial?: boolean;
  error?: string | null;
  generatedAt?: Date | null;
};

function logTxc(
  sessionId: string,
  action: string,
  extra?: Record<string, string | number | boolean>
): void {
  const suffix = extra
    ? " " +
      Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  console.log(`${TXC_LOG} wbsid=${sessionId} action=${action}${suffix}`);
}

function logTnt(
  sessionId: string,
  action: string,
  extra?: Record<string, string | number | boolean>
): void {
  const suffix = extra
    ? " " +
      Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
    : "";
  console.log(`${TNT_LOG} wbsid=${sessionId} action=${action}${suffix}`);
}

/** Idempotent upsert on (sessionId, chunkBlobUrl) — safe for at-least-once queue delivery. */
export async function upsertTranscriptChunk(
  input: UpsertTranscriptChunkInput
): Promise<TranscriptChunk> {
  const { sessionId, chunkBlobUrl, recordingTimeOffsetMs, status, ...rest } = input;
  logTxc(sessionId, "upsert", { offsetMs: recordingTimeOffsetMs, status });

  return withDbRetry(
    () =>
      db.transcriptChunk.upsert({
        where: {
          sessionId_chunkBlobUrl: { sessionId, chunkBlobUrl },
        },
        create: {
          sessionId,
          chunkBlobUrl,
          recordingTimeOffsetMs,
          status,
          transcript: rest.transcript ?? "",
          durationMs: rest.durationMs ?? undefined,
          error: rest.error ?? undefined,
          transcribedAt: rest.transcribedAt ?? undefined,
          attempts: rest.attempts ?? 0,
        },
        update: {
          recordingTimeOffsetMs,
          status,
          ...(rest.transcript !== undefined ? { transcript: rest.transcript } : {}),
          ...(rest.durationMs !== undefined ? { durationMs: rest.durationMs } : {}),
          ...(rest.error !== undefined ? { error: rest.error } : {}),
          ...(rest.transcribedAt !== undefined ? { transcribedAt: rest.transcribedAt } : {}),
          ...(rest.attempts !== undefined ? { attempts: rest.attempts } : {}),
        },
      }),
    { label: "upsertTranscriptChunk" }
  );
}

export async function getTranscriptChunksBySessionId(
  sessionId: string
): Promise<TranscriptChunk[]> {
  return withDbRetry(
    () =>
      db.transcriptChunk.findMany({
        where: { sessionId },
        orderBy: { recordingTimeOffsetMs: "asc" },
      }),
    { label: "getTranscriptChunksBySessionId" }
  );
}

export type FindStaleTranscriptChunksInput = {
  staleBefore: Date;
  maxAttempts: number;
  limit: number;
};

/**
 * Rows eligible for the cron backstop sweep: stale pending, or retryable failed
 * (attempts below max). Permanently-failed rows (attempts >= max) are excluded.
 */
export async function findStaleTranscriptChunksForSweep(
  input: FindStaleTranscriptChunksInput
): Promise<TranscriptChunk[]> {
  const { staleBefore, maxAttempts, limit } = input;

  return withDbRetry(
    () =>
      db.transcriptChunk.findMany({
        where: {
          updatedAt: { lt: staleBefore },
          OR: [
            { status: "pending" },
            { status: "failed", attempts: { lt: maxAttempts } },
          ],
        },
        orderBy: { updatedAt: "asc" },
        take: limit,
      }),
    { label: "findStaleTranscriptChunksForSweep" }
  );
}

export async function getTranscriptChunkByBlobUrl(
  sessionId: string,
  chunkBlobUrl: string
): Promise<TranscriptChunk | null> {
  return withDbRetry(
    () =>
      db.transcriptChunk.findUnique({
        where: { sessionId_chunkBlobUrl: { sessionId, chunkBlobUrl } },
      }),
    { label: "getTranscriptChunkByBlobUrl" }
  );
}

export async function updateTranscriptChunkStatus(
  sessionId: string,
  chunkId: string,
  status: TranscriptChunkStatus,
  fields?: Pick<Prisma.TranscriptChunkUpdateInput, "transcript" | "durationMs" | "error" | "transcribedAt">
): Promise<TranscriptChunk> {
  logTxc(sessionId, "status_update", { chunkId, status });

  return withDbRetry(
    () =>
      db.transcriptChunk.update({
        where: { id: chunkId },
        data: { status, ...fields },
      }),
    { label: "updateTranscriptChunkStatus" }
  );
}

export async function countTranscriptChunksByStatus(
  sessionId: string,
  status: TranscriptChunkStatus
): Promise<number> {
  return withDbRetry(
    () =>
      db.transcriptChunk.count({
        where: { sessionId, status },
      }),
    { label: "countTranscriptChunksByStatus" }
  );
}

export async function upsertChunkExtraction(
  input: UpsertChunkExtractionInput
): Promise<TranscriptChunkExtraction> {
  const { sessionId, chunkId, ...payload } = input;
  const serialized = serializeChunkExtraction(payload);

  return withDbRetry(
    () =>
      db.transcriptChunkExtraction.upsert({
        where: { chunkId },
        create: {
          sessionId,
          chunkId,
          ...serialized,
        },
        update: {
          sessionId,
          ...serialized,
          extractedAt: new Date(),
        },
      }),
    { label: "upsertChunkExtraction" }
  );
}

export async function getChunkExtractionsBySessionId(
  sessionId: string
): Promise<TranscriptChunkExtraction[]> {
  return withDbRetry(
    () =>
      db.transcriptChunkExtraction.findMany({
        where: { sessionId },
        orderBy: { extractedAt: "asc" },
      }),
    { label: "getChunkExtractionsBySessionId" }
  );
}

export async function createTutorNote(input: CreateTutorNoteInput): Promise<TutorNote> {
  logTnt(input.sessionId, "create", { status: input.status });

  return withDbRetry(
    () =>
      db.tutorNote.create({
        data: {
          sessionId: input.sessionId,
          status: input.status,
          content: input.content ?? undefined,
          isPartial: input.isPartial ?? false,
          error: input.error ?? undefined,
          generatedAt: input.generatedAt ?? undefined,
        },
      }),
    { label: "createTutorNote" }
  );
}

export async function getTutorNoteBySessionId(sessionId: string): Promise<TutorNote | null> {
  return withDbRetry(
    () =>
      db.tutorNote.findUnique({
        where: { sessionId },
      }),
    { label: "getTutorNoteBySessionId" }
  );
}

export async function updateTutorNote(
  sessionId: string,
  data: Pick<Prisma.TutorNoteUpdateInput, "status" | "content" | "isPartial" | "error" | "generatedAt">
): Promise<TutorNote> {
  const action =
    data.status === "done"
      ? "notes_done"
      : data.status === "failed"
        ? "failed"
        : "update";
  logTnt(sessionId, action, {
    status: String(data.status ?? ""),
    partial: Boolean(data.isPartial),
  });

  return withDbRetry(
    () =>
      db.tutorNote.update({
        where: { sessionId },
        data,
      }),
    { label: "updateTutorNote" }
  );
}

export async function upsertTutorNotePending(sessionId: string): Promise<TutorNote> {
  logTnt(sessionId, "enqueue");

  return withDbRetry(
    () =>
      db.tutorNote.upsert({
        where: { sessionId },
        create: { sessionId, status: "pending" },
        update: {},
      }),
    { label: "upsertTutorNotePending" }
  );
}

// ---------------------------------------------------------------------------
// Tutor-facing wrappers — assert whiteboard session ownership first.
// ---------------------------------------------------------------------------

export async function getTranscriptChunksForAuthorisedSession(
  whiteboardSessionId: string
): Promise<TranscriptChunk[]> {
  await assertOwnsWhiteboardSession(whiteboardSessionId);
  return getTranscriptChunksBySessionId(whiteboardSessionId);
}

export async function getTutorNoteForAuthorisedSession(
  whiteboardSessionId: string
): Promise<TutorNote | null> {
  await assertOwnsWhiteboardSession(whiteboardSessionId);
  return getTutorNoteBySessionId(whiteboardSessionId);
}
