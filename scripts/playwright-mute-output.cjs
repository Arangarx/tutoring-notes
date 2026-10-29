const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

/**
 * True only for browsers Playwright itself installed. The user's Chrome
 * lives outside this directory and must keep playing sound.
 * Same rule as scripts/playwright-mute-output.ps1.
 */
function isPlaywrightBrowserExe(exePath) {
  if (!exePath || typeof exePath !== "string") return false;
  return exePath.replace(/\\/g, "/").toLowerCase().includes("/ms-playwright/");
}

/**
 * True for the Playwright test runner entry, not for config files or Chrome.
 * Playwright 1.58 loads globalSetup via require() inside this process
 * (`loadGlobalHook` → `runAllTestsWithConfig`). A future worker-style
 * setup would be a child of it; the walk in resolvePlaywrightRunnerPid
 * climbs to this command line.
 */
function isPlaywrightRunnerCommand(commandLine) {
  if (!commandLine || typeof commandLine !== "string") return false;
  const norm = commandLine.replace(/\\/g, "/").toLowerCase();
  return (
    norm.includes("/@playwright/test/cli.js") ||
    norm.includes("/playwright/cli.js")
  );
}

/**
 * Pid whose lifetime is the test run. Prefer the @playwright/test/cli.js
 * process. If this process already is that runner, or no ancestor is,
 * keep the start pid — never latch onto an unrelated parent.
 * `lookup(pid)` returns `{ ppid, commandLine }` or null.
 */
function resolvePlaywrightRunnerPid(startPid, lookup) {
  const start = Number(startPid);
  if (!Number.isInteger(start) || start <= 0) return null;
  const seen = new Set();
  let pid = start;
  while (pid > 0 && !seen.has(pid)) {
    seen.add(pid);
    let info = null;
    try {
      info = lookup(pid);
    } catch {
      info = null;
    }
    if (!info) return start;
    if (isPlaywrightRunnerCommand(info.commandLine)) return pid;
    const parent = Number(info.ppid);
    if (!Number.isInteger(parent) || parent <= 0 || parent === pid) return start;
    pid = parent;
  }
  return start;
}

function defaultProcessLookup(pid) {
  const id = Number(pid);
  if (id === process.pid) {
    return {
      ppid: process.ppid,
      commandLine: process.argv.map(String).join(" "),
    };
  }
  return lookupWindowsProcess(id);
}

function lookupWindowsProcess(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return null;
  let out = "";
  try {
    out = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${id}"; if ($p) { [Console]::Out.Write($p.ParentProcessId.ToString() + [char]9 + [string]$p.CommandLine) }`,
      ],
      { encoding: "utf8", timeout: 20000, windowsHide: true },
    );
  } catch {
    return null;
  }
  const tab = out.indexOf("\t");
  if (tab < 0) return null;
  const ppid = Number(out.slice(0, tab).trim());
  if (!Number.isInteger(ppid)) return null;
  return { ppid, commandLine: out.slice(tab + 1).replace(/\r?\n$/, "") };
}

/**
 * Mute OS playback for Playwright's browsers until the runner exits.
 * Chromium's --mute-audio flag also silences the fake mic the recorder
 * tests measure, so those projects opt out of it. This mutes the Windows
 * audio session instead, which follows speakers or headphones.
 *
 * Do not spawn PowerShell detached. On Windows, `detached: true` makes
 * powershell.exe exit 0 before -File runs, so the helper never mutes and
 * the log stays empty (seen 2026-10-28). The process stays attached,
 * unref'd, and leaves when the runner pid dies or stop() is called.
 * No-op off Windows. Returns a stop function.
 */
function startPlaywrightOutputMute(options = {}) {
  if (process.platform !== "win32") return () => {};
  const lookup = options.lookup || defaultProcessLookup;
  const runnerPid = resolvePlaywrightRunnerPid(
    options.parentPid || process.pid,
    lookup,
  );
  if (!runnerPid) return () => {};
  const script = path.join(__dirname, "playwright-mute-output.ps1");
  const logPath =
    options.logPath ||
    path.join(__dirname, "..", "test-results", "playwright-mute.log");
  let logStream;
  let child;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    logStream = fs.createWriteStream(logPath, { flags: "a" });
    // Attached, not detached: see the comment above. stderr is a pipe
    // because a numeric fd is not a reliable Windows stdio target.
    child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-ParentPid",
        String(runnerPid),
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    child.stderr.pipe(logStream);
    child.unref();
    child.stderr.unref();
    if (typeof logStream.unref === "function") logStream.unref();
    const pid = child.pid;
    logStream.write(
      `[playwright-mute] self=${process.pid} ppid=${process.ppid} runner=${runnerPid} helperPid=${pid}\n`,
    );
    return () => {
      try {
        logStream.write(`[playwright-mute] stop helperPid=${pid}\n`);
      } catch {
        /* stream already closed */
      }
      if (!pid) return;
      try {
        process.kill(pid);
      } catch {
        /* already exited with the test run */
      }
    };
  } catch (err) {
    console.error("[playwright-mute] failed to start output mute", err);
    return () => {};
  }
}

module.exports = {
  isPlaywrightBrowserExe,
  isPlaywrightRunnerCommand,
  resolvePlaywrightRunnerPid,
  startPlaywrightOutputMute,
};
