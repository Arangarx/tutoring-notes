import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { assertTutorApproved } from "@/lib/tutor-approval-scope";

/**
 * Whiteboard session live-persist + legacy checkpoint upload.
 *
 * **WS-B (~1s path):** `runServerPersist` in `useWhiteboardRecorder` POSTs
 * incremental event slices + required `boardDocumentJson` on every batch.
 * Rows land in `WhiteboardEventBatch`; session cursors
 * (`lastPersistedBatchSeq`, `lastPersistedToIndex`) are the source of truth
 * for WS-C/D finalize/resume. **No Vercel Blob `put` on this path** (SF-3) —
 * cross-device redundancy stays on the 30s IndexedDB checkpoint loop.
 *
 * **Legacy blob shape** (`takenAt` + full `eventsJson`): optional recovery
 * upload to `whiteboard-checkpoints/{sessionId}/` when a client still sends
 * that body shape. Not used by the 1s sidecar.
 */

type BatchCheckpointBody = {
  batchSeq: number;
  fromEventIndex: number;
  toEventIndex: number;
  eventsJson: string;
  boardDocumentJson: unknown;
  schemaVersion: number;
};

type LegacyCheckpointBody = {
  schemaVersion: number;
  takenAt: string;
  eventsJson: string;
};

function parseBatchBody(raw: unknown): BatchCheckpointBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<BatchCheckpointBody>;
  if (typeof r.batchSeq !== "number") return null;
  if (typeof r.fromEventIndex !== "number") return null;
  if (typeof r.toEventIndex !== "number") return null;
  if (typeof r.eventsJson !== "string") return null;
  if (r.boardDocumentJson === undefined || r.boardDocumentJson === null) return null;
  if (typeof r.schemaVersion !== "number") return null;
  return r as BatchCheckpointBody;
}

function parseLegacyBody(raw: unknown): LegacyCheckpointBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<LegacyCheckpointBody>;
  if (typeof r.schemaVersion !== "number") return null;
  if (typeof r.takenAt !== "string") return null;
  if (typeof r.eventsJson !== "string") return null;
  return r as LegacyCheckpointBody;
}

function isBatchBody(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  return typeof (raw as { batchSeq?: unknown }).batchSeq === "number";
}

async function assertActiveSession(
  sessionId: string,
  rid: string,
  session: { endedAt: Date | null }
): Promise<Response | null> {
  if (session.endedAt) {
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} ignoring checkpoint for ended session`
    );
    return NextResponse.json(
      { error: "Session already ended." },
      { status: 409 }
    );
  }

  const phaseRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: { sessionPhase: true },
      }),
    { label: "wbCheckpoint.phase" }
  );
  if (phaseRow?.sessionPhase !== "ACTIVE") {
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} skipping checkpoint: sessionPhase=${phaseRow?.sessionPhase ?? "unknown"}`
    );
    return NextResponse.json(
      { error: "Session not yet active.", debugId: rid },
      { status: 409 }
    );
  }

  return null;
}

async function handleBatchPersist(
  sessionId: string,
  rid: string,
  parsed: BatchCheckpointBody
): Promise<Response> {
  if (parsed.batchSeq <= 0) {
    return NextResponse.json(
      { error: "batchSeq must be positive.", debugId: rid },
      { status: 400 }
    );
  }
  if (parsed.fromEventIndex < 0 || parsed.toEventIndex < parsed.fromEventIndex) {
    return NextResponse.json(
      { error: "Invalid event index range.", debugId: rid },
      { status: 400 }
    );
  }

  const sessionRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: sessionId },
        select: {
          lastPersistedBatchSeq: true,
          lastPersistedToIndex: true,
        },
      }),
    { label: "wbCheckpoint.batchCursor" }
  );
  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const existing = await withDbRetry(
    () =>
      db.whiteboardEventBatch.findUnique({
        where: {
          whiteboardSessionId_batchSeq: {
            whiteboardSessionId: sessionId,
            batchSeq: parsed.batchSeq,
          },
        },
        select: { id: true },
      }),
    { label: "wbCheckpoint.batchLookup" }
  );
  if (existing) {
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} batchSeq=${parsed.batchSeq} noop=duplicate`
    );
    return NextResponse.json({ ok: true, noop: true, debugId: rid });
  }

  if (parsed.fromEventIndex < sessionRow.lastPersistedToIndex) {
    return NextResponse.json(
      {
        error: "fromEventIndex precedes lastPersistedToIndex.",
        debugId: rid,
      },
      { status: 400 }
    );
  }

  let eventsPayload: Prisma.InputJsonValue;
  try {
    eventsPayload = JSON.parse(parsed.eventsJson) as Prisma.InputJsonValue;
  } catch {
    return NextResponse.json(
      { error: "eventsJson is not valid JSON.", debugId: rid },
      { status: 400 }
    );
  }

  await withDbRetry(
    () =>
      db.$transaction(async (tx) => {
        await tx.whiteboardEventBatch.upsert({
          where: {
            whiteboardSessionId_batchSeq: {
              whiteboardSessionId: sessionId,
              batchSeq: parsed.batchSeq,
            },
          },
          create: {
            whiteboardSessionId: sessionId,
            batchSeq: parsed.batchSeq,
            fromEventIndex: parsed.fromEventIndex,
            toEventIndex: parsed.toEventIndex,
            eventsJson: eventsPayload,
            boardDocumentJson: parsed.boardDocumentJson as Prisma.InputJsonValue,
            schemaVersion: parsed.schemaVersion,
          },
          update: {
            fromEventIndex: parsed.fromEventIndex,
            toEventIndex: parsed.toEventIndex,
            eventsJson: eventsPayload,
            boardDocumentJson: parsed.boardDocumentJson as Prisma.InputJsonValue,
            schemaVersion: parsed.schemaVersion,
          },
        });

        await tx.whiteboardSession.update({
          where: { id: sessionId },
          data: {
            lastPersistedBatchSeq: Math.max(
              sessionRow.lastPersistedBatchSeq,
              parsed.batchSeq
            ),
            lastPersistedToIndex: Math.max(
              sessionRow.lastPersistedToIndex,
              parsed.toEventIndex
            ),
          },
        });
      }),
    { label: "wbCheckpoint.batchUpsert" }
  );

  console.log(
    `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} batchSeq=${parsed.batchSeq} from=${parsed.fromEventIndex} to=${parsed.toEventIndex} schemaVersion=${parsed.schemaVersion}`
  );
  return NextResponse.json({ ok: true, debugId: rid });
}

async function handleLegacyBlobCheckpoint(
  sessionId: string,
  rid: string,
  parsed: LegacyCheckpointBody
): Promise<Response> {
  const { put } = await import("@vercel/blob");
  const pathname = `whiteboard-checkpoints/${sessionId}/${Date.now()}-${parsed.takenAt.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;

  try {
    const result = await put(pathname, parsed.eventsJson, {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: true,
    });
    console.log(
      `[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} legacy_blob schemaVersion=${parsed.schemaVersion} bytes=${parsed.eventsJson.length} url=${result.url}`
    );
    return NextResponse.json({ ok: true, url: result.url, debugId: rid });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} put failed:`, msg);
    return NextResponse.json(
      { error: "Could not save checkpoint.", debugId: rid },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ sessionId: string }> }
): Promise<Response> {
  const rid = createActionCorrelationId();
  const { sessionId } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.warn(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} invalid JSON body`);
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let session;
  try {
    session = await assertOwnsWhiteboardSession(sessionId);
  } catch (err) {
    throw err;
  }

  try {
    await assertTutorApproved(session.adminUserId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} tap_rejected: ${msg}`);
    return NextResponse.json({ error: "Account pending approval." }, { status: 403 });
  }

  const activeGate = await assertActiveSession(sessionId, rid, session);
  if (activeGate) return activeGate;

  if (isBatchBody(body)) {
    const parsed = parseBatchBody(body);
    if (!parsed) {
      console.warn(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} batch body shape invalid`);
      return NextResponse.json(
        { error: "Invalid batch checkpoint payload.", debugId: rid },
        { status: 400 }
      );
    }
    return handleBatchPersist(sessionId, rid, parsed);
  }

  const legacy = parseLegacyBody(body);
  if (!legacy) {
    console.warn(`[wbCheckpoint.route] rid=${rid} wbsid=${sessionId} body shape invalid`);
    return NextResponse.json({ error: "Invalid checkpoint payload." }, { status: 400 });
  }
  return handleLegacyBlobCheckpoint(sessionId, rid, legacy);
}
