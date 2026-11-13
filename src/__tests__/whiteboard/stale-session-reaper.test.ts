/**
 * @jest-environment node
 */

/**
 * Consent wave C4c (docs/handoff/consent-wave-plan.md § 3.9, § 8): the reaper's mode switch, its `[slc]` log
 * lines, the dry_run "writes nothing" promise and the enforce-only post-commit work.
 *
 * The oracle is the SPEC in the plan: the mode table (unset / empty / unrecognized = dry_run; only enforce
 * stamps), the exact log shapes, and what each mode may touch. Persistence behavior (a real row ended, a real
 * board purged) is Playwright: tests/integration/wb-consent-reaper.spec.ts. This file is the part a log line
 * format and a mocked write count can prove.
 */

jest.mock("@/lib/env", () => ({ __esModule: true, env: {} }));

const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockWrite = jest.fn();
const mockTransaction = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  withDbRetry: (fn: () => unknown) => fn(),
  db: {
    whiteboardSession: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockWrite("update", ...a),
      updateMany: (...a: unknown[]) => mockWrite("updateMany", ...a),
    },
    whiteboardEventBatch: { aggregate: async () => ({ _max: { createdAt: null } }) },
    sessionRecording: { aggregate: async () => ({ _max: { createdAt: null } }) },
    sessionParticipant: { aggregate: async () => ({ _max: { joinedAt: null } }) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

const order: string[] = [];
const mockStamp = jest.fn(async () => {
  order.push("stamp");
  return { endedAt: new Date(), durationSeconds: 1, purgeBoard: true };
});
jest.mock("@/lib/whiteboard/stale-session-stamp", () => ({
  __esModule: true,
  stampStaleWhiteboardSessionEnd: (...a: unknown[]) => (mockStamp as (...x: unknown[]) => unknown)(...a),
}));
const mockLock = jest.fn(async () => true);
jest.mock("@/lib/whiteboard/session-row-lock", () => ({
  __esModule: true,
  lockWhiteboardSessionRowTx: (...a: unknown[]) => (mockLock as (...x: unknown[]) => unknown)(...a),
}));

let mockPersist = true;
jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  resolveSessionCapabilities: async () => ({ whiteboard: { persist: mockPersist } }),
  resolveFrozenSessionCapabilities: async () => ({ whiteboard: { persist: mockPersist } }),
}));
const mockProductEvent = jest.fn();
jest.mock("@/lib/observability/product-events", () => ({
  __esModule: true,
  logProductEvent: (...a: unknown[]) => mockProductEvent(...a),
}));
const mockEnqueue = jest.fn();
jest.mock("@/lib/recording/concat-audio-enqueue", () => ({
  __esModule: true,
  enqueueReplayConcatAfterFinalize: (...a: unknown[]) => mockEnqueue(...a),
}));
const mockAssemble = jest.fn();
jest.mock("@/lib/whiteboard/assemble-session-events", () => ({
  __esModule: true,
  assembleSessionEvents: (...a: unknown[]) => {
    order.push("assemble");
    return mockAssemble(...a);
  },
}));

import {
  resolveReaperMode,
  resolveReaperModeForRun,
  runStaleSessionReaper,
} from "@/lib/whiteboard/stale-session-reaper";
import { SESSION_REAPER_IDLE_AFTER_MS } from "@/lib/session-cleanup-config";
import { env } from "@/lib/env";

/** The mocked `env`, typed for the one variable this file drives. */
const mockEnv = env as unknown as { CONSENT_REAPER_MODE?: string };

const NOW = new Date("2026-11-01T12:00:00.000Z");
const HOUR = 3_600_000;
const ID = "wbs-reaper-unit";
const PLACEHOLDER = "https://blob.example/placeholder.json";

function sessionRow(over: Partial<{ createdAt: Date; endedAt: Date | null; sessionPhase: string; scheduledSession: unknown }> = {}) {
  return {
    endedAt: null,
    createdAt: new Date(NOW.getTime() - 30 * HOUR),
    activatedAt: null,
    lastActiveAt: null,
    sessionPhase: "ACTIVE",
    scheduledSession: null,
    adminUserId: "admin-1",
    studentId: "student-1",
    eventsBlobUrl: PLACEHOLDER,
    ...over,
  };
}

/** Every `[slc]` line the reaper printed, across info / warn / error. */
let logs: string[] = [];
const slc = (action: string) => logs.filter((l) => l.includes(`action=${action}`));

beforeEach(() => {
  delete mockEnv.CONSENT_REAPER_MODE;
  logs = [];
  order.length = 0;
  mockPersist = true;
  for (const m of [mockFindMany, mockFindUnique, mockWrite, mockTransaction, mockProductEvent, mockEnqueue, mockAssemble]) {
    m.mockReset();
  }
  mockWrite.mockResolvedValue({ count: 1 });
  mockStamp.mockClear();
  mockLock.mockClear();
  mockFindMany.mockResolvedValue([{ id: ID }]);
  mockFindUnique.mockResolvedValue(sessionRow());
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
    whiteboardSession: { findUnique: mockFindUnique },
    whiteboardEventBatch: { aggregate: async () => ({ _max: { createdAt: null } }) },
    sessionRecording: { aggregate: async () => ({ _max: { createdAt: null } }) },
    sessionParticipant: { aggregate: async () => ({ _max: { joinedAt: null } }) },
  }));
  mockAssemble.mockResolvedValue({ ok: true, eventsBlobUrl: PLACEHOLDER, batchCount: 0, segments: [] });
  for (const level of ["info", "warn", "error", "log"] as const) {
    jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});
afterEach(() => jest.restoreAllMocks());

const run = (mode: "off" | "dry_run" | "enforce") =>
  runStaleSessionReaper({ now: NOW, mode, deadline: Date.now() + 60_000 });

describe("resolveReaperMode: the mode table", () => {
  it.each([
    [undefined, "dry_run", null],
    [null, "dry_run", null],
    ["", "dry_run", null],
    ["   ", "dry_run", null],
    ["dry_run", "dry_run", null],
    ["off", "off", null],
    ["enforce", "enforce", null],
    [" enforce ", "enforce", null],
    ["ENFORCE", "dry_run", "ENFORCE"],
    ["enforced", "dry_run", "enforced"],
    ["true", "dry_run", "true"],
    ["1", "dry_run", "1"],
    ["on", "dry_run", "on"],
  ])("raw %j resolves to %s (invalid raw: %j)", (raw, mode, invalidRaw) => {
    expect(resolveReaperMode(raw as string | null | undefined)).toEqual({ mode, invalidRaw });
  });

  it("an unrecognized value can never resolve to enforce (the safe state is also the typo state)", () => {
    for (const raw of ["Enforce", "enfroce", "enforce!", "yes", "reap", "0"]) {
      expect(resolveReaperMode(raw).mode).not.toBe("enforce");
    }
  });
});

describe("resolveReaperModeForRun: environment and the invalid-value log", () => {
  it.each([
    [undefined, "dry_run", 0],
    ["", "dry_run", 0],
    ["off", "off", 0],
    ["dry_run", "dry_run", 0],
    ["enforce", "enforce", 0],
    ["enfroce", "dry_run", 1],
  ])("CONSENT_REAPER_MODE=%j gives %s and logs reaper_mode_invalid %i time(s)", (raw, mode, invalidLogs) => {
    if (raw !== undefined) mockEnv.CONSENT_REAPER_MODE = raw;
    expect(resolveReaperModeForRun()).toBe(mode);
    expect(slc("reaper_mode_invalid")).toHaveLength(invalidLogs);
  });

  it("the invalid log names the offending value and is not an error line", () => {
    mockEnv.CONSENT_REAPER_MODE = "enfroce";
    resolveReaperModeForRun();
    expect(slc("reaper_mode_invalid")[0]).toContain('raw="enfroce"');
  });
});

describe("off", () => {
  it("logs reaper_off exactly once, scans nothing and writes nothing", async () => {
    mockFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const result = await run("off");
    expect(slc("reaper_off")).toHaveLength(1);
    expect(result).toMatchObject({ mode: "off", candidates: 0, reaped: 0, wouldReap: 0, outcomes: [] });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockStamp).not.toHaveBeenCalled();
  });
});

describe("dry_run writes nothing", () => {
  it("logs would_reap in the plan's format and takes no lock, no transaction, no stamp, no write, no event", async () => {
    const result = await run("dry_run");
    expect(result).toMatchObject({ mode: "dry_run", candidates: 1, wouldReap: 1, reaped: 0 });
    expect(result.outcomes).toEqual([{ id: ID, action: "would_reap" }]);

    const line = slc("would_reap");
    expect(line).toHaveLength(1);
    const idleSince = new Date(NOW.getTime() - 30 * HOUR).toISOString();
    expect(line[0]).toBe(
      `[slc] wbsid=${ID} action=would_reap phase=active idleSince=${idleSince} idleHours=30 persist=true appt=none`
    );

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockLock).not.toHaveBeenCalled();
    expect(mockStamp).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockProductEvent).not.toHaveBeenCalled();
    expect(mockAssemble).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(slc("reaped")).toHaveLength(0);
  });

  it("reports the phase, the persist decision and whether an appointment is linked", async () => {
    mockPersist = false;
    mockFindUnique.mockResolvedValue(
      sessionRow({
        sessionPhase: "PENDING",
        scheduledSession: { startAt: new Date(NOW.getTime() - 40 * HOUR), endAt: new Date(NOW.getTime() - 39 * HOUR) },
      })
    );
    await run("dry_run");
    expect(slc("would_reap")[0]).toMatch(/phase=pending .* persist=false appt=clear$/);
  });
});

describe("skips", () => {
  it.each([
    ["already ended", () => sessionRow({ endedAt: new Date(NOW.getTime() - HOUR) }), "already_ended"],
    ["recent activity", () => sessionRow({ createdAt: new Date(NOW.getTime() - HOUR) }), "not_idle"],
    [
      "a future appointment",
      () => sessionRow({ scheduledSession: { startAt: new Date(NOW.getTime() + HOUR), endAt: null } }),
      "appointment_delay",
    ],
  ])("%s logs reaper_skip reason=%s and writes nothing (dry_run and enforce)", async (_label, row, reason) => {
    for (const mode of ["dry_run", "enforce"] as const) {
      logs = [];
      mockFindUnique.mockResolvedValue(row());
      const result = await run(mode);
      expect(slc("reaper_skip")).toEqual([`[slc] wbsid=${ID} action=reaper_skip reason=${reason}`]);
      expect(result.skipped).toBe(1);
      expect(result.outcomes).toEqual([{ id: ID, action: "skip", reason }]);
      expect(mockStamp).not.toHaveBeenCalled();
      expect(mockProductEvent).not.toHaveBeenCalled();
    }
  });

  it("a row that vanishes between the scan and the lock is already_ended, not an error", async () => {
    mockLock.mockResolvedValueOnce(false);
    const result = await run("enforce");
    expect(slc("reaper_skip")).toEqual([`[slc] wbsid=${ID} action=reaper_skip reason=already_ended`]);
    expect(result.errors).toBe(0);
    expect(mockStamp).not.toHaveBeenCalled();
  });
});

describe("enforce is the only mode that stamps", () => {
  it.each(["off", "dry_run"] as const)("%s never calls the stamp helper", async (mode) => {
    await run(mode);
    expect(mockStamp).not.toHaveBeenCalled();
  });

  it("stamps through the shared helper: the last-activity instant is endedAt, notesForbidden false, source reaper", async () => {
    const result = await run("enforce");
    expect(result).toMatchObject({ mode: "enforce", reaped: 1, wouldReap: 0 });
    expect(mockLock).toHaveBeenCalledTimes(1);
    expect(mockStamp).toHaveBeenCalledTimes(1);
    const args = mockStamp.mock.calls[0] as unknown as unknown[];
    expect(args[1]).toBe(ID);
    expect(args[2]).toEqual(new Date(NOW.getTime() - 30 * HOUR));
    expect(args[3]).toBe(false);
    expect(args[4]).toBe("reaper");
    expect(slc("reaped")).toEqual([
      `[slc] wbsid=${ID} action=reaped phase=active idleSince=${new Date(NOW.getTime() - 30 * HOUR).toISOString()} idleHours=30`,
    ]);
    // Idle really did mean older than the configured window.
    expect(30 * HOUR).toBeGreaterThan(SESSION_REAPER_IDLE_AFTER_MS);
  });

  it("logs SESSION_ENDED with path reaper and the prior phase, once, and only in enforce", async () => {
    mockFindUnique.mockResolvedValue(sessionRow({ sessionPhase: "PENDING" }));
    await run("enforce");
    expect(mockProductEvent).toHaveBeenCalledTimes(1);
    expect(mockProductEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "SESSION_ENDED",
        whiteboardSessionId: ID,
        metadata: { priorPhase: "PENDING", path: "reaper" },
      })
    );
  });

  it("assembles and enqueues the concat only AFTER the stamp commits, and bills / drafts notes for nothing", async () => {
    mockAssemble.mockResolvedValue({
      ok: true,
      eventsBlobUrl: "https://blob.example/final.json",
      batchCount: 3,
      segments: [{ id: "s1" }, { id: "s2" }],
    });
    await run("enforce");
    expect(order).toEqual(["stamp", "assemble"]);
    expect(mockEnqueue).toHaveBeenCalledWith(ID);
    // The placeholder is replaced conditionally: only while the row still holds the URL this run read.
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(
      "updateMany",
      expect.objectContaining({
        where: { id: ID, eventsBlobUrl: PLACEHOLDER },
        data: { eventsBlobUrl: "https://blob.example/final.json" },
      })
    );
  });

  it("when the row no longer holds the placeholder the replay URL is kept, logged, and nothing is overwritten", async () => {
    mockAssemble.mockResolvedValue({
      ok: true,
      eventsBlobUrl: "https://blob.example/final.json",
      batchCount: 1,
      segments: [],
    });
    mockWrite.mockResolvedValue({ count: 0 });
    await run("enforce");
    expect(slc("reaper_events_url_kept")).toEqual([`[slc] wbsid=${ID} action=reaper_events_url_kept reason=row_changed`]);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("a whiteboard-off session (frozen persist false) is stamped and logged but never assembled", async () => {
    mockPersist = false;
    await run("enforce");
    expect(mockStamp).toHaveBeenCalledTimes(1);
    expect(mockProductEvent).toHaveBeenCalledTimes(1);
    expect(mockAssemble).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("a failed assembly logs reaper_assemble_failed, leaves the placeholder, and the session stays reaped", async () => {
    mockAssemble.mockResolvedValue({ ok: false, error: "Could not upload final whiteboard events. Please try again." });
    const result = await run("enforce");
    expect(slc("reaper_assemble_failed")).toHaveLength(1);
    expect(result).toMatchObject({ reaped: 1, errors: 0 });
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("a throw in the post-commit work cannot undo the end: it logs reaper_after_error and the run goes on", async () => {
    mockAssemble.mockRejectedValue(new Error("blob store down"));
    const result = await run("enforce");
    expect(slc("reaper_after_error")).toHaveLength(1);
    expect(result).toMatchObject({ reaped: 1, errors: 0 });
    expect(mockStamp).toHaveBeenCalledTimes(1);
  });

  it("one session throwing in the stamp is an error outcome and the next candidate still runs", async () => {
    mockFindMany.mockResolvedValue([{ id: "bad" }, { id: "good" }]);
    mockStamp.mockRejectedValueOnce(new Error("deadlock"));
    const result = await run("enforce");
    expect(result.outcomes.map((o) => `${o.id}:${o.action}`)).toEqual(["bad:error", "good:reaped"]);
    expect(slc("reaper_error")).toHaveLength(1);
  });
});

describe("the route deadline", () => {
  it("stops between candidates once the deadline has passed, and says so", async () => {
    mockFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const result = await runStaleSessionReaper({ now: NOW, mode: "enforce", deadline: Date.now() - 1 });
    expect(result).toMatchObject({ candidates: 2, reaped: 0, stoppedAtDeadline: true });
    expect(mockStamp).not.toHaveBeenCalled();
  });
});
