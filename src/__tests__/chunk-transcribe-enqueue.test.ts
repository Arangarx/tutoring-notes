/**
 * Unit tests for src/lib/recording/chunk-transcribe-enqueue.ts
 *
 * Tests:
 *  1. Upserts a durable pending row before firing the worker.
 *  2. Fire-and-forget — enqueue resolves without awaiting worker completion.
 *  3. Does not downgrade an existing done row to pending.
 *  4. Does not clobber an in-flight transcribing row back to pending.
 *  5. Re-enqueue on failed row re-upserts pending.
 *  6. Swallows pending-upsert errors and still fires the worker.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetTranscriptChunkByBlobUrl = jest.fn();
const mockUpsertTranscriptChunk = jest.fn();
const mockProcessChunkTranscribeJob = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  getTranscriptChunkByBlobUrl: (...args: unknown[]) => mockGetTranscriptChunkByBlobUrl(...args),
  upsertTranscriptChunk: (...args: unknown[]) => mockUpsertTranscriptChunk(...args),
}));

jest.mock("@/lib/recording/transcription-worker", () => ({
  processChunkTranscribeJob: (...args: unknown[]) => mockProcessChunkTranscribeJob(...args),
}));

// Mock after() to fire callback as a void promise (fire-and-forget, async).
// This preserves the real semantics: enqueueChunkTranscribe resolves immediately,
// and the callback runs in the next microtask.
jest.mock("next/server", () => ({
  after: jest.fn((callback: () => Promise<void>) => {
    void callback();
  }),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { enqueueChunkTranscribe } from "@/lib/recording/chunk-transcribe-enqueue";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOB = {
  sessionId: "wbsid-enqueue-test",
  chunkBlobUrl: "https://blob.vercel-storage.com/sessions/test/chunk-1.webm",
  recordingTimeOffsetMs: 12000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enqueueChunkTranscribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row-1", status: "pending" });
    mockProcessChunkTranscribeJob.mockResolvedValue("done");
  });

  test("upserts pending row before firing worker", async () => {
    const callOrder: string[] = [];
    mockUpsertTranscriptChunk.mockImplementation(async () => {
      callOrder.push("upsert");
      return { id: "row-1", status: "pending" };
    });
    mockProcessChunkTranscribeJob.mockImplementation(async () => {
      callOrder.push("worker");
      return "done";
    });

    await enqueueChunkTranscribe(JOB);
    // Drain after() callback (fires async via void callback())
    await new Promise((r) => setTimeout(r, 10));

    expect(mockUpsertTranscriptChunk).toHaveBeenCalledWith({
      sessionId: JOB.sessionId,
      chunkBlobUrl: JOB.chunkBlobUrl,
      recordingTimeOffsetMs: JOB.recordingTimeOffsetMs,
      status: "pending",
    });
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(JOB);
    expect(callOrder).toEqual(["upsert", "worker"]);
  });

  test("resolves without awaiting worker completion (fire-and-forget)", async () => {
    let workerResolved = false;
    mockProcessChunkTranscribeJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            workerResolved = true;
            resolve("done");
          }, 50);
        })
    );

    await enqueueChunkTranscribe(JOB);

    expect(workerResolved).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(workerResolved).toBe(true);
  });

  test("does not upsert pending when chunk is already done", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "done-row",
      status: "done",
      attempts: 1,
    });

    await enqueueChunkTranscribe(JOB);

    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(JOB);
  });

  test("does not reset transcribing row back to pending", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "in-flight",
      status: "transcribing",
      attempts: 0,
    });

    await enqueueChunkTranscribe(JOB);

    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(JOB);
  });

  test("re-upserts pending when prior row failed", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "failed-row",
      status: "failed",
      attempts: 2,
    });

    await enqueueChunkTranscribe(JOB);

    expect(mockUpsertTranscriptChunk).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    );
  });

  test("uses offset 0 when producer offset absent", async () => {
    const { recordingTimeOffsetMs: _omit, ...jobWithoutOffset } = JOB;
    await enqueueChunkTranscribe(jobWithoutOffset);

    expect(mockUpsertTranscriptChunk).toHaveBeenCalledWith(
      expect.objectContaining({ recordingTimeOffsetMs: 0, status: "pending" })
    );
  });

  test("swallows pending-upsert error and still fires worker", async () => {
    mockUpsertTranscriptChunk.mockRejectedValue(new Error("DB unavailable"));

    await expect(enqueueChunkTranscribe(JOB)).resolves.toBeUndefined();

    await new Promise((r) => setTimeout(r, 0));
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(JOB);
  });
});
