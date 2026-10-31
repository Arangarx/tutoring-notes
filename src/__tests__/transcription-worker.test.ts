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
const mockFetchPrivateBlobBytes = jest.fn();
const mockUpdateTranscriptChunkStatus = jest.fn();
const mockGateTranscription = jest.fn();

jest.mock("@/lib/recording/transcript-store", () => ({
  getTranscriptChunkByBlobUrl: (...args: unknown[]) => mockGetTranscriptChunkByBlobUrl(...args),
  upsertTranscriptChunk: (...args: unknown[]) => mockUpsertTranscriptChunk(...args),
  getTranscriptChunksBySessionId: (...args: unknown[]) => mockGetTranscriptChunksBySessionId(...args),
  updateTranscriptChunkStatus: (...args: unknown[]) => mockUpdateTranscriptChunkStatus(...args),
}));

// The consent gate has its own tests (consent-gates.test.ts, wb-consent-matrix). Here it allows by default so these
// tests keep exercising the transcription pipeline; the refusal and lane tests at the bottom drive it explicitly.
jest.mock("@/lib/recording/consent-gates", () => ({
  gateTranscription: (...args: unknown[]) => mockGateTranscription(...args),
}));

jest.mock("@/lib/recording/transcribe-chunk", () => ({
  transcribeChunk: (...args: unknown[]) => mockTranscribeChunk(...args),
}));

jest.mock("@/lib/blob", () => ({
  fetchPrivateBlobBytes: (...args: unknown[]) => mockFetchPrivateBlobBytes(...args),
}));

// Fire-and-forget map phase in the worker must not leak real extract-chunk /
// notes-enqueue async work after test teardown.
jest.mock("@/lib/recording/extract-chunk", () => ({
  extractChunkMap: jest.fn().mockResolvedValue("done"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/session-capabilities";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SESSION_ID = "wbsid-worker-test";
const CHUNK_URL = "https://blob.vercel-storage.com/sessions/test/chunk-1.webm";
const CHUNK_URL_2 = "https://blob.vercel-storage.com/sessions/test/chunk-2.webm";
const FAKE_AUDIO = Buffer.alloc(512, 0xbb);

const okBlobFetch = {
  buffer: FAKE_AUDIO,
  contentType: "audio/webm;codecs=opus",
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
  mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processChunkTranscribeJob", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGateTranscription.mockResolvedValue({ allow: true });
  });

  afterEach(async () => {
    // Restore fetch if overridden.
    jest.restoreAllMocks();
    // Flush fire-and-forget map phase microtasks from the worker.
    await new Promise<void>((r) => setImmediate(r));
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------
  test("happy path: fetches blob, transcribes, upserts done row, returns done", async () => {
    setupHappyPath();

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("skipped");
    // No DB upsert, no blob fetch, no transcription on re-delivery.
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
  });

  test("idempotency: chunk already transcribing → returns skipped without Whisper call", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "in-flight-chunk",
      status: "transcribing",
      recordingTimeOffsetMs: 0,
    });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("skipped");
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
  });

  test("pending and failed chunks still proceed to transcription", async () => {
    for (const status of ["pending", "failed"] as const) {
      jest.clearAllMocks();
      mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
        id: `chunk-${status}`,
        status,
        attempts: status === "failed" ? 1 : 0,
        streamId: TUTOR_MIC_STREAM_ID,
        speakerId: null,
      });
      mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
      mockUpsertTranscriptChunk.mockResolvedValue({ id: "chunk-row", status: "done" });
      mockTranscribeChunk.mockResolvedValue(okTranscribeResult);
      mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);

      const outcome = await processChunkTranscribeJob({
        sessionId: SESSION_ID,
        chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
        recordingTimeOffsetMs: 0,
      });

      expect(outcome).toBe("done");
      expect(mockTranscribeChunk).toHaveBeenCalledTimes(1);
    }
  });

  test("idempotency: processing same chunk twice in sequence → one done row, no corruption", async () => {
    // First call: no existing row → processes normally.
    setupHappyPath();
    const first = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });
    expect(first).toBe("done");

    // Second call: simulate the upsert returning the done row.
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({ id: "existing", status: "done" });

    const second = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockRejectedValue(new Error("HTTP 404 Not Found"));

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockRejectedValue(new Error("ECONNREFUSED"));

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    mockTranscribeChunk.mockResolvedValue({ error: "Transcription API timeout" });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockRejectedValueOnce(new Error("HTTP 500 Server Error"));

    const outcome1 = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });
    expect(outcome1).toBe("failed");

    // Chunk 2 invocation: succeeds independently.
    jest.clearAllMocks();
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "row2", status: "done" });
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    const outcome2 = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL_2,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
    });

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
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
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
    mockFetchPrivateBlobBytes.mockImplementation(async () => {
      callOrder.push("fetch");
      return okBlobFetch;
    });
    mockTranscribeChunk.mockImplementation(async () => {
      callOrder.push("transcribe");
      return okTranscribeResult;
    });

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });

    // Verify order: transcribing → fetch → transcribe → done.
    expect(callOrder[0]).toBe("upsert:transcribing");
    expect(callOrder[callOrder.length - 1]).toBe("upsert:done");
  });

  // -------------------------------------------------------------------------
  // 9. Authenticated blob fetch — uses fetchPrivateBlobBytes helper
  // -------------------------------------------------------------------------
  test("blob download: delegates to fetchPrivateBlobBytes with chunk URL", async () => {
    setupHappyPath();

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      streamId: TUTOR_MIC_STREAM_ID,
      recordingTimeOffsetMs: 0,
    });

    expect(mockFetchPrivateBlobBytes).toHaveBeenCalledTimes(1);
    expect(mockFetchPrivateBlobBytes).toHaveBeenCalledWith(CHUNK_URL);
  });

  // -------------------------------------------------------------------------
  // 10. Per-speaker labels — streamId / speakerId threading
  // -------------------------------------------------------------------------
  test("passes explicit streamId and speakerId to upsertTranscriptChunk", async () => {
    setupHappyPath();

    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
      streamId: "student:peer-xyz:mic",
      speakerId: "peer-xyz",
    });

    for (const call of mockUpsertTranscriptChunk.mock.calls) {
      expect(call[0]).toMatchObject({
        streamId: "student:peer-xyz:mic",
        speakerId: "peer-xyz",
      });
    }
  });

  // -------------------------------------------------------------------------
  // 11. Lane identity + consent gate (consent wave C2, plan § 2.3 / A8 / A9)
  // -------------------------------------------------------------------------
  const LEARNER_LANE = "speaker:learner-1:transcript";

  test("a stored row's lane wins over the input lane, and a differing input logs lane_mismatch", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "stored-learner",
      status: "pending",
      attempts: 0,
      streamId: LEARNER_LANE,
      speakerId: "learner-1",
    });
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "stored-learner", status: "done" });
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    // The caller (a tampered or stale producer) claims tutor:mic for what is stored as a learner chunk.
    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
      streamId: TUTOR_MIC_STREAM_ID,
      speakerId: null,
    });

    // The gate is asked about the STORED lane, never the claimed one.
    expect(mockGateTranscription).toHaveBeenCalledWith(SESSION_ID, LEARNER_LANE, "chunk");
    for (const call of mockUpsertTranscriptChunk.mock.calls) {
      expect(call[0]).toMatchObject({ streamId: LEARNER_LANE, speakerId: "learner-1" });
    }
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain(
      `[cns] wbsid=${SESSION_ID} action=lane_mismatch stored=${LEARNER_LANE} input=${TUTOR_MIC_STREAM_ID}`
    );
  });

  test("no lane_mismatch is logged when the input lane matches the stored lane, or the input has none", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "stored",
      status: "pending",
      attempts: 0,
      streamId: LEARNER_LANE,
      speakerId: "learner-1",
    });
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "stored", status: "done" });
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    await processChunkTranscribeJob({ sessionId: SESSION_ID, chunkBlobUrl: CHUNK_URL, recordingTimeOffsetMs: 0 });
    await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
      streamId: LEARNER_LANE,
    });

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("action=lane_mismatch"))).toBe(false);
  });

  test("a stored row with no input lane keeps its lane (the old default would have relabeled it tutor:mic)", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "stored",
      status: "failed",
      attempts: 1,
      streamId: LEARNER_LANE,
      speakerId: "learner-1",
    });
    mockGetTranscriptChunksBySessionId.mockResolvedValue([]);
    mockUpsertTranscriptChunk.mockResolvedValue({ id: "stored", status: "done" });
    mockTranscribeChunk.mockResolvedValue(okTranscribeResult);
    mockFetchPrivateBlobBytes.mockResolvedValue(okBlobFetch);

    await processChunkTranscribeJob({ sessionId: SESSION_ID, chunkBlobUrl: CHUNK_URL, recordingTimeOffsetMs: 0 });

    expect(mockGateTranscription).toHaveBeenCalledWith(SESSION_ID, LEARNER_LANE, "chunk");
    for (const call of mockUpsertTranscriptChunk.mock.calls) {
      expect(call[0]).toMatchObject({ streamId: LEARNER_LANE, speakerId: "learner-1" });
    }
  });

  test("no stored row and no input lane: skipped (lane_unknown), nothing written, nothing fetched, no default lane", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(outcome).toBe("skipped");
    expect(mockGateTranscription).not.toHaveBeenCalled();
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
    expect(log.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringContaining("action=worker_skip reason=lane_unknown")
    );
  });

  test("a refused chunk with a stored row is marked refused (terminal), keeps its lane, and is never fetched or transcribed", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "stored-learner",
      status: "pending",
      attempts: 0,
      streamId: LEARNER_LANE,
      speakerId: "learner-1",
    });
    mockGateTranscription.mockResolvedValue({ allow: false, reason: "audio_off" });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
      surface: "sweep",
    });

    expect(outcome).toBe("refused");
    expect(mockGateTranscription).toHaveBeenCalledWith(SESSION_ID, LEARNER_LANE, "sweep");
    expect(mockUpdateTranscriptChunkStatus).toHaveBeenCalledWith(SESSION_ID, "stored-learner", "refused", {
      error: "audio_off",
    });
    // The refusal is a status-only update: the lane columns are not written.
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
    expect(mockTranscribeChunk).not.toHaveBeenCalled();
  });

  test("a refused chunk with no stored row creates no row at all", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue(null);
    mockGateTranscription.mockResolvedValue({ allow: false, reason: "audio_off" });

    const outcome = await processChunkTranscribeJob({
      sessionId: SESSION_ID,
      chunkBlobUrl: CHUNK_URL,
      recordingTimeOffsetMs: 0,
      streamId: LEARNER_LANE,
      surface: "queue",
    });

    expect(outcome).toBe("refused");
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptChunkStatus).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
  });

  test("an already-refused row is a terminal no-op: returns refused without re-gating, fetching or writing", async () => {
    mockGetTranscriptChunkByBlobUrl.mockResolvedValue({
      id: "refused-row",
      status: "refused",
      attempts: 0,
      streamId: LEARNER_LANE,
      speakerId: "learner-1",
    });

    const outcome = await processChunkTranscribeJob({ sessionId: SESSION_ID, chunkBlobUrl: CHUNK_URL });

    expect(outcome).toBe("refused");
    expect(mockGateTranscription).not.toHaveBeenCalled();
    expect(mockUpsertTranscriptChunk).not.toHaveBeenCalled();
    expect(mockUpdateTranscriptChunkStatus).not.toHaveBeenCalled();
    expect(mockFetchPrivateBlobBytes).not.toHaveBeenCalled();
  });
});