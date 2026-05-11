/**
 * @jest-environment node
 *
 * Unit tests for `streamBlobWithRangeSupport`.
 *
 * Pins the protocol contract the whiteboard replay scrubber relies on:
 *
 *   - Inbound `Range` header is forwarded to the upstream blob URL.
 *   - Upstream `Accept-Ranges`, `Content-Length`, and `Content-Range`
 *     headers are echoed back so the browser knows it can seek.
 *   - We force `Accept-Ranges: bytes` on the response even when the
 *     upstream initial 200 doesn't include it (some CDNs only set
 *     it on the first 206).
 *   - 206 partial responses keep their status code intact.
 *   - Upstream failures collapse to a single 502 JSON payload.
 *
 * The audio proxy was previously returning 200 with no range
 * headers, leaving the native `<audio controls>` scrubber inert
 * until the user hard-refreshed the page (Sarah-pilot regression,
 * Phase 1b smoke testing).
 */

import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/audio/admin/aud_1", {
    method: "GET",
    headers,
  });
}

function makeUpstream(
  status: number,
  headers: Record<string, string>,
  body: string = ""
): Response {
  return new Response(body, { status, headers });
}

describe("streamBlobWithRangeSupport", () => {
  it("forwards no Range header on initial requests and returns 200 + Accept-Ranges", async () => {
    const seen: Array<{ url: string; headers: Headers }> = [];
    const fetchImpl = jest.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        seen.push({
          url: String(url),
          headers: new Headers(init?.headers as HeadersInit | undefined),
        });
        return makeUpstream(
          200,
          {
            "Content-Length": "12345",
            "Content-Type": "audio/webm",
          },
          ""
        );
      }
    ) as unknown as typeof fetch;

    const req = makeReq();
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm;codecs=opus",
      { fetchImpl }
    );

    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://blob.test/abc");
    expect(seen[0].headers.get("range")).toBeNull();
    expect(seen[0].headers.get("authorization")).toMatch(/^Bearer /);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/webm;codecs=opus");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Length")).toBe("12345");
    expect(res.headers.get("Cache-Control")).toMatch(/private/);
  });

  it("forwards inbound Range header to the upstream blob URL", async () => {
    let seenRange: string | null = null;
    const fetchImpl = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        seenRange = new Headers(init?.headers as HeadersInit | undefined).get(
          "range"
        );
        return makeUpstream(
          206,
          {
            "Content-Length": "4096",
            "Content-Range": "bytes 8192-12287/100000",
          },
          ""
        );
      }
    ) as unknown as typeof fetch;

    const req = makeReq({ Range: "bytes=8192-12287" });
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm",
      { fetchImpl }
    );

    expect(seenRange).toBe("bytes=8192-12287");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 8192-12287/100000");
    expect(res.headers.get("Content-Length")).toBe("4096");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("preserves 206 status when upstream returns partial content", async () => {
    const fetchImpl = jest.fn(
      async () => makeUpstream(206, { "Content-Length": "1024" }, "")
    ) as unknown as typeof fetch;

    const req = makeReq({ Range: "bytes=0-1023" });
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm",
      { fetchImpl }
    );

    expect(res.status).toBe(206);
  });

  it("forces Accept-Ranges: bytes even when upstream omits it", async () => {
    const fetchImpl = jest.fn(
      async () =>
        // Vercel Blob may return Content-Length but not
        // Accept-Ranges on the initial 200. Browsers gate seekable
        // ranges on this header so we MUST surface it.
        makeUpstream(200, { "Content-Length": "9999" }, "")
    ) as unknown as typeof fetch;

    const req = makeReq();
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm",
      { fetchImpl }
    );

    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("returns 502 JSON on upstream non-success (e.g. blob deleted)", async () => {
    const fetchImpl = jest.fn(
      async () => makeUpstream(404, {}, "not found")
    ) as unknown as typeof fetch;

    const req = makeReq();
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/missing",
      "audio/webm",
      { fetchImpl }
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("Content-Type")).toMatch(/json/);
    expect(await res.json()).toEqual({ error: "Audio unavailable" });
  });

  it("returns 502 JSON when fetch throws (network error)", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const req = makeReq();
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm",
      { fetchImpl }
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Audio unavailable" });
  });

  it("treats upstream 416 (unsatisfiable range) as 502 — predictable failure", async () => {
    // 416 is technically a valid HTTP code but the browser would
    // handle it differently from 200/206. Collapse to 502 so the
    // player's existing error UI handles it uniformly.
    const fetchImpl = jest.fn(
      async () => makeUpstream(416, {}, "")
    ) as unknown as typeof fetch;

    const req = makeReq({ Range: "bytes=999999999-" });
    const res = await streamBlobWithRangeSupport(
      req,
      "https://blob.test/abc",
      "audio/webm",
      { fetchImpl }
    );

    expect(res.status).toBe(502);
  });
});
