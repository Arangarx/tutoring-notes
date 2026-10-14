/**
 * Local scan preflight rules. Literal fake URLs only — this file does not
 * read the repo .env.
 */

const {
  parseDotenv,
  evaluateLocalScanPreflight,
} = require("../../../scripts/local-scan-preflight-rules.cjs");
const {
  APP_ORIGIN,
  DOCKER_TARGET,
  ZAP_IMAGE,
  parseRunLocalZapArgs,
  buildLocalZapDockerArgs,
} = require("../../../scripts/local-zap-command.cjs");

const LOCAL_DB = "postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test";
const LOCAL_DIRECT = "postgresql://scanner:fake-secret@localhost:5432/pen_test";
const PREVIEW_POOLED =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech/neondb";
const PREVIEW_DIRECT =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao.c-5.us-east-1.aws.neon.tech/neondb";

function reasonsFor(result: { failures: Array<{ key: string; reason: string }> }, key: string) {
  return result.failures.filter((failure) => failure.key === key).map((failure) => failure.reason);
}

describe("evaluateLocalScanPreflight", () => {
  it("passes a localhost database with shared keys empty", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: LOCAL_DIRECT,
      NEXTAUTH_URL: "http://localhost:3000",
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when DATABASE_URL is the shared preview pooler", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: PREVIEW_POOLED,
      DIRECT_URL: LOCAL_DIRECT,
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual(["host is the shared preview database"]);
  });

  it("fails when DIRECT_URL is the shared preview direct host", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: PREVIEW_DIRECT,
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual(["host is the shared preview database"]);
  });

  it("fails when OPENAI_API_KEY is nonempty", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: LOCAL_DIRECT,
      OPENAI_API_KEY: "sk-fake-local-scan",
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "OPENAI_API_KEY")).toEqual(["must be empty"]);
    expect(JSON.stringify(result)).not.toContain("sk-fake-local-scan");
  });

  it("does not let a slash comment hide a real DATABASE_URL", () => {
    const parsed = parseDotenv(
      [
        "DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech/neondb",
        "DIRECT_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test",
      ].join("\n")
    );
    const result = evaluateLocalScanPreflight(parsed);
    expect(parsed.DATABASE_URL).toContain("ep-bold-feather-amv9wmao-pooler");
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual(["host is the shared preview database"]);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
  });

  it("treats a # line as a comment and keeps the first real assignment", () => {
    const parsed = parseDotenv(
      [
        "# DATABASE_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/decoy",
        "DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech/neondb",
        "DATABASE_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/later",
        'DIRECT_URL="postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test"',
      ].join("\n")
    );
    expect(parsed.DATABASE_URL).toContain("ep-bold-feather-amv9wmao-pooler");
    expect(parsed.DIRECT_URL.startsWith("postgresql://")).toBe(true);
    const result = evaluateLocalScanPreflight(parsed);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual(["host is the shared preview database"]);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([]);
  });

  it("passes a Neon pooler DATABASE_URL and a Neon direct DIRECT_URL that are not the preview hosts", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL:
        "postgresql://scanner:fake-secret@ep-local-scan-pooler.c-5.us-east-1.aws.neon.tech/neondb",
      DIRECT_URL: "postgresql://scanner:fake-secret@ep-local-scan.c-5.us-east-1.aws.neon.tech/neondb",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a Neon direct host for DATABASE_URL and a Neon pooler host for DIRECT_URL", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: "postgresql://scanner:fake-secret@ep-local-scan.c-5.us-east-1.aws.neon.tech/neondb",
      DIRECT_URL:
        "postgresql://scanner:fake-secret@ep-local-scan-pooler.c-5.us-east-1.aws.neon.tech/neondb",
    });
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([
      "host must be localhost or a Neon pooler host",
    ]);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([
      "host must be localhost or a Neon direct host",
    ]);
  });

  it("rejects a remote NEXTAUTH_URL and a nonempty shared token", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: LOCAL_DIRECT,
      NEXTAUTH_URL: "https://tutoring-notes.example.test",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_fake",
    });
    expect(reasonsFor(result, "NEXTAUTH_URL")).toEqual(["host must be localhost"]);
    expect(reasonsFor(result, "BLOB_READ_WRITE_TOKEN")).toEqual(["must be empty"]);
  });
});

describe("local ZAP command", () => {
  it("builds a baseline command for the one docker origin", () => {
    const args = buildLocalZapDockerArgs("C:/src/tutoring-notes/scripts/zap");
    expect(args).toContain(ZAP_IMAGE);
    expect(args).toContain("zap-baseline.py");
    const targets = args.filter((arg: string) => arg.startsWith("http://") || arg.startsWith("https://"));
    expect(targets).toEqual([DOCKER_TARGET]);
    expect(args).toContain("-n");
    expect(args).toContain("local-only.context");
    expect(args.join(" ")).not.toContain(APP_ORIGIN);
    expect(ZAP_IMAGE).toBe("ghcr.io/zaproxy/zaproxy:stable");
  });

  it("accepts no target argument", () => {
    expect(parseRunLocalZapArgs([]).ok).toBe(true);
    expect(parseRunLocalZapArgs(["--print-only"])).toEqual({ ok: true, printOnly: true });
    const refused = parseRunLocalZapArgs(["--print-only", "http://127.0.0.1:3000"]);
    expect(refused.ok).toBe(false);
  });
});
