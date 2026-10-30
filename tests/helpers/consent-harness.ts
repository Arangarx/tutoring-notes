/**
 * Consent wave C0 — Playwright-side clients for the hermetic test surfaces:
 *
 *   - blob harness store  (`/api/test/blob/state`, `/api/test/blob/reset`)
 *   - test seams          (`/api/test/seams`: holdPoint / faultPoint / armReaperMode)
 *   - cron driver         (`/api/cron/session-cleanup`, `/api/cron/transcribe-sweep`)
 *
 * All three are HTTP clients over the real server, so a test exercises the same
 * bundles production code runs in (the cross-module point of SF-B). They take
 * Playwright's `APIRequestContext` (the `request` fixture, which carries the
 * project `baseURL`).
 *
 * The matching server code is `src/lib/blob-harness.ts` and `src/lib/test-seams.ts`;
 * the rule is docs/handoff/consent-wave-plan.md § 6 "Shared test infrastructure".
 */

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";
/** `playwright.config.ts` sets `CRON_SECRET` to this same literal on both webServers (never a real secret). */
export const PW_CRON_SECRET = "playwright-cron-secret";

function testAuth(): Record<string, string> {
  return { authorization: `Bearer ${TEST_SECRET}` };
}

async function okJson<T>(res: APIResponse, what: string): Promise<T> {
  if (!res.ok()) {
    throw new Error(`${what} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Blob harness store
// ---------------------------------------------------------------------------

export type HarnessObject = { key: string; size: number };

export async function resetBlobHarness(request: APIRequestContext): Promise<void> {
  await okJson(await request.post("/api/test/blob/reset"), "blob reset");
}

/** Keys and sizes under `prefix` — the independent oracle for "what is left in the store". */
export async function listHarnessBlobs(
  request: APIRequestContext,
  prefix = ""
): Promise<HarnessObject[]> {
  const res = await request.get("/api/test/blob/state", {
    params: { prefix },
    headers: testAuth(),
  });
  return (await okJson<{ objects: HarnessObject[] }>(res, "blob list")).objects;
}

export async function deleteHarnessBlob(
  request: APIRequestContext,
  key: string
): Promise<boolean> {
  const res = await request.delete("/api/test/blob/state", {
    params: { key },
    headers: testAuth(),
  });
  return (await okJson<{ existed: boolean }>(res, "blob delete")).existed;
}

/** Write objects straight into the harness store (e.g. legacy checkpoint blobs under a prefix). */
export async function seedHarnessBlobs(
  request: APIRequestContext,
  items: { key: string; text: string }[]
): Promise<void> {
  await okJson(
    await request.post("/api/test/blob/state", { data: { seed: items }, headers: testAuth() }),
    "blob seed"
  );
}

export async function failNextBlobDeletes(request: APIRequestContext, n: number): Promise<void> {
  await okJson(
    await request.post("/api/test/blob/state", { data: { failNextDeletes: n }, headers: testAuth() }),
    "blob fail next deletes"
  );
}

export async function failBlobDeletesMatching(
  request: APIRequestContext,
  prefix: string
): Promise<void> {
  await okJson(
    await request.post("/api/test/blob/state", {
      data: { failDeleteMatching: prefix },
      headers: testAuth(),
    }),
    "blob fail deletes matching"
  );
}

// ---------------------------------------------------------------------------
// Test seams (holdPoint / faultPoint / armReaperMode)
// ---------------------------------------------------------------------------

export type HoldName =
  | "checkpoint:batch:before_txn"
  | "start:tx:between_consent_read_and_update"
  | "end:tx:before_update"
  | "reaper:between_scan_and_stamp"
  | "purge:pass1:after_delete_before_stamp"
  | "selftest:probe"
  | "selftest:probe:in_tx";

export type FaultName =
  | "cleanup:reaper"
  | "cleanup:purge"
  | "end:after_purge"
  | "reaper:session"
  | "selftest:fault";

export type HoldState = {
  armed: boolean;
  parkFirstN: number;
  parked: number;
  parkedTotal: number;
  releasedByTest: number;
  autoReleased: number;
  passedThrough: number;
};

async function seamPost(request: APIRequestContext, data: Record<string, unknown>) {
  return okJson<Record<string, unknown>>(
    await request.post("/api/test/seams", { data, headers: testAuth() }),
    `seam ${String(data.action)}`
  );
}

export async function resetSeams(request: APIRequestContext): Promise<void> {
  await seamPost(request, { action: "reset" });
}

/** Arm → park → release. Arm first, fire the action WITHOUT awaiting, then `waitUntilParked`. */
export async function armHold(
  request: APIRequestContext,
  opts: { name: HoldName; sessionId: string; parkFirstN?: number }
): Promise<void> {
  await seamPost(request, { action: "armHold", ...opts });
}

export async function holdState(
  request: APIRequestContext,
  name: HoldName,
  sessionId: string
): Promise<HoldState> {
  const res = await request.get("/api/test/seams", {
    params: { hold: name, sessionId },
    headers: testAuth(),
  });
  return okJson<HoldState>(res, "seam hold state");
}

/** Polls the point until `count` callers are parked. Never a sleep. */
export async function waitUntilParked(
  request: APIRequestContext,
  name: HoldName,
  sessionId: string,
  count = 1,
  timeout = 15_000
): Promise<void> {
  await expect
    .poll(async () => (await holdState(request, name, sessionId)).parked, {
      timeout,
      message: `waiting for ${count} caller(s) to park at ${name}`,
    })
    .toBeGreaterThanOrEqual(count);
}

export async function releaseHold(
  request: APIRequestContext,
  name: HoldName,
  sessionId: string
): Promise<number> {
  return ((await seamPost(request, { action: "releaseHold", name, sessionId })).released as number) ?? 0;
}

/** Race tests call this last: the hold must have been released by the test, not by the cap. */
export async function expectReleasedByTest(
  request: APIRequestContext,
  name: HoldName,
  sessionId: string
): Promise<void> {
  const s = await holdState(request, name, sessionId);
  expect(s.autoReleased, `${name} was auto-released by the cap, not by the test`).toBe(0);
  expect(s.releasedByTest).toBeGreaterThan(0);
}

export async function armFault(
  request: APIRequestContext,
  opts: { name: FaultName; sessionId?: string; times?: number }
): Promise<void> {
  await seamPost(request, { action: "armFault", ...opts });
}

export async function disarmFault(
  request: APIRequestContext,
  name: FaultName,
  sessionId?: string
): Promise<void> {
  await seamPost(request, { action: "disarmFault", name, sessionId });
}

/** `raw: null` simulates an unset `CONSENT_REAPER_MODE`; a typo string reaches the reaper's own parser. */
export async function armReaperMode(
  request: APIRequestContext,
  raw: string | null,
  opts?: { sticky?: boolean }
): Promise<void> {
  await seamPost(request, { action: "armReaperMode", raw, sticky: opts?.sticky });
}

/** Calls the C0 probe route (a different bundle from the arm route) — seam self-test only. */
export async function probeSeam(
  request: APIRequestContext,
  mode: "hold" | "fault" | "reaper",
  query: Record<string, string> = {}
): Promise<APIResponse> {
  return request.post("/api/test/seams/probe", {
    params: { mode, ...query },
    headers: testAuth(),
  });
}

// ---------------------------------------------------------------------------
// Cron driver
// ---------------------------------------------------------------------------

export type CronRoute = "/api/cron/session-cleanup" | "/api/cron/transcribe-sweep";

export type CronResult = { status: number; body: unknown; text: string };

/**
 * Calls a cron route over HTTP with the test `CRON_SECRET`, so purge/reaper tests
 * exercise the real route, predicate and ordering rather than an imported
 * function. Returns status and body so K1/K2 can assert the 500 and which job
 * failed. `secret: null` sends no Authorization header (the 401 control).
 */
export async function runCron(
  request: APIRequestContext,
  route: CronRoute,
  opts?: { secret?: string | null; timeout?: number }
): Promise<CronResult> {
  const secret = opts?.secret === undefined ? PW_CRON_SECRET : opts.secret;
  const res = await request.get(route, {
    headers: secret === null ? {} : { authorization: `Bearer ${secret}` },
    timeout: opts?.timeout ?? 120_000,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body: keep text */
  }
  return { status: res.status(), body, text };
}
