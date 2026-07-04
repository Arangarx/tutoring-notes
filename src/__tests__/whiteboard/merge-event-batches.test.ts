/**
 * @jest-environment node
 *
 * WS-D SHOULD-FIX 1 — gap/overlap detection in batch merge.
 */

import { mergeBatchRows } from "@/lib/whiteboard/merge-event-batches";

describe("mergeBatchRows", () => {
  it("merges contiguous batches in order", () => {
    const result = mergeBatchRows([
      {
        fromEventIndex: 0,
        toEventIndex: 1,
        eventsJson: [
          { t: 0, type: "snapshot", elements: [] },
          { t: 50, type: "add", element: { id: "a" } },
        ],
      },
      {
        fromEventIndex: 2,
        toEventIndex: 3,
        eventsJson: [
          { t: 100, type: "add", element: { id: "b" } },
          { t: 150, type: "add", element: { id: "c" } },
        ],
      },
    ]);

    expect(result.hasIntegrityIssue).toBe(false);
    expect(result.events).toHaveLength(4);
    expect(result.maxToEventIndex).toBe(3);
  });

  it("dedupes overlapping batch ranges (last batch wins per index)", () => {
    const result = mergeBatchRows([
      {
        fromEventIndex: 0,
        toEventIndex: 2,
        eventsJson: [
          { t: 0, type: "snapshot", elements: [] },
          { t: 50, type: "add", element: { id: "old-b" } },
          { t: 60, type: "add", element: { id: "old-c" } },
        ],
      },
      {
        fromEventIndex: 2,
        toEventIndex: 3,
        eventsJson: [
          { t: 70, type: "add", element: { id: "new-c" } },
          { t: 80, type: "add", element: { id: "d" } },
        ],
      },
    ]);

    expect(result.hasIntegrityIssue).toBe(false);
    expect(result.hadOverlap).toBe(true);
    expect(result.events).toHaveLength(4);
    expect((result.events[2] as { element: { id: string } }).element.id).toBe(
      "new-c"
    );
  });

  it("flags a gap between batch ranges", () => {
    const result = mergeBatchRows([
      {
        fromEventIndex: 0,
        toEventIndex: 1,
        eventsJson: [
          { t: 0, type: "snapshot", elements: [] },
          { t: 50, type: "add", element: { id: "a" } },
        ],
      },
      {
        fromEventIndex: 4,
        toEventIndex: 5,
        eventsJson: [
          { t: 200, type: "add", element: { id: "e" } },
          { t: 250, type: "add", element: { id: "f" } },
        ],
      },
    ]);

    expect(result.hasIntegrityIssue).toBe(true);
    expect(result.integrityIssue).toBe("gap");
    expect(result.gapFrom).toBe(2);
    expect(result.gapTo).toBe(3);
    expect(result.events).toHaveLength(0);
  });
});
