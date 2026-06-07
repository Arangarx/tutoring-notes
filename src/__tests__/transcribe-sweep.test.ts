/**
 * Unit tests for src/lib/recording/transcribe-sweep.ts
 */

const mockFindStaleTranscriptChunksForSweep = jest.fn();
const mockProcessChunkTranscribeJob = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  findStaleTranscriptChunksForSweep: (...args: unknown[]) =>
    mockFindStaleTranscriptChunksForSweep(...args),
}));

jest.mock("@/lib/recording/transcription-worker", () => ({
  processChunkTranscribeJob: (...args: unknown[]) => mockProcessChunkTranscribeJob(...args),
}));

import { runTranscribeSweep } from "@/lib/recording/transcribe-sweep";
import {
  TRANSCRIBE_SWEEP_BATCH_LIMIT,
  TRANSCRIBE_SWEEP_MAX_ATTEMPTS,
  TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS,
} from "@/lib/recording/transcribe-sweep-config";

const STALE_CHUNK = {
  id: "chunk-1",
  sessionId: "wbsid-sweep",
  chunkBlobUrl: "https://blob.vercel-storage.com/sessions/test/chunk-1.webm",
  recordingTimeOffsetMs: 0,
  status: "pending",
  attempts: 0,
  updatedAt: new Date("2026-06-07T10:00:00.000Z"),
};

describe("runTranscribeSweep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessChunkTranscribeJob.mockResolvedValue("done");
  });

  test("queries stale pending/failed rows with batch limit and max-attempts filter", async () => {
    mockFindStaleTranscriptChunksForSweep.mockResolvedValue([]);
    const now = new Date("2026-06-07T12:00:00.000Z");

    await runTranscribeSweep(now);

    expect(mockFindStaleTranscriptChunksForSweep).toHaveBeenCalledWith({
      staleBefore: new Date(now.getTime() - TRANSCRIBE_SWEEP_STALE_THRESHOLD_MS),
      maxAttempts: TRANSCRIBE_SWEEP_MAX_ATTEMPTS,
      limit: TRANSCRIBE_SWEEP_BATCH_LIMIT,
    });
  });

  test("invokes worker for each eligible chunk", async () => {
    const chunk2 = {
      ...STALE_CHUNK,
      id: "chunk-2",
      chunkBlobUrl: "https://blob.vercel-storage.com/sessions/test/chunk-2.webm",
      recordingTimeOffsetMs: 30000,
      status: "failed",
      attempts: 2,
    };
    mockFindStaleTranscriptChunksForSweep.mockResolvedValue([STALE_CHUNK, chunk2]);
    mockProcessChunkTranscribeJob.mockResolvedValueOnce("done").mockResolvedValueOnce("skipped");

    const result = await runTranscribeSweep();

    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledTimes(2);
    expect(mockProcessChunkTranscribeJob).toHaveBeenNthCalledWith(1, {
      sessionId: STALE_CHUNK.sessionId,
      chunkBlobUrl: STALE_CHUNK.chunkBlobUrl,
      recordingTimeOffsetMs: STALE_CHUNK.recordingTimeOffsetMs,
    });
    expect(result).toMatchObject({
      scanned: 2,
      processed: 2,
      done: 1,
      skipped: 1,
      failed: 0,
    });
  });

  test("respects batch limit returned by store (does not process beyond scanned set)", async () => {
    const chunks = Array.from({ length: TRANSCRIBE_SWEEP_BATCH_LIMIT }, (_, i) => ({
      ...STALE_CHUNK,
      id: `chunk-${i}`,
      chunkBlobUrl: `https://blob.vercel-storage.com/sessions/test/chunk-${i}.webm`,
    }));
    mockFindStaleTranscriptChunksForSweep.mockResolvedValue(chunks);

    const result = await runTranscribeSweep();

    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledTimes(TRANSCRIBE_SWEEP_BATCH_LIMIT);
    expect(result.processed).toBe(TRANSCRIBE_SWEEP_BATCH_LIMIT);
  });

  test("permanently-failed rows are excluded by store query (attempts >= max)", async () => {
    mockFindStaleTranscriptChunksForSweep.mockResolvedValue([]);

    const result = await runTranscribeSweep();

    expect(mockFindStaleTranscriptChunksForSweep).toHaveBeenCalledWith(
      expect.objectContaining({ maxAttempts: TRANSCRIBE_SWEEP_MAX_ATTEMPTS })
    );
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
    expect(result.scanned).toBe(0);
  });

  test("counts worker failures", async () => {
    mockFindStaleTranscriptChunksForSweep.mockResolvedValue([STALE_CHUNK]);
    mockProcessChunkTranscribeJob.mockResolvedValue("failed");

    const result = await runTranscribeSweep();

    expect(result.failed).toBe(1);
  });
});
