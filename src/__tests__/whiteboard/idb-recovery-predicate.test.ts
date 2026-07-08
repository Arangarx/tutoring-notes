/**
 * @jest-environment node
 *
 * WS-D BLOCKER — shouldSuppressIdbPrompt + IDB-tail merge (test-to-spec).
 */

import {
  mergeServerStateWithIdbTail,
  shouldSuppressIdbPrompt,
} from "@/lib/whiteboard/idb-recovery-predicate";
import { createEmptyEventLog, type WBElement } from "@/lib/whiteboard/event-log";
import type { InitialPersistedWhiteboardState } from "@/lib/whiteboard/assemble-persisted-state";

const STARTED = "2026-07-04T12:00:00.000Z";

function stubElement(id: string): WBElement {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
}

function makeServerState(
  serverEventCount: number,
  lastPersistedToIndex: number
): InitialPersistedWhiteboardState {
  const events = Array.from({ length: serverEventCount }, (_, i) => ({
    t: i * 100,
    type: "add" as const,
    element: stubElement(`srv-${i}`),
  }));
  return {
    source: "batches",
    log: { ...createEmptyEventLog(STARTED), events, durationMs: (serverEventCount - 1) * 100 },
    boardDocument: null,
    lastPersistedToIndex,
    lastPersistedBatchSeq: 1,
    recordingSegmentCount: 0,
  };
}

describe("shouldSuppressIdbPrompt", () => {
  it("suppresses when server fully covers IDB (happy path)", () => {
    expect(
      shouldSuppressIdbPrompt({
        serverLastPersistedToIndex: 4,
        idbEventCount: 5,
      })
    ).toBe(true);
  });

  it("suppresses when server exceeds IDB coverage", () => {
    expect(
      shouldSuppressIdbPrompt({
        serverLastPersistedToIndex: 10,
        idbEventCount: 5,
      })
    ).toBe(true);
  });

  it("suppresses when no IDB checkpoint exists", () => {
    expect(
      shouldSuppressIdbPrompt({
        serverLastPersistedToIndex: 2,
        idbEventCount: 0,
      })
    ).toBe(true);
  });

  /**
   * RED-before on old logic: fc147ff unconditionally suppressed whenever
   * server batches existed, even when IDB had more events than the server
   * cursor — tab-kill data loss. Must NOT suppress here.
   */
  it("does NOT suppress when IDB is ahead of server cursor (tab-kill tail)", () => {
    expect(
      shouldSuppressIdbPrompt({
        serverLastPersistedToIndex: 3,
        idbEventCount: 7,
      })
    ).toBe(false);
  });

  it("does NOT suppress when IDB has exactly one more event than server persisted", () => {
    expect(
      shouldSuppressIdbPrompt({
        serverLastPersistedToIndex: 4,
        idbEventCount: 6,
      })
    ).toBe(false);
  });
});

describe("mergeServerStateWithIdbTail", () => {
  it("appends only events beyond lastPersistedToIndex (zero double-apply)", () => {
    const server = makeServerState(4, 3);
    const idbLog = {
      ...createEmptyEventLog(STARTED),
      events: [
        ...server.log.events,
        { t: 400, type: "add" as const, element: stubElement("idb-4") },
        { t: 500, type: "add" as const, element: stubElement("idb-5") },
      ],
      durationMs: 500,
    };

    const { mergedLog } = mergeServerStateWithIdbTail(server, { log: idbLog });
    expect(mergedLog.events).toHaveLength(6);
    expect(mergedLog.events[4]?.type).toBe("add");
    expect((mergedLog.events[4] as { element: { id: string } }).element.id).toBe(
      "idb-4"
    );
    expect((mergedLog.events[5] as { element: { id: string } }).element.id).toBe(
      "idb-5"
    );
  });

  it("returns server log unchanged when IDB does not extend beyond cursor", () => {
    const server = makeServerState(5, 4);
    const idbLog = { ...server.log };
    const { mergedLog } = mergeServerStateWithIdbTail(server, { log: idbLog });
    expect(mergedLog.events).toHaveLength(5);
  });
});
