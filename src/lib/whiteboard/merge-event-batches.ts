/**
 * Pure merge of `WhiteboardEventBatch` rows — gap/overlap detection for WS-D.
 */

import type { WBEvent } from "@/lib/whiteboard/event-log";

export type EventBatchRow = {
  fromEventIndex: number;
  toEventIndex: number;
  eventsJson: unknown;
};

export type MergeBatchRowsResult = {
  events: WBEvent[];
  maxToEventIndex: number;
  hasIntegrityIssue: boolean;
  integrityIssue?: "gap";
  gapFrom?: number;
  gapTo?: number;
  hadOverlap: boolean;
};

function parseEventSlice(raw: unknown): WBEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw as WBEvent[];
}

/**
 * Merge batch rows in event-index order. Overlapping ranges are deduped
 * (last batch wins per index). A gap between consecutive batch ranges
 * marks the merge as unsafe — caller should fall back to IDB / checkpoint.
 */
export function mergeBatchRows(
  batches: EventBatchRow[]
): MergeBatchRowsResult {
  if (batches.length === 0) {
    return {
      events: [],
      maxToEventIndex: -1,
      hasIntegrityIssue: false,
      hadOverlap: false,
    };
  }

  const sorted = [...batches].sort(
    (a, b) =>
      a.fromEventIndex - b.fromEventIndex ||
      a.toEventIndex - b.toEventIndex
  );

  let hadOverlap = false;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i]!;
    const next = sorted[i + 1]!;
    if (next.fromEventIndex <= cur.toEventIndex) {
      hadOverlap = true;
    }
    if (next.fromEventIndex > cur.toEventIndex + 1) {
      return {
        events: [],
        maxToEventIndex: -1,
        hasIntegrityIssue: true,
        integrityIssue: "gap",
        gapFrom: cur.toEventIndex + 1,
        gapTo: next.fromEventIndex - 1,
        hadOverlap,
      };
    }
  }

  const byIndex = new Map<number, WBEvent>();
  let maxTo = -1;

  for (const batch of sorted) {
    const slice = parseEventSlice(batch.eventsJson);
    for (let i = 0; i < slice.length; i++) {
      const eventIndex = batch.fromEventIndex + i;
      if (eventIndex > batch.toEventIndex) break;
      byIndex.set(eventIndex, slice[i]!);
      if (eventIndex > maxTo) maxTo = eventIndex;
    }
    if (batch.toEventIndex > maxTo) maxTo = batch.toEventIndex;
  }

  const indices = Array.from(byIndex.keys()).sort((a, b) => a - b);
  const events = indices.map((i) => byIndex.get(i)!);

  return {
    events,
    maxToEventIndex: maxTo,
    hasIntegrityIssue: false,
    hadOverlap,
  };
}
