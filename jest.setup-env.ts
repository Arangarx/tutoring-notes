/**
 * Runs in every Jest worker before test files load (see jest.config.ts `setupFiles`).
 * globalSetup sets DATABASE_URL in a separate process — workers only inherit the
 * parent shell env, so pin the local test DB here when .env points at remote Neon.
 */
const DEFAULT_TEST_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_test";

const localTestUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
const current = process.env.DATABASE_URL ?? "";

if (!current || current.includes("neon.tech") || current.startsWith("file:")) {
  process.env.DATABASE_URL = localTestUrl;
  process.env.DIRECT_URL = localTestUrl;
}
