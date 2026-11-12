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
jest.mock("@/lib/whiteboard/board-purge", () => ({
  __esModule: true,
  runBoardPurgeSweep: (...args: unknown[]) => sweepMock(...args),
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
  });
});
