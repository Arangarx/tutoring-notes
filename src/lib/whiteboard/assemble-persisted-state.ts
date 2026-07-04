/**
 * WS-B / WS-C — merge backend-persisted whiteboard state for finalize + resume.
 *
 * Merges `WhiteboardEventBatch` rows (ordered by event index) into a canonical
 * `WBEventLog`. Falls back to the latest legacy checkpoint Blob when no batches
 * exist. Used by `finalizeWhiteboardSessionFromBackend` (WS-C) and WS-D hydrate.
 */

import { list } from "@vercel/blob";
import { db, withDbRetry } from "@/lib/db";
import { fetchPrivateBlobBytes } from "@/lib/blob";
import {
  createEmptyEventLog,
  type WBEvent,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";

export type AssembledBackendEvents = {
  log: WBEventLog;
  batchCount: number;
  maxToEventIndex: number;
  source: "batches" | "checkpoint" | "empty";
};

function parseEventSlice(raw: unknown): WBEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw as WBEvent[];
}

function finalizeLog(log: WBEventLog): WBEventLog {
  const last = log.events[log.events.length - 1];
  if (last && last.t > log.durationMs) {
    log.durationMs = last.t;
  }
  return log;
}

/**
 * Merge all `WhiteboardEventBatch` rows for a session into one event log.
 */
export async function mergeEventBatchesFromDb(
  whiteboardSessionId: string,
  startedAtIso: string
): Promise<AssembledBackendEvents> {
  const batches = await withDbRetry(
    () =>
      db.whiteboardEventBatch.findMany({
        where: { whiteboardSessionId },
        orderBy: [{ fromEventIndex: "asc" }, { toEventIndex: "asc" }],
        select: {
          fromEventIndex: true,
          toEventIndex: true,
          eventsJson: true,
        },
      }),
    { label: "mergeEventBatchesFromDb" }
  );

  if (batches.length === 0) {
    return {
      log: createEmptyEventLog(startedAtIso),
      batchCount: 0,
      maxToEventIndex: -1,
      source: "empty",
    };
  }

  const allEvents: WBEvent[] = [];
  let maxTo = -1;
  for (const batch of batches) {
    allEvents.push(...parseEventSlice(batch.eventsJson));
    if (batch.toEventIndex > maxTo) {
      maxTo = batch.toEventIndex;
    }
  }

  const log = finalizeLog({
    ...createEmptyEventLog(startedAtIso),
    events: allEvents,
  });

  return {
    log,
    batchCount: batches.length,
    maxToEventIndex: maxTo,
    source: "batches",
  };
}

async function listCheckpointBlobUrls(sessionId: string): Promise<string[]> {
  const prefix = `whiteboard-checkpoints/${sessionId}/`;
  const urls: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      urls.push(blob.url);
    }
    if (!page.hasMore || !page.cursor) break;
    cursor = page.cursor;
  }
  return urls;
}

/**
 * Best-effort: load the richest legacy checkpoint Blob when DB batches are empty.
 */
export async function loadBestCheckpointEventLog(
  whiteboardSessionId: string,
  startedAtIso: string
): Promise<AssembledBackendEvents | null> {
  const urls = await listCheckpointBlobUrls(whiteboardSessionId);
  if (urls.length === 0) return null;

  let best: WBEventLog | null = null;
  for (const url of urls) {
    try {
      const { buffer } = await fetchPrivateBlobBytes(url);
      const raw = JSON.parse(buffer.toString("utf8")) as {
        eventsJson?: string;
        events?: unknown;
        schemaVersion?: number;
        startedAt?: string;
        durationMs?: number;
      };
      let candidate: WBEventLog | null = null;
      if (typeof raw.eventsJson === "string") {
        candidate = JSON.parse(raw.eventsJson) as WBEventLog;
      } else if (Array.isArray(raw.events)) {
        candidate = {
          schemaVersion: 1,
          startedAt: raw.startedAt ?? startedAtIso,
          durationMs: raw.durationMs ?? 0,
          events: raw.events as WBEvent[],
        };
      }
      if (!candidate || !Array.isArray(candidate.events)) continue;
      if (!best || candidate.events.length > best.events.length) {
        best = finalizeLog({
          ...createEmptyEventLog(startedAtIso),
          events: candidate.events,
        });
      }
    } catch {
      // skip corrupt checkpoint
    }
  }

  if (!best) return null;

  return {
    log: best,
    batchCount: 0,
    maxToEventIndex: best.events.length - 1,
    source: "checkpoint",
  };
}

/**
 * Assemble the best backend event log: batches first, checkpoint fallback.
 */
export async function assembleBackendEventLog(
  whiteboardSessionId: string,
  startedAtIso: string
): Promise<AssembledBackendEvents> {
  const fromBatches = await mergeEventBatchesFromDb(
    whiteboardSessionId,
    startedAtIso
  );
  if (fromBatches.batchCount > 0 && fromBatches.log.events.length > 0) {
    return fromBatches;
  }
  const fromCheckpoint = await loadBestCheckpointEventLog(
    whiteboardSessionId,
    startedAtIso
  );
  if (fromCheckpoint) return fromCheckpoint;
  return fromBatches;
}

/** Count replay events in a remote events.json blob (best-effort). */
export async function countEventsInBlobUrl(blobUrl: string): Promise<number> {
  if (!blobUrl || !/^https?:\/\//i.test(blobUrl)) return 0;
  try {
    const { buffer } = await fetchPrivateBlobBytes(blobUrl);
    const parsed = JSON.parse(buffer.toString("utf8")) as { events?: unknown };
    return Array.isArray(parsed.events) ? parsed.events.length : 0;
  } catch {
    return 0;
  }
}
