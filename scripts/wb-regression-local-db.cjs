"use strict";

/**
 * Local Postgres URL for the whiteboard regression net (docker-compose.yml).
 * Playwright webServer + globalSetup force this; host guard rejects anything else.
 */
const WB_REGRESSION_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes";

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
  process.env.DATABASE_URL = WB_REGRESSION_LOCAL_DATABASE_URL;
  process.env.DIRECT_URL = WB_REGRESSION_LOCAL_DATABASE_URL;
}

module.exports = {
  WB_REGRESSION_LOCAL_DATABASE_URL,
  ALLOWED_HOSTS,
  assertLocalDatabaseUrlForHarness,
  applyWbRegressionLocalDatabaseEnv,
  parseDatabaseHost,
};
