/**
 * One local command for the standing security checks:
 * Semgrep (OWASP, TypeScript, React, Next.js), gitleaks, production npm
 * audit, and the Jest tests under src/__tests__/security.
 *
 * Jest is pointed at an unreachable database so global setup cannot reset
 * the shared tutoring_notes_test database. Semgrep and gitleaks do not
 * print matched secret text; findings are rule, file, and line.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GITLEAKS_VERSION = "8.30.1";
const GITLEAKS_SHA256 = {
  "windows-x64":
    "d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e",
  "linux-x64":
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb",
  "darwin-x64":
    "dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709",
  "darwin-arm64":
    "b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5",
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, options = {}) {
  const base = {
    cwd: root,
    encoding: "utf8",
    ...options,
  };
  // On Windows, .cmd shims need a shell. Pass one command string so Node
  // does not warn about an args array combined with shell:true.
  if (process.platform === "win32" && base.shell !== false) {
    delete base.shell;
    const line = [command, ...args]
      .map((part) => {
        const text = String(part);
        return /[\s"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(" ");
    return spawnSync(line, { ...base, shell: true });
  }
  return spawnSync(command, args, { ...base, shell: false });
}

function semgrepFindings(stdout) {
  const start = stdout.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

function runSemgrep() {
  console.log("semgrep: p/owasp-top-ten p/typescript p/react p/nextjs");
  const result = run(
    "semgrep",
    [
      "scan",
      "--config",
      "p/owasp-top-ten",
      "--config",
      "p/typescript",
      "--config",
      "p/react",
      "--config",
      "p/nextjs",
      "--error",
      "--metrics",
      "off",
      "--json",
    ],
    {
      env: { ...process.env, SEMGREP_SEND_METRICS: "off" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  if (result.error && result.error.code === "ENOENT") {
    fail("semgrep is not on PATH. Install it with: pip install semgrep");
  }
  const report = semgrepFindings(result.stdout || "");
  const findings = report?.results ?? [];
  const bySeverity = {};
  for (const finding of findings) {
    const severity = finding.extra?.severity || "UNKNOWN";
    bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    const path = finding.path || "?";
    const line = finding.start?.line ?? "?";
    const rule = finding.check_id || "?";
    console.error(`${severity} ${rule} ${path}:${line}`);
  }
  const summary = Object.entries(bySeverity)
    .map(([severity, count]) => `${severity}=${count}`)
    .join(" ");
  console.log(`semgrep findings: ${findings.length}${summary ? ` (${summary})` : ""}`);
  if (!report && result.status !== 0) {
    if (result.stderr) console.error(result.stderr);
    fail(`semgrep exited ${result.status} without a JSON report.`);
  }
  if (findings.length > 0 || result.status !== 0) {
    fail("semgrep reported findings.");
  }
}

function gitleaksAsset() {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "win32") {
    return {
      key: `windows-${arch}`,
      file: `gitleaks_${GITLEAKS_VERSION}_windows_${arch}.zip`,
      binary: "gitleaks.exe",
    };
  }
  if (process.platform === "darwin") {
    return {
      key: `darwin-${arch}`,
      file: `gitleaks_${GITLEAKS_VERSION}_darwin_${arch}.tar.gz`,
      binary: "gitleaks",
    };
  }
  return {
    key: `linux-${arch}`,
    file: `gitleaks_${GITLEAKS_VERSION}_linux_${arch}.tar.gz`,
    binary: "gitleaks",
  };
}

async function ensureGitleaks() {
  const onPath = run("gitleaks", ["version"], { stdio: ["ignore", "pipe", "pipe"] });
  if (onPath.status === 0) return "gitleaks";

  const asset = gitleaksAsset();
  const expected = GITLEAKS_SHA256[asset.key];
  if (!expected) fail(`No gitleaks checksum for ${asset.key}.`);
  const cacheDir = join(root, "node_modules", ".cache", `gitleaks-${GITLEAKS_VERSION}`);
  const binaryPath = join(cacheDir, asset.binary);
  if (existsSync(binaryPath)) return binaryPath;

  mkdirSync(cacheDir, { recursive: true });
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${asset.file}`;
  const response = await fetch(url);
  if (!response.ok) fail(`Could not download gitleaks (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) fail("gitleaks download checksum did not match.");
  const archivePath = join(cacheDir, asset.file);
  writeFileSync(archivePath, bytes);
  if (asset.file.endsWith(".zip")) {
    const expanded = run(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${archivePath}' -DestinationPath '${cacheDir}' -Force`,
      ],
      { stdio: "inherit" }
    );
    if (expanded.status !== 0) fail("Could not unzip gitleaks.");
  } else {
    const extracted = run("tar", ["-xzf", archivePath, "-C", cacheDir], {
      stdio: "inherit",
      shell: false,
    });
    if (extracted.status !== 0) fail("Could not extract gitleaks.");
  }
  if (process.platform !== "win32") chmodSync(binaryPath, 0o755);
  if (!existsSync(binaryPath)) fail("gitleaks binary missing after extract.");
  return binaryPath;
}

function runGitleaks(binary) {
  console.log(`gitleaks ${GITLEAKS_VERSION}`);
  const reportPath = join(tmpdir(), `tn-gitleaks-${process.pid}.json`);
  const result = run(
    binary,
    [
      "detect",
      "--source",
      ".",
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      reportPath,
      "--exit-code",
      "1",
    ],
    { stdio: ["ignore", "pipe", "pipe"], shell: false }
  );
  let findings = [];
  if (existsSync(reportPath)) {
    try {
      findings = JSON.parse(readFileSync(reportPath, "utf8"));
    } catch {
      findings = [];
    }
  }
  if (!Array.isArray(findings)) findings = [];
  for (const finding of findings) {
    const rule = finding.RuleID || "?";
    const file = finding.File || "?";
    const line = finding.StartLine ?? "?";
    console.error(`${rule} ${file}:${line}`);
  }
  console.log(`gitleaks findings: ${findings.length}`);
  if (result.status !== 0) fail("gitleaks reported findings.");
}

function runAudit() {
  console.log("npm audit: high and critical production dependencies");
  const result = run("node", ["scripts/check-npm-audit.mjs"], { stdio: "inherit" });
  if (result.status !== 0) fail("npm audit gate failed.");
}

function runJest() {
  console.log("jest: src/__tests__/security");
  const result = run("npx", ["jest", "src/__tests__/security", "--watchAll=false"], {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: "postgresql://x:x@127.0.0.1:1/x",
      DATABASE_URL: "postgresql://x:x@127.0.0.1:1/x",
      DIRECT_URL: "postgresql://x:x@127.0.0.1:1/x",
    },
  });
  if (result.status !== 0) fail("security jest failed.");
}

const gitleaksBinary = await ensureGitleaks();
runSemgrep();
runGitleaks(gitleaksBinary);
runAudit();
runJest();
console.log("security:check passed");
