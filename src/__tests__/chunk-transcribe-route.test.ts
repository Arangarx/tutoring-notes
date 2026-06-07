/**
 * Unit tests for src/app/api/queues/chunk-transcribe/route.ts
 *
 * Tests:
 *  1. Valid payload + worker success → HTTP 200 with outcome=done.
 *  2. Valid payload + already done (worker skipped) → HTTP 200 with outcome=skipped.
 *  3. Worker returns 'failed' → HTTP 500 (triggers queue retry).
 *  4. Invalid JSON body → HTTP 400.
 *  5. Missing required fields → HTTP 400.
 *  6. Invalid URL in chunkBlobUrl → HTTP 400.
 *  7. Worker throws unexpected error → HTTP 500.
 *  8. Optional recordingTimeOffsetMs is forwarded when present.
 *  9. Safe redelivery: POST with same payload when chunk is already done → 200 (idempotent).
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProcessChunkTranscribeJob = jest.fn();

jest.mock("@/lib/recording/transcription-worker", () => ({
  processChunkTranscribeJob: (...args: unknown[]) => mockProcessChunkTranscribeJob(...args),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { POST } from "@/app/api/queues/chunk-transcribe/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("https://app.example.com/api/queues/chunk-transcribe", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  sessionId: "wbsid-route-test",
  chunkBlobUrl: "https://blob.vercel-storage.com/sessions/test/chunk-1.webm",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/queues/chunk-transcribe", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path — worker done
  // -------------------------------------------------------------------------
  test("valid payload + worker done → 200 with outcome=done", async () => {
    mockProcessChunkTranscribeJob.mockResolvedValue("done");

    const res = await POST(makeRequest(VALID_PAYLOAD));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, outcome: "done" });
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith({
      sessionId: VALID_PAYLOAD.sessionId,
      chunkBlobUrl: VALID_PAYLOAD.chunkBlobUrl,
      recordingTimeOffsetMs: undefined,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Already done — idempotent re-delivery
  // -------------------------------------------------------------------------
  test("worker skipped (already done) → 200 with outcome=skipped", async () => {
    mockProcessChunkTranscribeJob.mockResolvedValue("skipped");

    const res = await POST(makeRequest(VALID_PAYLOAD));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, outcome: "skipped" });
  });

  // -------------------------------------------------------------------------
  // 3. Worker returns failed → 500 (queue retries)
  // -------------------------------------------------------------------------
  test("worker returns failed → 500 to trigger queue retry", async () => {
    mockProcessChunkTranscribeJob.mockResolvedValue("failed");

    const res = await POST(makeRequest(VALID_PAYLOAD));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ ok: false, outcome: "failed", retryable: true });
  });

  // -------------------------------------------------------------------------
  // 4. Invalid JSON body
  // -------------------------------------------------------------------------
  test("invalid JSON body → 400", async () => {
    const req = new Request("https://app.example.com/api/queues/chunk-transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json {{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Missing required fields
  // -------------------------------------------------------------------------
  test("missing sessionId → 400", async () => {
    const res = await POST(makeRequest({ chunkBlobUrl: VALID_PAYLOAD.chunkBlobUrl }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.details).toBeDefined();
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  test("missing chunkBlobUrl → 400", async () => {
    const res = await POST(makeRequest({ sessionId: VALID_PAYLOAD.sessionId }));
    expect(res.status).toBe(400);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 6. Invalid URL in chunkBlobUrl
  // -------------------------------------------------------------------------
  test("non-URL chunkBlobUrl → 400", async () => {
    const res = await POST(
      makeRequest({ sessionId: VALID_PAYLOAD.sessionId, chunkBlobUrl: "not-a-url" })
    );
    expect(res.status).toBe(400);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 7. Worker throws unexpected error
  // -------------------------------------------------------------------------
  test("worker throws unexpected error → 500", async () => {
    mockProcessChunkTranscribeJob.mockRejectedValue(new Error("Unexpected database error"));

    const res = await POST(makeRequest(VALID_PAYLOAD));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 8. Optional recordingTimeOffsetMs forwarded when present
  // -------------------------------------------------------------------------
  test("optional recordingTimeOffsetMs is forwarded to worker", async () => {
    mockProcessChunkTranscribeJob.mockResolvedValue("done");

    const payload = { ...VALID_PAYLOAD, recordingTimeOffsetMs: 30000 };
    await POST(makeRequest(payload));

    expect(mockProcessChunkTranscribeJob).toHaveBeenCalledWith(
      expect.objectContaining({ recordingTimeOffsetMs: 30000 })
    );
  });

  // -------------------------------------------------------------------------
  // 9. Negative recordingTimeOffsetMs is rejected
  // -------------------------------------------------------------------------
  test("negative recordingTimeOffsetMs → 400", async () => {
    const payload = { ...VALID_PAYLOAD, recordingTimeOffsetMs: -100 };
    const res = await POST(makeRequest(payload));
    expect(res.status).toBe(400);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });
});
