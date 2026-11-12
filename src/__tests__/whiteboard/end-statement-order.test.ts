/**
 * @jest-environment node
 */

/**
 * Consent wave S14(a) (docs/handoff/consent-wave-plan.md § 6b, § 3.2): statement order of the End
 * transaction, through the PENDING snapshot write. Jest is the right layer: the oracle is the order of
 * statements a transaction issues, not timing or layout. Concurrency itself is W18 / S8 in Playwright.
 *
 * A recording transaction double captures every statement `endWhiteboardSession` and the shared stale
 * stamp (`stampStaleWhiteboardSessionEnd`) issue. The expected orders below are typed from the plan,
 * not read from the code:
 *
 *   lock (SELECT … FOR UPDATE on the session row, the first statement), phase read, [seam],
 *   conditional update (`endedAt: null`), and ONLY when it changed one row on a PENDING session:
 *   the snapshot write. Stops at the snapshot write (the intent statement is S14(a2), C4b).
 */

type Stmt = { op: string; args?: unknown; sql?: string };

const SID = "wb_s14";
let log: Stmt[] = [];
const PRE_END_EVENTS_URL = "https://abc.blob.vercel-storage.com/placeholder-events.json";
const FINAL_EVENTS_URL = "https://abc.blob.vercel-storage.com/final-events.json";

let world: {
  phase: "PENDING" | "ACTIVE";
  endedAt: Date | null;
  updateCount: 0 | 1;
  /** Whiteboard switch of the family's live record (what a PENDING End freezes). */
  liveWhiteboard: boolean;
  /** Whiteboard switch of the snapshot already frozen at Start (ACTIVE). */
  startWhiteboard: boolean;
} = {
  phase: "PENDING",
  endedAt: null,
  updateCount: 1,
  liveWhiteboard: true,
  startWhiteboard: true,
};

/** The whiteboard switch of the snapshot as it stands now: the End-time freeze if one was written, else Start's. */
function frozenWhiteboard(): boolean {
  const freeze = log.find((s) => s.op === "sessionConsentSnapshot.upsert");
  const create = (freeze?.args as { create?: { allowWhiteboardRecording?: boolean } } | undefined)?.create;
  return create?.allowWhiteboardRecording ?? world.startWhiteboard;
}

function respond(op: string, args: unknown): unknown {
  const a = (args ?? {}) as { data?: { endedAt?: Date } };
  switch (op) {
    case "whiteboardSession.findUnique":
      return {
        eventsBlobUrl: PRE_END_EVENTS_URL,
        notesForbidden: false,
        consentSnapshot: {
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: frozenWhiteboard(),
          allowNoteSending: true,
        },
        id: SID,
        adminUserId: "admin_1",
        studentId: "stu_1",
        startedAt: new Date(Date.now() - 60_000),
        activatedAt: null,
        sessionMode: "LIVE",
        activeMs: 0,
        lastActiveAt: null,
        bothConnectedAt: null,
        roundingIncrementMin: 5,
        roundingMode: "nearest",
        tutorTimezone: null,
        billedDurationMin: null,
        durationSeconds: world.endedAt ? 60 : null,
        endedAt: world.endedAt,
        sessionPhase: world.phase,
        student: { adminUserId: "admin_1", organizationId: null, learnerProfileId: "lp_1" },
      };
    case "whiteboardSession.updateMany":
      if (world.updateCount === 1 && a.data?.endedAt) world.endedAt = a.data.endedAt;
      return { count: world.updateCount };
    case "whiteboardSession.update":
      if (a.data?.endedAt) world.endedAt = a.data.endedAt;
      return { id: SID, endedAt: world.endedAt, durationSeconds: 60 };
    case "consentRecord.findFirst":
      return {
        id: "cr_2",
        version: 2,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: world.liveWhiteboard,
        allowNoteSending: true,
      };
    case "consentRestriction.findUnique":
      return null;
    case "sessionConsentSnapshot.findUnique":
      return {
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
      };
    default:
      return op.endsWith("Many") ? { count: 0 } : {};
  }
}

const recordingTx: unknown = new Proxy(
  {},
  {
    get(_t, model: string | symbol) {
      if (typeof model !== "string" || model === "then") return undefined;
      if (model === "$queryRaw" || model === "$executeRaw") {
        return (first: unknown, ..._values: unknown[]) => {
          const sql = Array.isArray(first)
            ? (first as string[]).join("?")
            : String((first as { sql?: string })?.sql ?? first);
          log.push({ op: model, sql });
          return Promise.resolve(model === "$queryRaw" ? [{ id: SID }] : 1);
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
              return Promise.resolve(respond(op, args));
            };
          },
        }
      );
    },
  }
);

jest.mock("@/lib/test-seams", () => ({
  ...jest.requireActual("@/lib/test-seams"),
  holdPoint: async (name: string) => {
    log.push({ op: `seam:${name}` });
  },
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      findUnique: async () => ({ sessionPhase: world.phase }),
    },
    adminUser: { findUnique: async () => ({ tutorTimezone: null }) },
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
    organizationId: null,
    endedAt: null,
    eventsBlobUrl: "https://abc.blob.vercel-storage.com/placeholder-events.json",
    consentAcknowledged: true,
  }),
}));
jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  shouldShortCircuitEndSessionForErasure: async () => false,
}));
jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_s14",
}));
jest.mock("next/cache", () => ({ __esModule: true, revalidatePath: () => undefined }));
jest.mock("@/lib/observability/product-events", () => ({
  __esModule: true,
  logProductEvent: async () => undefined,
}));

import { endWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { stampStaleWhiteboardSessionEnd } from "@/lib/whiteboard/stale-session-stamp";
import type { Prisma } from "@prisma/client";

const SNAPSHOT_WRITES = new Set(["upsert", "create", "update", "updateMany", "createMany"]);

/** The plan's statement classes. Anything else in the transaction is not part of this order. */
function classify(s: Stmt): string | null {
  if (s.op === "$queryRaw" && /"WhiteboardSession"/.test(s.sql ?? "") && /FOR UPDATE/i.test(s.sql ?? "")) {
    return "lock";
  }
  const args = (s.args ?? {}) as { select?: { sessionPhase?: unknown }; where?: { endedAt?: unknown } };
  if (s.op === "whiteboardSession.findUnique" && args.select?.sessionPhase) return "phase_read";
  if (s.op === "seam:end:tx:before_update") return "seam";
  if (s.op === "whiteboardSession.updateMany" && args.where && "endedAt" in args.where && args.where.endedAt === null) {
    return "conditional_update";
  }
  if (s.op === "whiteboardSession.updateMany" && args.where && "boardPurgeRequestedAt" in args.where) {
    return (args.where as { boardPurgeRequestedAt?: unknown }).boardPurgeRequestedAt === null ? "intent" : "intent_unconditional";
  }
  if (s.op === "whiteboardSession.update") {
    const data = (s.args as { data?: Record<string, unknown> }).data ?? {};
    return "eventsBlobUrl" in data && !("endedAt" in data) ? "url_restore" : "unconditional_update";
  }
  if (s.op === "whiteboardEventBatch.deleteMany") return "batch_delete";
  const [model, method] = s.op.split(".");
  if (model === "sessionConsentSnapshot" && SNAPSHOT_WRITES.has(method)) return "snapshot_write";
  return null;
}

function order(): string[] {
  return log.map(classify).filter((c): c is string => c !== null);
}

type EndPath = { name: string; run: () => Promise<unknown> };
const END_PATHS: EndPath[] = [
  {
    name: "endWhiteboardSession",
    run: () => endWhiteboardSession(SID, FINAL_EVENTS_URL),
  },
  {
    name: "stampStaleWhiteboardSessionEnd",
    run: () => stampStaleWhiteboardSessionEnd(recordingTx as Prisma.TransactionClient, SID, new Date()),
  },
];

beforeEach(() => {
  log = [];
  world = { phase: "PENDING", endedAt: null, updateCount: 1, liveWhiteboard: true, startWhiteboard: true };
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe.each(END_PATHS)("S14(a) End statement order: $name", ({ run }) => {
  it("PENDING, this End wins: lock first, phase read, seam, conditional update, then the snapshot write", async () => {
    await run();
    expect(classify(log[0])).toBe("lock");
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update", "snapshot_write"]);
  });

  it("PENDING, the conditional update changed no row (another End won): no snapshot write", async () => {
    world.updateCount = 0;
    await run().catch(() => undefined);
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update"]);
  });

  it("ACTIVE: the End never writes the snapshot (consent was fixed at Start)", async () => {
    world.phase = "ACTIVE";
    await run();
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update"]);
  });

  it("already ended when read under the lock: no update and no snapshot write", async () => {
    world.endedAt = new Date(Date.now() - 5_000);
    await run().catch(() => undefined);
    expect(order()).toEqual(["lock", "phase_read"]);
  });
});

/** Args of the first logged statement `op` (e.g. "whiteboardJoinToken.updateMany"). */
function argsOf(op: string): { where?: unknown; data?: Record<string, unknown>; create?: Record<string, unknown> } {
  const s = log.find((l) => l.op === op);
  if (!s) throw new Error(`no ${op} statement`);
  return s.args as { data?: Record<string, unknown>; create?: Record<string, unknown> };
}

describe("SF-F clock rule: the shared stamp with a back-dated endedAt (the reaper's last-activity instant)", () => {
  it("endedAt, durationSeconds and participant leftAt use the passed instant; token revokedAt and snapshot frozenAt use real server time", async () => {
    const backDated = new Date(Date.now() - 6 * 60 * 60_000);
    const callStart = Date.now();
    await stampStaleWhiteboardSessionEnd(recordingTx as Prisma.TransactionClient, SID, backDated);

    const end = argsOf("whiteboardSession.updateMany").data!;
    expect(end.endedAt).toEqual(backDated);
    // startedAt in the mock world is 60s before the call, so a back-dated end clamps the duration at 0.
    expect(end.durationSeconds).toBe(0);
    expect(argsOf("sessionParticipant.updateMany").data!.leftAt).toEqual(backDated);

    const revokedAt = argsOf("whiteboardJoinToken.updateMany").data!.revokedAt as Date;
    expect(revokedAt.getTime()).toBeGreaterThanOrEqual(callStart);
    const frozenAt = argsOf("sessionConsentSnapshot.upsert").create!.frozenAt as Date;
    expect(frozenAt.getTime()).toBeGreaterThanOrEqual(callStart);
  });
});

/**
 * S14(a2), C4b (plan § 3.2): the purge intent comes AFTER the snapshot write, so it reads the capability
 * this End froze. End (not the stale stamp) also puts the URL columns back and deletes the batch rows in
 * the same transaction; the stale stamp leaves rows to the purge (its org loops stay O(1) per session).
 * Expected orders are the plan's, typed here.
 */
const PATH_TAIL: Record<string, string[]> = {
  endWhiteboardSession: ["url_restore", "batch_delete", "intent"],
  stampStaleWhiteboardSessionEnd: ["intent"],
};

describe.each(END_PATHS)("S14(a2) purge intent order: $name", ({ name, run }) => {
  it("PENDING, family turned whiteboard off: the intent follows the snapshot write", async () => {
    world.liveWhiteboard = false;
    await run();
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update", "snapshot_write", ...PATH_TAIL[name]]);
  });

  it("ACTIVE, Start froze whiteboard off: the intent follows the conditional update (no second freeze)", async () => {
    world.phase = "ACTIVE";
    world.startWhiteboard = false;
    await run();
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update", ...PATH_TAIL[name]]);
  });

  it("whiteboard on: no intent, no URL restore, no batch delete", async () => {
    world.phase = "ACTIVE";
    await run();
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update"]);
  });

  it("the conditional update changed no row (another End won): no intent", async () => {
    world.liveWhiteboard = false;
    world.updateCount = 0;
    await run().catch(() => undefined);
    expect(order()).toEqual(["lock", "phase_read", "seam", "conditional_update"]);
  });

  it("the intent is written before the participants update and is stamped with server time", async () => {
    world.phase = "ACTIVE";
    world.startWhiteboard = false;
    const callStart = Date.now();
    await run();
    const intentAt = log.findIndex((s) => classify(s) === "intent");
    const participantsAt = log.findIndex((s) => s.op === "sessionParticipant.updateMany");
    expect(intentAt).toBeGreaterThan(-1);
    expect(participantsAt).toBeGreaterThan(intentAt);
    const stamped = (log[intentAt].args as { data: { boardPurgeRequestedAt: Date } }).data.boardPurgeRequestedAt;
    expect(stamped.getTime()).toBeGreaterThanOrEqual(callStart);
  });
});

describe("Andrew 2026-11-12 URL rule: End, whiteboard off", () => {
  it("the first End write is unchanged (it still records the client's URL), and the corrective write puts the pre-End URL back with no snapshot", async () => {
    world.phase = "ACTIVE";
    world.startWhiteboard = false;
    await endWhiteboardSession(SID, FINAL_EVENTS_URL, {
      snapshotBlobUrl: "https://abc.blob.vercel-storage.com/snap.png",
    });
    expect(argsOf("whiteboardSession.updateMany").data!.eventsBlobUrl).toBe(FINAL_EVENTS_URL);
    const restore = log.find((s) => classify(s) === "url_restore");
    expect(restore).toBeDefined();
    expect((restore!.args as { data: unknown }).data).toEqual({
      eventsBlobUrl: PRE_END_EVENTS_URL,
      snapshotBlobUrl: null,
    });
  });

  it("a back-dated stale stamp writes the intent with server time, not the back-dated endedAt", async () => {
    world.phase = "ACTIVE";
    world.startWhiteboard = false;
    const backDated = new Date(Date.now() - 6 * 60 * 60_000);
    const callStart = Date.now();
    await stampStaleWhiteboardSessionEnd(recordingTx as Prisma.TransactionClient, SID, backDated);
    const intent = log.find((s) => classify(s) === "intent");
    expect(intent).toBeDefined();
    const at = (intent!.args as { data: { boardPurgeRequestedAt: Date } }).data.boardPurgeRequestedAt;
    expect(at.getTime()).toBeGreaterThanOrEqual(callStart);
  });
});
