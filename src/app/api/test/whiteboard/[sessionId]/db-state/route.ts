import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function isTestEnvRoute(): boolean {
  return (
    process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "1"
  );
}

function authorize(req: NextRequest): boolean {
  const secret = process.env.PLAYWRIGHT_TEST_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Test-env-only helper for Playwright WS-B batch assertions (SF-6).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  if (!isTestEnvRoute()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await ctx.params;

  const [batchCount, session, latestBatch] = await Promise.all([
    db.whiteboardEventBatch.count({
      where: { whiteboardSessionId: sessionId },
    }),
    db.whiteboardSession.findUnique({
      where: { id: sessionId },
      select: {
        lastPersistedBatchSeq: true,
        lastPersistedToIndex: true,
      },
    }),
    db.whiteboardEventBatch.findFirst({
      where: { whiteboardSessionId: sessionId },
      orderBy: { toEventIndex: "desc" },
      select: { toEventIndex: true },
    }),
  ]);

  return NextResponse.json({
    batchCount,
    lastPersistedBatchSeq: session?.lastPersistedBatchSeq ?? 0,
    lastPersistedToIndex: session?.lastPersistedToIndex ?? -1,
    latestToEventIndex: latestBatch?.toEventIndex ?? null,
  });
}
