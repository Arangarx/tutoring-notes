/**
 * Tests for housekeeping scripts blob-cleanup + branch-sweep guardrails / pure helpers.
 */

import path from "node:path";
import { spawnSync } from "node:child_process";

function runBlobCli(
  argv: string[],
  envOverrides: Record<string, string | undefined>
) {
  const scriptPath = path.join(process.cwd(), "scripts", "blob-cleanup.mjs");
  const merged = { ...process.env } as NodeJS.ProcessEnv;
  Object.entries(envOverrides).forEach(([key, val]) => {
    if (val === undefined || val === "") {
      delete merged[key];
    } else {
      merged[key] = val;
    }
  });
  return spawnSync(process.execPath, [scriptPath, ...argv], {
    encoding: "utf-8",
    env: merged,
  });
}

function runBranchSweep(argv: string[]) {
  const scriptPath = path.join(process.cwd(), "scripts", "branch-sweep.mjs");
  return spawnSync(process.execPath, [scriptPath, ...argv], {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: process.env,
  });
}

describe("blob-cleanup.mjs CLI", () => {
  it("refuses contradictory --dry-run with --delete", () => {
    const r = runBlobCli(["--dry-run", "--delete"], {});
    expect(r.status).toBe(1);
    expect(String(r.stderr + r.stdout).toLowerCase()).toContain("contradict");
  });

  it("hard-exits when PROD_DATABASE_URL missing", () => {
    const r = runBlobCli(
      [],
      {
        DEV_DATABASE_URL: "postgresql://nope@127.0.0.1:5555/x",
        PROD_DATABASE_URL: undefined,
        BLOB_READ_WRITE_TOKEN: "tok",
      }
    );
    expect(r.status).toBe(1);
    const blob = `${r.stderr}\n${r.stdout}`;
    expect(blob).toMatch(/DUAL-DB CHECK REQUIRED/i);
  });

  it("hard-exits when DEV_DATABASE_URL missing", () => {
    const r = runBlobCli(
      [],
      {
        DEV_DATABASE_URL: undefined,
        PROD_DATABASE_URL: "postgresql://nope@127.0.0.1:5555/x",
        BLOB_READ_WRITE_TOKEN: "tok",
      }
    );
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toMatch(/DUAL-DB CHECK REQUIRED/i);
  });

  it("hard-exits when prod and dev urls match", () => {
    const u = "postgresql://same@s/s";
    const r = runBlobCli(
      [],
      {
        PROD_DATABASE_URL: u,
        DEV_DATABASE_URL: u,
        BLOB_READ_WRITE_TOKEN: "ignored",
      }
    );
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`).toMatch(/equals DEV_DATABASE_URL|meaningless/i);
  });
});

/** Mirror of scripts/blob-cleanup-logic exports for typing tests only */
interface BlobCleanupLogicModule {
  referencedWhere(
    url: string,
    prodRefs: Set<string>,
    devRefs: Set<string>
  ): "prod" | "dev" | "prod,dev" | null;
  isOrphanCandidate(
    url: string,
    prodRefs: Set<string>,
    devRefs: Set<string>,
    uploadedAt: Date,
    minAgeMs: number
  ): boolean;
  refuseDeletionOverCap(
    orphanCount: number,
    maxDeletions: number,
    noLimit: boolean
  ): boolean;
  applyDeletionCap(
    orphans: { url: string; size: number; uploadedAt: Date }[],
    maxDeletions: number,
    noLimit: boolean
  ): {
    selected: typeof orphans;
    refusedExcess: number;
  };
}

describe("blob-cleanup-logic helpers", () => {
  let mod!: BlobCleanupLogicModule;

  beforeAll(async () => {
    // @ts-expect-error Housekeeping `.mjs` modules ship without DTS; interface above mirrors exports.
    const loaded = await import("../../../scripts/blob-cleanup-logic.mjs");
    mod = loaded as BlobCleanupLogicModule;
  });

  it("referencedWhere distinguishes prod/dev/both/absent", () => {
    const prod = new Set(["https://blob/x"]);
    const dev = new Set(["https://blob/y"]);
    expect(mod.referencedWhere("https://blob/x", prod, dev)).toBe("prod");
    expect(mod.referencedWhere("https://blob/y", prod, dev)).toBe("dev");
    prod.add("https://blob/z");
    dev.add("https://blob/z");
    expect(mod.referencedWhere("https://blob/z", prod, dev)).toBe("prod,dev");
    expect(mod.referencedWhere("https://blob/orphan", prod, dev)).toBe(null);
  });

  it("isOrphanCandidate honors min-age-days", () => {
    const empty = new Set<string>();
    const old = new Date(Date.now() - 10 * 86400 * 1000);
    const young = new Date(Date.now() - 1 * 86400 * 1000);
    const minAgeMs = 7 * 86400 * 1000;

    expect(
      mod.isOrphanCandidate(
        "https://a",
        empty,
        empty,
        old,
        minAgeMs
      )
    ).toBe(true);
    expect(
      mod.isOrphanCandidate(
        "https://a",
        empty,
        empty,
        young,
        minAgeMs
      )
    ).toBe(false);
    const prod = new Set(["https://prod-only"]);
    expect(
      mod.isOrphanCandidate(
        "https://prod-only",
        prod,
        empty,
        old,
        minAgeMs
      )
    ).toBe(false);
    const dev = new Set(["https://dev-only"]);
    expect(
      mod.isOrphanCandidate(
        "https://dev-only",
        empty,
        dev,
        old,
        minAgeMs
      )
    ).toBe(false);
  });

  it("refuses deletion caps without --no-limit", () => {
    expect(mod.refuseDeletionOverCap(60, 50, false)).toBe(true);
    expect(mod.refuseDeletionOverCap(10, 50, false)).toBe(false);
    expect(mod.refuseDeletionOverCap(9999, 50, true)).toBe(false);
  });

  it("applyDeletionCap keeps oldest orphans first when truncating", () => {
    const mk = (
      /** @type {string} */
      url: string,
      /** @type {number} */
      daysAgo: number,
      /** @type {number} */
      sizeBytes: number
    ) => ({
      url,
      uploadedAt: new Date(Date.now() - daysAgo * 86400 * 1000),
      size: sizeBytes,
    });
    const orphans = [
      mk("https://new", 1, 1),
      mk("https://mid", 5, 1),
      mk("https://ancient", 20, 1),
    ];

    const res = mod.applyDeletionCap(orphans, 2, false);
    expect(res.selected.map((x: { url: string }) => x.url)).toEqual([
      "https://ancient",
      "https://mid",
    ]);
    expect(res.refusedExcess).toBe(1);
  });
});

describe("branch-sweep.mjs CLI guardrails", () => {
  it("refuses contradictory --dry-run with --delete", () => {
    const r = runBranchSweep(["--dry-run", "--delete"]);
    expect(r.status).toBe(1);
    expect(`${r.stderr}${r.stdout}`.toLowerCase()).toMatch(/dry-run.+delete together|contradict/);
  });
});
