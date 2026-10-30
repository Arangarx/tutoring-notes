import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/session-capabilities";

const DEFAULT_NOTE_CONTENT = JSON.stringify({
  topics: "Algebra factoring",
  assessment: "Solid grasp of basics",
  nextSteps: "Practice mixed problems",
  links: "",
});

/**
 * Test-env-only: seed WS-K live-reduce watermark precondition for Playwright.
 *
 * Fake-mic WebM cannot be transcribed by Whisper in the harness; this route
 * establishes the durable DB state live reduce would have written mid-session
 * (done chunks + extractions + TutorNote.content + lastReducedChunkCount).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ sessionId: string }> }
) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;

  const { sessionId } = await ctx.params;

  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: { id: true, endedAt: true, adminUserId: true, studentId: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.endedAt) {
    return NextResponse.json({ error: "Session already ended." }, { status: 409 });
  }

  let chunkCount = 5;
  let pruneNonHarnessChunks = false;
  let noteStatus: "pending" | "generating" = "pending";
  let noteContent: string | null = DEFAULT_NOTE_CONTENT;
  try {
    const body = (await req.json()) as {
      chunkCount?: number;
      pruneNonHarnessChunks?: boolean;
      noteStatus?: unknown;
      noteContent?: unknown;
    };
    if (
      typeof body.chunkCount === "number" &&
      Number.isInteger(body.chunkCount) &&
      body.chunkCount >= 1 &&
      body.chunkCount <= 20
    ) {
      chunkCount = body.chunkCount;
    }
    if (body.pruneNonHarnessChunks === true) {
      pruneNonHarnessChunks = true;
    }
    if ("noteStatus" in body && body.noteStatus !== undefined) {
      if (body.noteStatus !== "pending" && body.noteStatus !== "generating") {
        return NextResponse.json(
          { error: "noteStatus must be pending or generating." },
          { status: 400 }
        );
      }
      noteStatus = body.noteStatus;
    }
    if ("noteContent" in body) {
      if (body.noteContent === null) {
        noteContent = null;
      } else if (typeof body.noteContent === "string") {
        noteContent = body.noteContent;
      } else {
        return NextResponse.json(
          { error: "noteContent must be a string or null." },
          { status: 400 }
        );
      }
    }
  } catch {
    // empty body → defaults
  }

  const harnessPrefix = `https://test.harness.local/wsk-seed/${sessionId}/`;

  if (pruneNonHarnessChunks) {
    await db.transcriptChunk.deleteMany({
      where: {
        sessionId,
        NOT: { chunkBlobUrl: { startsWith: harnessPrefix } },
      },
    });
  }

  const now = new Date();
  const chunkIds: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const blobUrl = `${harnessPrefix}${i}.webm`;
    const chunk = await db.transcriptChunk.upsert({
      where: {
        sessionId_chunkBlobUrl: { sessionId, chunkBlobUrl: blobUrl },
      },
      create: {
        sessionId,
        chunkBlobUrl: blobUrl,
        recordingTimeOffsetMs: i * 30_000,
        durationMs: 28_000,
        transcript: `Harness transcript segment ${i + 1} for algebra review.`,
        status: "done",
        streamId: TUTOR_MIC_STREAM_ID,
        transcribedAt: now,
      },
      update: {
        status: "done",
        transcript: `Harness transcript segment ${i + 1} for algebra review.`,
        transcribedAt: now,
      },
    });
    chunkIds.push(chunk.id);

    await db.transcriptChunkExtraction.upsert({
      where: { chunkId: chunk.id },
      create: {
        sessionId,
        chunkId: chunk.id,
        topics: JSON.stringify([`Topic ${i + 1}`]),
        studentQuestions: "[]",
        corrections: "[]",
        followUps: "[]",
      },
      update: {
        topics: JSON.stringify([`Topic ${i + 1}`]),
        extractedAt: now,
      },
    });
  }

  const note = await db.tutorNote.upsert({
    where: { sessionId },
    create: {
      sessionId,
      status: noteStatus,
      content: noteContent,
      lastReducedChunkCount: chunkCount,
      lastLiveReduceAt: now,
    },
    update: {
      status: noteStatus,
      content: noteContent,
      lastReducedChunkCount: chunkCount,
      lastLiveReduceAt: now,
      isPartial: false,
      error: null,
      generatedAt: null,
    },
  });

  // One live_reduce billing row — distinguishes finalize fast-path (phase=reduce).
  await db.costEvent.create({
    data: {
      kind: "GPT_NOTES_GENERATION",
      model: "gpt-4o-mini",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.0001,
      whiteboardSessionId: sessionId,
      adminUserId: session.adminUserId,
      studentId: session.studentId,
      metadata: {
        tnt: true,
        phase: "live_reduce",
        chunks: chunkCount,
        harnessSeed: true,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    chunkCount,
    chunkIds,
    tutorNoteId: note.id,
    lastReducedChunkCount: note.lastReducedChunkCount,
    noteStatus: note.status,
    noteContent: note.content,
  });
}
