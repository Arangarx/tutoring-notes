"use client";

/**
 * Whiteboard blob upload helpers — one entry-point per `UploadKind`
 * served by `/api/upload/blob`.
 *
 * Mirrors `uploadAudioDirect` in `src/lib/recording/upload.ts`. We
 * keep them separate so a future tweak to one (retry policy, content-
 * type quirks) doesn't accidentally regress the other. Both go
 * through the same `handleUpload` route and share its auth gate.
 */

import { safeName } from "@/lib/blob-path";

export type WhiteboardUploadResult =
  | { ok: true; blobUrl: string; sizeBytes: number }
  | { ok: false; error: string };

const TOKEN_RETRYABLE =
  /client token|Failed to retrieve|token|rate|limit|5\d\d|network|fetch|timeout|AbortError/i;

/** Four attempts — long PDFs burst token mints; page 3+ needs headroom. */
export const WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS = [0, 400, 1_200, 2_400] as const;

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function uploadGeneric(
  pathname: string,
  blob: Blob,
  contentType: string,
  clientPayload: Record<string, unknown> & { joinToken?: string }
): Promise<WhiteboardUploadResult> {
  const { shouldUseBlobHarnessClientUpload, uploadViaBlobHarness } =
    await import("@/lib/blob-harness-client-upload");
  const useHarness = shouldUseBlobHarnessClientUpload();

  const attemptUpload = async (): Promise<{ url: string }> => {
    if (useHarness) {
      return uploadViaBlobHarness({
        pathname,
        blob,
        contentType,
        handleUploadUrl: "/api/upload/blob",
        clientPayload: JSON.stringify(clientPayload),
      });
    }
    const { upload } = await import("@vercel/blob/client");
    return upload(pathname, blob, {
      access: "private",
      handleUploadUrl: "/api/upload/blob",
      contentType,
      clientPayload: JSON.stringify(clientPayload),
    });
  };

  // Long PDF runs issue many back-to-back token requests; Vercel can
  // occasionally fail a single "retrieve the client token" call — retry
  // with backoff on both SDK and harness mint paths.
  let lastRaw = "Unknown error";
  for (let attempt = 0; attempt < WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS.length; attempt++) {
    const backoff = WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS[attempt]!;
    if (backoff > 0) {
      await sleepMs(backoff);
    }
    try {
      const result = await attemptUpload();
      return { ok: true, blobUrl: result.url, sizeBytes: blob.size };
    } catch (err) {
      lastRaw = err instanceof Error ? err.message : String(err);
      const retry =
        attempt < WHITEBOARD_UPLOAD_TOKEN_BACKOFFS_MS.length - 1 &&
        TOKEN_RETRYABLE.test(lastRaw);
      if (typeof console !== "undefined" && !retry) {
        console.error("[whiteboard.upload] upload failed", {
          pathname,
          contentType,
          sizeBytes: blob.size,
          rawError: lastRaw,
          attempt,
        });
      } else if (typeof console !== "undefined" && retry) {
        console.warn("[whiteboard.upload] retrying after token/client error", {
          attempt: attempt + 1,
          rawError: lastRaw,
        });
      }
      if (!retry) {
        return {
          ok: false,
          error: `Could not upload to whiteboard storage. Please try again. (${lastRaw})`,
        };
      }
    }
  }
  return {
    ok: false,
    error: `Could not upload to whiteboard storage. Please try again. (${lastRaw})`,
  };
}

/**
 * Upload the canonical event log (events.json) at end-of-session.
 *
 * Pathname includes the studentId + sessionId for traceability and so
 * a future cleanup sweep can list-and-delete by prefix. Random suffix
 * is added by the route's `addRandomSuffix: true` so two simultaneous
 * uploads don't collide.
 */
export async function uploadWhiteboardEvents(args: {
  whiteboardSessionId: string;
  studentId: string;
  eventsJson: string;
}): Promise<WhiteboardUploadResult> {
  const { whiteboardSessionId, studentId, eventsJson } = args;
  const blob = new Blob([eventsJson], { type: "application/json" });
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/${Date.now()}-events.json`;
  return uploadGeneric(pathname, blob, "application/json", {
    kind: "whiteboard-events",
    whiteboardSessionId,
  });
}

/**
 * Upload an end-of-session canvas snapshot PNG. Optional — the session
 * survives without it; we use it for thumbnails on the admin index.
 */
export async function uploadWhiteboardSnapshot(args: {
  whiteboardSessionId: string;
  studentId: string;
  png: Blob;
}): Promise<WhiteboardUploadResult> {
  const { whiteboardSessionId, studentId, png } = args;
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/${Date.now()}-snapshot.png`;
  return uploadGeneric(pathname, png, "image/png", {
    kind: "whiteboard-snapshot",
    whiteboardSessionId,
  });
}

/**
 * Upload an inserted asset (PDF page render, raster image, math SVG).
 * `assetTag` is included in server log lines for traceability.
 */
export async function uploadWhiteboardAsset(args: {
  whiteboardSessionId: string;
  studentId: string;
  blob: Blob;
  filename: string;
  contentType: string;
  assetTag?: string;
  /**
   * Student join page: authenticate the Vercel Blob token via the same
   * `WhiteboardJoinToken` the student used to open `/w/...` (no tutor cookie).
   */
  joinToken?: string;
}): Promise<WhiteboardUploadResult> {
  const {
    whiteboardSessionId,
    studentId,
    blob,
    filename,
    contentType,
    assetTag,
    joinToken,
  } = args;
  const pathname = `whiteboard-sessions/${studentId}/${whiteboardSessionId}/assets/${Date.now()}-${safeName(filename, "blob.bin")}`;
  return uploadGeneric(pathname, blob, contentType, {
    kind: "whiteboard-asset",
    whiteboardSessionId,
    assetTag,
    ...(joinToken ? { joinToken } : {}),
  });
}
