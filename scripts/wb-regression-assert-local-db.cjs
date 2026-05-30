"use strict";

/**
 * CLI guard before `prisma db push` in the Playwright webServer (child process).
 * DATABASE_URL / DIRECT_URL must already be set to the local Docker URL via `cmd /c set`.
 */
const { assertLocalDatabaseUrlForHarness } = require("./wb-regression-local-db.cjs");

assertLocalDatabaseUrlForHarness();
