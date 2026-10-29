/**
 * Fail the Playwright run when a reused dev server was not started with
 * PLAYWRIGHT_TEST=1. next.config.ts reads that env once, at process start.
 * reuseExistingServer would otherwise keep an `npm run dev` that still shows
 * the Next dev indicator and lacks the rest of the harness env.
 *
 * The bearer secret matches the webServer command in playwright.config.ts.
 */

const HARNESS_SECRET = "playwright-test-secret";

async function assertPlaywrightTestServer(origin, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const secret =
    options.secret || process.env.PLAYWRIGHT_TEST_SECRET || HARNESS_SECRET;
  const base = String(origin).replace(/\/$/, "");
  const url = `${base}/api/test/playwright-harness`;
  let res;
  try {
    res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[playwright-harness] ${base} did not answer ${url} (${message}).`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `[playwright-harness] ${base} is not a Playwright dev server (GET ${url} → ${res.status}). ` +
        `reuseExistingServer can keep a process started without PLAYWRIGHT_TEST=1, so next.config never applied the harness. ` +
        `Stop that process and rerun so Playwright starts the server.`,
    );
  }
  const body = await res.json();
  if (!body || body.playwrightTest !== true) {
    throw new Error(
      `[playwright-harness] ${base} answered without playwrightTest:true.`,
    );
  }
}

async function assertPlaywrightDevServers(options = {}) {
  const env = options.env || process.env;
  await assertPlaywrightTestServer("http://localhost:3100", options);
  if (!env.WB_SKIP_3101_WEBSERVER) {
    await assertPlaywrightTestServer("http://localhost:3101", options);
  }
}

module.exports = {
  assertPlaywrightDevServers,
  assertPlaywrightTestServer,
};
