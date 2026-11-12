/**
 * @jest-environment node
 */

/**
 * Consent wave S14(c), C4b (docs/handoff/consent-wave-plan.md § 3.4): the checkpoint batch transaction
 * takes the session row lock as its FIRST statement and re-reads `endedAt` under it, so a batch that
 * passed the active-session check before End cannot write a row after a whiteboard-off End committed
 * (W11 is the Playwright race). Jest is the right layer: the oracle is statement order.
 *
 * Also: the active-session gate refuses an ended whiteboard-off session even inside the org forced-end
 * upload window (the window exists to save a board the family kept).
 */

type Stmt = { op: string; sql?: string; args?: unknown };

const SID = "wb_s14c";
let log: Stmt[] = [];
let world: { endedAtUnderLock: Date | null; frozenWhiteboard: boolean | null; endedAtAtGate: Date | null; uploadOpen: boolean };

const recordingTx: unknown = new Proxy(
  {},
  {
    get(_t, model: string | symbol) {
      if (typeof model !== "string" || model === "then") return undefined;
      if (model === "$queryRaw" || model === "$executeRaw") {
        return (first: unknown) => {
          const sql = Array.isArray(first) ? (first as string[]).join("?") : String(first);
          log.push({ op: model, sql });
          return Promise.resolve(model === "$queryRaw" ? [{ endedAt: world.endedAtUnderLock }] : 1);
        };
      }
      return new Proxy(
        {},
        {
          get(_m, method: string | symbol) {
            if (typeof method !== "string" || method === "then") return undefined;
            return (args: unknown) => {
              const op = `${model}.${method}`;
              log.push({ op, args });
              if (op === "whiteboardSession.findUnique") return Promise.resolve(frozenRow());
              return Promise.resolve({});
            };
          },
        }
      );
    },
  }
);

function frozenRow() {
  return {
    sessionMode: "LIVE",
    notesForbidden: false,
    sessionPhase: "ACTIVE",
    lastPersistedBatchSeq: 0,
    lastPersistedToIndex: 0,
    consentSnapshot:
      world.frozenWhiteboard === null
        ? null
        : {
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: world.frozenWhiteboard,
            allowNoteSending: true,
          },
  };
}

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: { findUnique: async () => frozenRow() },
    whiteboardEventBatch: { findUnique: async () => null },
    $transaction: (fn: (tx: unknown) => unknown) => fn(recordingTx),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: async () => ({
    id: SID,
    studentId: "stu_1",
    adminUserId: "admin_1",
    organizationId: world.uploadOpen ? "org_1" : null,
    endedAt: world.endedAtAtGate,
  }),
}));
jest.mock("@/lib/org-session-access", () => ({
  __esModule: true,
  orgForcedEndUploadOpen: async () => world.uploadOpen,
}));
jest.mock("@/lib/tutor-approval-scope", () => ({ __esModule: true, assertTutorApproved: async () => undefined }));
jest.mock("@/lib/action-correlation", () => ({ __esModule: true, createActionCorrelationId: () => "rid_s14c" }));
jest.mock("@/lib/test-seams", () => ({ __esModule: true, holdPoint: async () => undefined }));

import { POST } from "@/app/api/whiteboard/[sessionId]/checkpoint/route";

function batchRequest(): Request {
  return new Request("http://localhost/api/whiteboard/x/checkpoint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      batchSeq: 1,
      fromEventIndex: 0,
      toEventIndex: 1,
      eventsJson: JSON.stringify([{ t: 0 }]),
      boardDocumentJson: { pages: [] },
      schemaVersion: 1,
    }),
  });
}

const post = () => POST(batchRequest(), { params: Promise.resolve({ sessionId: SID }) });
const txOps = () => log.map((s) => s.op);

beforeEach(() => {
  log = [];
  world = { endedAtUnderLock: null, frozenWhiteboard: false, endedAtAtGate: null, uploadOpen: false };
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  jest.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("S14(c) checkpoint batch transaction", () => {
  it("the first statement is the session row lock (FOR NO KEY UPDATE) that reads endedAt", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(log[0]?.op).toBe("$queryRaw");
    expect(log[0]?.sql).toMatch(/"endedAt"/);
    expect(log[0]?.sql).toMatch(/FROM\s+"WhiteboardSession"/);
    expect(log[0]?.sql).toMatch(/FOR NO KEY UPDATE/i);
  });

  it("End committed while the batch waited, whiteboard off: 409, and no batch row is written", async () => {
    world.endedAtUnderLock = new Date();
    const res = await post();
    expect(res.status).toBe(409);
    expect(txOps()).not.toContain("whiteboardEventBatch.upsert");
  });

  it("End committed while the batch waited, whiteboard on: the batch is still written (the board is kept)", async () => {
    world.endedAtUnderLock = new Date();
    world.frozenWhiteboard = true;
    const res = await post();
    expect(res.status).toBe(200);
    expect(txOps()).toContain("whiteboardEventBatch.upsert");
  });

  it("End committed while the batch waited, capability unreadable: refused (fail closed, nothing written)", async () => {
    world.endedAtUnderLock = new Date();
    world.frozenWhiteboard = null;
    const res = await post();
    expect(res.status).toBe(409);
    expect(txOps()).not.toContain("whiteboardEventBatch.upsert");
  });
});

describe("assertActiveSession: ended whiteboard-off session inside the forced-end upload window", () => {
  it("returns 409 before any transaction (covers the legacy blob path too)", async () => {
    world.endedAtAtGate = new Date();
    world.uploadOpen = true;
    const res = await post();
    expect(res.status).toBe(409);
    expect(log).toEqual([]);
  });

  it("control: whiteboard on inside the window is not refused by the gate", async () => {
    world.endedAtAtGate = new Date();
    world.uploadOpen = true;
    world.frozenWhiteboard = true;
    world.endedAtUnderLock = world.endedAtAtGate;
    const res = await post();
    expect(res.status).toBe(200);
  });
});
