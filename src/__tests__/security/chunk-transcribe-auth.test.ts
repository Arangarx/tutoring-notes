/**
 * Security regression: POST /api/queues/chunk-transcribe must enforce
 * the internal-caller bearer-token guard when CRON_SECRET is configured.
 *
 * Asserts:
 *  - When CRON_SECRET is set, requests without a valid Bearer token are
 *    rejected 401 before the worker runs.
 *  - When CRON_SECRET is unset, the request is allowed through (fail-open
 *    backward-compat for pre-config deployments).
 *  - A valid bearer token passes the guard and reaches the worker.
 */

const mockProcessChunkTranscribeJob = jest.fn();

jest.mock("@/lib/recording/transcription-worker", () => ({
  processChunkTranscribeJob: (...args: unknown[]) =>
    mockProcessChunkTranscribeJob(...args),
}));

import { POST } from "@/app/api/queues/chunk-transcribe/route";

const VALID_PAYLOAD = {
  sessionId: "sess-abc-123",
  chunkBlobUrl: "https://blob.vercel-storage.com/test/chunk.webm",
};

function makeRequest(body: unknown, bearerToken?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (bearerToken !== undefined) {
    headers["authorization"] = `Bearer ${bearerToken}`;
  }
  return new Request("https://app.example.com/api/queues/chunk-transcribe", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/queues/chunk-transcribe — internal-caller auth guard", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
    jest.clearAllMocks();
  });

  test("returns 401 when CRON_SECRET is set and Authorization header is absent", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    const res = await POST(makeRequest(VALID_PAYLOAD));
    expect(res.status).toBe(401);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  test("returns 401 when CRON_SECRET is set and wrong bearer token is provided", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    const res = await POST(makeRequest(VALID_PAYLOAD, "wrong-token"));
    expect(res.status).toBe(401);
    expect(mockProcessChunkTranscribeJob).not.toHaveBeenCalled();
  });

  test("passes through when CRON_SECRET is unset (fail-open for backward compat)", async () => {
    delete process.env.CRON_SECRET;
    mockProcessChunkTranscribeJob.mockResolvedValue("done");
    const res = await POST(makeRequest(VALID_PAYLOAD));
    // 200 or 500 depending on worker mock, but NOT 401
    expect(res.status).not.toBe(401);
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalled();
  });

  test("proceeds to worker when correct bearer token is provided", async () => {
    process.env.CRON_SECRET = "test-secret-xyz";
    mockProcessChunkTranscribeJob.mockResolvedValue("done");
    const res = await POST(makeRequest(VALID_PAYLOAD, "test-secret-xyz"));
    expect(res.status).not.toBe(401);
    expect(mockProcessChunkTranscribeJob).toHaveBeenCalled();
  });
});
