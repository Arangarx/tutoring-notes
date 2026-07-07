#!/usr/bin/env node
"use strict";

/**
 * Serial sharded runner for the wb-regression Playwright merge gate.
 *
 * - Manifest is derived from playwright.config.ts wb-regression testMatch (never hand-maintained).
 * - integration-setup runs ONCE; each shard is a separate Playwright invocation with a fresh :3100 dev server.
 * - Failed tests get an isolation re-run pass to separate real reds from env-exhaustion flakes.
 *
 * Flags:
 *   --manifest-only   Print shard manifest + compare to `playwright --list` (no test execution).
 *   --target-shards N Default shard count (default: 6).
 */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { cleanupWbDevServerPorts } = require("./free-wb-dev-server-ports.cjs");

const ROOT = path.resolve(__dirname, "..");
const PROJECT = "wb-regression";
/** Combined flag — required on Windows (shell:true mangles separate `--project` + name + file paths). */
const PROJECT_FLAG = `--project=${PROJECT}`;
const LIFECYCLE_BASENAME = "wb-session-lifecycle.spec.ts";
const DEFAULT_TARGET_SHARDS = 6;
/**
 * Per-shard blob zips for merge-reports. MUST live outside Playwright's
 * outputDir (`test-results/`) — createRemoveOutputDirsTask wipes outputDir at
 * the start of every `playwright test` invocation, so in-test-results blobs
 * from prior shards are deleted before merge. Also set PWTEST_BLOB_DO_NOT_REMOVE
 * on shard runs: BlobReporter removes PLAYWRIGHT_BLOB_OUTPUT_DIR by default.
 */
const MERGE_BLOB_DIR = path.join(ROOT, "wb-shard-blobs");
const MERGED_JSON_REPORT = path.join(ROOT, "test-results", "wb-shard-merged.json");
/** Pause between shards so prior dev-server memory/handles can be reclaimed. */
const INTER_SHARD_COOLDOWN_MS = 8000;

function parseArgs(argv) {
  const args = { manifestOnly: false, targetShards: DEFAULT_TARGET_SHARDS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest-only") {
      args.manifestOnly = true;
    } else if (arg === "--target-shards") {
      args.targetShards = Number(argv[++i]);
      if (!Number.isFinite(args.targetShards) || args.targetShards < 2) {
        throw new Error("--target-shards must be an integer >= 2");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function npxPlaywright(args, env = {}) {
  return spawnSync("npx", ["playwright", ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function loadWbRegressionProject() {
  const playwrightRoot = path.join(ROOT, "node_modules", "playwright");
  const { loadConfigFromFile } = require(path.join(
    playwrightRoot,
    "lib/common/configLoader",
  ));
  const { filterProjects, collectFilesForProject } = require(path.join(
    playwrightRoot,
    "lib/runner/projectUtils",
  ));

  const config = await loadConfigFromFile(path.join(ROOT, "playwright.config.ts"));
  const projects = filterProjects(config.projects, [PROJECT]);
  if (projects.length !== 1) {
    throw new Error(`Expected exactly one Playwright project named ${PROJECT}`);
  }
  const project = projects[0];
  const files = await collectFilesForProject(project);
  const testMatch = project.project.testMatch;
  const patterns = Array.isArray(testMatch) ? testMatch : testMatch ? [testMatch] : [];
  return {
    files: files.map((f) => path.normalize(f)).sort(),
    testMatchPatterns: patterns,
  };
}

function toPosixRel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

/** Playwright --list paths are relative to config testDir (`tests/`), not repo root. */
function toTestDirRel(filePath) {
  const rel = toPosixRel(filePath);
  return rel.startsWith("tests/") ? rel.slice("tests/".length) : rel;
}

/** CLI file args are repo-root paths (`tests/...`). */
function toCliTestArg(testDirRel) {
  return testDirRel.startsWith("tests/") ? testDirRel : `tests/${testDirRel}`;
}

function parseListOutput(output) {
  const tests = [];
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Listing tests:") || trimmed.startsWith("Total:")) {
      continue;
    }
    const match = trimmed.match(
      /\[wb-regression\]\s*›\s*(.+?):(\d+):(\d+)\s*›\s*(.+)$/,
    );
    if (!match) {
      continue;
    }
    const [, file, lineNo, col, title] = match;
    const normalizedFile = file.replace(/\\/g, "/");
    tests.push({
      file: normalizedFile,
      line: Number(lineNo),
      column: Number(col),
      title: title.trim(),
      id: `${normalizedFile}:${lineNo}:${col} › ${title.trim()}`,
    });
  }
  return tests;
}

function listProjectTests(extraArgs = []) {
  const result = npxPlaywright(["test", PROJECT_FLAG, "--list", ...extraArgs]);
  if (result.status !== 0) {
    throw new Error(
      `playwright --list failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return parseListOutput(`${result.stdout}\n${result.stderr}`);
}

function countTestsByFile(tests) {
  const counts = new Map();
  for (const test of tests) {
    counts.set(test.file, (counts.get(test.file) || 0) + 1);
  }
  return counts;
}

function isLifecycleFile(filePath) {
  return path.basename(filePath) === LIFECYCLE_BASENAME;
}

function buildShards(enrolledFiles, testsByFile, targetShards) {
  const lifecycle = enrolledFiles.filter((f) => isLifecycleFile(f));
  const others = enrolledFiles.filter((f) => !isLifecycleFile(f));

  if (lifecycle.length > 1) {
    throw new Error(`Expected at most one ${LIFECYCLE_BASENAME} in wb-regression enrollment`);
  }

  const shards = [];
  if (lifecycle.length === 1) {
    shards.push({
      name: "lifecycle",
      files: lifecycle.map(toTestDirRel),
      testCount: testsByFile.get(toTestDirRel(lifecycle[0])) || 0,
    });
  }

  const remainingShardSlots = Math.max(1, targetShards - shards.length);
  const bins = Array.from({ length: remainingShardSlots }, () => ({
    files: [],
    testCount: 0,
  }));

  const sortedOthers = [...others].sort((a, b) => {
    const relA = toTestDirRel(a);
    const relB = toTestDirRel(b);
    return (testsByFile.get(relB) || 0) - (testsByFile.get(relA) || 0);
  });

  for (const absFile of sortedOthers) {
    const rel = toTestDirRel(absFile);
    const count = testsByFile.get(rel) || 0;
    let target = bins[0];
    for (const bin of bins) {
      if (bin.testCount < target.testCount) {
        target = bin;
      }
    }
    target.files.push(rel);
    target.testCount += count;
  }

  bins.forEach((bin, index) => {
    if (bin.files.length === 0) {
      return;
    }
    shards.push({
      name: `shard-${shards.length + 1}`,
      files: bin.files.sort(),
      testCount: bin.testCount,
    });
  });

  if (shards.length === 0) {
    throw new Error("Shard manifest is empty — no wb-regression files resolved from testMatch");
  }

  return shards;
}

function assertShardManifest(enrolledFiles, shards, allTests) {
  const enrolledRel = new Set(enrolledFiles.map(toTestDirRel));
  const manifestFiles = new Set();
  for (const shard of shards) {
    for (const file of shard.files) {
      if (manifestFiles.has(file)) {
        throw new Error(`File appears in multiple shards: ${file}`);
      }
      manifestFiles.add(file);
    }
  }

  if (manifestFiles.size !== enrolledRel.size) {
    const missing = [...enrolledRel].filter((f) => !manifestFiles.has(f));
    const extra = [...manifestFiles].filter((f) => !enrolledRel.has(f));
    throw new Error(
      `Shard manifest file union mismatch.\n` +
        `Missing: ${missing.join(", ") || "(none)"}\n` +
        `Extra: ${extra.join(", ") || "(none)"}`,
    );
  }

  const manifestTestIds = new Set();
  for (const shard of shards) {
    const shardTests = allTests.filter((t) => shard.files.includes(t.file));
    for (const test of shardTests) {
      manifestTestIds.add(test.id);
    }
  }

  const fullIds = new Set(allTests.map((t) => t.id));
  if (manifestTestIds.size !== fullIds.size) {
    throw new Error(
      `Shard manifest test count mismatch: manifest=${manifestTestIds.size} full --list=${fullIds.size}`,
    );
  }
  for (const id of fullIds) {
    if (!manifestTestIds.has(id)) {
      throw new Error(`Test missing from shard manifest union: ${id}`);
    }
  }
}

function printManifest(shards, enrolledFiles, allTests) {
  console.log("=== wb-regression shard manifest (from playwright.config.ts testMatch) ===");
  console.log(`Enrolled files: ${enrolledFiles.length}`);
  console.log(`Full --list tests: ${allTests.length}`);
  console.log(`Shards: ${shards.length}`);
  let manifestTests = 0;
  for (const shard of shards) {
    manifestTests += shard.testCount;
    console.log(
      `\n[${shard.name}] ${shard.files.length} file(s), ~${shard.testCount} test(s)`,
    );
    for (const file of shard.files) {
      console.log(`  - ${file}`);
    }
  }
  console.log(`\nManifest test total: ${manifestTests}`);
  console.log(`Full --list total:   ${allTests.length}`);
  console.log(
    manifestTests === allTests.length
      ? "OK: manifest union equals full --list set."
      : "ERROR: manifest union does NOT equal full --list set.",
  );
}

async function freeDevServerPorts() {
  await cleanupWbDevServerPorts();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walk a Playwright JSON report (merge-reports / json reporter) and collect only
 * wb-regression tests whose final outcome is `unexpected` (genuine failure).
 * Skips passed/expected, skipped, and flaky (passed on retry).
 */
function extractUnexpectedFailuresFromJsonReport(report) {
  const failures = [];
  const seen = new Set();

  function addFailure(spec, fullTitle) {
    const relFile = (spec.file || "").replace(/\\/g, "/");
    const file = relFile.startsWith("tests/") ? relFile : `tests/${relFile}`;
    const id = `${file}:${spec.line} › ${fullTitle}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    failures.push({ file, grep: fullTitle, id });
  }

  function walkSuites(suites, titlePrefix) {
    for (const suite of suites || []) {
      const isFileSuite = Boolean(suite.file) && !suite.line;
      const nextPrefix = isFileSuite
        ? titlePrefix
        : titlePrefix
          ? `${titlePrefix} › ${suite.title}`
          : suite.title;
      walkSuites(suite.suites, nextPrefix);
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          if (test.projectName !== PROJECT) {
            continue;
          }
          if (test.status !== "unexpected") {
            continue;
          }
          const titleParts = [];
          if (nextPrefix) {
            titleParts.push(nextPrefix);
          }
          titleParts.push(spec.title);
          addFailure(spec, titleParts.join(" › "));
        }
      }
    }
  }

  walkSuites(report.suites, "");
  return failures;
}

/**
 * @deprecated stdout line parsing — kept for shard exit diagnostics only.
 * Do NOT use for isolation collection (matches progress lines for passed tests).
 */
function parseFailuresFromStdout(output) {
  const failures = [];
  const seen = new Set();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(
      /\[wb-regression\]\s*›\s*(.+?):(\d+):(\d+)\s*›\s*(.+)$/,
    );
    if (!match) {
      continue;
    }
    const [, file, lineNo, , title] = match;
    const normalizedFile = file.replace(/\\/g, "/");
    const key = `${normalizedFile}::${title.trim()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    failures.push({
      file: normalizedFile,
      grep: title.trim(),
      id: `${normalizedFile}:${lineNo} › ${title.trim()}`,
    });
  }
  return failures;
}

async function runIntegrationSetup() {
  console.log("\n=== integration-setup (once) ===");
  await freeDevServerPorts();
  const result = npxPlaywright(["test", "--project=integration-setup"]);
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    throw new Error(`integration-setup failed with exit code ${result.status}`);
  }
}

async function runShard(shard, index) {
  const shardLabel = shard.name || `shard-${index + 1}`;
  const blobDir = path.join(ROOT, "test-results", `shard-${index + 1}`);
  fs.mkdirSync(blobDir, { recursive: true });

  console.log(`\n=== ${shardLabel} (${shard.files.length} files, ~${shard.testCount} tests) ===`);
  await freeDevServerPorts();

  const blobOutputDir = MERGE_BLOB_DIR;
  fs.mkdirSync(blobOutputDir, { recursive: true });

  const result = npxPlaywright(
    [
      "test",
      PROJECT_FLAG,
      "--no-deps",
      ...shard.files.map(toCliTestArg),
      "--workers=1",
      "--reporter=line,blob",
    ],
    {
      WB_SKIP_3101_WEBSERVER: "1",
      PWTEST_BLOB_DO_NOT_REMOVE: "1",
      PLAYWRIGHT_BLOB_OUTPUT_DIR: blobOutputDir,
      PLAYWRIGHT_BLOB_OUTPUT_NAME: `${shardLabel}-report.zip`,
    },
  );

  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");

  return {
    shard: shardLabel,
    exitCode: result.status ?? 1,
    blobZipName: `${shardLabel}-report.zip`,
    stdoutFailures: result.status === 0 ? [] : parseFailuresFromStdout(`${result.stdout}\n${result.stderr}`),
  };
}

function mergeBlobReports() {
  console.log("\n=== merge-reports ===");
  if (!fs.existsSync(MERGE_BLOB_DIR)) {
    console.warn("No blob report directory found — skipping merge-reports");
    return { exitCode: 0, failures: [] };
  }
  const zips = fs.readdirSync(MERGE_BLOB_DIR).filter((f) => f.endsWith(".zip"));
  if (zips.length === 0) {
    console.warn("No blob zip files found — skipping merge-reports");
    return { exitCode: 0, failures: [] };
  }

  const result = spawnSync(
    "npx",
    [
      "playwright",
      "merge-reports",
      MERGE_BLOB_DIR,
      "--reporter=html",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: { ...process.env },
    },
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");

  const jsonResult = spawnSync(
    "npx",
    [
      "playwright",
      "merge-reports",
      MERGE_BLOB_DIR,
      "--reporter=json",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_FILE: MERGED_JSON_REPORT,
      },
    },
  );
  if (jsonResult.status !== 0) {
    console.warn(
      `merge-reports json failed (exit ${jsonResult.status}):\n${jsonResult.stdout}\n${jsonResult.stderr}`,
    );
    return { exitCode: result.status ?? 1, failures: [] };
  }

  let failures = [];
  if (fs.existsSync(MERGED_JSON_REPORT)) {
    const report = JSON.parse(fs.readFileSync(MERGED_JSON_REPORT, "utf8"));
    failures = extractUnexpectedFailuresFromJsonReport(report);
    console.log(
      `[wb-relay-shard-run] merged JSON: ${report.stats?.unexpected ?? "?"} unexpected wb-regression failure(s) for isolation`,
    );
  } else {
    console.warn(`Expected merged JSON at ${MERGED_JSON_REPORT} — isolation list empty`);
  }

  return { exitCode: result.status ?? 1, failures };
}

async function runIsolationPass(failures) {
  if (failures.length === 0) {
    console.log("\n=== isolation re-run pass: no failures to re-run ===");
    return { realFailures: [], envFlakes: [] };
  }

  console.log(`\n=== isolation re-run pass (${failures.length} failure(s)) ===`);
  const realFailures = [];
  const envFlakes = [];

  for (const failure of failures) {
    console.log(`\n--- isolate: ${failure.id} ---`);
    await freeDevServerPorts();
    const result = npxPlaywright(
      [
        "test",
        PROJECT_FLAG,
        "--no-deps",
        toCliTestArg(failure.file),
        "-g",
        failure.grep,
        "--workers=1",
        "--reporter=line",
      ],
      { WB_SKIP_3101_WEBSERVER: "1" },
    );
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    if (result.status === 0) {
      envFlakes.push(failure);
      console.log(`CLASSIFICATION: ENV-FLAKE (passed isolated) — ${failure.id}`);
    } else {
      realFailures.push(failure);
      console.log(`CLASSIFICATION: REAL-FAIL (failed isolated) — ${failure.id}`);
    }
  }

  return { realFailures, envFlakes };
}

function printFinalSummary(shardResults, isolation) {
  console.log("\n========================================");
  console.log("WB-REGRESSION SHARDED GATE SUMMARY");
  console.log("========================================");
  for (const result of shardResults) {
    console.log(
      `${result.shard}: exit ${result.exitCode}, stdout failure lines ${result.stdoutFailures.length}`,
    );
  }
  console.log(`\nIsolation re-runs: ${isolation.realFailures.length + isolation.envFlakes.length}`);
  console.log(`  REAL-FAIL: ${isolation.realFailures.length}`);
  for (const f of isolation.realFailures) {
    console.log(`    - ${f.id}`);
  }
  console.log(`  ENV-FLAKE: ${isolation.envFlakes.length}`);
  for (const f of isolation.envFlakes) {
    console.log(`    - ${f.id}`);
  }
  console.log(`\nMerged report dir: ${MERGE_BLOB_DIR}`);
  console.log("========================================");
}

async function main() {
  if ("CI" in process.env) {
    console.warn(
      "[wb-relay-shard-run] NOTE: process.env.CI is set in the environment; this runner does NOT set CI itself.",
    );
  }

  const cli = parseArgs(process.argv.slice(2));
  const { files: enrolledFiles, testMatchPatterns } = await loadWbRegressionProject();
  const allTests = listProjectTests();
  const testsByFile = countTestsByFile(allTests);
  const shards = buildShards(enrolledFiles, testsByFile, cli.targetShards);
  assertShardManifest(enrolledFiles, shards, allTests);
  printManifest(shards, enrolledFiles, allTests);

  console.log("\nEnrollment source: playwright.config.ts wb-regression testMatch");
  for (const pattern of testMatchPatterns) {
    console.log(`  - ${pattern}`);
  }

  if (cli.manifestOnly) {
    return;
  }

  fs.mkdirSync(MERGE_BLOB_DIR, { recursive: true });
  const existingZips = fs.readdirSync(MERGE_BLOB_DIR).filter((f) => f.endsWith(".zip"));
  for (const zip of existingZips) {
    fs.unlinkSync(path.join(MERGE_BLOB_DIR, zip));
  }

  await runIntegrationSetup();

  const shardResults = [];
  for (let i = 0; i < shards.length; i++) {
    if (i > 0) {
      console.log(
        `\n[wb-relay-shard-run] inter-shard cooldown ${INTER_SHARD_COOLDOWN_MS}ms before ${shards[i].name}...`,
      );
      await sleep(INTER_SHARD_COOLDOWN_MS);
    }
    const result = await runShard(shards[i], i);
    shardResults.push(result);
    await freeDevServerPorts();
  }

  const mergeResult = mergeBlobReports();
  const isolation = await runIsolationPass(mergeResult.failures);
  printFinalSummary(shardResults, isolation);

  const gateExitCode = isolation.realFailures.length > 0 ? 1 : 0;
  process.exit(gateExitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  buildShards,
  extractUnexpectedFailuresFromJsonReport,
  loadWbRegressionProject,
  listProjectTests,
  parseListOutput,
};
