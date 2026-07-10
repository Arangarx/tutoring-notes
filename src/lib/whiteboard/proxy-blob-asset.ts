/**
 * Shared stream core for whiteboard private-blob asset proxies.
 *
 * Callers MUST run auth / session gates before invoking the stream helpers.
 * SSRF guard: callers MUST call `isWbAssetUrlInSessionScope` (wraps
 * `isBlobUrlForSession`) before `streamPrivateWbAsset` — the scope check
 * is not performed inside the stream helper.
 */

import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  harnessStoreGet,
  isBlobHarnessActive,
  isHarnessBlobUrl,
  pathnameFromHarnessUrl,
} from "@/lib/blob-harness";
import { isBlobUrlForSession } from "@/lib/whiteboard/blob-asset-in-scope";

export type WbAssetSessionScope = {
  studentId: string;
  whiteboardSessionId: string;
};

export type ParsedWbAssetUrl =
  | { ok: true; publicUrl: string }
  | { ok: false; response: Response };

/** Parse and syntactically validate the `u` query param. */
export function parseWbAssetUrlFromSearchParams(
  searchParams: URLSearchParams
): ParsedWbAssetUrl {
  const u = searchParams.get("u");
  if (!u) {
    return {
      ok: false,
      response: new NextResponse("Missing u query parameter.", { status: 400 }),
    };
  }
  try {
    const publicUrl = decodeURIComponent(u);
    // eslint-disable-next-line no-new -- validate URL shape
    new URL(publicUrl);
    return { ok: true, publicUrl };
  } catch {
    return {
      ok: false,
      response: new NextResponse("Invalid u parameter.", { status: 400 }),
    };
  }
}

/** Path-namespace SSRF guard — must pass before any blob I/O. */
export function isWbAssetUrlInSessionScope(
  publicUrl: string,
  scope: WbAssetSessionScope
): boolean {
  return isBlobUrlForSession(publicUrl, scope);
}

export type StreamPrivateWbAssetOptions = {
  cacheMaxAge: number;
  /** Tutor route only: read from Playwright harness store when active. */
  harnessFallback?: boolean;
  /** Injectable for unit tests. */
  blobGet?: typeof get;
};

/**
 * Stream a private whiteboard asset after scope validation.
 * Returns 404 when the blob is missing or harness lookup fails.
 */
export async function streamPrivateWbAsset(
  publicUrl: string,
  options: StreamPrivateWbAssetOptions
): Promise<Response> {
  const { cacheMaxAge, harnessFallback = false, blobGet = get } = options;

  if (harnessFallback && isBlobHarnessActive() && isHarnessBlobUrl(publicUrl)) {
    const key = pathnameFromHarnessUrl(publicUrl);
    const stored = key ? harnessStoreGet(key) : null;
    if (!stored) {
      return new NextResponse("Not found.", { status: 404 });
    }
    const ct = stored.contentType ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(stored.bytes), {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": `private, max-age=${cacheMaxAge}`,
      },
    });
  }

  const result = await blobGet(publicUrl, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const ct = result.blob.contentType ?? "application/octet-stream";
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Cache-Control": `private, max-age=${cacheMaxAge}`,
    },
  });
}
