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
 * zap-baseline.py -t is the scan origin. -n loads scripts/zap/local-only.context
 * before the spider; the baseline spider then stays in that context, which
 * includes only http://host.docker.internal:3000.
 *
 * @param {string} contextDir absolute directory mounted at /zap/wrk
 * @returns {string[]}
 */
function buildLocalZapDockerArgs(contextDir) {
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

module.exports = {
  APP_ORIGIN,
  DOCKER_TARGET,
  ZAP_IMAGE,
  CONTEXT_FILE,
  parseRunLocalZapArgs,
  buildLocalZapDockerArgs,
  formatLocalZapDockerCommand,
};
