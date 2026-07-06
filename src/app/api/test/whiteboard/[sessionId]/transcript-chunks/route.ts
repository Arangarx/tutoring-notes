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
 * Test-env-only helper for Playwright DB assertions on TranscriptChunk rows.
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
  const rows = await db.transcriptChunk.findMany({
    where: { sessionId },
    select: {
      streamId: true,
      speakerId: true,
      status: true,
      recordingTimeOffsetMs: true,
    },
    orderBy: { recordingTimeOffsetMs: "asc" },
  });

  const byStream: Record<string, number> = {};
  for (const row of rows) {
    byStream[row.streamId] = (byStream[row.streamId] ?? 0) + 1;
  }

  const tutorNote = await db.tutorNote.findUnique({
    where: { sessionId },
    select: { status: true, lastReducedChunkCount: true },
  });

  const doneChunkCount = rows.filter((r) => r.status === "done").length;

  const notesCostEvents = await db.costEvent.findMany({
    where: {
      whiteboardSessionId: sessionId,
      kind: "GPT_NOTES_GENERATION",
    },
    select: { metadata: true },
  });

  const costPhase = (metadata: unknown): string | null => {
    if (!metadata || typeof metadata !== "object" || !("phase" in metadata)) {
      return null;
    }
    const phase = (metadata as { phase?: unknown }).phase;
    return typeof phase === "string" ? phase : null;
  };

  let finalizeReduceCostEventCount = 0;
  let liveReduceCostEventCount = 0;
  for (const event of notesCostEvents) {
    const phase = costPhase(event.metadata);
    if (phase === "reduce") {
      finalizeReduceCostEventCount += 1;
    } else if (phase === "live_reduce") {
      liveReduceCostEventCount += 1;
    }
  }

  return NextResponse.json({
    count: rows.length,
    byStream,
    rows,
    tutorNoteStatus: tutorNote?.status ?? null,
    tutorNoteLastReducedChunkCount: tutorNote?.lastReducedChunkCount ?? 0,
    doneChunkCount,
    finalizeReduceCostEventCount,
    liveReduceCostEventCount,
  });
}
