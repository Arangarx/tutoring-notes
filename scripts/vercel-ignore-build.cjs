"use strict";

/**
 * Vercel `ignoreCommand` helper — decides whether to skip a production build.
 *
 * Polarity (Vercel convention — do not invert):
 *   exit 0 → SKIP the build
 *   exit 1 → RUN the build
 *
 * Fail-safe: missing previous SHA, git errors, empty diffs, or any
 * non-docs/rules path → BUILD (exit 1).
 */

const { execSync } = require("node:child_process");

/**
 * @param {string} filePath repo-relative path from `git diff --name-only`
 * @returns {boolean}
 */
function isNonBuildAffecting(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  if (normalized.startsWith("docs/")) return true;
  if (normalized.startsWith(".cursor/")) return true;
  if (normalized.endsWith(".md")) return true;
  if (normalized.endsWith(".mdc")) return true;
  return false;
}

/**
 * Pure predicate: true only when EVERY changed file is provably non-build-affecting.
 *
 * @param {string[]} changedFiles
 * @returns {boolean}
 */
function shouldSkipBuild(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return false;
  }
  return changedFiles.every(isNonBuildAffecting);
}

/**
 * @param {string[]} changedFiles
 * @returns {string | undefined}
 */
function firstBuildAffectingPath(changedFiles) {
  return changedFiles.find((p) => !isNonBuildAffecting(p));
}

function main() {
  const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!previousSha || String(previousSha).trim() === "") {
    console.log(
      "vercel-ignore: building — VERCEL_GIT_PREVIOUS_SHA unset (first deploy / fork fail-safe)"
    );
    process.exit(1);
  }

  let stdout;
  try {
    stdout = execSync(
      `git diff ${JSON.stringify(previousSha)} HEAD --name-only`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  } catch {
    console.log("vercel-ignore: building — git diff failed");
    process.exit(1);
  }

  const changedFiles = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (changedFiles.length === 0) {
    console.log("vercel-ignore: building — empty diff (fail-safe)");
    process.exit(1);
  }

  if (shouldSkipBuild(changedFiles)) {
    console.log(
      `vercel-ignore: skipping build — ${changedFiles.length} changed file(s) all docs/rules`
    );
    process.exit(0);
  }

  const offender = firstBuildAffectingPath(changedFiles);
  console.log(
    `vercel-ignore: building — code path changed: ${offender ?? changedFiles[0]}`
  );
  process.exit(1);
}

module.exports = {
  shouldSkipBuild,
  isNonBuildAffecting,
  firstBuildAffectingPath,
};

if (require.main === module) {
  main();
}
