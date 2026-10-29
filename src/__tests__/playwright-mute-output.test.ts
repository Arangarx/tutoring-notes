const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  isPlaywrightBrowserExe,
  isPlaywrightRunnerCommand,
  resolvePlaywrightRunnerPid,
  startPlaywrightOutputMute,
} = require("../../scripts/playwright-mute-output.cjs");

function muteHelperPids() {
  // The query lives in its own file so this process's command line does not
  // contain the muter script name and get counted as a helper.
  const query = path.join(os.tmpdir(), "list-pw-mute-helper-pids.ps1");
  fs.writeFileSync(
    query,
    [
      "Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" |",
      "  Where-Object { $_.CommandLine -like '*-File*playwright-mute-output.ps1*' } |",
      "  ForEach-Object { $_.ProcessId }",
      "",
    ].join("\n"),
    "utf8",
  );
  const out = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-File", query],
    { encoding: "utf8", timeout: 20000, windowsHide: true },
  );
  return out
    .split(/\s+/)
    .map((part) => Number(part))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("playwright output mute process filter", () => {
  it("matches Playwright's Chromium, headless shell, and Firefox", () => {
    expect(
      isPlaywrightBrowserExe(
        "C:\\Users\\arang\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1208\\chrome-headless-shell-win64\\chrome-headless-shell.exe",
      ),
    ).toBe(true);
    expect(
      isPlaywrightBrowserExe(
        "C:/Users/arang/AppData/Local/ms-playwright/firefox-1495/firefox/firefox.exe",
      ),
    ).toBe(true);
  });

  it("does not match the user's normal Chrome", () => {
    expect(
      isPlaywrightBrowserExe(
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toBe(false);
    expect(
      isPlaywrightBrowserExe(
        "C:\\Users\\arang\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toBe(false);
  });

  it("rejects empty and unrelated paths that merely contain the letters", () => {
    expect(isPlaywrightBrowserExe("")).toBe(false);
    expect(isPlaywrightBrowserExe(null)).toBe(false);
    expect(
      isPlaywrightBrowserExe("C:\\ms-playwright-tools\\chrome.exe"),
    ).toBe(false);
  });

  it("matches the marker compiled into the Windows muter", () => {
    const ps1 = fs.readFileSync(
      path.join(__dirname, "../../scripts/playwright-mute-output.ps1"),
      "utf8",
    );
    expect(ps1).toContain('"/ms-playwright/"');
  });
});

describe("playwright runner pid resolution", () => {
  const cli =
    "C:\\Program Files\\nodejs\\node.exe C:\\repo\\node_modules\\@playwright\\test\\cli.js test --project=wb-regression";

  it("treats the @playwright/test cli as the runner and ignores Chrome and config files", () => {
    expect(isPlaywrightRunnerCommand(cli)).toBe(true);
    expect(
      isPlaywrightRunnerCommand(
        "node /repo/node_modules/playwright/cli.js test",
      ),
    ).toBe(true);
    expect(
      isPlaywrightRunnerCommand(
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      ),
    ).toBe(false);
    expect(
      isPlaywrightRunnerCommand("node playwright.config.ts"),
    ).toBe(false);
    expect(isPlaywrightRunnerCommand("")).toBe(false);
    expect(isPlaywrightRunnerCommand(null)).toBe(false);
  });

  it("returns this process when it is already the cli runner", () => {
    const runner = resolvePlaywrightRunnerPid(43821, (pid) =>
      pid === 43821 ? { ppid: 100, commandLine: cli } : null,
    );
    expect(runner).toBe(43821);
  });

  it("walks from a short-lived child up to the cli.js runner", () => {
    const lookup = (pid) => {
      if (pid === 50) return { ppid: 40, commandLine: "node global-setup-worker.js" };
      if (pid === 40) return { ppid: 10, commandLine: cli };
      if (pid === 10) return { ppid: 1, commandLine: "C:\\Windows\\System32\\cmd.exe" };
      return null;
    };
    expect(resolvePlaywrightRunnerPid(50, lookup)).toBe(40);
  });

  it("keeps the start pid when no ancestor is the runner", () => {
    const lookup = (pid) => {
      if (pid === 7) return { ppid: 6, commandLine: "node jest.js" };
      if (pid === 6) return { ppid: 1, commandLine: "C:\\Windows\\explorer.exe" };
      return null;
    };
    expect(resolvePlaywrightRunnerPid(7, lookup)).toBe(7);
  });

  it("stops on a parent cycle and returns the start pid", () => {
    const lookup = (pid) => {
      if (pid === 3) return { ppid: 4, commandLine: "node a.js" };
      if (pid === 4) return { ppid: 3, commandLine: "node b.js" };
      return null;
    };
    expect(resolvePlaywrightRunnerPid(3, lookup)).toBe(3);
  });

  it("falls back to the start pid when a process cannot be read", () => {
    expect(resolvePlaywrightRunnerPid(9, () => null)).toBe(9);
    expect(resolvePlaywrightRunnerPid(9, () => {
      throw new Error("access denied");
    })).toBe(9);
  });
});

describe("playwright output mute lifetime", () => {
  const stoppers = [];
  afterEach(() => {
    while (stoppers.length) stoppers.pop()();
  });

  it("stays alive while the runner pid is alive", async () => {
    if (process.platform !== "win32") return;
    const logPath = path.join(os.tmpdir(), `pw-mute-${process.pid}-${Date.now()}.log`);
    const before = new Set(muteHelperPids());
    const stop = startPlaywrightOutputMute({
      parentPid: process.pid,
      logPath,
      lookup: () => ({
        ppid: process.ppid,
        commandLine: "node /@playwright/test/cli.js",
      }),
    });
    stoppers.push(stop);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const started = muteHelperPids().filter((pid) => !before.has(pid));
    expect(started.length).toBeGreaterThan(0);
    for (const pid of started) expect(pidAlive(pid)).toBe(true);
    const text = fs.readFileSync(logPath, "utf8");
    expect(text).toContain(`self=${process.pid}`);
    expect(text).toContain(`runner=${process.pid}`);
    expect(text).toContain(`watching pid=${process.pid}`);
    stop();
    stoppers.pop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const pid of started) expect(pidAlive(pid)).toBe(false);
  }, 20000);
});
