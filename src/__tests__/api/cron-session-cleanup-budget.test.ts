/**
 * @jest-environment node
 */

/**
 * Consent wave K3(a) + K5 unit half, C4b (docs/handoff/consent-wave-plan.md § 3.9): the session-cleanup
 * cron's budgets fit under its own `maxDuration`, and the purge job's deadline derives from the route's
 * start (not from a clock the job starts itself). A failing purge returns 500 naming the job.
 * K5's end-to-end half (real row, real harness) is wb-consent-cron.spec.ts.
 */

const sweepMock = jest.fn();
const reaperMock = jest.fn();
jest.mock("@/lib/whiteboard/board-purge", () => ({
  __esModule: true,
  runBoardPurgeSweep: (...args: unknown[]) => sweepMock(...args),
}));
jest.mock("@/lib/whiteboard/stale-session-reaper", () => ({
  __esModule: true,
  resolveReaperModeForRun: () => "dry_run",
  runStaleSessionReaper: (...args: unknown[]) => reaperMock(...args),
}));
jest.mock("@/lib/cron-auth", () => ({
  __esModule: true,
  verifyCronSecret: (req: Request) => req.headers.get("authorization") === "Bearer ok",
}));

import { GET, maxDuration, runtime } from "@/app/api/cron/session-cleanup/route";
import {
  BOARD_PURGE_SWEEP_MIN_WINDOW_MS,
  SESSION_CLEANUP_MARGIN_MS,
  SESSION_REAPER_TIME_BUDGET_MS,
} from "@/lib/session-cleanup-config";

const call = (auth = "Bearer ok") =>
  GET(new Request("http://localhost/api/cron/session-cleanup", { headers: { authorization: auth } }));

beforeEach(() => {
  reaperMock.mockReset();
  reaperMock.mockResolvedValue({ mode: "dry_run", candidates: 0, reaped: 0, wouldReap: 0, skipped: 0, errors: 0 });
  sweepMock.mockReset();
  sweepMock.mockResolvedValue({ candidates: 0, pass1: 0, pass2: 0, failed: 0, skipped: 0, stuck: 0, stoppedAtDeadline: false });
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(console, "info").mockImplementation(() => undefined);
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("K3(a) session-cleanup budgets", () => {
  it("runs on node with a 300 s ceiling (Vercel Pro)", () => {
    expect(runtime).toBe("nodejs");
    expect(maxDuration).toBe(300);
  });

  it("reaper budget + purge minimum window + margin fit under maxDuration", () => {
    expect(SESSION_REAPER_TIME_BUDGET_MS + BOARD_PURGE_SWEEP_MIN_WINDOW_MS + SESSION_CLEANUP_MARGIN_MS).toBeLessThanOrEqual(
      maxDuration * 1000
    );
  });

  it("the purge deadline is the route start + maxDuration − margin", async () => {
    const before = Date.now();
    const res = await call();
    const after = Date.now();
    expect(res.status).toBe(200);
    const { deadline } = sweepMock.mock.calls[0][0] as { deadline: number };
    expect(deadline).toBeGreaterThanOrEqual(before + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
    expect(deadline).toBeLessThanOrEqual(after + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
  });

  it("a slow job before the purge cannot push its deadline: the deadline is fixed when the route starts", async () => {
    const before = Date.now();
    const realNow = Date.now;
    // Every later read of the clock is 200 s on; a deadline taken after that would be 200 s later.
    let first = true;
    jest.spyOn(Date, "now").mockImplementation(() => {
      if (first) {
        first = false;
        return realNow();
      }
      return realNow() + 200_000;
    });
    await call();
    const { deadline } = sweepMock.mock.calls[0][0] as { deadline: number };
    expect(deadline).toBeLessThanOrEqual(realNow() + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
    expect(deadline).toBeGreaterThanOrEqual(before + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
  });
});

describe("K5 unit half: the purge job's failure is isolated", () => {
  it("returns 500 with a body naming purge and logs the job error", async () => {
    sweepMock.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).toMatch(/purge/);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[slc] cron=session-cleanup job=purge action=job_error err=boom")
    );
  });

  it("rejects a call without the cron secret", async () => {
    const res = await call("Bearer nope");
    expect(res.status).toBe(401);
    expect(sweepMock).not.toHaveBeenCalled();
    expect(reaperMock).not.toHaveBeenCalled();
  });
});

describe("C4c K3(b) unit half: the reaper's deadline is its own capped share of the route's start", () => {
  it("hands the reaper routeStart + SESSION_REAPER_TIME_BUDGET_MS, and the purge the full route deadline", async () => {
    const before = Date.now();
    await call();
    const after = Date.now();
    const { deadline: reaperDeadline } = reaperMock.mock.calls[0][0] as { deadline: number };
    const { deadline: purgeDeadline } = sweepMock.mock.calls[0][0] as { deadline: number };
    expect(reaperDeadline).toBeGreaterThanOrEqual(before + SESSION_REAPER_TIME_BUDGET_MS);
    expect(reaperDeadline).toBeLessThanOrEqual(after + SESSION_REAPER_TIME_BUDGET_MS);
    expect(purgeDeadline).toBeGreaterThanOrEqual(before + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
    expect(purgeDeadline).toBeLessThanOrEqual(after + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
    expect(purgeDeadline).toBeGreaterThan(reaperDeadline);
  });

  it("a slow reaper cannot move the purge's deadline: both are fixed when the route starts", async () => {
    const realNow = Date.now;
    const before = realNow();
    let calls = 0;
    // The reaper "runs" for 200 s: every clock read after the route's first statement is 200 s on.
    jest.spyOn(Date, "now").mockImplementation(() => (calls++ === 0 ? realNow() : realNow() + 200_000));
    await call();
    const { deadline: purgeDeadline } = sweepMock.mock.calls[0][0] as { deadline: number };
    expect(purgeDeadline).toBeLessThanOrEqual(realNow() + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
    expect(purgeDeadline).toBeGreaterThanOrEqual(before + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS);
  });
});

describe("C4c K1 / K2 unit halves: each job's failure is isolated from the other", () => {
  it("a throwing reaper: the purge still runs and the 500 names the reaper", async () => {
    reaperMock.mockRejectedValue(new Error("reaper boom"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(sweepMock).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { failedJob: string };
    expect(body.failedJob).toBe("reaper");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[slc] cron=session-cleanup job=reaper action=job_error err=reaper boom")
    );
  });

  it("a throwing purge: the reaper has already run, and the 500 names the purge", async () => {
    sweepMock.mockRejectedValue(new Error("purge boom"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(reaperMock).toHaveBeenCalledTimes(1);
    expect((await res.json()) as { failedJob: string }).toMatchObject({ failedJob: "purge" });
  });

  it("runs the reaper before the purge", async () => {
    const order: string[] = [];
    reaperMock.mockImplementation(async () => {
      order.push("reaper");
      return {};
    });
    sweepMock.mockImplementation(async () => {
      order.push("purge");
      return {};
    });
    await call();
    expect(order).toEqual(["reaper", "purge"]);
  });
});
