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
}
