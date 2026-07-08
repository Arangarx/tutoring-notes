import { NextResponse } from "next/server";
import {
  isBlobHarnessActive,
  isHarnessBlobUrl,
  streamHarnessBlobWithRangeSupport,
} from "@/lib/blob-harness";

/**
 * Stream a private Vercel Blob audio file through our origin with
 * full HTTP range-request support.
 *
 * Why this matters:
 *
 *   - HTML `<audio controls>` needs `Accept-Ranges: bytes` (and
 *     ideally `Content-Length`) on the response so the native
 *     scrubber can be dragged. Without range support, Chrome cannot
 *     seek even after it knows the duration — clicking the scrubber
 *     either no-ops or resets to t=0.
 *   - The Chrome `MediaRecorder` WebM bug means our recordings have
 *     no duration header. The standard `currentTime = 1e101` hack
 *     (see `attachWebmDurationFix`) only works if the browser can
 *     range-fetch the tail of the file to recover cluster timestamps.
 *     A proxy that buffers the whole body with no `Accept-Ranges`
 *     defeats both mechanisms — exactly the Sarah-pilot regression
 *     we shipped a partial fix for in Phase 1b.
 *
 * What this helper does:
 *
 *   1. Forwards the inbound `Range` header to the underlying Vercel
 *      Blob URL. Vercel Blob is S3-compatible and honours byte
 *      ranges natively, including `Range: bytes=-N` for tail reads.
 *   2. Echoes back the upstream `status` (`200` for full responses,
 *      `206` for partial), `Content-Length`, and `Content-Range`.
 *   3. Always sets `Accept-Ranges: bytes` on the response so the
 *      browser knows it can issue range requests on subsequent
 *      seeks — even on the initial 200 response.
 *
 * Caller responsibilities:
 *
 *   - Auth / ownership checks BEFORE invoking this helper. This
 *     helper trusts the caller.
 *   - Provide a fully-resolved `mimeType` to return as
 *     `Content-Type`. We pass it through verbatim.
 *
 * `fetchImpl` is injectable for tests that don't want to hit the
 * network. Defaults to the global `fetch`.
 */
export async function streamBlobWithRangeSupport(
  req: Request,
  blobUrl: string,
  mimeType: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<Response> {
  if (isBlobHarnessActive() && isHarnessBlobUrl(blobUrl)) {
    return streamHarnessBlobWithRangeSupport(req, blobUrl, mimeType);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";

  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${blobToken}`,
  };
  const range = req.headers.get("range");
  if (range) upstreamHeaders.Range = range;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetchImpl(blobUrl, { headers: upstreamHeaders });
  } catch {
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }

  // 200 (full body) and 206 (range satisfied) are both valid
  // success cases. Anything else (404, 416 unsatisfiable range,
  // 5xx) is surfaced as 502 to the browser so the player shows a
  // single, predictable failure path.
  if (upstreamRes.status !== 200 && upstreamRes.status !== 206) {
    return NextResponse.json({ error: "Audio unavailable" }, { status: 502 });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": mimeType,
    "Cache-Control": "private, max-age=3600",
    // CRITICAL: surface `Accept-Ranges: bytes` even on the initial
    // 200 response. Browsers gate the seekable range on this header
    // when no explicit `seekable` info is available.
    "Accept-Ranges": "bytes",
  };
  const contentLength = upstreamRes.headers.get("content-length");
  if (contentLength) responseHeaders["Content-Length"] = contentLength;
  const contentRange = upstreamRes.headers.get("content-range");
  if (contentRange) responseHeaders["Content-Range"] = contentRange;

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: responseHeaders,
  });
}
