/**
 * Per-test Postgres cleanup — runs after every test via setupFilesAfterEnv.
 * See src/__tests__/helpers/reset-test-database.ts for the fail-closed guard.
 */
import {
  awaitPendingTruncate,
  resetTestDatabase,
  shouldRunDbReset,
} from "@/__tests__/helpers/reset-test-database";

// Never start a test while the prior test's truncate is still in flight.
beforeEach(async () => {
  await awaitPendingTruncate();
});

afterEach(async () => {
  if (!shouldRunDbReset()) return;
  await resetTestDatabase();
}, 30_000);
