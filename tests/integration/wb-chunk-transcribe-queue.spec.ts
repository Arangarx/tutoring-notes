/**
 * POST /api/queues/chunk-transcribe over the Playwright webServer.
 *
 * The route documents: missing/wrong bearer is 401 when CRON_SECRET is set;
 * a payload that fails validation is 400 (bad message — do not retry).
 */
import { test, expect } from "@playwright/test";
import { TAG } from "../test-tags";

const CRON_SECRET = "playwright-cron-secret";

test.describe("POST /api/queues/chunk-transcribe", { tag: [TAG.WB_RECORDING] }, () => {
  test("no bearer is 401; bearer with an invalid job body is 400", async ({ request }) => {
    const noAuth = await request.post("/api/queues/chunk-transcribe", {
      data: { sessionId: "does-not-exist", chunkBlobUrl: "not-a-url" },
    });
    expect(noAuth.status()).toBe(401);

    const invalid = await request.post("/api/queues/chunk-transcribe", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
      data: { sessionId: "does-not-exist", chunkBlobUrl: "not-a-url" },
    });
    // Payload validation failure (chunkBlobUrl is not a URL). Not an auth rejection.
    expect(invalid.status()).toBe(400);
    const body = (await invalid.json()) as { ok?: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid payload");
  });
});
