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
 *  7. SHOULD-FIX-2 Option A: includes CRON_SECRET bearer when calling the
 *     guarded endpoint (server-side only; fail-open when CRON_SECRET absent).
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

jest.mock("@/lib/public-url", () => ({
  getPublicBaseUrl: () => "https://app.example.com",
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
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    // Tests in this suite exercise the fail-open direct-call path.
    // Clear CRON_SECRET so the new HTTP-fetch path is not triggered.
    delete process.env.CRON_SECRET;
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row-1", status: "pending" });
    mockProcessChunkTranscribeJob.mockResolvedValue("done");
  });

  afterEach(() => {
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
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

// ── 7. SHOULD-FIX-2 Option A — CRON_SECRET bearer ────────────────────────────
//
// When CRON_SECRET is configured, the fire-and-forget path routes through the
// guarded /api/queues/chunk-transcribe HTTP endpoint with a server-side bearer
// token so all worker invocations share the same auth boundary as the cron sweep.
//
// When CRON_SECRET is absent (local dev / pre-config), the direct-call path is
// used unchanged (fail-open).

describe("enqueueChunkTranscribe — CRON_SECRET bearer (SHOULD-FIX-2 Option A)", () => {
  const MOCK_SECRET = "test-cron-secret-xyz";
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row-1", status: "pending" });

    // Spy on global fetch — used by the CRON_SECRET path to call the route endpoint.
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, outcome: "done" }),
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.CRON_SECRET;
  });

  test("includes Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = MOCK_SECRET;

    await enqueueChunkTranscribe(JOB);
    // Drain the after() callback (fired as void promise by the mock)
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.example.com/api/queues/chunk-transcribe");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Bearer ${MOCK_SECRET}`
    );
    expect(init.method).toBe("POST");
  });

  test("sends the job payload as JSON body when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = MOCK_SECRET;

    await enqueueChunkTranscribe(JOB);
    await new Promise((r) => setTimeout(r, 10));

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as typeof JOB;
    expect(sentBody).toEqual(JOB);
  });

  test("does NOT call processChunkTranscribeJob directly when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = MOCK_SECRET;

    await enqueueChunkTranscribe(JOB);
    await new Promise((r) => setTimeout(r, 10));

    // Worker is invoked via the HTTP endpoint, not called directly
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  test("falls back to direct processChunkTranscribeJob call when CRON_SECRET is absent (fail-open)", async () => {
    // CRON_SECRET is not set
    delete process.env.CRON_SECRET;
    mockProcessChunkTranscribeJob.mockResolvedValue("done");

    await enqueueChunkTranscribe(JOB);
    await new Promise((r) => setTimeout(r, 10));

    // Fail-open: direct call, no HTTP fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(JOB);
  });
});
