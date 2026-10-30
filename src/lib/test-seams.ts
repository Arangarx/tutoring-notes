/**
 * Test-only seams: `holdPoint`, `faultPoint`, `armReaperMode` (consent wave C0).
 *
 * ONE module for the three. Product code calls `await holdPoint(name, sessionId)`
 * or `faultPoint(name)` at a named site, and reads the reaper mode through
 * `readReaperModeOverride()`; product code never reads a test flag itself.
 *
 * C0 builds the module and its test routes only. The call sites land in the wave
 * that owns each function (docs/handoff/consent-wave-plan.md § 6 infra, SF-A):
 * `checkpoint:batch:before_txn` (C4b), `start:tx:between_consent_read_and_update`
 * and `end:tx:before_update` (C3a), `reaper:between_scan_and_stamp` (C4c),
 * `purge:pass1:after_delete_before_stamp` (C4b),
 * `notes:reduce:before_resolve` (notes reduce, before any resolving write).
 * Each lands as a no-op.
 *
 * GATE (impossible to enable in production): every helper is inert unless
 * `isPlaywrightTestEnvEnabled()` — `PLAYWRIGHT_TEST=1` AND not a production
 * runtime (`NODE_ENV !== "production"`, `VERCEL_ENV !== "production"`). That is
 * the same predicate the blob harness composes, and `next start` (what
 * `npm run test:prod-shape` runs) is NODE_ENV=production, so the gate is closed
 * there even if a sentinel leaks. The arm functions also throw when the gate is
 * closed, behind the test route's own `guardPlaywrightTestRoute`.
 *
 * STATE lives on `globalThis` under a `Symbol.for` key, exactly like
 * `blob-harness.ts`. The test route that arms a point and the server action,
 * route handler or cron route that calls `holdPoint` can be separate bundles in
 * the Next server, each with its own copy of this module. A module-scoped Map
 * would be armed in one copy and checked in another, and the seam would
 * silently never park.
 *
 * AUTO-RELEASE: a hold parked inside a transaction keeps a connection (and for
 * End a row lock), so points flagged `inTx` release themselves after 3 s,
 * under the explicit 10 s timeout the seam-bearing transactions carry. Points
 * outside a transaction use 30 s so a slow CI machine cannot flake. Race tests
 * assert the point was released by the test, not by the cap
 * (`holdPointState(...).autoReleased === 0`).
 *
 * Log prefix: none (test-only; failures surface as thrown errors).
 */

import { isPlaywrightTestEnvEnabled } from "@/lib/playwright-test-route";

/** A hold parked inside a DB transaction auto-releases this fast (SF-B). */
export const IN_TX_HOLD_CAP_MS = 3_000;
/** A hold parked outside any transaction. */
export const OUT_OF_TX_HOLD_CAP_MS = 30_000;

/**
 * Every hold point in the product, with whether it sits inside a DB
 * transaction. The registry is also what rejects a typo'd arm.
 */
export const HOLD_POINTS = {
  "checkpoint:batch:before_txn": { inTx: false },
  "start:tx:between_consent_read_and_update": { inTx: true },
  "end:tx:before_update": { inTx: true },
  "reaper:between_scan_and_stamp": { inTx: false },
  "purge:pass1:after_delete_before_stamp": { inTx: false },
  /**
   * Notes reduce, after the TutorNote row is pending and before any path
   * can write generating / done / partial / failed. Outside a transaction.
   */
  "notes:reduce:before_resolve": { inTx: false },
  /** Harness self-test only (`/api/test/seams/probe`). */
  "selftest:probe": { inTx: false },
  "selftest:probe:in_tx": { inTx: true },
} as const;

export type HoldPointName = keyof typeof HOLD_POINTS;

/** Every fault point in the product. */
export const FAULT_POINTS = [
  "cleanup:reaper",
  "cleanup:purge",
  /** W22: kill the `after()` purge work so only the durable intent survives. */
  "end:after_purge",
  /** G9: one reaper candidate fails; scope with `sessionId`. */
  "reaper:session",
  /** Harness self-test only (`/api/test/seams/probe`). */
  "selftest:fault",
] as const;

export type FaultPointName = (typeof FAULT_POINTS)[number];

export class SeamFaultError extends Error {
  constructor(name: string) {
    super(`[seam] fault injected at ${name}`);
    this.name = "SeamFaultError";
  }
}

type Parked = { release: () => void; timer: ReturnType<typeof setTimeout> };

type HoldArm = {
  name: HoldPointName;
  sessionId: string;
  parkFirstN: number;
  parkedTotal: number;
  parked: Parked[];
  releasedByTest: number;
  autoReleased: number;
  passedThrough: number;
};

type FaultArm = {
  name: FaultPointName;
  sessionId?: string;
  times?: number;
  fires: number;
};

type ReaperModeArm = { raw: string | null; sticky: boolean };

type SeamState = {
  holds: Map<string, HoldArm>;
  faults: Map<string, FaultArm>;
  reaperMode: ReaperModeArm | null;
};

const SEAM_STATE_KEY = Symbol.for("tutoring-notes.test-seams.state");

type SeamGlobal = typeof globalThis & { [SEAM_STATE_KEY]?: SeamState };

function state(): SeamState {
  const g = globalThis as SeamGlobal;
  if (!g[SEAM_STATE_KEY]) {
    g[SEAM_STATE_KEY] = { holds: new Map(), faults: new Map(), reaperMode: null };
  }
  return g[SEAM_STATE_KEY];
}

/** True only under the Playwright/jest test gate; closed in any production runtime. */
export function isTestSeamActive(): boolean {
  return isPlaywrightTestEnvEnabled();
}

function assertActive(what: string): void {
  if (!isTestSeamActive()) {
    throw new Error(`test seams are disabled (${what}): set PLAYWRIGHT_TEST=1 outside production`);
  }
}

function holdKey(name: string, sessionId: string): string {
  return `${name}|${sessionId}`;
}

function faultKey(name: string, sessionId?: string): string {
  return `${name}|${sessionId ?? "*"}`;
}

function releaseAll(arm: HoldArm, byTest: boolean): number {
  const n = arm.parked.length;
  for (const p of arm.parked) {
    clearTimeout(p.timer);
    p.release();
  }
  arm.parked = [];
  if (byTest) arm.releasedByTest += n;
  return n;
}

// ---------------------------------------------------------------------------
// holdPoint: arm -> park -> release
// ---------------------------------------------------------------------------

/**
 * Called by product code at a named site. A no-op (resolves immediately) unless
 * the gate is open AND the point is armed for this session. The first
 * `parkFirstN` callers park until the test releases them or the cap fires;
 * later callers pass straight through.
 */
export async function holdPoint(name: HoldPointName, sessionId: string): Promise<void> {
  if (!isTestSeamActive()) return;
  const arm = state().holds.get(holdKey(name, sessionId));
  if (!arm) return;
  if (arm.parkedTotal >= arm.parkFirstN) {
    arm.passedThrough += 1;
    return;
  }
  arm.parkedTotal += 1;

  const cap = HOLD_POINTS[name].inTx ? IN_TX_HOLD_CAP_MS : OUT_OF_TX_HOLD_CAP_MS;
  await new Promise<void>((resolve) => {
    const parked: Parked = {
      release: resolve,
      timer: setTimeout(() => {
        arm.parked = arm.parked.filter((p) => p !== parked);
        arm.autoReleased += 1;
        console.warn(`[seam] hold auto_released name=${name} sessionId=${sessionId} capMs=${cap}`);
        resolve();
      }, cap),
    };
    arm.parked.push(parked);
  });
}

export function armHold(opts: {
  name: HoldPointName;
  sessionId: string;
  parkFirstN?: number;
}): void {
  assertActive("armHold");
  if (!(opts.name in HOLD_POINTS)) {
    throw new Error(`unknown hold point: ${String(opts.name)}`);
  }
  const key = holdKey(opts.name, opts.sessionId);
  const previous = state().holds.get(key);
  if (previous) releaseAll(previous, true);
  state().holds.set(key, {
    name: opts.name,
    sessionId: opts.sessionId,
    parkFirstN: Math.max(1, Math.floor(opts.parkFirstN ?? 1)),
    parkedTotal: 0,
    parked: [],
    releasedByTest: 0,
    autoReleased: 0,
    passedThrough: 0,
  });
}

/** Release every caller parked at the point. Returns how many were released. */
export function releaseHold(name: HoldPointName, sessionId: string): number {
  const arm = state().holds.get(holdKey(name, sessionId));
  return arm ? releaseAll(arm, true) : 0;
}

/** Release anything parked and remove the arm. */
export function disarmHold(name: HoldPointName, sessionId: string): void {
  const key = holdKey(name, sessionId);
  const arm = state().holds.get(key);
  if (arm) releaseAll(arm, true);
  state().holds.delete(key);
}

export type HoldPointState = {
  armed: boolean;
  parkFirstN: number;
  /** Callers currently parked (poll this; never sleep). */
  parked: number;
  parkedTotal: number;
  releasedByTest: number;
  autoReleased: number;
  passedThrough: number;
};

export function holdPointState(name: HoldPointName, sessionId: string): HoldPointState {
  const arm = state().holds.get(holdKey(name, sessionId));
  if (!arm) {
    return {
      armed: false,
      parkFirstN: 0,
      parked: 0,
      parkedTotal: 0,
      releasedByTest: 0,
      autoReleased: 0,
      passedThrough: 0,
    };
  }
  return {
    armed: true,
    parkFirstN: arm.parkFirstN,
    parked: arm.parked.length,
    parkedTotal: arm.parkedTotal,
    releasedByTest: arm.releasedByTest,
    autoReleased: arm.autoReleased,
    passedThrough: arm.passedThrough,
  };
}

// ---------------------------------------------------------------------------
// faultPoint
// ---------------------------------------------------------------------------

/** Throws `SeamFaultError` when armed (for this session, if the arm is scoped). */
export function faultPoint(name: FaultPointName, sessionId?: string): void {
  if (!isTestSeamActive()) return;
  const { faults } = state();
  const arm = faults.get(faultKey(name, sessionId)) ?? faults.get(faultKey(name));
  if (!arm) return;
  arm.fires += 1;
  if (arm.times !== undefined) {
    arm.times -= 1;
    if (arm.times <= 0) {
      faults.delete(faultKey(arm.name, arm.sessionId));
    }
  }
  throw new SeamFaultError(name);
}

export function armFault(opts: { name: FaultPointName; sessionId?: string; times?: number }): void {
  assertActive("armFault");
  if (!(FAULT_POINTS as readonly string[]).includes(opts.name)) {
    throw new Error(`unknown fault point: ${String(opts.name)}`);
  }
  state().faults.set(faultKey(opts.name, opts.sessionId), {
    name: opts.name,
    sessionId: opts.sessionId,
    times: opts.times,
    fires: 0,
  });
}

export function disarmFault(name: FaultPointName, sessionId?: string): void {
  state().faults.delete(faultKey(name, sessionId));
}

export function faultPointState(
  name: FaultPointName,
  sessionId?: string
): { armed: boolean; fires: number } {
  const arm = state().faults.get(faultKey(name, sessionId));
  return arm ? { armed: true, fires: arm.fires } : { armed: false, fires: 0 };
}

// ---------------------------------------------------------------------------
// armReaperMode
// ---------------------------------------------------------------------------

/**
 * Override `CONSENT_REAPER_MODE` for the next read (one request). `raw` is the
 * unparsed env value, so a typo (`enfroce`) reaches the reaper's own parser;
 * `null` simulates an unset env var. `sticky` keeps it until disarmed.
 */
export function armReaperMode(raw: string | null, opts?: { sticky?: boolean }): void {
  assertActive("armReaperMode");
  state().reaperMode = { raw, sticky: opts?.sticky === true };
}

export function disarmReaperMode(): void {
  state().reaperMode = null;
}

/**
 * Read by the reaper's `resolveReaperMode` (C4c). `{ armed: false }` means "use
 * the env var". A one-shot arm is consumed by this read.
 */
export function readReaperModeOverride():
  | { armed: false }
  | { armed: true; raw: string | null } {
  if (!isTestSeamActive()) return { armed: false };
  const s = state();
  const arm = s.reaperMode;
  if (!arm) return { armed: false };
  if (!arm.sticky) s.reaperMode = null;
  return { armed: true, raw: arm.raw };
}

// ---------------------------------------------------------------------------

/** Release anything parked and clear every arm (Playwright per-test isolation). */
export function resetSeams(): void {
  const s = state();
  for (const arm of s.holds.values()) releaseAll(arm, true);
  s.holds.clear();
  s.faults.clear();
  s.reaperMode = null;
}
