/**
 * Consent wave C0 — the test-only gates cannot be enabled in a production runtime.
 *
 * `npm run test:prod-shape` runs `next start` (NODE_ENV=production) against the real
 * blob store token. Every test-only surface (blob harness routing, test seams, the
 * /api/test routes) must be closed there EVEN IF the Playwright sentinels leak into
 * the environment. These tests set every sentinel and flip only the production
 * signal, so a gate that forgot the production lock fails here.
 */
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const envSnapshot = { ...process.env };

function setEnv(vars: Record<string, string | undefined>) {
  process.env = { ...envSnapshot };
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
}

const ALL_SENTINELS = {
  PLAYWRIGHT_TEST: "1",
  BLOB_HARNESS_LOCAL: "1",
  PLAYWRIGHT_TEST_SECRET: "leaked-secret",
};

afterEach(() => {
  process.env = { ...envSnapshot };
});

function load<T>(id: string): T {
  let mod!: T;
  jest.isolateModules(() => {
    mod = require(id);
  });
  return mod;
}

function req(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: `Bearer ${ALL_SENTINELS.PLAYWRIGHT_TEST_SECRET}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe.each([
  ["NODE_ENV=production (next start)", { NODE_ENV: "production" }],
  ["VERCEL_ENV=production", { NODE_ENV: "test", VERCEL_ENV: "production" }],
])("%s with every Playwright sentinel set", (_label, prod) => {
  beforeEach(() => setEnv({ ...ALL_SENTINELS, ...prod }));

  test("the blob harness is inactive", () => {
    const { isBlobHarnessActive } = load<typeof import("@/lib/blob-harness")>("@/lib/blob-harness");
    expect(isBlobHarnessActive()).toBe(false);
  });

  test("the test seams are inactive and refuse to arm", () => {
    const seams = load<typeof import("@/lib/test-seams")>("@/lib/test-seams");
    expect(seams.isTestSeamActive()).toBe(false);
    expect(() => seams.armHold({ name: "selftest:probe", sessionId: "s" })).toThrow(/disabled/);
  });

  test("every C0 test route answers 404, secret or not", async () => {
    const seams = load<typeof import("@/app/api/test/seams/route")>("@/app/api/test/seams/route");
    const probe = load<typeof import("@/app/api/test/seams/probe/route")>("@/app/api/test/seams/probe/route");
    const blob = load<typeof import("@/app/api/test/blob/state/route")>("@/app/api/test/blob/state/route");
    const statuses = [
      (await seams.GET(req("GET", "/api/test/seams?hold=selftest:probe&sessionId=s"))).status,
      (await seams.POST(req("POST", "/api/test/seams", { action: "reset" }))).status,
      (await probe.POST(req("POST", "/api/test/seams/probe?mode=reaper"))).status,
      (await blob.GET(req("GET", "/api/test/blob/state?prefix="))).status,
      (await blob.POST(req("POST", "/api/test/blob/state", { seed: [{ key: "k", text: "t" }] }))).status,
      (await blob.DELETE(req("DELETE", "/api/test/blob/state?key=k"))).status,
    ];
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
  });
});

describe("outside production the same routes demand the test secret", () => {
  beforeEach(() => setEnv({ ...ALL_SENTINELS, NODE_ENV: "test", VERCEL_ENV: undefined }));

  test("a request with no or a wrong secret is 401, the right secret is accepted", async () => {
    const seams = load<typeof import("@/app/api/test/seams/route")>("@/app/api/test/seams/route");
    const noAuth = new NextRequest("http://localhost/api/test/seams", {
      method: "POST",
      body: JSON.stringify({ action: "reset" }),
    });
    expect((await seams.POST(noAuth)).status).toBe(401);
    const wrong = new NextRequest("http://localhost/api/test/seams", {
      method: "POST",
      headers: { authorization: "Bearer nope" },
      body: JSON.stringify({ action: "reset" }),
    });
    expect((await seams.POST(wrong)).status).toBe(401);
    expect((await seams.POST(req("POST", "/api/test/seams", { action: "reset" }))).status).toBe(200);
  });
});

describe("the prod-shape Playwright config never turns a test gate on", () => {
  const config = fs.readFileSync(
    path.join(process.cwd(), "playwright.prod-shape.config.ts"),
    "utf8"
  );

  test.each([
    "PLAYWRIGHT_TEST=",
    "PLAYWRIGHT_TEST_SECRET=",
    "BLOB_HARNESS_LOCAL=",
    "CRON_SECRET=playwright",
    "NEXT_PUBLIC_PLAYWRIGHT_TEST",
  ])("does not set %s on its server", (needle) => {
    expect(config).not.toContain(needle);
  });

  test("serves with next start (a production runtime)", () => {
    expect(config).toContain("next start");
  });
});
