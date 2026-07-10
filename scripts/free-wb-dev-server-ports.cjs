#!/usr/bin/env node
"use strict";

/**
 * ============================================================================
 * SAFETY-CRITICAL — WB PLAYWRIGHT DEV-SERVER PORT CLEANUP (ALLOWLIST ONLY)
 * ============================================================================
 *
 * This helper kills listeners on EXACTLY ports 3100 and 3101 — the Next.js
 * dev servers spawned by Playwright's wb-regression webServer entries.
 *
 * NEVER add port 3002 to the allowlist. :3002 is the persistent Docker relay
 * (wb-relay-local) / Postgres pipe endpoint managed by
 * scripts/playwright-relay-or-stub.cjs. Killing :3002 wedges Docker + the
 * local Postgres relay and breaks every subsequent wb-regression run.
 *
 * NEVER kill Docker PIDs or processes not bound to 3100/3101.
 * ============================================================================
 */

const { execSync, spawnSync } = require("node:child_process");
const net = require("node:net");

/** Hard-coded allowlist — do NOT extend without orchestrator review. */
const ALLOWED_PORTS = Object.freeze([3100, 3101]);

function portIsFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

function assertAllowedPort(port) {
  if (!ALLOWED_PORTS.includes(port)) {
    throw new Error(
      `[free-wb-dev-server-ports] REFUSED port ${port} — allowlist is [${ALLOWED_PORTS.join(", ")}] only. ` +
        "Port 3002 (Docker relay) must NEVER be targeted.",
    );
  }
}

function getListenerPidsWindows(port) {
  assertAllowedPort(port);
  const ps = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
        "Select-Object -ExpandProperty OwningProcess -Unique",
    ],
    { encoding: "utf8" },
  );
  if (ps.status !== 0 && ps.stderr?.trim()) {
    return [];
  }
  return (ps.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+$/.test(line))
    .map((line) => Number(line));
}

function getListenerPidsUnix(port) {
  assertAllowedPort(port);
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null || true`, {
      encoding: "utf8",
    });
    return out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^\d+$/.test(line))
      .map((line) => Number(line));
  } catch {
    return [];
  }
}

function getListenerPids(port) {
  if (process.platform === "win32") {
    return getListenerPidsWindows(port);
  }
  return getListenerPidsUnix(port);
}

function killPid(pid, port) {
  if (!Number.isFinite(pid) || pid <= 0) {
    return;
  }
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGTERM");
    }
    console.log(`[free-wb-dev-server-ports] killed PID ${pid} on :${port}`);
  } catch (err) {
    console.warn(
      `[free-wb-dev-server-ports] could not kill PID ${pid} on :${port}: ${err.message}`,
    );
  }
}

async function freePort(port) {
  assertAllowedPort(port);
  if (await portIsFree(port)) {
    console.log(`[free-wb-dev-server-ports] :${port} already free`);
    return;
  }
  const pids = [...new Set(getListenerPids(port))];
  if (pids.length === 0) {
    console.log(`[free-wb-dev-server-ports] :${port} in use but no listener PID found — no-op`);
    return;
  }
  for (const pid of pids) {
    killPid(pid, port);
  }
}

/**
 * Find node.exe processes whose command line targets an allowlisted dev-server port
 * (e.g. `npm run dev -- --port 3100`). Catches orphans that no longer hold LISTEN.
 */
function getOrphanedWbDevServerPids() {
  const pids = new Set();
  if (process.platform === "win32") {
    const ps = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" -ErrorAction SilentlyContinue | " +
          "Where-Object { $_.CommandLine -match '--port\\s+3100\\b' -or $_.CommandLine -match '--port\\s+3101\\b' } | " +
          "Select-Object -ExpandProperty ProcessId -Unique",
      ],
      { encoding: "utf8" },
    );
    for (const line of (ps.stdout || "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (/^\d+$/.test(trimmed)) {
        pids.add(Number(trimmed));
      }
    }
    return [...pids];
  }
  try {
    const out = execSync(
      "ps -ax -o pid=,command= 2>/dev/null | grep -E 'node.*--port[[:space:]]+(3100|3101)\\b' || true",
      { encoding: "utf8" },
    );
    for (const line of out.split(/\r?\n/)) {
      const match = line.trim().match(/^(\d+)/);
      if (match) {
        pids.add(Number(match[1]));
      }
    }
  } catch {
    // no-op
  }
  return [...pids];
}

/** Kill orphaned wb dev-server node processes, then free allowlisted listener ports. */
async function cleanupWbDevServerPorts() {
  const orphanPids = getOrphanedWbDevServerPids();
  for (const pid of orphanPids) {
    killPid(pid, "orphan");
  }
  for (const port of ALLOWED_PORTS) {
    await freePort(port);
  }
}

async function main() {
  const cliPorts = process.argv.slice(2).map((arg) => Number(arg));
  const ports = cliPorts.length > 0 ? cliPorts : [...ALLOWED_PORTS];
  for (const port of ports) {
    await freePort(port);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  ALLOWED_PORTS,
  cleanupWbDevServerPorts,
  freePort,
  freeAllAllowedPorts: main,
  getOrphanedWbDevServerPids,
};
