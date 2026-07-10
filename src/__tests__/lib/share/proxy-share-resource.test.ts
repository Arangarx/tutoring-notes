/**
 * @jest-environment node
 *
 * Unit tests for proxy-share-resource shared gate + fetch core.
 * Oracle: ended-session gate, studentId match, DB-origin only (no client URL),
 * fetch+Bearer vs range streaming modes.
 */

const checkApiShareAccessMock = jest.fn();
const assertStudentNotErasedApiMock = jest.fn();
const streamBlobWithRangeSupportMock = jest.fn();

jest.mock("@/lib/share-access-scope", () => ({
  __esModule: true,
  checkApiShareAccess: (...args: unknown[]) => checkApiShareAccessMock(...args),
}));

jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  assertStudentNotErasedApi: (...args: unknown[]) =>
    assertStudentNotErasedApiMock(...args),
}));

jest.mock("@/lib/audio/proxy-stream", () => ({
  __esModule: true,
  streamBlobWithRangeSupport: (...args: unknown[]) =>
    streamBlobWithRangeSupportMock(...args),
}));

import {
  assertShareProxyAccess,
  fetchShareBlobWithBearer,
  gatePublicWbSessionBlob,
  streamShareBlobWithRange,
} from "@/lib/share/proxy-share-resource";

const DB_BLOB_URL =
  "https://abc.blob.vercel-storage.com/whiteboard-sessions/stu/events.json";
const EVIL_URL = "https://evil.example.com/steal-me";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NOTES_AUTH_WALL = "false";
  checkApiShareAccessMock.mockResolvedValue({
    allowed: true,
    studentId: "stu_a",
    learnerProfileId: null,
  });
  assertStudentNotErasedApiMock.mockResolvedValue(null);
  streamBlobWithRangeSupportMock.mockResolvedValue(
    new Response("audio", { status: 200, headers: { "Accept-Ranges": "bytes" } })
  );
});

describe("assertShareProxyAccess", () => {
  it("missing token → 401 JSON", async () => {
    const result = await assertShareProxyAccess(
      new Request("http://localhost/api/test"),
      null,
      "/api/test"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const json = (await result.response.json()) as { error?: string };
      expect(json.error).toMatch(/missing token/i);
    }
    expect(checkApiShareAccessMock).not.toHaveBeenCalled();
  });

  it("denied access preserves status from checkApiShareAccess", async () => {
    checkApiShareAccessMock.mockResolvedValue({ allowed: false, status: 403 });
    const result = await assertShareProxyAccess(
      new Request("http://localhost/api/test?token=tok"),
      "tok",
      "/api/test?token=tok"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
    expect(assertStudentNotErasedApiMock).not.toHaveBeenCalled();
  });

  it("allowed + not erased → studentId", async () => {
    const result = await assertShareProxyAccess(
      new Request("http://localhost/api/test?token=tok"),
      "tok",
      "/api/test?token=tok"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.studentId).toBe("stu_a");
    }
    expect(assertStudentNotErasedApiMock).toHaveBeenCalledWith("stu_a", {
      salToken: "tok",
    });
  });
});

describe("gatePublicWbSessionBlob", () => {
  it("studentId mismatch → 404 JSON", async () => {
    const gated = gatePublicWbSessionBlob(
      {
        studentId: "stu_other",
        endedAt: new Date(),
        blobUrl: DB_BLOB_URL,
      },
      "stu_a",
      { requireEnded: true }
    );
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.response.status).toBe(404);
      const json = (await gated.response.json()) as { error?: string };
      expect(json.error).toMatch(/not found/i);
    }
  });

  it("live session with requireEnded JSON mode → 404 with not-yet-available copy", async () => {
    const gated = gatePublicWbSessionBlob(
      { studentId: "stu_a", endedAt: null, blobUrl: DB_BLOB_URL },
      "stu_a",
      {
        requireEnded: true,
        notEndedJsonError: "Session recording not yet available.",
      }
    );
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      const json = (await gated.response.json()) as { error?: string };
      expect(json.error).toMatch(/not yet available/i);
    }
  });

  it("live session plain-text mode → 404 text (concat-audio shape)", async () => {
    const gated = gatePublicWbSessionBlob(
      { studentId: "stu_a", endedAt: null, blobUrl: DB_BLOB_URL },
      "stu_a",
      { requireEnded: true, plainTextErrors: true }
    );
    expect(gated.ok).toBe(false);
    if (!gated.ok) {
      expect(gated.response.status).toBe(404);
      expect(await gated.response.text()).toMatch(/not found/i);
    }
  });

  it("ended session + blob column → DB blobUrl only (never client URL)", () => {
    const gated = gatePublicWbSessionBlob(
      {
        studentId: "stu_a",
        endedAt: new Date(),
        blobUrl: DB_BLOB_URL,
      },
      "stu_a",
      { requireEnded: true }
    );
    expect(gated.ok).toBe(true);
    if (gated.ok) {
      expect(gated.blobUrl).toBe(DB_BLOB_URL);
      expect(gated.blobUrl).not.toBe(EVIL_URL);
    }
  });
});

describe("fetchShareBlobWithBearer", () => {
  it("streams blob with configured content-type and cache", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response('{"events":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const res = await fetchShareBlobWithBearer(DB_BLOB_URL, {
      contentType: "application/json",
      cacheMaxAge: 300,
      unavailableJsonError: "Event log unavailable.",
      fetchImpl: fetchMock,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(fetchMock).toHaveBeenCalledWith(
      DB_BLOB_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining("Bearer"),
        }),
      })
    );
  });

  it("upstream failure → 502 JSON", async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response("", { status: 500 }));
    const res = await fetchShareBlobWithBearer(DB_BLOB_URL, {
      contentType: "application/json",
      cacheMaxAge: 300,
      unavailableJsonError: "Event log unavailable.",
      fetchImpl: fetchMock,
    });
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/unavailable/i);
  });
});

describe("streamShareBlobWithRange", () => {
  it("delegates to streamBlobWithRangeSupport with DB blob URL", async () => {
    const req = new Request("http://localhost/api/test");
    await streamShareBlobWithRange(req, DB_BLOB_URL, "audio/webm", {
      streamImpl: streamBlobWithRangeSupportMock,
    });
    expect(streamBlobWithRangeSupportMock).toHaveBeenCalledWith(
      req,
      DB_BLOB_URL,
      "audio/webm"
    );
  });
});
