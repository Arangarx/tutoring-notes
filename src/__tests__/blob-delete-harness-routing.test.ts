/**
 * @jest-environment node
 *
 * Consent wave C0 (§ 1c item 11): `deleteBlob` used to call the real
 * `@vercel/blob` `del` with a harness URL. Under the test gate it must route to
 * the harness; everywhere else it must behave exactly as before.
 */
export {};


const mockDel = jest.fn();

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  del: (...args: unknown[]) => mockDel(...args),
  head: jest.fn(),
  getDownloadUrl: (u: string) => u,
  list: jest.fn(),
}));

const envSnapshot = { ...process.env };
const HARNESS_URL = "http://localhost:3100/api/test/blob/object/whiteboard-checkpoints/s1/a.json";
const REAL_URL = "https://abc.private.blob.vercel-storage.com/whiteboard-checkpoints/s1/a.json";

function setEnv(opts: { harness: boolean; nodeEnv?: string; vercelEnv?: string }): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = opts.nodeEnv ?? "test";
  if (opts.vercelEnv) env.VERCEL_ENV = opts.vercelEnv;
  else delete env.VERCEL_ENV;
  if (opts.harness) {
    process.env.PLAYWRIGHT_TEST = "1";
    process.env.BLOB_HARNESS_LOCAL = "1";
  } else {
    delete process.env.PLAYWRIGHT_TEST;
    delete process.env.BLOB_HARNESS_LOCAL;
  }
}

describe("deleteBlob routes to the harness only under the test gate", () => {
  beforeEach(() => {
    jest.resetModules();
    mockDel.mockReset();
    mockDel.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test("harness active + harness URL: object is deleted from the harness store and the real del is never called", async () => {
    setEnv({ harness: true });
    const h = await import("@/lib/blob-harness");
    const { deleteBlob } = await import("@/lib/blob");
    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-checkpoints/s1/a.json", Buffer.from("x"), "application/json");

    await deleteBlob(HARNESS_URL);

    expect(mockDel).not.toHaveBeenCalled();
    expect(h.harnessStoreList("whiteboard-checkpoints/s1/")).toEqual([]);
  });

  test("harness delete of a missing key resolves (same contract as a swallowed 404)", async () => {
    setEnv({ harness: true });
    const h = await import("@/lib/blob-harness");
    const { deleteBlob } = await import("@/lib/blob");
    h.resetHarnessStore();
    await expect(deleteBlob(HARNESS_URL)).resolves.toBeUndefined();
    expect(mockDel).not.toHaveBeenCalled();
  });

  test("an injected delete fault surfaces as a thrown error and keeps the object", async () => {
    setEnv({ harness: true });
    const h = await import("@/lib/blob-harness");
    const { deleteBlob } = await import("@/lib/blob");
    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-checkpoints/s1/a.json", Buffer.from("x"), "application/json");
    h.harnessFailNextDeletes(1);

    await expect(deleteBlob(HARNESS_URL)).rejects.toThrow(/injected/i);
    expect(h.harnessStoreList("whiteboard-checkpoints/s1/")).toHaveLength(1);
    expect(mockDel).not.toHaveBeenCalled();

    await deleteBlob(HARNESS_URL);
    expect(h.harnessStoreList("whiteboard-checkpoints/s1/")).toEqual([]);
  });

  test("harness active + a real Vercel Blob URL still calls the real del", async () => {
    setEnv({ harness: true });
    const { deleteBlob } = await import("@/lib/blob");
    await deleteBlob(REAL_URL);
    expect(mockDel).toHaveBeenCalledWith(REAL_URL);
  });

  test("gate off: even a harness-shaped URL goes to the real del (behavior unchanged)", async () => {
    setEnv({ harness: false });
    const { deleteBlob } = await import("@/lib/blob");
    await deleteBlob(HARNESS_URL);
    expect(mockDel).toHaveBeenCalledWith(HARNESS_URL);
  });

  test("production shape (NODE_ENV=production, both sentinels set): real del, harness untouched", async () => {
    setEnv({ harness: true, nodeEnv: "production" });
    const h = await import("@/lib/blob-harness");
    const { deleteBlob } = await import("@/lib/blob");
    h.harnessStorePut("whiteboard-checkpoints/s1/a.json", Buffer.from("x"), "application/json");
    await deleteBlob(HARNESS_URL);
    expect(mockDel).toHaveBeenCalledWith(HARNESS_URL);
    expect(h.harnessStoreGet("whiteboard-checkpoints/s1/a.json")).not.toBeNull();
  });

  test("a real 404 from del is still swallowed and any other error still throws", async () => {
    setEnv({ harness: false });
    const { deleteBlob } = await import("@/lib/blob");
    mockDel.mockRejectedValueOnce(new Error("The requested blob does not exist (404)"));
    await expect(deleteBlob(REAL_URL)).resolves.toBeUndefined();
    mockDel.mockRejectedValueOnce(new Error("rate limited"));
    await expect(deleteBlob(REAL_URL)).rejects.toThrow("rate limited");
  });
});
