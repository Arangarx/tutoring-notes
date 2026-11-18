"use strict";

const crypto = require("crypto");
const { playwrightDatabaseUrl } = require("./pw-stack.cjs");

/**
 * Local Postgres URL for the whiteboard regression net (docker-compose.yml).
 * Playwright webServer + globalSetup force this; host guard rejects anything else.
 * Database name follows PW_DB_NAME (default tutoring_notes). Host stays local.
 */
function currentLocalDatabaseUrl() {
  return playwrightDatabaseUrl();
}

/** Fixed 32-byte root key for Playwright webServer only (live session keys + 2FA fixtures). */
const WB_REGRESSION_TOTP_ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update("tutoring-notes-wb-regression-root-key-v1")
  .digest("base64url");

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const FATAL_PREFIX =
  "Refusing to run the whiteboard regression net against a non-local database";

/**
 * @param {string | undefined} databaseUrl
 */
function parseDatabaseHost(databaseUrl) {
  const normalized = databaseUrl.replace(/^postgres:\/\//, "postgresql://");
  return new URL(normalized).hostname.toLowerCase();
}

/**
 * @param {string | undefined} [databaseUrl]
 */
function assertLocalDatabaseUrlForHarness(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error(
      `${FATAL_PREFIX}: DATABASE_URL is unset. This harness must run against the local Docker Postgres only.`
    );
  }
  let host;
  try {
    host = parseDatabaseHost(databaseUrl);
  } catch {
    throw new Error(
      `${FATAL_PREFIX}: DATABASE_URL is not a valid URL. This harness must run against the local Docker Postgres only.`
    );
  }
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `${FATAL_PREFIX} (host=${host}). This harness must run against the local Docker Postgres only.`
    );
  }
}

function applyWbRegressionLocalDatabaseEnv() {
  const url = currentLocalDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
}

module.exports = {
  get WB_REGRESSION_LOCAL_DATABASE_URL() {
    return currentLocalDatabaseUrl();
  },
  WB_REGRESSION_TOTP_ENCRYPTION_KEY,
  ALLOWED_HOSTS,
  assertLocalDatabaseUrlForHarness,
  applyWbRegressionLocalDatabaseEnv,
  parseDatabaseHost,
};
