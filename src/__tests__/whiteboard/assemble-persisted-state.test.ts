/**
 * @jest-environment node
 *
 * WS-D — assembleInitialPersistedState merges batches + latest boardDocument.
 */

const dbWhiteboardEventBatchFindMany = jest.fn();
const dbWhiteboardEventBatchFindFirst = jest.fn();
const dbWhiteboardSessionFindUnique = jest.fn();
const dbSessionRecordingCount = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardEventBatch: {
      findMany: (...args: unknown[]) => dbWhiteboardEventBatchFindMany(...args),
      findFirst: (...args: unknown[]) => dbWhiteboardEventBatchFindFirst(...args),
    },
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWhiteboardSessionFindUnique(...args),
    },
    sessionRecording: {
      count: (...args: unknown[]) => dbSessionRecordingCount(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  list: jest.fn().mockResolvedValue({ blobs: [], hasMore: false }),
}));

import { assembleInitialPersistedState } from "@/lib/whiteboard/assemble-persisted-state";

const WBSID = "wb_resume_test";
const STARTED = "2026-07-04T12:00:00.000Z";

const BOARD_DOC = {
  v: 1 as const,
  activePageId: "p2",
  pageList: [
    { id: "p1", title: "Board 1" },
    { id: "p2", title: "Board 2" },
  ],
  pages: {
    p1: [{ id: "el-p1", type: "rectangle", x: 0, y: 0, width: 10, height: 10 }],
    p2: [{ id: "el-p2", type: "rectangle", x: 1, y: 1, width: 10, height: 10 }],
  },
};

describe("assembleInitialPersistedState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no batches exist", async () => {
    dbWhiteboardEventBatchFindMany.mockResolvedValue([]);
    const result = await assembleInitialPersistedState(WBSID, STARTED);
    expect(result).toBeNull();
  });

  it("merges event batches and picks latest boardDocumentJson", async () => {
    dbWhiteboardEventBatchFindMany.mockResolvedValue([
      {
        fromEventIndex: 0,
        toEventIndex: 2,
        eventsJson: [{ t: 0, type: "snapshot", elements: [] }],
      },
      {
        fromEventIndex: 2,
        toEventIndex: 4,
        eventsJson: [{ t: 100, type: "add", element: { id: "a" } }],
      },
    ]);
    dbWhiteboardSessionFindUnique.mockResolvedValue({
      lastPersistedBatchSeq: 2,
      lastPersistedToIndex: 4,
    });
    dbWhiteboardEventBatchFindFirst.mockResolvedValue({
      boardDocumentJson: BOARD_DOC,
    });
    dbSessionRecordingCount.mockResolvedValue(1);

    const result = await assembleInitialPersistedState(WBSID, STARTED);
    expect(result).not.toBeNull();
    expect(result?.source).toBe("batches");
    expect(result?.log.events).toHaveLength(2);
    expect(result?.boardDocument?.activePageId).toBe("p2");
    expect(result?.lastPersistedToIndex).toBe(4);
    expect(result?.lastPersistedBatchSeq).toBe(2);
    expect(result?.recordingSegmentCount).toBe(1);
  });
});
