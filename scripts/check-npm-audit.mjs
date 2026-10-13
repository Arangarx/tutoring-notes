/**
 * Production npm audit gate.
 *
 * Runs `npm audit --omit=dev --audit-level=high --json`. Exits 0 only when
 * the set of high/critical packages equals scripts/audit-allow.json.
 * An unlisted high or critical fails. A listed package that is no longer
 * high or critical fails too (the exception is stale and must be removed).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { compareAuditAllowlist } = require("./audit-allow-compare.cjs");

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const allowPath = join(here, "audit-allow.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

let allowDoc;
try {
  allowDoc = JSON.parse(readFileSync(allowPath, "utf8"));
} catch (err) {
  fail(`Could not read ${allowPath}: ${(err && err.message) || err}`);
}

let stdout = "";
let stderr = "";
try {
  stdout = execSync("npm audit --omit=dev --audit-level=high --json", {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (err) {
  stdout = err && err.stdout ? String(err.stdout) : "";
  stderr = err && err.stderr ? String(err.stderr) : "";
  if (!stdout.includes("{")) {
    if (stderr) console.error(stderr);
    fail(`npm audit failed to start: ${(err && err.message) || err}`);
  }
}

let report;
try {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error("no JSON object in npm audit stdout");
  report = JSON.parse(stdout.slice(start));
} catch (err) {
  if (stderr) console.error(stderr);
  fail(`npm audit did not return JSON (${(err && err.message) || err}).`);
}

if (report.error) {
  fail(report.error.summary || JSON.stringify(report.error));
}

const reported = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (vuln && (vuln.severity === "high" || vuln.severity === "critical")) {
    reported.push(name);
  }
}

const entries = allowDoc.packages ?? [];
const result = compareAuditAllowlist(reported, entries);
const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `npm audit --omit=dev --audit-level=high: critical=${counts.critical ?? "?"} high=${counts.high ?? "?"}`
);

if (!result.ok) {
  if (result.invalid.length) {
    console.error(`Invalid allowlist entries: ${result.invalid.join("; ")}`);
  }
  if (result.unexpected.length) {
    console.error("High or critical packages not on the allowlist:");
    for (const name of result.unexpected) console.error(`  - ${name}`);
  }
  if (result.stale.length) {
    console.error("Allowlist entries that are no longer high or critical (remove them):");
    for (const name of result.stale) console.error(`  - ${name}`);
  }
  process.exit(1);
}

if (reported.length === 0) {
  console.log("No high or critical production advisories. Allowlist matches (empty).");
} else {
  console.log("High/critical production advisories match the allowlist:");
  for (const entry of entries) {
    console.log(`  - ${entry.name}: ${entry.reason}`);
  }
}
