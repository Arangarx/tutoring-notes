/**
 * Consent wave C0 — DB oracle helpers. Row counts come straight from Postgres
 * (a fresh Prisma client, no app code path), so a purge/consent test never
 * trusts the code under test to report its own result.
 *
 *   countRowsBySession(sessionId)   TranscriptChunk / SessionRecording by streamId,
 *                                   WhiteboardEventBatch, TutorNote, SessionNote
 *   expectBatchCount(sessionId, …)  POSITIVE CONTROL (W10): assert > 0 before End and
 *                                   0 after, so a purge test cannot pass because
 *                                   nothing was ever written
 *   backdateBoardPurgeFirstPass     the pass-2 clock seam (W8, W11, W12, W22): moves
 *                                   `boardPurgeFirstPassAt` back by `ms`. No product code
 *                                   reads a test clock.
 *
 * `backdateBoardPurgeFirstPass` needs the C4b migration (`boardPurgeFirstPassAt`).
 * Until then it throws a clear error rather than silently no-opping.
 */

import { PrismaClient } from "@prisma/client";
import { expect } from "@playwright/test";

async function withPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

export type SessionRowCounts = {
  /** `TranscriptChunk` rows keyed by `streamId`. */
  transcriptChunksByStream: Record<string, number>;
  /** `SessionRecording` rows (audio) keyed by `streamId`, linked by `whiteboardSessionId`. */
  recordingsByStream: Record<string, number>;
  eventBatches: number;
  tutorNotes: number;
  /** `SessionNote` rows linked to the whiteboard session through `noteId`. */
  sessionNotes: number;
};

function tally(rows: { streamId: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.streamId] = (out[r.streamId] ?? 0) + 1;
  return out;
}

export async function countRowsBySession(sessionId: string): Promise<SessionRowCounts> {
  return withPrisma(async (prisma) => {
    const [chunks, recordings, eventBatches, tutorNotes, session] = await Promise.all([
      prisma.transcriptChunk.findMany({ where: { sessionId }, select: { streamId: true } }),
      prisma.sessionRecording.findMany({
        where: { whiteboardSessionId: sessionId },
        select: { streamId: true },
      }),
      prisma.whiteboardEventBatch.count({ where: { whiteboardSessionId: sessionId } }),
      prisma.tutorNote.count({ where: { sessionId } }),
      prisma.whiteboardSession.findUnique({ where: { id: sessionId }, select: { noteId: true } }),
    ]);
    const sessionNotes = session?.noteId
      ? await prisma.sessionNote.count({ where: { id: session.noteId } })
      : 0;
    return {
      transcriptChunksByStream: tally(chunks),
      recordingsByStream: tally(recordings),
      eventBatches,
      tutorNotes,
      sessionNotes,
    };
  });
}

/** `WhiteboardEventBatch` rows for a session. */
export async function countEventBatches(sessionId: string): Promise<number> {
  return withPrisma((prisma) =>
    prisma.whiteboardEventBatch.count({ where: { whiteboardSessionId: sessionId } })
  );
}

/**
 * Positive control (W10). `expect: "some"` before End proves the purge test has
 * something to purge; `expect: 0` after End proves it was purged. Polls, because
 * a purge runs after the response.
 */
export async function expectBatchCount(
  sessionId: string,
  expectation: "some" | 0,
  opts?: { timeout?: number }
): Promise<void> {
  const assertion = expect.poll(() => countEventBatches(sessionId), {
    timeout: opts?.timeout ?? 15_000,
    message: `WhiteboardEventBatch count for ${sessionId}`,
  });
  if (expectation === 0) await assertion.toBe(0);
  else await assertion.toBeGreaterThan(0);
}

async function columnExists(prisma: PrismaClient, table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

export const BOARD_PURGE_FIRST_PASS_COLUMN_MISSING =
  "boardPurgeFirstPassAt does not exist yet: backdateBoardPurgeFirstPass needs the C4b migration";

/**
 * Pass-2 clock seam (§ 3.3): move `boardPurgeFirstPassAt` back by `ms` so the
 * sweep's "second pass delay elapsed" predicate becomes true without waiting.
 * Returns the number of rows changed (0 when the first pass has not stamped).
 */
export async function backdateBoardPurgeFirstPass(sessionId: string, ms: number): Promise<number> {
  return withPrisma(async (prisma) => {
    if (!(await columnExists(prisma, "WhiteboardSession", "boardPurgeFirstPassAt"))) {
      throw new Error(BOARD_PURGE_FIRST_PASS_COLUMN_MISSING);
    }
    return prisma.$executeRaw`
      UPDATE "WhiteboardSession"
      SET "boardPurgeFirstPassAt" = "boardPurgeFirstPassAt" - (${ms}::double precision * interval '1 millisecond')
      WHERE id = ${sessionId} AND "boardPurgeFirstPassAt" IS NOT NULL`;
  });
}

/** True when the C4b columns exist (lets a spec skip a row until its wave lands). */
export async function boardPurgeColumnsExist(): Promise<boolean> {
  return withPrisma((prisma) => columnExists(prisma, "WhiteboardSession", "boardPurgeFirstPassAt"));
}
