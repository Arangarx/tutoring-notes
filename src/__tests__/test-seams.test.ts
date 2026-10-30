/**
 * @jest-environment node
 *
 * Consent wave C0 (§ 6 infra): the ONE `holdPoint` / `faultPoint` /
 * `armReaperMode` module. Self-tests: gate, arm -> park -> release, parkFirstN,
 * the in-transaction auto-release cap, and globalThis-backed state shared by
 * separate module copies (the Next bundles that arm and the ones that park).
 */
export {};


type Seams = typeof import("@/lib/test-seams");

const envSnapshot = { ...process.env };
const SID = "sess-1";

function setEnv(opts: { playwright: boolean; nodeEnv?: string; vercelEnv?: string }): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = opts.nodeEnv ?? "test";
  if (opts.vercelEnv) env.VERCEL_ENV = opts.vercelEnv;
  else delete env.VERCEL_ENV;
  if (opts.playwright) process.env.PLAYWRIGHT_TEST = "1";
  else delete process.env.PLAYWRIGHT_TEST;
}

/** Flush microtasks so an awaited holdPoint has registered itself as parked. */
async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function load(): Seams {
  let mod!: Seams;
  jest.isolateModules(() => {
    mod = require("@/lib/test-seams");
  });
  return mod;
}

// Seam state is globalThis-backed (that is the point), so it survives
// jest.isolateModules; clear it between tests so no arm leaks to the next test.
afterEach(() => {
  load().resetSeams();
});

describe("test seams: gate", () => {
  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test.each([
    ["PLAYWRIGHT_TEST unset", { playwright: false }],
    ["NODE_ENV=production even with PLAYWRIGHT_TEST=1 (the `next start` shape test:prod-shape runs)", { playwright: true, nodeEnv: "production" }],
    ["VERCEL_ENV=production even with PLAYWRIGHT_TEST=1", { playwright: true, vercelEnv: "production" }],
  ])("gate is closed: %s", (_label, opts) => {
    setEnv({ playwright: true });
    const seams = load();
    seams.armHold({ name: "start:tx:between_consent_read_and_update", sessionId: SID });
    seams.armFault({ name: "cleanup:purge" });
    seams.armReaperMode("enforce");

    setEnv(opts);

    expect(seams.isTestSeamActive()).toBe(false);
    // armed state exists, but the helpers are inert: no park, no throw, no override
    return Promise.all([
      seams.holdPoint("start:tx:between_consent_read_and_update", SID),
      (async () => {
        expect(() => seams.faultPoint("cleanup:purge")).not.toThrow();
        expect(seams.readReaperModeOverride()).toEqual({ armed: false });
      })(),
    ]);
  });

  test("arming throws when the gate is closed (defense in depth behind the route guard)", () => {
    setEnv({ playwright: false });
    const seams = load();
    expect(() => seams.armHold({ name: "end:tx:before_update", sessionId: SID })).toThrow(/disabled/i);
    expect(() => seams.armFault({ name: "cleanup:reaper" })).toThrow(/disabled/i);
    expect(() => seams.armReaperMode("off")).toThrow(/disabled/i);
  });

  test("gate is open only with PLAYWRIGHT_TEST=1 and no production signal", () => {
    setEnv({ playwright: true });
    expect(load().isTestSeamActive()).toBe(true);
  });

  test("arming an unknown point name is rejected (typo cannot silently never park)", () => {
    setEnv({ playwright: true });
    const seams = load();
    expect(() => seams.armHold({ name: "start:tx:typo" as never, sessionId: SID })).toThrow(/unknown/i);
    expect(() => seams.armFault({ name: "cleanup:typo" as never })).toThrow(/unknown/i);
  });
});

describe("test seams: holdPoint arm -> park -> release", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setEnv({ playwright: true });
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...envSnapshot };
  });

  test("an unarmed point is a no-op that resolves immediately", async () => {
    const seams = load();
    await expect(seams.holdPoint("end:tx:before_update", SID)).resolves.toBeUndefined();
  });

  test("armed point parks the first caller until the test releases it", async () => {
    const seams = load();
    seams.armHold({ name: "start:tx:between_consent_read_and_update", sessionId: SID, parkFirstN: 1 });

    let done = false;
    const p = seams.holdPoint("start:tx:between_consent_read_and_update", SID).then(() => {
      done = true;
    });
    await tick();
    expect(seams.holdPointState("start:tx:between_consent_read_and_update", SID)).toMatchObject({
      armed: true,
      parked: 1,
    });
    expect(done).toBe(false);

    expect(seams.releaseHold("start:tx:between_consent_read_and_update", SID)).toBe(1);
    await p;
    expect(done).toBe(true);
    expect(seams.holdPointState("start:tx:between_consent_read_and_update", SID)).toMatchObject({
      parked: 0,
      releasedByTest: 1,
      autoReleased: 0,
    });
  });

  test("only the first N callers park; later callers pass straight through (S1: second Start wins)", async () => {
    const seams = load();
    const name = "start:tx:between_consent_read_and_update";
    seams.armHold({ name, sessionId: SID, parkFirstN: 1 });

    let aDone = false;
    const a = seams.holdPoint(name, SID).then(() => {
      aDone = true;
    });
    await tick();
    await seams.holdPoint(name, SID); // B passes while A is parked
    expect(aDone).toBe(false);
    expect(seams.holdPointState(name, SID)).toMatchObject({ parked: 1, passedThrough: 1 });

    seams.releaseHold(name, SID);
    await a;
  });

  test("a hold for one session does not park another session", async () => {
    const seams = load();
    seams.armHold({ name: "end:tx:before_update", sessionId: "A" });
    await expect(seams.holdPoint("end:tx:before_update", "B")).resolves.toBeUndefined();
  });

  test("in-transaction points auto-release after 3 s and record auto_released (never a hung connection)", async () => {
    const seams = load();
    const name = "end:tx:before_update";
    seams.armHold({ name, sessionId: SID });
    let done = false;
    const p = seams.holdPoint(name, SID).then(() => {
      done = true;
    });
    await tick();

    await jest.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(2);
    await p;
    expect(done).toBe(true);
    expect(seams.holdPointState(name, SID)).toMatchObject({ autoReleased: 1, releasedByTest: 0 });
  });

  test("points outside a transaction use the longer 30 s cap", async () => {
    const seams = load();
    const name = "checkpoint:batch:before_txn";
    seams.armHold({ name, sessionId: SID });
    let done = false;
    const p = seams.holdPoint(name, SID).then(() => {
      done = true;
    });
    await tick();

    await jest.advanceTimersByTimeAsync(29_000);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1_100);
    await p;
    expect(seams.holdPointState(name, SID)).toMatchObject({ autoReleased: 1 });
  });

  test("the cap constants match the plan (3 s in a transaction, 30 s outside) and sit under the 10 s tx timeout", () => {
    const seams = load();
    expect(seams.IN_TX_HOLD_CAP_MS).toBe(3_000);
    expect(seams.OUT_OF_TX_HOLD_CAP_MS).toBe(30_000);
    expect(seams.IN_TX_HOLD_CAP_MS).toBeLessThan(10_000);
  });

  test("resetSeams releases anything still parked and clears every arm", async () => {
    const seams = load();
    seams.armHold({ name: "end:tx:before_update", sessionId: SID });
    seams.armFault({ name: "cleanup:purge" });
    seams.armReaperMode("enforce");
    let done = false;
    const p = seams.holdPoint("end:tx:before_update", SID).then(() => {
      done = true;
    });
    await tick();

    seams.resetSeams();
    await p;
    expect(done).toBe(true);
    expect(seams.holdPointState("end:tx:before_update", SID).armed).toBe(false);
    expect(() => seams.faultPoint("cleanup:purge")).not.toThrow();
    expect(seams.readReaperModeOverride()).toEqual({ armed: false });
  });
});

describe("test seams: cross-module self-test (state is globalThis-backed)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setEnv({ playwright: true });
  });
  afterEach(() => {
    jest.useRealTimers();
    process.env = { ...envSnapshot };
  });

  test("arm through one module copy, park a call made from a different copy, release from a third", async () => {
    const armingRoute = load();
    const callingRoute = load();
    const releasingRoute = load();
    expect(armingRoute).not.toBe(callingRoute);

    armingRoute.armHold({ name: "checkpoint:batch:before_txn", sessionId: SID });

    let done = false;
    const p = callingRoute.holdPoint("checkpoint:batch:before_txn", SID).then(() => {
      done = true;
    });
    await tick();
    expect(done).toBe(false);
    expect(armingRoute.holdPointState("checkpoint:batch:before_txn", SID).parked).toBe(1);

    releasingRoute.releaseHold("checkpoint:batch:before_txn", SID);
    await p;
    expect(done).toBe(true);
  });

  test("a fault armed in one copy throws in another, and a reaper-mode override is read from another", () => {
    const a = load();
    const b = load();
    a.armFault({ name: "cleanup:reaper" });
    expect(() => b.faultPoint("cleanup:reaper")).toThrow(/cleanup:reaper/);
    a.armReaperMode("enforce");
    expect(b.readReaperModeOverride()).toEqual({ armed: true, raw: "enforce" });
  });
});

describe("test seams: faultPoint and armReaperMode", () => {
  beforeEach(() => setEnv({ playwright: true }));
  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test("an armed fault throws until disarmed; unarmed points never throw", () => {
    const seams = load();
    expect(() => seams.faultPoint("cleanup:purge")).not.toThrow();
    seams.armFault({ name: "cleanup:purge" });
    expect(() => seams.faultPoint("cleanup:purge")).toThrow(/injected/i);
    expect(() => seams.faultPoint("cleanup:purge")).toThrow(/injected/i);
    expect(seams.faultPointState("cleanup:purge")).toMatchObject({ armed: true, fires: 2 });
    seams.disarmFault("cleanup:purge");
    expect(() => seams.faultPoint("cleanup:purge")).not.toThrow();
    // the other job is never affected (K1/K2 isolation depends on this)
    seams.armFault({ name: "cleanup:purge" });
    expect(() => seams.faultPoint("cleanup:reaper")).not.toThrow();
  });

  test("times: 1 fires once then clears itself", () => {
    const seams = load();
    seams.armFault({ name: "cleanup:reaper", times: 1 });
    expect(() => seams.faultPoint("cleanup:reaper")).toThrow();
    expect(() => seams.faultPoint("cleanup:reaper")).not.toThrow();
  });

  test("a session-scoped fault only fires for that session (G9: a failing row does not block the others)", () => {
    const seams = load();
    seams.armFault({ name: "reaper:session", sessionId: "bad" });
    expect(() => seams.faultPoint("reaper:session", "good")).not.toThrow();
    expect(() => seams.faultPoint("reaper:session", "bad")).toThrow();
  });

  test("armReaperMode is one-shot: the next read consumes it, then the env value applies again", () => {
    const seams = load();
    expect(seams.readReaperModeOverride()).toEqual({ armed: false });
    seams.armReaperMode("enforce");
    expect(seams.readReaperModeOverride()).toEqual({ armed: true, raw: "enforce" });
    expect(seams.readReaperModeOverride()).toEqual({ armed: false });
  });

  test("armReaperMode(null) simulates an unset env var, distinct from 'not armed' (G14/G16)", () => {
    const seams = load();
    seams.armReaperMode(null);
    expect(seams.readReaperModeOverride()).toEqual({ armed: true, raw: null });
  });

  test("a raw typo value passes through untouched so the reaper's own parser is what is tested (G16)", () => {
    const seams = load();
    seams.armReaperMode("enfroce");
    expect(seams.readReaperModeOverride()).toEqual({ armed: true, raw: "enfroce" });
  });

  test("sticky mode persists across reads until disarmed", () => {
    const seams = load();
    seams.armReaperMode("dry_run", { sticky: true });
    expect(seams.readReaperModeOverride()).toEqual({ armed: true, raw: "dry_run" });
    expect(seams.readReaperModeOverride()).toEqual({ armed: true, raw: "dry_run" });
    seams.disarmReaperMode();
    expect(seams.readReaperModeOverride()).toEqual({ armed: false });
  });
});
