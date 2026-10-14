"use strict";

/**
 * Fail-closed rules for a local security scan.
 *
 * parseDotenv follows dotenv's line rules: a '#' starts a comment, '//' does
 * not, and one matching pair of quotes is stripped. The first assignment of a
 * key wins so a later line cannot replace a host that was already set.
 * evaluateLocalScanPreflight takes that key map and never returns secret values.
 */

const PREVIEW_POOLED_HOST =
  "ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech";
const PREVIEW_DIRECT_HOST =
  "ep-bold-feather-amv9wmao.c-5.us-east-1.aws.neon.tech";

const MUST_BE_EMPTY = [
  "BLOB_READ_WRITE_TOKEN",
  "OPENAI_API_KEY",
  "WHITEBOARD_SYNC_URL",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "PLAYWRIGHT_TEST_SECRET",
];

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseDotenv(text) {
  const out = Object.create(null);
  const src = String(text).replace(/^\uFEFF/, "");
  for (const line of src.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    let body = trimmed;
    if (body.startsWith("export ")) {
      body = body.slice("export ".length).trim();
    }
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[\w.-]+$/.test(key)) continue;
    if (Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = unquoteEnvValue(body.slice(eq + 1).trim());
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {string}
 */
function unquoteEnvValue(raw) {
  if (raw.startsWith('"') || raw.startsWith("'")) {
    const quote = raw[0];
    const end = raw.indexOf(quote, 1);
    if (end !== -1) return raw.slice(1, end);
    return raw;
  }
  const hash = raw.indexOf("#");
  if (hash !== -1) return raw.slice(0, hash).trim();
  return raw;
}

/**
 * @param {string} value
 * @returns {string | null}
 */
function hostnameOf(value) {
  try {
    const normalized = String(value).trim().replace(/^postgres:\/\//i, "postgresql://");
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1";
}

function isNeonHost(host) {
  return host === "neon.tech" || host.endsWith(".neon.tech");
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

  checkDatabaseUrl(source, failures);
  checkDirectUrl(source, failures);
  for (const key of MUST_BE_EMPTY) {
    if (!isBlank(source[key])) {
      failures.push({ key, reason: "must be empty" });
    }
  }
  checkNextAuthUrl(source, failures);

  return { ok: failures.length === 0, failures };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<{ key: string, reason: string }>} failures
 */
function checkDatabaseUrl(env, failures) {
  const value = env.DATABASE_URL;
  if (isBlank(value)) {
    failures.push({ key: "DATABASE_URL", reason: "is not set" });
    return;
  }
  const host = hostnameOf(value);
  if (!host) {
    failures.push({ key: "DATABASE_URL", reason: "is not a valid URL" });
    return;
  }
  if (host === PREVIEW_POOLED_HOST) {
    failures.push({ key: "DATABASE_URL", reason: "host is the shared preview database" });
    return;
  }
  if (isLocalHost(host)) return;
  if (isNeonHost(host) && host.includes("-pooler")) return;
  failures.push({
    key: "DATABASE_URL",
    reason: "host must be localhost or a Neon pooler host",
  });
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<{ key: string, reason: string }>} failures
 */
function checkDirectUrl(env, failures) {
  const value = env.DIRECT_URL;
  if (isBlank(value)) {
    failures.push({ key: "DIRECT_URL", reason: "is not set" });
    return;
  }
  const host = hostnameOf(value);
  if (!host) {
    failures.push({ key: "DIRECT_URL", reason: "is not a valid URL" });
    return;
  }
  if (host === PREVIEW_DIRECT_HOST) {
    failures.push({ key: "DIRECT_URL", reason: "host is the shared preview database" });
    return;
  }
  if (isLocalHost(host)) return;
  if (isNeonHost(host) && !host.includes("-pooler")) return;
  failures.push({
    key: "DIRECT_URL",
    reason: "host must be localhost or a Neon direct host",
  });
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<{ key: string, reason: string }>} failures
 */
function checkNextAuthUrl(env, failures) {
  const value = env.NEXTAUTH_URL;
  if (isBlank(value)) return;
  const host = hostnameOf(value);
  if (!host || !isLocalHost(host)) {
    failures.push({
      key: "NEXTAUTH_URL",
      reason: host ? "host must be localhost" : "is not a valid URL",
    });
  }
}

module.exports = {
  PREVIEW_POOLED_HOST,
  PREVIEW_DIRECT_HOST,
  MUST_BE_EMPTY,
  parseDotenv,
  evaluateLocalScanPreflight,
};
