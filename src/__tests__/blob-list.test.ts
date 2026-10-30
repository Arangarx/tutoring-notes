/**
 * @jest-environment node
 *
 * Consent wave C0 (§ 6 infra, § 1c item 22): ONE `listBlobsByPrefix` honours the
 * harness, and `listCheckpointBlobsForSession` lives there (moved, not copied).
 */

import fs from "node:fs";
import path from "node:path";

const mockList = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  list: (...args: unknown[]) => mockList(...args),
}));

const envSnapshot = { ...process.env };

function setEnv(harness: boolean, nodeEnv = "test"): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = nodeEnv;
  delete env.VERCEL_ENV;
  if (harness) {
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
    process.env.NEXTAUTH_URL = "http://localhost:3100";
  } else {
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.BLOB_HARNESS_LOCAL;
  }
}

describe("listBlobsByPrefix", () => {
  beforeEach(() => {
    jest.resetModules();
    mockList.mockReset();
  });
  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test("real store: pages through every cursor and returns url, pathname and size", async () => {
    setEnv(false);
    mockList
      .mockResolvedValueOnce({
        blobs: [{ url: "https://x.blob.vercel-storage.com/p/1", pathname: "p/1", size: 10 }],
        hasMore: true,
        cursor: "c1",
      })
      .mockResolvedValueOnce({
        blobs: [{ url: "https://x.blob.vercel-storage.com/p/2", pathname: "p/2", size: 20 }],
        hasMore: false,
      });
    const { listBlobsByPrefix } = await import("@/lib/blob-list");

    const out = await listBlobsByPrefix("p/");

    expect(out).toEqual([
      { url: "https://x.blob.vercel-storage.com/p/1", pathname: "p/1", size: 10 },
      { url: "https://x.blob.vercel-storage.com/p/2", pathname: "p/2", size: 20 },
    ]);
    expect(mockList).toHaveBeenNthCalledWith(1, { prefix: "p/", limit: 1000, cursor: undefined });
    expect(mockList).toHaveBeenNthCalledWith(2, { prefix: "p/", limit: 1000, cursor: "c1" });
  });

  test("harness active: lists the harness store (urls are harness urls) and never calls the real list", async () => {
    setEnv(true);
    const h = await import("@/lib/blob-harness");
    const { listBlobsByPrefix } = await import("@/lib/blob-list");
    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-checkpoints/s1/a.json", Buffer.from("12345"), "application/json");
    h.harnessStorePut("whiteboard-checkpoints/s2/a.json", Buffer.from("9"), "application/json");

    const out = await listBlobsByPrefix("whiteboard-checkpoints/s1/");

    expect(mockList).not.toHaveBeenCalled();
    expect(out).toEqual([
      {
        url: h.harnessBlobUrl("http://localhost:3100", "whiteboard-checkpoints/s1/a.json"),
        pathname: "whiteboard-checkpoints/s1/a.json",
        size: 5,
      },
    ]);
    expect(h.isHarnessBlobUrl(out[0].url)).toBe(true);
  });

  test("production shape: real list even with both sentinels", async () => {
    setEnv(true, "production");
    mockList.mockResolvedValueOnce({ blobs: [], hasMore: false });
    const { listBlobsByPrefix } = await import("@/lib/blob-list");
    await listBlobsByPrefix("p/");
    expect(mockList).toHaveBeenCalledTimes(1);
  });
});

describe("listCheckpointBlobsForSession (moved into blob-list.ts)", () => {
  beforeEach(() => {
    jest.resetModules();
    mockList.mockReset();
  });
  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test("lists exactly the session's checkpoint prefix and returns urls", async () => {
    setEnv(false);
    mockList.mockResolvedValueOnce({
      blobs: [
        { url: "https://x.blob.vercel-storage.com/whiteboard-checkpoints/sess-9/a", pathname: "whiteboard-checkpoints/sess-9/a", size: 1 },
      ],
      hasMore: false,
    });
    const { listCheckpointBlobsForSession } = await import("@/lib/blob-list");

    await expect(listCheckpointBlobsForSession("sess-9")).resolves.toEqual([
      "https://x.blob.vercel-storage.com/whiteboard-checkpoints/sess-9/a",
    ]);
    expect(mockList).toHaveBeenCalledWith({
      prefix: "whiteboard-checkpoints/sess-9/",
      limit: 1000,
      cursor: undefined,
    });
  });
});

describe("composition guard: one lister (no duplicate list loops)", () => {
  const SRC = path.resolve(__dirname, "..");

  function productFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        productFiles(full, out);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  }

  test("only blob-list.ts imports `list` from @vercel/blob", () => {
    const offenders = productFiles(SRC).filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /import\s*\{[^}]*\blist\b[^}]*\}\s*from\s*["']@vercel\/blob["']/.test(text);
    });
    expect(offenders.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual(["lib/blob-list.ts"]);
  });

  test("listCheckpointBlobsForSession is defined once, in blob-list.ts", () => {
    const definers = productFiles(SRC).filter((file) =>
      /(?:async\s+)?function\s+listCheckpointBlobsForSession\b|const\s+listCheckpointBlobsForSession\b/.test(
        fs.readFileSync(file, "utf8")
      )
    );
    expect(definers.map((f) => path.relative(SRC, f).replace(/\\/g, "/"))).toEqual(["lib/blob-list.ts"]);
  });
});
