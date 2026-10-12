import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enqueueNotesReduce } from "@/lib/recording/notes-enqueue";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

/**
 * Test-env-only: seal session + enqueue notes reduce without audio drain.
 *
 * Fake-mic End uploads corrupt WebM that Whisper marks failed — that blocks
 * the WS-K finalize fast-path (isPartial). This route mirrors the notes
 * pipeline trigger End would fire once chunks are settled, without polluting
 * TranscriptChunk rows.
 *
 * `{ enqueue: false }` seals endedAt and leaves the TutorNote row alone.
 * The notes-blur tests need a pending or generating note that stays that way;
 * enqueueNotesReduce can fast-path the row to done and hide the blur.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const { sessionId } = await ctx.params;

  let enqueue = true;
  try {
    const body = (await req.json()) as { enqueue?: unknown };
    if (body?.enqueue === false) enqueue = false;
  } catch {
    // empty body → enqueue, matching the original seal-and-enqueue callers
  }

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

  if (enqueue) {
    await enqueueNotesReduce(sessionId);
  }

  return NextResponse.json({
    ok: true,
    sealedAt: sealedAt.toISOString(),
    enqueued: enqueue,
  });
}
