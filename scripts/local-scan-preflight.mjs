/**
 * Fail closed before a local security scan.
 *
 * Judges the environment `next dev` would load. Prints key names and short
 * reasons. Never prints a value. Does not open .env.production.local.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { NEXT_DEV_ENV_FILES, mergeNextDevEnv, evaluateLocalScanPreflight } = require(
  "./local-scan-preflight-rules.cjs"
);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = {};

for (const name of NEXT_DEV_ENV_FILES) {
  try {
    files[name] = readFileSync(join(root, name), "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") continue;
    console.error(`${name}: could not be read`);
    process.exit(1);
  }
}

const result = evaluateLocalScanPreflight(mergeNextDevEnv({ files, processEnv: process.env }));
if (!result.ok) {
  for (const failure of result.failures) {
    console.error(`${failure.key}: ${failure.reason}`);
  }
  process.exit(1);
}

console.log("local scan preflight: ok");
process.exit(0);
