"use strict";

/**
 * Endpoints for one Playwright / Jest stack.
 *
 * Unset env keeps today's values: dev 3100 + 3101, relay 3002
 * (container wb-relay-local), prod-shape 3102, Playwright database
 * tutoring_notes, Jest database tutoring_notes_test, output dir
 * test-results. Set PW_* to run another stack beside that one.
 * The relay image still listens on 3002 inside the container; only the
 * published host port changes.
 */

const LOCAL_USER = "postgres";
const LOCAL_PASSWORD = "postgres";
const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 5432;

function envGet(env, name) {
  const raw = env[name];
  if (raw == null) return "";
  return String(raw).trim();
}

function readPort(env, name, fallback) {
  const raw = envGet(env, name);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a TCP port, got ${raw}`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) {
    throw new Error(`${name} must be a TCP port, got ${raw}`);
  }
  return port;
}

function readDbName(env, fallback) {
  const name = envGet(env, "PW_DB_NAME") || fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`PW_DB_NAME must be a PostgreSQL identifier, got ${name}`);
  }
  return name;
}

function localDatabaseUrl(dbName) {
  return `postgresql://${LOCAL_USER}:${LOCAL_PASSWORD}@${LOCAL_HOST}:${LOCAL_PORT}/${dbName}`;
}

function playwrightDatabaseUrl(env = process.env) {
  return localDatabaseUrl(readDbName(env, "tutoring_notes"));
}

function jestDatabaseUrl(env = process.env) {
  const explicit = envGet(env, "TEST_DATABASE_URL");
  if (explicit) return explicit;
  return localDatabaseUrl(readDbName(env, "tutoring_notes_test"));
}

function resolvePwStack(env = process.env) {
  const port = readPort(env, "PW_PORT", 3100);
  const altPort = envGet(env, "PW_ALT_PORT")
    ? readPort(env, "PW_ALT_PORT", 0)
    : port === 3100
      ? 3101
      : port + 1;
  const relayPort = readPort(env, "PW_RELAY_PORT", 3002);
  const prodShapePort = readPort(env, "PW_PROD_SHAPE_PORT", 3102);

  if (altPort < 1 || altPort > 65535) {
    throw new Error(`Derived PW_ALT_PORT ${altPort} is not a TCP port`);
  }

  const claimed = [
    ["PW_PORT", port],
    ["PW_ALT_PORT", altPort],
    ["PW_RELAY_PORT", relayPort],
    ["PW_PROD_SHAPE_PORT", prodShapePort],
  ];
  const seen = new Map();
  for (const [label, value] of claimed) {
    if (seen.has(value)) {
      throw new Error(
        `${label} ${value} collides with ${seen.get(value)} (dev servers must not use the relay port)`,
      );
    }
    seen.set(value, label);
  }

  const outputDir = envGet(env, "PW_OUTPUT_DIR") || "test-results";
  const reportDir = envGet(env, "PW_REPORT_DIR") || null;
  const authDir = (envGet(env, "PW_AUTH_DIR") || "tests/integration/.auth").replace(/\\/g, "/").replace(/\/$/, "");
  const distDir = envGet(env, "PW_DIST_DIR") || null;

  return {
    port,
    altPort,
    relayPort,
    prodShapePort,
    origin: `http://localhost:${port}`,
    altOrigin: `http://localhost:${altPort}`,
    prodShapeOrigin: `http://localhost:${prodShapePort}`,
    syncUrl: `ws://localhost:${relayPort}`,
    relayHttpUrl: `http://localhost:${relayPort}/`,
    relayContainerName: relayPort === 3002 ? "wb-relay-local" : `wb-relay-local-${relayPort}`,
    outputDir,
    reportDir,
    authDir,
    distDir,
  };
}

function authStatePath(fileName, env = process.env) {
  return `${resolvePwStack(env).authDir}/${fileName}`;
}

function harnessOrigin(env = process.env) {
  const configured = envGet(env, "NEXTAUTH_URL");
  if (configured) return configured.replace(/\/$/, "");
  return resolvePwStack(env).origin;
}

function relayHttpUrl(env = process.env) {
  return resolvePwStack(env).relayHttpUrl;
}

function relayDockerArgs(env = process.env) {
  const stack = resolvePwStack(env);
  return [
    "run",
    "--rm",
    "--name",
    stack.relayContainerName,
    "-p",
    `${stack.relayPort}:3002`,
    "-e",
    "PORT=3002",
    "-e",
    `CORS_ORIGIN=${stack.origin}`,
    "wb-relay-local",
  ];
}

function allowedDevPorts(env = process.env) {
  const stack = resolvePwStack(env);
  return [stack.port, stack.altPort];
}

function assertAllowedPort(port, env = process.env) {
  const stack = resolvePwStack(env);
  const allowed = allowedDevPorts(env);
  if (port === stack.relayPort || !allowed.includes(port)) {
    const why =
      port === stack.relayPort
        ? `that port is the Docker relay. Port ${stack.relayPort} (Docker relay) must NEVER be targeted.`
        : `allowlist is [${allowed.join(", ")}] only. Port ${stack.relayPort} (Docker relay) must NEVER be targeted.`;
    throw new Error(`[free-wb-dev-server-ports] REFUSED port ${port} — ${why}`);
  }
}

function buildWbDevServerCommand(options) {
  const env = options.env || process.env;
  const stack = resolvePwStack(env);
  const databaseUrl = playwrightDatabaseUrl(env);
  const port = options.port;
  const solo = options.soloUntilStudent
    ? "set NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1&& "
    : "";
  return (
    `cmd /c "set DATABASE_URL=${databaseUrl}&& set DIRECT_URL=${databaseUrl}` +
    `&& set TOTP_ENCRYPTION_KEY=${options.totpKey}` +
    `&& set TWILIO_ACCOUNT_SID=${options.twilioSid}` +
    `&& set TWILIO_AUTH_TOKEN=${options.twilioToken}` +
    `&& set TWILIO_FROM_NUMBER=${options.twilioFrom}` +
    `&& set OPERATOR_EMAILS=playwright@test.local,playwright-erasure-admin@test.local` +
    `&& set WHITEBOARD_SYNC_URL=${stack.syncUrl}&& ${solo}` +
    `set NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1` +
    `&& set WB_E2E_HARNESS=1` +
    `&& set PLAYWRIGHT_TEST=1` +
    `&& set PLAYWRIGHT_TEST_SECRET=playwright-test-secret` +
    `&& set BLOB_HARNESS_LOCAL=1` +
    `&& set BLOB_READ_WRITE_TOKEN=playwright-harness` +
    `&& set CRON_SECRET=${options.cronSecret}` +
    `&& set NEXT_PUBLIC_PLAYWRIGHT_TEST=1` +
    `&& set NEXT_PUBLIC_BLOB_HARNESS_LOCAL=1` +
    `&& set NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true` +
    `&& set NEXTAUTH_URL=http://localhost:${port}` +
    `&& set GOOGLE_CLIENT_ID=playwright-harness-google-client-id` +
    `&& set GOOGLE_CLIENT_SECRET=playwright-harness-google-client-secret` +
    `&& set LEARNER_SESSION_HMAC_SECRET=pw-wb-test-hmac-secret-regression-2026` +
    `&& set AH_SESSION_HMAC_SECRET=pw-wb-test-ah-hmac-secret-regression-2026` +
    `&& node scripts/wb-regression-assert-local-db.cjs` +
    `&& npx prisma db push --skip-generate --accept-data-loss` +
    `&& node scripts/apply-org-learner-guards.cjs` +
    `&& npm run dev -- --port ${port}"`
  );
}

function buildProdShapeServerCommand(options) {
  const env = options.env || process.env;
  const stack = resolvePwStack(env);
  const databaseUrl = playwrightDatabaseUrl(env);
  const buildStep = options.buildStep ?? "";
  return (
    `cmd /c "set DATABASE_URL=${databaseUrl}&& set DIRECT_URL=${databaseUrl}` +
    `&& set TOTP_ENCRYPTION_KEY=${options.totpKey}` +
    `&& set NEXTAUTH_URL=${stack.prodShapeOrigin}` +
    `&& set NEXTAUTH_SECRET=${options.nextAuthSecret}` +
    `&& set WHITEBOARD_SYNC_URL=${stack.syncUrl}` +
    `&& set GOOGLE_CLIENT_ID=prod-shape-google-client-id` +
    `&& set GOOGLE_CLIENT_SECRET=prod-shape-google-client-secret` +
    `&& set LEARNER_SESSION_HMAC_SECRET=pw-prod-shape-hmac-secret-2026` +
    `&& set AH_SESSION_HMAC_SECRET=pw-prod-shape-ah-hmac-secret-2026` +
    `&& node scripts/wb-regression-assert-local-db.cjs` +
    `&& npx prisma db push --skip-generate --accept-data-loss` +
    `&& node scripts/apply-org-learner-guards.cjs` +
    `&& ${buildStep}npx next start --port ${stack.prodShapePort}"`
  );
}

module.exports = {
  allowedDevPorts,
  assertAllowedPort,
  authStatePath,
  buildProdShapeServerCommand,
  buildWbDevServerCommand,
  harnessOrigin,
  jestDatabaseUrl,
  playwrightDatabaseUrl,
  relayDockerArgs,
  relayHttpUrl,
  resolvePwStack,
};
