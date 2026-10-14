/**
 * Fail closed before a local security scan.
 *
 * Reads the repo-root .env only. Prints key names and short reasons.
 * Never prints a value.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { parseDotenv, evaluateLocalScanPreflight } = require("./local-scan-preflight-rules.cjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

let text;
try {
  text = readFileSync(envPath, "utf8");
} catch {
  console.error("DATABASE_URL: is not set");
  console.error("DIRECT_URL: is not set");
  process.exit(1);
}

const result = evaluateLocalScanPreflight(parseDotenv(text));
if (!result.ok) {
  for (const failure of result.failures) {
    console.error(`${failure.key}: ${failure.reason}`);
  }
  process.exit(1);
}

console.log("local scan preflight: ok");
process.exit(0);
