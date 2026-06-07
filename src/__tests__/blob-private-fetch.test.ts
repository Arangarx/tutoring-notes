/**
 * Unit tests for fetchPrivateBlobBytes — private Vercel Blob authenticated read.
 *
 * Private-store URLs return 403 without BLOB_READ_WRITE_TOKEN Bearer header.
 * Regression guard for transcription-worker and other server-side download paths.
 */

const mockHead = jest.fn();
const mockDel = jest.fn();
const mockGetDownloadUrl = jest.fn();

jest.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => mockDel(...args),
  head: (...args: unknown[]) => mockHead(...args),
  getDownloadUrl: (...args: unknown[]) => mockGetDownloadUrl(...args),
}));

import { fetchPrivateBlobBytes } from "@/lib/blob";

const PRIVATE_BLOB_URL =
  "https://zhmkbigofdexruvq.private.blob.vercel-storage.com/sessions/test/chunk.webm";
const FAKE_AUDIO = Buffer.alloc(256, 0xaa);

describe("fetchPrivateBlobBytes", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalToken;
    }
  });

  test("sends Bearer token — unauthenticated fetch returns 403, authenticated returns 200", async () => {
    const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      if (!auth) {
        return {
          ok: false,
          status: 403,
          statusText: "Forbidden",
          headers: { get: () => null },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        };
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (key: string) => (key === "content-type" ? "audio/webm" : null) },
        arrayBuffer: () => Promise.resolve(FAKE_AUDIO.buffer as ArrayBuffer),
      };
    });

    const result = await fetchPrivateBlobBytes(PRIVATE_BLOB_URL, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(PRIVATE_BLOB_URL, {
      headers: { Authorization: "Bearer test_blob_rw_token" },
    });
    expect(result.buffer).toEqual(FAKE_AUDIO);
    expect(result.contentType).toBe("audio/webm");
  });

  test("throws on non-OK response (e.g. 403 when token missing)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "";

    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: { get: () => null },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });

    await expect(
      fetchPrivateBlobBytes(PRIVATE_BLOB_URL, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).rejects.toThrow(/HTTP 403 Forbidden/);
    expect(fetchImpl).toHaveBeenCalledWith(PRIVATE_BLOB_URL, { headers: {} });
  });
});
