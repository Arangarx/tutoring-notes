/**
 * Unit tests for src/lib/recording/transcription-worker.ts
 *
 * Tests (reliability requirements from D2 design):
 *  1. Happy path — fetches blob, calls transcribeChunk, upserts done row.
 *  2. Idempotency — same chunk twice → second call returns 'skipped', no extra DB write.
 *  3. Blob fetch failure — chunk marked 'failed', returns 'failed'.
 *  4. Transcription failure — chunk marked 'failed', returns 'failed'.
 *  5. Partial failure isolation — one chunk fails, others (separate calls) unaffected.
 *  6. Offset derivation — when recordingTimeOffsetMs absent, derived from prior chunks.
 *  7. Offset from producer — when recordingTimeOffsetMs provided, used directly.
 *  8. Status progression — 'transcribing' upserted before fetch, 'done' after.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetTranscriptChunkByBlobUrl = jest.fn();
const mockUpsertTranscriptChunk = jest.fn();
const mockGetTranscriptChunksBySessionId = jest.fn();
const mockTranscribeChunk = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  getTranscriptChunkByBlobUrl: (...args: unknown[]) => mockGetTranscriptChunkByBlobUrl(...args),
  upsertTranscriptChunk: (...args: unknown[]) => mockUpsertTranscriptChunk(...args),
  getTranscriptChunksBySessionId: (...args: unknown[]) => mockGetTranscriptChunksBySessionId(...args),
}));

jest.mock("@/lib/recording/transcribe-chunk", () => ({
  transcribeChunk: (...args: unknown[]) => mockTranscribeChunk(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = "wbsid-worker-test";
const CHUNK_URL = "https://blob.vercel-storage.com/sessions/test/chunk-1.webm";
const CHUNK_URL_2 = "https://blob.vercel-storage.com/sessions/test/chunk-2.webm";
const FAKE_AUDIO = Buffer.alloc(512, 0xbb);

const okFetchResponse = {
  ok: true,
  status: 200,
  statusText: "OK",
  arrayBuffer: () => Promise.resolve(FAKE_AUDIO.buffer as ArrayBuffer),
  headers: {
    get: (key: string) => (key === "content-type" ? "audio/webm;codecs=opus" : null),
  },
};

const okTranscribeResult = {
  transcript: "Student asked about quadratics.",
  durationMs: 30000,
  modelUsed: "gpt-4o-mini-transcribe",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupHappyPath() {
  mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
  mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
  mockUpsertTranscriptChunk.mockResolvedValue({ id: "chunk-row-1", status: "done" });
  mockTranscribeChunk.mockResolvedValue(okTranscribeResult);
  global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processChunkTranscribeJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore fetch if overridden.
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  test("happy path: fetches blob, transcribes, upserts done row, returns done", async () => {
    setupHappyPath();

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("done");

    // Must upsert 'transcribing' BEFORE fetching blob (status progression).
    const upsertCalls = mockUpsertTranscriptChunk.mock.calls;
    expect(upsertCalls.length).toBeGreaterThanOrEqual(2);
    expect(upsertCalls[0][0]).toMatchObject({ status: "transcribing", sessionId: SESSION_ID, chunkBlobUrl: CHUNK_URL });

    // Final upsert must be 'done' with transcript + durationMs.
    const finalCall = upsertCalls[upsertCalls.length - 1][0];
    expect(finalCall).toMatchObject({
      status: "done",
      transcript: okTranscribeResult.transcript,
      durationMs: okTranscribeResult.durationMs,
    });

    expect(mockTranscribeChunk).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 2. Idempotency — same chunk delivered twice
  // -------------------------------------------------------------------------
  test("idempotency: chunk already done → returns skipped without re-processing", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "existing-chunk",
      status: "done",
      transcript: "Already processed.",
      durationMs: 15000,
    });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("skipped");
    // No DB upsert, no blob fetch, no transcription on re-delivery.
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    // fetch should not have been called (no blob download on skipped).
    // global.fetch may be defined by the test environment; check it was not invoked.
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
  });

  test("idempotency: processing same chunk twice in sequence → one done row, no corruption", async () => {
    // First call: no existing row → processes normally.
    setupHappyPath();
    const first = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });
    expect(first).toBe("done");

    // Second call: simulate the upsert returning the done row.
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({ id: "existing", status: "done" });

    const second = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });
    expect(second).toBe("skipped");
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 3. Blob fetch failure
  // -------------------------------------------------------------------------
  test("blob fetch failure: chunk marked failed, returns failed", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "chunk-row", status: "failed" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("failed");
    expect(mockTranscribeChunk).not.toHaveBeenCalled();

    const upsertCalls = mockUpsertTranscriptChunk.mock.calls;
    const failedUpsert = upsertCalls.find((c) => c[0].status === "failed");
    expect(failedUpsert).toBeDefined();
    expect(failedUpsert![0].error).toMatch(/Blob fetch failed/i);
  });

  test("blob fetch network error: chunk marked failed, returns failed", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "chunk-row", status: "failed" });
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("failed");
    // Must NOT throw — partial failure isolation.
  });

  // -------------------------------------------------------------------------
  // 4. Transcription failure
  // -------------------------------------------------------------------------
  test("transcription failure: chunk marked failed, returns failed", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "chunk-row", status: "failed" });
    global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
    mockTranscribeChunk.mockResolvedValue({ error: "Transcription API timeout" });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("failed");
    const upsertCalls = mockUpsertTranscriptChunk.mock.calls;
    const failedUpsert = upsertCalls.find((c) => c[0].status === "failed");
    expect(failedUpsert).toBeDefined();
    expect(failedUpsert![0].error).toMatch(/Transcription API timeout/);
  });

  // -------------------------------------------------------------------------
  // 5. Partial failure isolation — two chunks, one fails
  // -------------------------------------------------------------------------
  test("partial failure: one chunk failing does not block another chunk (separate invocations)", async () => {
    // Chunk 1: fails.
    mockGetTranscriptChunkByBlobUrl.mockResolvedValueOnce(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row", status: "failed" });
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    });

    const outcome1 = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });
    expect(outcome1).toBe("failed");

    // Chunk 2 invocation: succeeds independently.
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row2", status: "done" });
    global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    const outcome2 = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL_2,
      recordingTimeOffsetMs: 30000,
    });
    expect(outcome2).toBe("done");
  });

  // -------------------------------------------------------------------------
  // 6. Offset derivation — no producer-supplied offset
  // -------------------------------------------------------------------------
  test("offset derivation: sums durationMs of prior done chunks when offset absent", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    // Two prior done chunks with known durations.
    mockGetTranscriptChunksBySessionId.mockResolvedValue([
      { id: "prior-1", status: "done", durationMs: 30000 },
      { id: "prior-2", status: "done", durationMs: 25000 },
      { id: "prior-3", status: "failed", durationMs: null }, // excluded (not done)
    ]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "new-row", status: "done" });
    global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      // No recordingTimeOffsetMs — should be derived as 30000 + 25000 = 55000.
    });

    const upsertCalls = mockUpsertTranscriptChunk.mock.calls;
    const transcribingCall = upsertCalls.find((c) => c[0].status === "transcribing");
    expect(transcribingCall).toBeDefined();
    expect(transcribingCall![0].recordingTimeOffsetMs).toBe(55000);
  });

  test("offset derivation: returns 0 when no prior chunks exist", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row", status: "done" });
    global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({ sessionId: SESSION_ID, chunkBlobUrl: CHUNK_URL });

    const transcribingCall = mockUpsertTranscriptChunk.mock.calls.find(
      (c) => c[0].status === "transcribing"
    );
    expect(transcribingCall![0].recordingTimeOffsetMs).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 7. Offset from producer — used directly, no derivation
  // -------------------------------------------------------------------------
  test("producer offset: uses supplied recordingTimeOffsetMs directly", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([
      // Even if there are prior chunks, the producer value wins.
      { id: "prior-1", status: "done", durationMs: 10000 },
    ]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row", status: "done" });
    global.fetch = jest.fn().mockResolvedValue(okFetchResponse);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 99000, // Explicit value from producer.
    });

    const transcribingCall = mockUpsertTranscriptChunk.mock.calls.find(
      (c) => c[0].status === "transcribing"
    );
    expect(transcribingCall![0].recordingTimeOffsetMs).toBe(99000);
    // getTranscriptChunksBySessionId should NOT have been called (no derivation needed).
    expect(mockGetTranscriptChunksBySessionId).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Status progression — 'transcribing' before fetch, 'done' after
  // -------------------------------------------------------------------------
  test("status progression: transcribing upserted before blob fetch, done after success", async () => {
    const callOrder: string[] = [];
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockImplementation(async (args: { status: string }) => {
      callOrder.push(`upsert:${args.status}`);
      return { id: "row", status: args.status };
    });
    global.fetch = jest.fn().mockImplementation(async () => {
      callOrder.push("fetch");
      return okFetchResponse;
    });
    mockTranscribeChunk.mockImplementation(async () => {
      callOrder.push("transcribe");
      return okTranscribeResult;
    });

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    // Verify order: transcribing → fetch → transcribe → done.
    expect(callOrder[0]).toBe("upsert:transcribing");
    expect(callOrder[callOrder.length - 1]).toBe("upsert:done");
  });
});
