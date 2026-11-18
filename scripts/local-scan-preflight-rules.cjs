"use strict";

/**
 * Fail-closed rules for a local security scan.
 *
 * parseDotenv is dotenv's own parser (already installed; Next uses it too):
 * '#' starts a comment, '//' does not, and the last assignment of a key wins.
 * mergeNextDevEnv applies the next dev file order without reading the disk.
 * evaluateLocalScanPreflight never returns secret values.
 */

const { parse } = require("dotenv");

const NEXT_DEV_ENV_FILES = [
  ".env",
  ".env.development",
  ".env.local",
  ".env.development.local",
];

const MUST_BE_EMPTY = [
  "BLOB_READ_WRITE_TOKEN",
  "OPENAI_API_KEY",
  "WHITEBOARD_SYNC_URL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "CRON_SECRET",
  "SETUP_SECRET",
  "PLAYWRIGHT_TEST_SECRET",
];

const HOST_REASON = "host is not localhost, 127.0.0.1, or an ep-icy-flower Neon host";
const QUERY_REASON = "query host names a different host";

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseDotenv(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const parsed = parse(src);
  const out = Object.create(null);
  for (const key of Object.keys(parsed)) {
    out[key] = parsed[key];
  }
  return out;
}

/**
 * Merge the sources `next dev` would load. Highest precedence last:
 * process env already set, then .env.development.local, .env.local,
 * .env.development, .env. Missing files are skipped. .env.production.local
 * is never read.
 *
 * @param {{
 *   files?: Record<string, string | null | undefined>,
 *   processEnv?: Record<string, string | undefined> | null,
 * }} [input]
 * @returns {Record<string, string>}
 */
function mergeNextDevEnv(input) {
  const files = input && input.files && typeof input.files === "object" ? input.files : {};
  const processEnv =
    input && input.processEnv && typeof input.processEnv === "object" ? input.processEnv : {};
  const merged = Object.create(null);
  for (const name of NEXT_DEV_ENV_FILES) {
    if (!Object.prototype.hasOwnProperty.call(files, name)) continue;
    const text = files[name];
    if (typeof text !== "string") continue;
    const parsed = parseDotenv(text);
    for (const key of Object.keys(parsed)) {
      merged[key] = parsed[key];
    }
  }
  for (const key of Object.keys(processEnv)) {
    const value = processEnv[key];
    if (typeof value !== "string") continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * @param {string} value
 * @returns {{ hostname: string, queryHostOverrides: boolean } | null}
 */
function inspectDatabaseUrl(value) {
  try {
    const normalized = String(value).trim().replace(/^postgres:\/\//i, "postgresql://");
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();
    if (!hostname) return null;
    let queryHostOverrides = false;
    for (const raw of url.searchParams.getAll("host")) {
      const override = raw.trim().toLowerCase();
      if (!override) continue;
      if (override !== hostname) queryHostOverrides = true;
    }
    return { hostname, queryHostOverrides };
  } catch {
    return null;
  }
}

function isAllowedDbHost(host) {
  if (host === "localhost" || host === "127.0.0.1") return true;
  return host.startsWith("ep-icy-flower") && host.endsWith(".neon.tech");
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1";
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

/**
 * @param {Record<string, string | undefined> | null | undefined} env
 * @returns {{ ok: boolean, failures: Array<{ key: string, reason: string }> }}
 */
function evaluateLocalScanPreflight(env) {
  const source = env && typeof env === "object" ? env : {};
  const failures = [];

  checkDbUrl("DATABASE_URL", source.DATABASE_URL, failures);
  checkDbUrl("DIRECT_URL", source.DIRECT_URL, failures);
  for (const key of MUST_BE_EMPTY) {
    if (!isBlank(source[key])) {
      failures.push({ key, reason: "must be empty" });
    }
  }
  checkNextAuthUrl(source, failures);

  return { ok: failures.length === 0, failures };
}

/**
 * @param {string} key
 * @param {string | undefined} value
 * @param {Array<{ key: string, reason: string }>} failures
 */
function checkDbUrl(key, value, failures) {
  if (isBlank(value)) {
    failures.push({ key, reason: "is not set" });
    return;
  }
  const inspected = inspectDatabaseUrl(value);
  if (!inspected) {
    failures.push({ key, reason: "is not a valid URL" });
    return;
  }
  if (!isAllowedDbHost(inspected.hostname)) {
    failures.push({ key, reason: HOST_REASON });
    return;
  }
  if (inspected.queryHostOverrides) {
    failures.push({ key, reason: QUERY_REASON });
  }
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<{ key: string, reason: string }>} failures
 */
function checkNextAuthUrl(env, failures) {
  const value = env.NEXTAUTH_URL;
  if (isBlank(value)) return;
  let host = null;
  try {
    host = new URL(String(value).trim()).hostname.toLowerCase();
  } catch {
    host = null;
  }
  if (!host || !isLocalHost(host)) {
    failures.push({
      key: "NEXTAUTH_URL",
      reason: host ? "host must be localhost" : "is not a valid URL",
    });
  }
}

module.exports = {
  NEXT_DEV_ENV_FILES,
  MUST_BE_EMPTY,
  parseDotenv,
  mergeNextDevEnv,
  evaluateLocalScanPreflight,
};
