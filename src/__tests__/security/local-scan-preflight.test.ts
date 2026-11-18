/**
 * Local scan preflight rules. Literal fake URLs only — this file does not
 * read the repo .env.
 */

const {
  parseDotenv,
  evaluateLocalScanPreflight,
  mergeNextDevEnv,
} = require("../../../scripts/local-scan-preflight-rules.cjs");
const {
  APP_ORIGIN,
  DOCKER_TARGET,
  ZAP_IMAGE,
  parseRunLocalZapArgs,
  buildLocalZapDockerArgs,
  nonLoopbackPortListeners,
} = require("../../../scripts/local-zap-command.cjs");

const LOCAL_DB = "postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test";
const LOCAL_DIRECT = "postgresql://scanner:fake-secret@localhost:5432/pen_test";
const PREVIEW_POOLED =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech/neondb";
const PREVIEW_DIRECT =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao.c-5.us-east-1.aws.neon.tech/neondb";
const BOLD_OTHER_REGION =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.eu-central-1.aws.neon.tech/neondb";
const BOLD_OTHER_REGION_DIRECT =
  "postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao.eu-central-1.aws.neon.tech/neondb";
const ICY_POOL =
  "postgresql://scanner:fake-secret@ep-icy-flower-amjka8db-pooler.c-5.us-east-1.aws.neon.tech/neondb";
const ICY_DIRECT =
  "postgresql://scanner:fake-secret@ep-icy-flower-amjka8db.c-5.us-east-1.aws.neon.tech/neondb";

const HOST_REASON = "host is not localhost, 127.0.0.1, or an ep-icy-flower Neon host";
const QUERY_REASON = "query host names a different host";

function reasonsFor(result: { failures: Array<{ key: string; reason: string }> }, key: string) {
  return result.failures.filter((failure) => failure.key === key).map((failure) => failure.reason);
}

function cleanFiles(overrides: Record<string, string> = {}) {
  return {
    ".env": [`DATABASE_URL=${LOCAL_DB}`, `DIRECT_URL=${LOCAL_DIRECT}`].join("\n"),
    ...overrides,
  };
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

  it("passes ep-icy-flower pooler and direct hostnames for both database URLs", () => {
    expect(
      evaluateLocalScanPreflight({
        DATABASE_URL: ICY_POOL,
        DIRECT_URL: ICY_DIRECT,
      }).ok
    ).toBe(true);
    expect(
      evaluateLocalScanPreflight({
        DATABASE_URL: ICY_DIRECT,
        DIRECT_URL: ICY_POOL,
      }).ok
    ).toBe(true);
  });

  it("fails when DATABASE_URL is the shared preview pooler", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: PREVIEW_POOLED,
      DIRECT_URL: LOCAL_DIRECT,
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([HOST_REASON]);
  });

  it("fails when DIRECT_URL is the shared preview direct host", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: PREVIEW_DIRECT,
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([HOST_REASON]);
  });

  it("rejects ep-bold-feather in another region", () => {
    const database = evaluateLocalScanPreflight({
      DATABASE_URL: BOLD_OTHER_REGION,
      DIRECT_URL: LOCAL_DIRECT,
    });
    expect(database.ok).toBe(false);
    expect(reasonsFor(database, "DATABASE_URL")).toEqual([HOST_REASON]);

    const direct = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: BOLD_OTHER_REGION_DIRECT,
    });
    expect(direct.ok).toBe(false);
    expect(reasonsFor(direct, "DIRECT_URL")).toEqual([HOST_REASON]);
  });

  it("rejects an arbitrary Neon host", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL:
        "postgresql://scanner:fake-secret@ep-local-scan-pooler.c-5.us-east-1.aws.neon.tech/neondb",
      DIRECT_URL: "postgresql://scanner:fake-secret@ep-local-scan.c-5.us-east-1.aws.neon.tech/neondb",
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([HOST_REASON]);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([HOST_REASON]);
  });

  it("rejects an ep-icy-flower hostname outside neon.tech", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: "postgresql://scanner:fake-secret@ep-icy-flower.example.test/neondb",
      DIRECT_URL: LOCAL_DIRECT,
    });
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([HOST_REASON]);
  });

  it("fails when a query host names a different host", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL:
        "postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test?host=ep-bold-feather-amv9wmao.eu-central-1.aws.neon.tech",
      DIRECT_URL:
        "postgresql://scanner:fake-secret@localhost:5432/pen_test?host=ep-bold-feather-amv9wmao.eu-central-1.aws.neon.tech",
    });
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([QUERY_REASON]);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([QUERY_REASON]);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
    expect(JSON.stringify(result)).not.toContain("ep-bold-feather");
  });

  it("allows a query host that repeats the URL host", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: "postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test?host=127.0.0.1",
      DIRECT_URL: "postgresql://scanner:fake-secret@localhost:5432/pen_test?host=localhost",
    });
    expect(result.ok).toBe(true);
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

  it("fails when CRON_SECRET or SETUP_SECRET is nonempty", () => {
    for (const key of ["CRON_SECRET", "SETUP_SECRET"]) {
      const result = evaluateLocalScanPreflight({
        DATABASE_URL: LOCAL_DB,
        DIRECT_URL: LOCAL_DIRECT,
        [key]: "not-empty-fake",
      });
      expect(result.ok).toBe(false);
      expect(reasonsFor(result, key)).toEqual(["must be empty"]);
      expect(JSON.stringify(result)).not.toContain("not-empty-fake");
    }
  });

  it("still fails when SMTP_USER or SMTP_PASS is nonempty", () => {
    const result = evaluateLocalScanPreflight({
      DATABASE_URL: LOCAL_DB,
      DIRECT_URL: LOCAL_DIRECT,
      SMTP_USER: "smtp-user-fake",
      SMTP_PASS: "smtp-pass-fake",
    });
    expect(reasonsFor(result, "SMTP_USER")).toEqual(["must be empty"]);
    expect(reasonsFor(result, "SMTP_PASS")).toEqual(["must be empty"]);
    expect(JSON.stringify(result)).not.toContain("smtp-user-fake");
    expect(JSON.stringify(result)).not.toContain("smtp-pass-fake");
  });

  it("keeps a real local DATABASE_URL when slash-prefixed lines surround it", () => {
    const parsed = parseDotenv(
      [
        "//DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.eu-central-1.aws.neon.tech/before",
        "DATABASE_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test",
        "//DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.eu-central-1.aws.neon.tech/after",
        "DIRECT_URL=postgresql://scanner:fake-secret@localhost:5432/pen_test",
      ].join("\n")
    );
    expect(new URL(parsed.DATABASE_URL).hostname).toBe("127.0.0.1");
    expect(parsed["//DATABASE_URL"]).toBeUndefined();
    const result = evaluateLocalScanPreflight(parsed);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
  });

  it("fails closed when the only database line is a slash-prefixed key", () => {
    const parsed = parseDotenv(
      [
        "//DATABASE_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test",
        "DIRECT_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test",
      ].join("\n")
    );
    expect(parsed.DATABASE_URL).toBeUndefined();
    const result = evaluateLocalScanPreflight(parsed);
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual(["is not set"]);
  });

  it("lets the last DATABASE_URL win, so a later preview host fails", () => {
    const parsed = parseDotenv(
      [
        "# DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.c-5.us-east-1.aws.neon.tech/comment",
        "DATABASE_URL=postgresql://scanner:fake-secret@127.0.0.1:5432/first-local",
        "DATABASE_URL=postgresql://scanner:fake-secret@ep-bold-feather-amv9wmao-pooler.ap-southeast-1.aws.neon.tech/later-preview",
        'DIRECT_URL="postgresql://scanner:fake-secret@127.0.0.1:5432/pen_test"',
      ].join("\n")
    );
    expect(new URL(parsed.DATABASE_URL).hostname).toContain("ap-southeast-1");
    expect(parsed.DIRECT_URL.startsWith("postgresql://")).toBe(true);
    const result = evaluateLocalScanPreflight(parsed);
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([HOST_REASON]);
    expect(reasonsFor(result, "DIRECT_URL")).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
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

describe("mergeNextDevEnv", () => {
  it("fails when .env.local overrides a clean DATABASE_URL with a preview host", () => {
    const merged = mergeNextDevEnv({
      files: cleanFiles({ ".env.local": `DATABASE_URL=${BOLD_OTHER_REGION}` }),
      processEnv: {},
    });
    const result = evaluateLocalScanPreflight(merged);
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "DATABASE_URL")).toEqual([HOST_REASON]);
    expect(JSON.stringify(result)).not.toContain("fake-secret");
  });

  it("lets .env.development.local override .env.local", () => {
    const merged = mergeNextDevEnv({
      files: cleanFiles({
        ".env.local": `DATABASE_URL=${BOLD_OTHER_REGION}`,
        ".env.development.local": `DATABASE_URL=${LOCAL_DB}`,
      }),
      processEnv: {},
    });
    expect(new URL(merged.DATABASE_URL).hostname).toBe("127.0.0.1");
    expect(evaluateLocalScanPreflight(merged).ok).toBe(true);
  });

  it("fails when a guarded key is set in the process environment and the files are clean", () => {
    const merged = mergeNextDevEnv({
      files: cleanFiles(),
      processEnv: { CRON_SECRET: "cron-from-process-fake" },
    });
    const result = evaluateLocalScanPreflight(merged);
    expect(result.ok).toBe(false);
    expect(reasonsFor(result, "CRON_SECRET")).toEqual(["must be empty"]);
    expect(JSON.stringify(result)).not.toContain("cron-from-process-fake");
  });

  it("lets a process DATABASE_URL override a clean file", () => {
    const merged = mergeNextDevEnv({
      files: cleanFiles(),
      processEnv: { DATABASE_URL: BOLD_OTHER_REGION },
    });
    expect(new URL(merged.DATABASE_URL).hostname).toContain("eu-central-1");
    expect(evaluateLocalScanPreflight(merged).ok).toBe(false);
  });

  it("does not apply .env.production.local", () => {
    const merged = mergeNextDevEnv({
      files: cleanFiles({
        ".env.production.local": [`DATABASE_URL=${BOLD_OTHER_REGION}`, "OPENAI_API_KEY=sk-prod-local-fake"].join(
          "\n"
        ),
      }),
      processEnv: {},
    });
    expect(merged.OPENAI_API_KEY).toBeUndefined();
    expect(new URL(merged.DATABASE_URL).hostname).toBe("127.0.0.1");
    expect(evaluateLocalScanPreflight(merged).ok).toBe(true);
    expect(JSON.stringify(evaluateLocalScanPreflight(merged))).not.toContain("sk-prod-local-fake");
  });
});

describe("local ZAP command", () => {
  it("builds a baseline command for the docker target and keeps the app origin on loopback", () => {
    expect(APP_ORIGIN).toBe("http://127.0.0.1:3000");
    expect(DOCKER_TARGET).toBe("http://host.docker.internal:3000");
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

  it("rejects any requested origin other than http://127.0.0.1:3000", () => {
    expect(() => buildLocalZapDockerArgs("C:/src/tutoring-notes/scripts/zap", "http://10.1.2.3:3000")).toThrow(
      /http:\/\/127\.0\.0\.1:3000/
    );
    expect(() =>
      buildLocalZapDockerArgs("C:/src/tutoring-notes/scripts/zap", "http://host.docker.internal:3000")
    ).toThrow(/http:\/\/127\.0\.0\.1:3000/);
  });

  it("accepts no target argument", () => {
    expect(parseRunLocalZapArgs([]).ok).toBe(true);
    expect(parseRunLocalZapArgs(["--print-only"])).toEqual({ ok: true, printOnly: true });
    const refused = parseRunLocalZapArgs(["--print-only", "http://127.0.0.1:3000"]);
    expect(refused.ok).toBe(false);
  });

  it("reports non-loopback listeners on port 3000 and ignores loopback", () => {
    const text = [
      "  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       1",
      "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       2",
      "  TCP    [::1]:3000             [::]:0                 LISTENING       3",
      "  TCP    [::]:3000              [::]:0                 LISTENING       4",
      "  TCP    192.168.1.20:3000      0.0.0.0:0              LISTENING       5",
      "  TCP    127.0.0.1:5432         0.0.0.0:0              LISTENING       6",
    ].join("\n");
    expect(nonLoopbackPortListeners(text, 3000)).toEqual(["0.0.0.0", "::", "192.168.1.20"]);
    expect(
      nonLoopbackPortListeners(
        "  TCP    127.0.0.1:3000         0.0.0.0:0              LISTENING       1\n  TCP    [::1]:3000             [::]:0                 LISTENING       3\n",
        3000
      )
    ).toEqual([]);
  });
});
