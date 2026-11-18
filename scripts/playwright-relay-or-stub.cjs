"use strict";

/**
 * Playwright webServer helper for the relay port (PW_RELAY_PORT, default 3002).
 * Uses the real wb-relay-local Docker image when present; otherwise a minimal
 * HTTP stub so identity/consent e2e can run without `npm run relay:build`.
 * WB regression still prefers the real image when available.
 * The container name follows the host port so two relays can run at once.
 * The image still listens on 3002 inside the container.
 */

const http = require("node:http");
const { spawn } = require("node:child_process");
const { execSync } = require("node:child_process");
const net = require("node:net");
const { relayDockerArgs, resolvePwStack } = require("./pw-stack.cjs");

const stack = resolvePwStack();
const PORT = stack.relayPort;

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

function dockerImageExists(name) {
  try {
    execSync(`docker image inspect ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function startStub() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[playwright-relay-or-stub] stub listening on :${PORT}`);
  });
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}

async function main() {
  if (await portInUse(PORT)) {
    console.log(
      `[playwright-relay-or-stub] :${PORT} already in use — holding webServer slot (reuse relay)`
    );
    // Playwright webServer (CI reuseExistingServer=false) needs this process to
    // stay alive while an existing relay/stub already owns this port.
    await new Promise(() => {});
    return;
  }

  if (dockerImageExists("wb-relay-local")) {
    console.log(
      `[playwright-relay-or-stub] starting ${stack.relayContainerName} on :${PORT}`
    );
    const child = spawn("docker", relayDockerArgs(), {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    process.on("SIGINT", () => child.kill("SIGINT"));
    return;
  }

  console.log(
    "[playwright-relay-or-stub] wb-relay-local image not found — using HTTP stub"
  );
  startStub();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
