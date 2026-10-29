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

const READY_LINE = "[playwright-mute] ready";
const DEFAULT_READY_TIMEOUT_MS = 90000;

/**
 * Keep reading helper stderr for the life of the process. Resolves when
 * the helper has finished its first sweep and logged READY_LINE.
 * The data listener stays attached so a full pipe cannot stall later sweeps.
 */
function waitForHelperReady(child, logPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buf = "";
    let settled = false;
    const timer = setTimeout(() => {
      fail(
        new Error(
          `[playwright-mute] timed out waiting for ready after ${timeoutMs}ms\n${buf.slice(-2000)}`,
        ),
      );
    }, timeoutMs);

    function fail(err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      reject(err);
    }

    function succeed() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve();
    }

    function onData(chunk) {
      try {
        fs.appendFileSync(logPath, chunk);
      } catch {
        /* log dir disappeared */
      }
      if (settled) return;
      buf += chunk.toString();
      if (buf.includes(READY_LINE)) succeed();
    }

    function onExit(code) {
      fail(
        new Error(
          `[playwright-mute] helper exited before ready code=${code}\n${buf.slice(-2000)}`,
        ),
      );
    }

    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

/**
 * Mute OS playback for Playwright's browsers until the runner exits.
 * Chromium's --mute-audio flag also silences the fake mic the recorder
 * tests measure, so those projects opt out of it. This mutes the Windows
 * audio session instead, which follows speakers or headphones.
 *
 * Do not spawn PowerShell detached. On Windows, `detached: true` makes
 * powershell.exe exit 0 before -File runs, so the helper never mutes and
 * the log stays empty (seen 2026-10-28). The process stays attached.
 *
 * Does not resolve until the helper logs `[playwright-mute] ready`, which
 * is after C# compile and the first sweep. Callers must await that, or the
 * first browsers play during compile. After ready the process is unref'd
 * and leaves when the runner pid dies or stop() is called.
 * No-op off Windows. Resolves to a stop function.
 */
async function startPlaywrightOutputMute(options = {}) {
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
  const readyTimeoutMs = options.readyTimeoutMs || DEFAULT_READY_TIMEOUT_MS;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  // Attached, not detached: see the comment above. stderr is a pipe
  // because a numeric fd is not a reliable Windows stdio target.
  const child = spawn(
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
  const ready = waitForHelperReady(child, logPath, readyTimeoutMs);
  const pid = child.pid;
  fs.appendFileSync(
    logPath,
    `[playwright-mute] self=${process.pid} ppid=${process.ppid} runner=${runnerPid} helperPid=${pid}\n`,
  );
  try {
    await ready;
  } catch (err) {
    try {
      if (pid) process.kill(pid);
    } catch {
      /* already exited */
    }
    throw err;
  }
  child.unref();
  child.stderr.unref();
  return () => {
    try {
      fs.appendFileSync(logPath, `[playwright-mute] stop helperPid=${pid}\n`);
    } catch {
      /* log already gone */
    }
    if (!pid) return;
    try {
      process.kill(pid);
    } catch {
      /* already exited with the test run */
    }
  };
}

module.exports = {
  isPlaywrightBrowserExe,
  isPlaywrightRunnerCommand,
  resolvePlaywrightRunnerPid,
  startPlaywrightOutputMute,
};
