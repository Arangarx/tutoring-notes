/**
 * Bounded local ZAP baseline. Preparation runner: it does not pull images
 * and it does not start the dev server.
 *
 * The docker command sets zap-baseline.py -t to http://host.docker.internal:3000
 * and passes -n local-only.context. The baseline script loads that context
 * before spidering, and the spider uses the context, so the spider stays on
 * that one host. This does not firewall the container, so it is not the
 * AI-agent run.
 */
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  APP_ORIGIN,
  DOCKER_TARGET,
  ZAP_IMAGE,
  parseRunLocalZapArgs,
  buildLocalZapDockerArgs,
  formatLocalZapDockerCommand,
} = require("./local-zap-command.cjs");

const here = dirname(fileURLToPath(import.meta.url));
const contextDir = join(here, "zap");
const preflightPath = join(here, "local-scan-preflight.mjs");

const parsed = parseRunLocalZapArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.reason);
  process.exit(1);
}

const preflight = spawnSync(process.execPath, [preflightPath], {
  stdio: "inherit",
  windowsHide: true,
});
if (preflight.status !== 0) {
  process.exit(preflight.status === null ? 1 : preflight.status);
}

const dockerArgs = buildLocalZapDockerArgs(contextDir);
const targetArgs = dockerArgs.filter((arg) => arg.startsWith("http://") || arg.startsWith("https://"));
if (targetArgs.length !== 1 || targetArgs[0] !== DOCKER_TARGET || APP_ORIGIN !== "http://127.0.0.1:3000") {
  console.error("Refusing to run ZAP: the command is not limited to one local origin.");
  process.exit(1);
}

if (parsed.printOnly) {
  console.log(formatLocalZapDockerCommand(contextDir));
  process.exit(0);
}

const listening = await devServerListening();
if (!listening) {
  console.error("127.0.0.1:3000 is not listening. Start the app with npm run dev, then re-run this script.");
  process.exit(1);
}

if (!dockerAvailable()) {
  console.error("Docker is not available. Not invoking ZAP.");
  console.log(formatLocalZapDockerCommand(contextDir));
  process.exit(1);
}

if (!zapImagePresent()) {
  console.error("ZAP image is not present locally. Not invoking ZAP and not pulling.");
  console.log(formatLocalZapDockerCommand(contextDir));
  process.exit(1);
}

const scan = spawnSync(dockerArgs[0], dockerArgs.slice(1), {
  stdio: "inherit",
  windowsHide: true,
});
process.exit(scan.status === null ? 1 : scan.status);

function devServerListening() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 3000 });
    const finish = (up) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(up);
    };
    socket.setTimeout(2000);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function dockerAvailable() {
  const result = spawnSync("docker", ["version"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}

function zapImagePresent() {
  const result = spawnSync("docker", ["image", "inspect", ZAP_IMAGE], {
    stdio: "ignore",
    windowsHide: true,
  });
  return result.status === 0;
}
