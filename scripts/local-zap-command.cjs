"use strict";

/**
 * The only app origin a local ZAP run may use, and the Docker hostname that
 * reaches it from the official ZAP container.
 */
const APP_ORIGIN = "http://127.0.0.1:3000";
const DOCKER_TARGET = "http://host.docker.internal:3000";
const ZAP_IMAGE = "ghcr.io/zaproxy/zaproxy:stable";
const CONTEXT_FILE = "local-only.context";

/**
 * @param {string[]} argv
 * @returns {{ ok: true, printOnly: boolean } | { ok: false, reason: string }}
 */
function parseRunLocalZapArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const unknown = args.filter((arg) => arg !== "--print-only");
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: "This script accepts no target. The only origin is http://127.0.0.1:3000.",
    };
  }
  return { ok: true, printOnly: args.includes("--print-only") };
}

/**
 * zap-baseline.py -t is the docker target (host.docker.internal). The only
 * permitted app origin is http://127.0.0.1:3000; any other requested origin
 * is rejected. -n loads scripts/zap/local-only.context before the spider.
 *
 * @param {string} contextDir absolute directory mounted at /zap/wrk
 * @param {string} [requestedOrigin]
 * @returns {string[]}
 */
function buildLocalZapDockerArgs(contextDir, requestedOrigin = APP_ORIGIN) {
  if (requestedOrigin !== APP_ORIGIN) {
    throw new Error("The only origin is http://127.0.0.1:3000.");
  }
  const volume = `${String(contextDir).replace(/\\/g, "/")}:/zap/wrk:ro`;
  return [
    "docker",
    "run",
    "--rm",
    "-t",
    "--add-host=host.docker.internal:host-gateway",
    "-v",
    volume,
    ZAP_IMAGE,
    "zap-baseline.py",
    "-t",
    DOCKER_TARGET,
    "-n",
    CONTEXT_FILE,
  ];
}

/**
 * @param {string} contextDir
 * @returns {string}
 */
function formatLocalZapDockerCommand(contextDir) {
  return buildLocalZapDockerArgs(contextDir)
    .map((part) => (part.includes(":/zap/") || /[\s"]/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part))
    .join(" ");
}

/**
 * Addresses listening on `port` that are not loopback. `0.0.0.0` and `::`
 * count as non-loopback. The input is netstat text; this function does not
 * inspect the machine.
 *
 * @param {string} netstatText
 * @param {number} [port]
 * @returns {string[]}
 */
function nonLoopbackPortListeners(netstatText, port = 3000) {
  const wanted = String(port);
  const offenders = [];
  for (const line of String(netstatText).split(/\r?\n/)) {
    if (!/\bLISTENING\b/i.test(line)) continue;
    const match = line.match(/TCP\s+(\[[^\]]+\]|\d{1,3}(?:\.\d{1,3}){3}):(\d+)\b/i);
    if (!match || match[2] !== wanted) continue;
    const address = match[1].replace(/^\[|\]$/g, "").toLowerCase();
    if (address === "127.0.0.1" || address === "::1") continue;
    offenders.push(address);
  }
  return offenders;
}

module.exports = {
  APP_ORIGIN,
  DOCKER_TARGET,
  ZAP_IMAGE,
  CONTEXT_FILE,
  parseRunLocalZapArgs,
  buildLocalZapDockerArgs,
  formatLocalZapDockerCommand,
  nonLoopbackPortListeners,
};
