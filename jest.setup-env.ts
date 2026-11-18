/**
 * Runs in every Jest worker before test files load (see jest.config.ts `setupFiles`).
 * globalSetup sets DATABASE_URL in a separate process — workers only inherit the
 * parent shell env, so pin the local test DB here when .env points at remote Neon.
 * TEST_DATABASE_URL wins. Otherwise PW_DB_NAME, else tutoring_notes_test.
 */
const { jestDatabaseUrl } = require("./scripts/pw-stack.cjs");

const localTestUrl = jestDatabaseUrl();
const current = process.env.DATABASE_URL ?? "";

if (!current || current.includes("neon.tech") || current.startsWith("file:")) {
  process.env.DATABASE_URL = localTestUrl;
  process.env.DIRECT_URL = localTestUrl;
}
