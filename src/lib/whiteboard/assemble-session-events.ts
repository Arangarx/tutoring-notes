import { put } from "@vercel/blob";
import { harnessRequestOrigin, harnessServerPut, isBlobHarnessActive } from "@/lib/blob-harness";
import { resolveFrozenSessionCapabilities } from "@/lib/consent-scope";
import { db, withDbRetry } from "@/lib/db";
import type { EndSessionSegment } from "@/app/admin/students/[id]/whiteboard/actions";
import {
  assembleBackendEventLog,
  countEventsInBlobUrl,
} from "@/lib/whiteboard/assemble-persisted-state";

export type AssembleSessionEventsResult =
  | {
      ok: true;
      /** The URL End should store: a freshly put assembled log, a better existing/client log, or the row's own. */
      eventsBlobUrl: string;
      /** Backend event batches assembled (0 when the board is off). */
      batchCount: number;
      /** Recording rows + any extra outbox segments, deduped by blob URL. */
      segments: EndSessionSegment[];
    }
  | { ok: false; error: string };

/**
 * Assemble a session's final board log from the backend batches and choose the best events blob.
 *
 * Extracted verbatim from `finalizeWhiteboardSessionFromBackend` so the stale-session reaper (C4c) and End
 * share ONE assembly path (it lives here, not in `actions.ts`, because that file is "use server"). The
 * order of effects is unchanged: startedAt read, frozen-capability read, assemble, recordings read, segment
 * map, the `[fzb] action=assemble` log, best-of scoring, then the blob put. A failed put returns
 * `{ ok: false }` with the same message End has always shown.
 *
 * Whiteboard off (frozen at Start): no log is assembled or chosen; the row's URL is kept.
 */
export async function assembleSessionEvents(args: {
  whiteboardSessionId: string;
  adminUserId: string;
  studentId: string;
  /** The row's current `eventsBlobUrl` (the placeholder or a prior upload). */
  currentEventsBlobUrl: string;
  /** Client-uploaded events.json when server batches may lag the live log (End only). */
  finalEventsBlobUrl?: string;
  /** Outbox segments not yet visible in SessionRecording (End only). */
  extraSegments?: ReadonlyArray<EndSessionSegment>;
}): Promise<AssembleSessionEventsResult> {
  const { whiteboardSessionId, currentEventsBlobUrl } = args;

  const startedAtRow = await withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { id: whiteboardSessionId },
        select: { startedAt: true },
      }),
    { label: "finalizeFromBackend.startedAt" }
  );
  const startedAtIso = startedAtRow?.startedAt.toISOString() ?? new Date().toISOString();

  // Whiteboard off (frozen at Start): no board log is assembled or chosen; End keeps the row's URL.
  const frozen = await resolveFrozenSessionCapabilities(whiteboardSessionId);
  const assembled =
    frozen?.whiteboard.persist === false
      ? null
      : await assembleBackendEventLog(whiteboardSessionId, startedAtIso);
  const batchCount = assembled?.batchCount ?? 0;

  const recordingRows = await withDbRetry(
    () =>
      db.sessionRecording.findMany({
        where: { whiteboardSessionId },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          blobUrl: true,
          mimeType: true,
          sizeBytes: true,
          streamId: true,
          createdAt: true,
        },
      }),
    { label: "finalizeFromBackend.recordings" }
  );

  const segmentByUrl = new Map<string, EndSessionSegment>();
  for (const row of recordingRows) {
    segmentByUrl.set(row.blobUrl, {
      blobUrl: row.blobUrl,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      streamId: row.streamId,
      segmentId: row.id,
      audioStartedAtMs: row.createdAt.getTime(),
    });
  }
  for (const extra of args.extraSegments ?? []) {
    if (!segmentByUrl.has(extra.blobUrl)) {
      segmentByUrl.set(extra.blobUrl, extra);
    }
  }
  const segments = [...segmentByUrl.values()];

  console.log(
    `[fzb] fzb=${whiteboardSessionId} action=assemble batches=${batchCount} segments=${segments.length}${assembled ? "" : " board=off"}`
  );

  const candidateScores: Array<{ url: string; score: number }> = [];
  const assembledScore = assembled?.log.events.length ?? 0;
  if (assembled) {
    if (assembledScore > 0) {
      candidateScores.push({ url: "__assembled__", score: assembledScore });
    }
    if (currentEventsBlobUrl) {
      const existingScore = await countEventsInBlobUrl(currentEventsBlobUrl);
      candidateScores.push({ url: currentEventsBlobUrl, score: existingScore });
    }
    if (args.finalEventsBlobUrl) {
      const clientScore = await countEventsInBlobUrl(args.finalEventsBlobUrl);
      candidateScores.push({ url: args.finalEventsBlobUrl, score: clientScore });
    }
  }

  let finalEventsBlobUrl = currentEventsBlobUrl;
  const best = candidateScores.reduce(
    (acc, cur) => (cur.score > acc.score ? cur : acc),
    { url: currentEventsBlobUrl, score: 0 }
  );

  if (assembled && best.url === "__assembled__" && assembledScore > 0) {
    try {
      const eventsBody = JSON.stringify(assembled.log);
      const assembledPath = `whiteboard-sessions/${args.adminUserId}/${args.studentId}/${Date.now()}-events.json`;
      const putResult = isBlobHarnessActive()
        ? await harnessServerPut(
            assembledPath,
            eventsBody,
            { contentType: "application/json", addRandomSuffix: true },
            harnessRequestOrigin()
          )
        : await put(assembledPath, eventsBody, {
            access: "private",
            contentType: "application/json",
            addRandomSuffix: true,
          });
      finalEventsBlobUrl = putResult.url;
    } catch (err) {
      console.error(`[fzb] fzb=${whiteboardSessionId} action=assemble_blob_put_failed`, err);
      return {
        ok: false,
        error: "Could not upload final whiteboard events. Please try again.",
      };
    }
  } else if (best.url !== "__assembled__" && best.score > 0) {
    finalEventsBlobUrl = best.url;
  }

  return { ok: true, eventsBlobUrl: finalEventsBlobUrl, batchCount, segments };
}
