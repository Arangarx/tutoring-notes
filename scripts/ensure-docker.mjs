/**
 * Ensure the Docker daemon is running before local wb-sync / db:up / relay:build.
 * Fast-path when Docker is already up; otherwise launches Docker Desktop (or
 * systemctl on Linux) and polls until `docker info` succeeds.
 *
 * Override wait: DOCKER_WAIT_TIMEOUT_MS (default 180000).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 180_000;

function dockerInfoOk() {
  const result = spawnSync("docker", ["info"], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  return result.status === 0;
}

function windowsDockerDesktopPaths() {
  const paths = [];
  const programFiles = process.env.ProgramFiles;
  const programW6432 = process.env.ProgramW6432;
  const localAppData = process.env.LOCALAPPDATA;

  if (programFiles) {
    paths.push(join(programFiles, "Docker", "Docker", "Docker Desktop.exe"));
  }
  if (programW6432 && programW6432 !== programFiles) {
    paths.push(join(programW6432, "Docker", "Docker", "Docker Desktop.exe"));
  }
  if (localAppData) {
    paths.push(join(localAppData, "Docker", "Docker Desktop.exe"));
    paths.push(join(localAppData, "Programs", "Docker", "Docker", "Docker Desktop.exe"));
  }
  return paths;
}

function findDockerDesktopExecutable() {
  if (process.platform === "win32") {
    for (const candidate of windowsDockerDesktopPaths()) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
  if (process.platform === "darwin") {
    return "/Applications/Docker.app";
  }
  return null;
}

function launchDockerDesktop(executable) {
  if (process.platform === "win32") {
    const child = spawn(executable, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", ["-a", "Docker"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  }
  if (process.platform === "linux") {
    const result = spawnSync("systemctl", ["start", "docker"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return result.status === 0;
  }
  return false;
}

function formatElapsed(ms) {
  return `${Math.round(ms / 1000)}s`;
}

async function waitForDocker(timeoutMs) {
  const started = Date.now();
  let lastProgressAt = 0;

  while (Date.now() - started < timeoutMs) {
    if (dockerInfoOk()) {
      return true;
    }

    const elapsed = Date.now() - started;
    if (elapsed - lastProgressAt >= POLL_INTERVAL_MS) {
      console.log(`[ensure-docker] waiting for Docker… ${formatElapsed(elapsed)}`);
      lastProgressAt = elapsed;
    }

    await delay(POLL_INTERVAL_MS);
  }

  return dockerInfoOk();
}

async function main() {
  if (dockerInfoOk()) {
    console.log("[ensure-docker] Docker already running");
    process.exit(0);
  }

  const timeoutMs = Number(process.env.DOCKER_WAIT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(
      "[ensure-docker] DOCKER_WAIT_TIMEOUT_MS must be a positive number (milliseconds).",
    );
    process.exit(1);
  }

  const executable = findDockerDesktopExecutable();
  const triedPaths =
    process.platform === "win32"
      ? windowsDockerDesktopPaths()
      : executable
        ? [executable]
        : [];

  if (process.platform === "linux") {
    console.log("[ensure-docker] Docker daemon not responding; trying systemctl start docker…");
    launchDockerDesktop(null);
  } else if (executable) {
    console.log(`[ensure-docker] Docker daemon not responding; starting Docker Desktop…`);
    console.log(`[ensure-docker] launch: ${executable}`);
    launchDockerDesktop(executable);
  } else {
    console.error("[ensure-docker] Docker daemon is not running and Docker Desktop was not found.");
    if (triedPaths.length > 0) {
      console.error("[ensure-docker] Checked paths:");
      for (const p of triedPaths) {
        console.error(`  - ${p}`);
      }
    }
    console.error(
      "[ensure-docker] Start Docker Desktop manually, then re-run your command.",
    );
    process.exit(1);
  }

  const ready = await waitForDocker(timeoutMs);
  if (ready) {
    console.log("[ensure-docker] Docker is ready");
    process.exit(0);
  }

  console.error(
    `[ensure-docker] Timed out after ${formatElapsed(timeoutMs)} waiting for the Docker daemon.`,
  );
  if (triedPaths.length > 0) {
    console.error("[ensure-docker] Tried to launch from:");
    for (const p of triedPaths) {
      console.error(`  - ${p}`);
    }
  }
  console.error(
    "[ensure-docker] Start Docker Desktop manually and re-run. " +
      `Increase DOCKER_WAIT_TIMEOUT_MS (currently ${timeoutMs}) if startup is slow.`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[ensure-docker] Unexpected error:", err);
  process.exit(1);
});
