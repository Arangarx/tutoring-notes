/**
 * Playwright globalSetup for the whiteboard regression net.
 * Forces local Docker Postgres and aborts if DATABASE_URL host is not local.
 */
const {
  applyWbRegressionLocalDatabaseEnv,
  assertLocalDatabaseUrlForHarness,
} = require("../../scripts/wb-regression-local-db.cjs");
const {
  startPlaywrightOutputMute,
} = require("../../scripts/playwright-mute-output.cjs");
const {
  assertPlaywrightDevServers,
} = require("../../scripts/playwright-harness-gate.cjs");

export default async function globalSetup(): Promise<() => void> {
  applyWbRegressionLocalDatabaseEnv();
  assertLocalDatabaseUrlForHarness();
  // Web servers are already up (plugin setup runs before this hook).
  // Reject a reused `npm run dev` that never saw PLAYWRIGHT_TEST=1.
  await assertPlaywrightDevServers();
  // Mutes Playwright browser playback on whatever device is current,
  // including headphones plugged in mid-run. Capture stays audible to
  // the recorder; Chromium --mute-audio would silence the fake mic.
  // Playwright 1.58 runs this hook in the @playwright/test/cli.js process
  // (not a short-lived worker). Task teardown calls the returned stop
  // after the tests finish. The helper also exits on its own if that
  // runner pid dies, so a crashed run does not leave it muted forever.
  const stopOutputMute = startPlaywrightOutputMute();
  // Test-runner skip guard for hermetic blob specs (webServer sets server-side vars).
  if (!process.env.PLAYWRIGHT_TEST) {
    process.env.PLAYWRIGHT_TEST = "1";
  }
  if (!process.env.BLOB_HARNESS_LOCAL) {
    process.env.BLOB_HARNESS_LOCAL = "1";
  }
  return () => {
    stopOutputMute();
  };
}
