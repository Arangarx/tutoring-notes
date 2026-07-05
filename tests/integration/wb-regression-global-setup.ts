/**
 * Playwright globalSetup for the whiteboard regression net.
 * Forces local Docker Postgres and aborts if DATABASE_URL host is not local.
 */
const {
  applyWbRegressionLocalDatabaseEnv,
  assertLocalDatabaseUrlForHarness,
} = require("../../scripts/wb-regression-local-db.cjs");

export default async function globalSetup(): Promise<void> {
  applyWbRegressionLocalDatabaseEnv();
  assertLocalDatabaseUrlForHarness();
  // Test-runner skip guard for hermetic blob specs (webServer sets server-side vars).
  if (!process.env.BLOB_HARNESS_LOCAL) {
    process.env.BLOB_HARNESS_LOCAL = "1";
  }
}
