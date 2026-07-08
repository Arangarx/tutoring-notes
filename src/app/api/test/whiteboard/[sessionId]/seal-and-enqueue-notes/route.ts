import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueNotesReduce } from "@/lib/recording/notes-enqueue";

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
 * Test-env-only: seal session + enqueue notes reduce without audio drain.
 *
 * Fake-mic End uploads corrupt WebM that Whisper marks failed — that blocks
 * the WS-K finalize fast-path (isPartial). This route mirrors the notes
 * pipeline trigger End would fire once chunks are settled, without polluting
 * TranscriptChunk rows.
 */
export async function POST(
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

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { id: true, endedAt: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const sealedAt = session.endedAt ?? new Date();
  if (!session.endedAt) {
    await db.whiteboardSession.update({
      where: { id: sessionId },
      data: { endedAt: sealedAt },
    });
  }

  await enqueueNotesReduce(sessionId);

  return NextResponse.json({
    ok: true,
    sealedAt: sealedAt.toISOString(),
  });
}
