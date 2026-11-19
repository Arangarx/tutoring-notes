/**
 * Parallel Playwright stacks. The oracle is the endpoint a run would
 * actually bind or refuse — not a copy of the resolver's private tables.
 *
 * Unset env must keep today's endpoints. A second stack's env must move
 * every shared resource (dev port, relay, database, output dir) together.
 */

export {};

const {
  assertAllowedPort,
  allowedDevPorts,
  authStatePath,
  buildProdShapeServerCommand,
  buildWbDevServerCommand,
  harnessOrigin,
  jestDatabaseUrl,
  playwrightDatabaseUrl,
  relayDockerArgs,
  resolvePwStack,
} = require("../../scripts/pw-stack.cjs");
const {
  assertLocalDatabaseUrlForHarness,
} = require("../../scripts/wb-regression-local-db.cjs");

const FIXTURE_SECRETS = {
  totpKey: "totp-key",
  twilioSid: "ACfixture",
  twilioToken: "twilio-token",
  twilioFrom: "+15555550100",
  cronSecret: "cron-secret",
};

function databaseName(url: string): string {
  return new URL(url.replace(/^postgres:\/\//, "postgresql://")).pathname.replace(/^\//, "");
}

describe("playwright stack endpoints", () => {
  it("keeps today's ports, relay, databases, and output dir when no stack env is set", () => {
    const stack = resolvePwStack({});
    expect(stack.origin).toBe("http://localhost:3100");
    expect(stack.altOrigin).toBe("http://localhost:3101");
    expect(stack.syncUrl).toBe("ws://localhost:3002");
    expect(stack.relayHttpUrl).toBe("http://localhost:3002/");
    expect(stack.prodShapeOrigin).toBe("http://localhost:3102");
    expect(databaseName(playwrightDatabaseUrl({}))).toBe("tutoring_notes");
    expect(databaseName(jestDatabaseUrl({}))).toBe("tutoring_notes_test");
    expect(new URL(playwrightDatabaseUrl({})).hostname).toBe("127.0.0.1");
    expect(new URL(jestDatabaseUrl({})).hostname).toBe("127.0.0.1");
    expect(stack.outputDir).toBe("test-results");
    expect(stack.reportDir).toBeNull();
    expect(authStatePath("tutor.json", {})).toBe("tests/integration/.auth/tutor.json");
    expect(allowedDevPorts({})).toEqual([3100, 3101]);

    const args = relayDockerArgs({});
    expect(args).toEqual([
      "run",
      "--rm",
      "-p",
      "3002:3002",
      "-e",
      "PORT=3002",
      "-e",
      "CORS_ORIGIN=http://localhost:3100",
      "wb-relay-local",
    ]);

    const primary = buildWbDevServerCommand({
      env: {},
      port: stack.port,
      primary: true,
      ...FIXTURE_SECRETS,
    });
    const secondary = buildWbDevServerCommand({
      env: {},
      port: stack.altPort,
      primary: false,
      ...FIXTURE_SECRETS,
    });
    expect(primary).toContain("WHITEBOARD_SYNC_URL=ws://localhost:3002");
    expect(primary).toContain("NEXTAUTH_URL=http://localhost:3100");
    expect(primary).toContain("--port 3100");
    expect(primary).toContain("/tutoring_notes");
    expect(primary).not.toContain("tutoring_notes_test");
    expect(primary).toContain("NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1");
    expect(secondary).toContain("NEXTAUTH_URL=http://localhost:3101");
    expect(secondary).toContain("--port 3101");
    expect(secondary).not.toContain("NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT");
    // Today the alternate (:3101) server never set these; only :3100 does.
    expect(primary).toContain("NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true");
    expect(primary).toContain("GOOGLE_CLIENT_ID=");
    expect(secondary).not.toContain("NEXT_PUBLIC_CLAIM_INVITES_ENABLED");
    expect(secondary).not.toContain("GOOGLE_CLIENT_ID");
    expect(secondary).not.toContain("GOOGLE_CLIENT_SECRET");

    const prod = buildProdShapeServerCommand({
      env: {},
      nextAuthSecret: "prod-secret",
      totpKey: "totp-key",
      buildStep: "",
    });
    expect(prod).toContain("NEXTAUTH_URL=http://localhost:3102");
    expect(prod).toContain("WHITEBOARD_SYNC_URL=ws://localhost:3002");
    expect(prod).toContain("--port 3102");
  });

  it("moves every shared resource when a second stack sets env", () => {
    const env = {
      PW_PORT: "3200",
      PW_RELAY_PORT: "3012",
      PW_DB_NAME: "tutoring_notes_pw_a",
      PW_OUTPUT_DIR: "test-results-pw-a",
      PW_REPORT_DIR: "playwright-report-pw-a",
      PW_AUTH_DIR: "tests/integration/.auth-pw-a",
      PW_PROD_SHAPE_PORT: "3212",
    };
    const stack = resolvePwStack(env);
    expect(stack.origin).toBe("http://localhost:3200");
    expect(stack.altOrigin).toBe("http://localhost:3201");
    expect(stack.syncUrl).toBe("ws://localhost:3012");
    expect(stack.relayHttpUrl).toBe("http://localhost:3012/");
    expect(stack.prodShapeOrigin).toBe("http://localhost:3212");
    expect(databaseName(playwrightDatabaseUrl(env))).toBe("tutoring_notes_pw_a");
    expect(databaseName(jestDatabaseUrl(env))).toBe("tutoring_notes_pw_a");
    expect(stack.outputDir).toBe("test-results-pw-a");
    expect(stack.reportDir).toBe("playwright-report-pw-a");
    expect(authStatePath("learner.json", env)).toBe(
      "tests/integration/.auth-pw-a/learner.json",
    );
    expect(allowedDevPorts(env)).toEqual([3200, 3201]);
    expect(allowedDevPorts(env)).not.toContain(3012);

    const primary = buildWbDevServerCommand({
      env,
      port: stack.port,
      primary: true,
      ...FIXTURE_SECRETS,
    });
    expect(primary).toContain("WHITEBOARD_SYNC_URL=ws://localhost:3012");
    expect(primary).toContain("NEXTAUTH_URL=http://localhost:3200");
    expect(primary).toContain("--port 3200");
    expect(primary).toContain("/tutoring_notes_pw_a");
    expect(primary).not.toContain("localhost:3100");
    expect(primary).not.toContain("localhost:3002");

    const args = relayDockerArgs(env);
    const nameAt = args.indexOf("--name");
    expect(args[nameAt + 1]).toBe("wb-relay-local-3012");
    expect(args).toContain("3012:3002");
    expect(args).toContain("CORS_ORIGIN=http://localhost:3200");

    const other = relayDockerArgs({ ...env, PW_RELAY_PORT: "3013" });
    expect(other[other.indexOf("--name") + 1]).not.toBe(args[nameAt + 1]);
  });

  it("lets PW_ALT_PORT override the derived second dev port", () => {
    const stack = resolvePwStack({ PW_PORT: "3200", PW_ALT_PORT: "3205" });
    expect(stack.origin).toBe("http://localhost:3200");
    expect(stack.altOrigin).toBe("http://localhost:3205");
  });

  it("prefers an explicit TEST_DATABASE_URL over PW_DB_NAME", () => {
    const url = jestDatabaseUrl({
      PW_DB_NAME: "tutoring_notes_pw_a",
      TEST_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_org_test",
    });
    expect(databaseName(url)).toBe("tutoring_notes_org_test");
  });

  it("refuses a non-local database host and refuses to free the relay port", () => {
    expect(() =>
      assertLocalDatabaseUrlForHarness(
        "postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb",
      ),
    ).toThrow(/non-local database/);

    expect(() => assertAllowedPort(3002, {})).toThrow(/relay/i);
    expect(() => assertAllowedPort(3012, { PW_RELAY_PORT: "3012", PW_PORT: "3200" })).toThrow(
      /relay/i,
    );
    expect(() => assertAllowedPort(3100, { PW_PORT: "3200" })).toThrow(/REFUSED/);
    expect(() => assertAllowedPort(3200, { PW_PORT: "3200" })).not.toThrow();
  });

  it("refuses a dev port that collides with the relay", () => {
    expect(() => resolvePwStack({ PW_PORT: "3002" })).toThrow(/relay/i);
  });

  it("addresses the stack dev server, not a developer NEXTAUTH_URL", () => {
    expect(harnessOrigin({})).toBe("http://localhost:3100");
    expect(harnessOrigin({ NEXTAUTH_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3100",
    );
    expect(
      harnessOrigin({
        NEXTAUTH_URL: "http://localhost:3000/",
        PW_PORT: "3200",
        PW_RELAY_PORT: "3012",
      }),
    ).toBe("http://localhost:3200");
    expect(
      harnessOrigin({
        NEXTAUTH_URL: "http://localhost:3000",
        PW_PORT: "3300",
        PW_RELAY_PORT: "3022",
      }),
    ).toBe("http://localhost:3300");
  });

  it("starts the alternate dev server only for the reopen-stroke spec", () => {
    const { gateEnvForFiles } = require("../../scripts/wb-relay-shard-run.cjs");
    expect(gateEnvForFiles(["integration/wb-consent-cron.spec.ts"]).WB_SKIP_3101_WEBSERVER).toBe(
      "1",
    );
    expect(
      gateEnvForFiles(["integration/wb-reopen-stroke-capture.spec.ts"]).WB_SKIP_3101_WEBSERVER,
    ).toBeUndefined();
    expect(
      gateEnvForFiles(["tests/integration/wb-reopen-stroke-capture.spec.ts"]).WB_SKIP_3101_WEBSERVER,
    ).toBeUndefined();
  });

  it("addresses the prod-shape server when that suite is the one under test", () => {
    expect(
      harnessOrigin({
        PW_PROD_SHAPE: "1",
        NEXTAUTH_URL: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3102");
    expect(
      harnessOrigin({
        PW_PROD_SHAPE: "1",
        NEXTAUTH_URL: "http://localhost:3000",
        PW_PORT: "3200",
        PW_RELAY_PORT: "3012",
        PW_PROD_SHAPE_PORT: "3212",
      }),
    ).toBe("http://localhost:3212");
  });
});
