import { NextResponse } from "next/server";
import { isBlobHarnessActive } from "@/lib/blob-harness";
import { assertStudentNotErasedApi } from "@/lib/erasure/assert-student-not-erased";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { env } from "@/lib/env";
import { replayResourceIsDenied, resolveReplayAccess } from "@/lib/share/replay-access";
import {
  isWbAssetUrlInSessionScope,
  parseWbAssetUrlFromSearchParams,
  streamPrivateWbAsset,
} from "@/lib/whiteboard/proxy-blob-asset";

/**
 * Logged-in tutor read proxy for the same private blob URLs, when the
 * workspace hydrates a scene that references a peer-originated asset.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const { sessionId } = await ctx.params;
  if (!env.BLOB_READ_WRITE_TOKEN && !isBlobHarnessActive()) {
    return new NextResponse("Blob storage is not configured.", { status: 503 });
  }

  const parsed = parseWbAssetUrlFromSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) return parsed.response;
  const { publicUrl } = parsed;

  const session = await assertOwnsWhiteboardSession(sessionId);

  const erasureBlocked = await assertStudentNotErasedApi(session.studentId);
  if (erasureBlocked) return erasureBlocked;

  if (
    !isWbAssetUrlInSessionScope(publicUrl, {
      studentId: session.studentId,
      whiteboardSessionId: session.id,
    })
  ) {
    return new NextResponse("Not found.", { status: 404 });
  }

  // After End the frozen snapshot decides whether a board exists to read. Whiteboard off: 404 even while the asset
  // blob is still in storage (before any purge pass). A live session is unchanged.
  const replay = (await resolveReplayAccess([session.id], { principal: "tutor" })).get(session.id);
  if (replayResourceIsDenied(replay, "board")) {
    return new NextResponse("Not found.", { status: 404 });
  }

  return streamPrivateWbAsset(publicUrl, {
    cacheMaxAge: 300,
    harnessFallback: true,
  });
}
