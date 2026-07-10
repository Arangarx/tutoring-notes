/**
 * Shared share-token proxy core for public whiteboard resources and audio.
 *
 * Blob URLs always come from DB columns — never from client query params.
 * Auth wall semantics are delegated to `checkApiShareAccess` unchanged.
 */

import { NextResponse } from "next/server";
import { streamBlobWithRangeSupport } from "@/lib/audio/proxy-stream";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { checkApiShareAccess } from "@/lib/share-access-scope";

export type ShareProxyAccess =
  | { ok: true; studentId: string }
  | { ok: false; response: Response };

/** Share-token + auth-wall gate, then erasure assert. */
export async function assertShareProxyAccess(
  req: Request,
  shareToken: string | null,
  apiPath: string
): Promise<ShareProxyAccess> {
  if (!shareToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Missing token." }, { status: 401 }),
    };
  }

  const access = await checkApiShareAccess(req, shareToken, apiPath);
  if (!access.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Access denied." },
        { status: access.status }
      ),
    };
  }

  const erasureBlocked = await assertStudentNotErasedApi(access.studentId, {
    salToken: shareToken,
  });
  if (erasureBlocked) {
    return { ok: false, response: erasureBlocked };
  }

  return { ok: true, studentId: access.studentId };
}

export type PublicWbSessionRow = {
  studentId: string;
  endedAt: Date | null;
  blobUrl: string | null | undefined;
};

export type GatePublicWbSessionOptions = {
  requireEnded: boolean;
  /** When set, live sessions return JSON (public-events / public-snapshot). */
  notEndedJsonError?: string;
  /** When true, live / missing blob return plain-text 404 (public-concat-audio). */
  plainTextErrors?: boolean;
  missingBlobJsonError?: string;
};

export type GatedPublicWbBlob =
  | { ok: true; blobUrl: string }
  | { ok: false; response: Response };

/**
 * Validate session ownership, ended gate, and blob column presence.
 * Does not fetch the blob — callers stream afterward.
 */
export function gatePublicWbSessionBlob(
  session: PublicWbSessionRow | null,
  accessStudentId: string,
  options: GatePublicWbSessionOptions
): GatedPublicWbBlob {
  if (!session || session.studentId !== accessStudentId) {
    if (options.plainTextErrors) {
      return {
        ok: false,
        response: new NextResponse("Not found.", { status: 404 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }

  if (options.requireEnded && !session.endedAt) {
    if (options.plainTextErrors) {
      return {
        ok: false,
        response: new NextResponse("Not found.", { status: 404 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: options.notEndedJsonError ?? "Session recording not yet available." },
        { status: 404 }
      ),
    };
  }

  const blobUrl = session.blobUrl;
  if (!blobUrl) {
    if (options.plainTextErrors) {
      return {
        ok: false,
        response: new NextResponse("Not found.", { status: 404 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: options.missingBlobJsonError ?? "Resource unavailable." },
        { status: 404 }
      ),
    };
  }

  return { ok: true, blobUrl };
}

export type FetchShareBlobOptions = {
  contentType: string;
  cacheMaxAge: number;
  unavailableJsonError: string;
  logTag?: string;
  sessionId?: string;
  rid?: string;
  /** Injectable for unit tests. */
  fetchImpl?: typeof fetch;
};

/** fetch + Bearer proxy for JSON/PNG share resources (no range support). */
export async function fetchShareBlobWithBearer(
  blobUrl: string,
  options: FetchShareBlobOptions
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const blobRes = await fetchImpl(blobUrl, {
    headers: blobToken ? { Authorization: `Bearer ${blobToken}` } : {},
  });

  if (!blobRes.ok) {
    if (options.logTag && options.sessionId && options.rid) {
      console.error(
        `[${options.logTag}] wbsid=${options.sessionId} rid=${options.rid} blob fetch ${blobRes.status}`
      );
    }
    return NextResponse.json(
      { error: options.unavailableJsonError },
      { status: 502 }
    );
  }

  return new Response(blobRes.body, {
    status: 200,
    headers: {
      "Content-Type": options.contentType,
      "Cache-Control": `private, max-age=${options.cacheMaxAge}`,
    },
  });
}

/** Range-capable share blob proxy (audio). */
export async function streamShareBlobWithRange(
  req: Request,
  blobUrl: string,
  mimeType: string,
  options: { streamImpl?: typeof streamBlobWithRangeSupport } = {}
): Promise<Response> {
  const streamImpl = options.streamImpl ?? streamBlobWithRangeSupport;
  return streamImpl(req, blobUrl, mimeType);
}
