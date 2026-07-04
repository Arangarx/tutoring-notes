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
    select: { status: true },
  });

  return NextResponse.json({
    count: rows.length,
    byStream,
    rows,
    tutorNoteStatus: tutorNote?.status ?? null,
  });
}
