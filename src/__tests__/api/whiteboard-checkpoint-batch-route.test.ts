/**
 * @jest-environment node
 *
 * WS-B checkpoint route — batch upsert idempotency, ordering, gates (BLOCKER-2).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

const dbWhiteboardSessionFindUnique = jest.fn();
const dbWhiteboardEventBatchFindUnique = jest.fn();
const dbWhiteboardEventBatchUpsert = jest.fn();
const dbTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWhiteboardSessionFindUnique(...args),
      update: jest.fn(),
    },
    whiteboardEventBatch: {
      findUnique: (...args: unknown[]) => dbWhiteboardEventBatchFindUnique(...args),
      upsert: (...args: unknown[]) => dbWhiteboardEventBatchUpsert(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => dbTransaction(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) => assertOwnsWhiteboardSessionMock(id),
}));

jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_test",
}));

import { POST } from "@/app/api/whiteboard/[sessionId]/checkpoint/route";

const WBSID = "wb_batch_test";
const BOARD_DOC = { schemaVersion: 1, activePageId: "p1", pageList: [], pages: {} };

function makeBatchBody(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    batchSeq: 1,
    fromEventIndex: 0,
    toEventIndex: 3,
    eventsJson: JSON.stringify([{ t: 0, type: "snapshot", elements: [] }]),
    boardDocumentJson: BOARD_DOC,
    schemaVersion: 1,
    ...overrides,
  };
}

function makeRequest(body: unknown) {
  return new Request(`http://localhost/api/whiteboard/${WBSID}/checkpoint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const openSession = {
  id: WBSID,
  adminUserId: "admin-1",
  studentId: "stu-1",
  endedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  assertOwnsWhiteboardSessionMock.mockResolvedValue(openSession);
  dbWhiteboardSessionFindUnique.mockImplementation(async (args: { select?: unknown }) => {
    const sel = args.select as { sessionPhase?: true; lastPersistedBatchSeq?: true };
    if (sel?.sessionPhase) return { sessionPhase: "ACTIVE" };
    if (sel?.lastPersistedBatchSeq !== undefined) {
      return { lastPersistedBatchSeq: 0, lastPersistedToIndex: -1 };
    }
    return null;
  });
  dbWhiteboardEventBatchFindUnique.mockResolvedValue(null);
  dbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      whiteboardEventBatch: { upsert: dbWhiteboardEventBatchUpsert },
      whiteboardSession: { update: jest.fn().mockResolvedValue({}) },
    };
    return fn(tx);
  });
  dbWhiteboardEventBatchUpsert.mockResolvedValue({ id: "batch-1" });
});

describe("POST /api/whiteboard/[sessionId]/checkpoint — WS-B batch persist", () => {
  it("missing boardDocumentJson → 400", async () => {
    const body = makeBatchBody();
    delete (body as { boardDocumentJson?: unknown }).boardDocumentJson;
    const res = await POST(makeRequest(body), {
      params: Promise.resolve({ sessionId: WBSID }),
    });
    expect(res.status).toBe(400);
    expect(dbWhiteboardEventBatchUpsert).not.toHaveBeenCalled();
  });

  it("ended session → 409", async () => {
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      ...openSession,
      endedAt: new Date(),
    });
    const res = await POST(makeRequest(makeBatchBody()), {
      params: Promise.resolve({ sessionId: WBSID }),
    });
    expect(res.status).toBe(409);
    expect(dbWhiteboardEventBatchUpsert).not.toHaveBeenCalled();
  });

  it("duplicate batchSeq → 200 noop (idempotent retry)", async () => {
    dbWhiteboardEventBatchFindUnique.mockResolvedValue({ id: "existing" });
    const res = await POST(makeRequest(makeBatchBody({ batchSeq: 1 })), {
      params: Promise.resolve({ sessionId: WBSID }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { noop?: boolean };
    expect(json.noop).toBe(true);
    expect(dbWhiteboardEventBatchUpsert).not.toHaveBeenCalled();
  });

  it("accepts out-of-order batchSeq when fromEventIndex is valid", async () => {
    dbWhiteboardSessionFindUnique.mockImplementation(async (args: { select?: unknown }) => {
      const sel = args.select as { sessionPhase?: true; lastPersistedBatchSeq?: true };
      if (sel?.sessionPhase) return { sessionPhase: "ACTIVE" };
      if (sel?.lastPersistedBatchSeq !== undefined) {
        return { lastPersistedBatchSeq: 5, lastPersistedToIndex: 10 };
      }
      return null;
    });

    const res = await POST(
      makeRequest(
        makeBatchBody({
          batchSeq: 3,
          fromEventIndex: 10,
          toEventIndex: 15,
        })
      ),
      { params: Promise.resolve({ sessionId: WBSID }) }
    );
    expect(res.status).toBe(200);
    expect(dbWhiteboardEventBatchUpsert).toHaveBeenCalledTimes(1);
    const upsertArg = dbWhiteboardEventBatchUpsert.mock.calls[0][0] as {
      create: { batchSeq: number; toEventIndex: number };
    };
    expect(upsertArg.create.batchSeq).toBe(3);
    expect(upsertArg.create.toEventIndex).toBe(15);
  });

  it("upserts batch on first persist", async () => {
    const res = await POST(makeRequest(makeBatchBody()), {
      params: Promise.resolve({ sessionId: WBSID }),
    });
    expect(res.status).toBe(200);
    expect(dbWhiteboardEventBatchUpsert).toHaveBeenCalledTimes(1);
  });
});
