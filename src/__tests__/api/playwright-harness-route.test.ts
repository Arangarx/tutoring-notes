/**
 * @jest-environment node
 *
 * GET /api/test/playwright-harness tells globalSetup whether this process
 * was started with PLAYWRIGHT_TEST=1. A normal dev server must not say yes.
 */

describe("GET /api/test/playwright-harness", () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
    jest.resetModules();
  });

  function makeRequest(secret = "playwright-test-secret") {
    return new Request("http://localhost/api/test/playwright-harness", {
      headers: { authorization: `Bearer ${secret}` },
    });
  }

  test("development without PLAYWRIGHT_TEST → 404", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    delete env.VERCEL_ENV;
    delete process.env.PLAYWRIGHT_TEST;
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import("@/app/api/test/playwright-harness/route");
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(404);
  });

  test("PLAYWRIGHT_TEST=1 + valid secret → playwrightTest true", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "development";
    delete env.VERCEL_ENV;
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import("@/app/api/test/playwright-harness/route");
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ playwrightTest: true });
  });

  test("production + PLAYWRIGHT_TEST=1 + valid secret → 404", async () => {
    const env = process.env as NodeJS.ProcessEnv & {
      NODE_ENV?: string;
      VERCEL_ENV?: string;
    };
    env.NODE_ENV = "production";
    delete env.VERCEL_ENV;
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.PLAYWRIGHT_TEST_SECRET = "playwright-test-secret";

    const { GET } = await import("@/app/api/test/playwright-harness/route");
    const res = await GET(makeRequest() as never);
    expect(res.status).toBe(404);
  });
});
