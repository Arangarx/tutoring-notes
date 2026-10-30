/**
 * @jest-environment node
 *
 * Consent wave C0 (docs/handoff/consent-wave-plan.md § 6 infra, D9): the blob
 * harness is the independent oracle for board-purge tests, so it needs list by
 * prefix, delete, and fault injection. Self-tests, red before the harness grew
 * those functions.
 */
export {};


const envSnapshot = { ...process.env };

function setHarnessEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "test";
  delete env.VERCEL_ENV;
  process.env.PLAYWRIGHT_TEST = "1";
  process.env.BLOB_HARNESS_LOCAL = "1";
}

async function loadHarness() {
  return import("@/lib/blob-harness");
}

describe("blob harness: list, delete, fault injection (C0)", () => {
  beforeEach(() => {
    jest.resetModules();
    setHarnessEnv();
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  test("harnessStoreList returns only keys under the prefix, with sizes, sorted", async () => {
    const h = await loadHarness();
    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-checkpoints/s1/b.json", Buffer.from("bbbb"), "application/json");
    h.harnessStorePut("whiteboard-checkpoints/s1/a.json", Buffer.from("aa"), "application/json");
    h.harnessStorePut("whiteboard-checkpoints/s2/a.json", Buffer.from("zzz"), "application/json");
    h.harnessStorePut("sessions/stu1/audio.webm", Buffer.from("x"), "audio/webm");

    expect(h.harnessStoreList("whiteboard-checkpoints/s1/")).toEqual([
      { key: "whiteboard-checkpoints/s1/a.json", size: 2 },
      { key: "whiteboard-checkpoints/s1/b.json", size: 4 },
    ]);
    expect(h.harnessStoreList("whiteboard-checkpoints/none/")).toEqual([]);
    expect(h.harnessStoreList("").map((o: { key: string }) => o.key)).toHaveLength(4);
  });

  test("harnessStoreDelete removes one key and reports whether it existed", async () => {
    const h = await loadHarness();
    h.resetHarnessStore();
    h.harnessStorePut("a/1", Buffer.from("1"), "text/plain");
    h.harnessStorePut("a/2", Buffer.from("2"), "text/plain");

    expect(h.harnessStoreDelete("a/1")).toBe(true);
    expect(h.harnessStoreDelete("a/1")).toBe(false);
    expect(h.harnessStoreList("a/").map((o: { key: string }) => o.key)).toEqual(["a/2"]);
    expect(h.harnessStoreGet("a/1")).toBeNull();
  });

  test("harnessFailNextDeletes(n) fails exactly n deletes and leaves the objects in place", async () => {
    const h = await loadHarness();
    h.resetHarnessStore();
    h.harnessStorePut("a/1", Buffer.from("1"), "text/plain");
    h.harnessStorePut("a/2", Buffer.from("2"), "text/plain");
    h.harnessFailNextDeletes(2);

    expect(() => h.harnessStoreDelete("a/1")).toThrow(/injected/i);
    expect(() => h.harnessStoreDelete("a/2")).toThrow(/injected/i);
    expect(h.harnessStoreList("a/")).toHaveLength(2);

    expect(h.harnessStoreDelete("a/1")).toBe(true);
    expect(h.harnessStoreList("a/").map((o: { key: string }) => o.key)).toEqual(["a/2"]);
  });

  test("an injected failure message never looks like a 404, so deleteBlob cannot swallow it", async () => {
    const h = await loadHarness();
    h.resetHarnessStore();
    h.harnessStorePut("a/1", Buffer.from("1"), "text/plain");
    h.harnessFailNextDeletes(1);
    let message = "";
    try {
      h.harnessStoreDelete("a/1");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toMatch(/404|not found/i);
  });

  test("harnessFailDeleteMatching(prefix) fails only keys under the prefix, until reset", async () => {
    const h = await loadHarness();
    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-sessions/stu/s1/events.json", Buffer.from("e"), "application/json");
    h.harnessStorePut("sessions/stu/audio.webm", Buffer.from("a"), "audio/webm");
    h.harnessFailDeleteMatching("whiteboard-sessions/stu/s1/");

    expect(() => h.harnessStoreDelete("whiteboard-sessions/stu/s1/events.json")).toThrow(/injected/i);
    expect(() => h.harnessStoreDelete("whiteboard-sessions/stu/s1/events.json")).toThrow(/injected/i);
    expect(h.harnessStoreDelete("sessions/stu/audio.webm")).toBe(true);

    h.resetHarnessStore();
    h.harnessStorePut("whiteboard-sessions/stu/s1/events.json", Buffer.from("e"), "application/json");
    expect(h.harnessStoreDelete("whiteboard-sessions/stu/s1/events.json")).toBe(true);
  });

  test("resetHarnessStore clears pending fault injection as well as objects", async () => {
    const h = await loadHarness();
    h.harnessFailNextDeletes(5);
    h.harnessFailDeleteMatching("x/");
    h.resetHarnessStore();
    h.harnessStorePut("x/1", Buffer.from("1"), "text/plain");
    expect(h.harnessStoreDelete("x/1")).toBe(true);
  });

  test("store and fault state are shared by two module copies (globalThis-backed, as the Next bundles need)", async () => {
    let copyA!: typeof import("@/lib/blob-harness");
    let copyB!: typeof import("@/lib/blob-harness");
    jest.isolateModules(() => {
      copyA = require("@/lib/blob-harness");
    });
    jest.isolateModules(() => {
      copyB = require("@/lib/blob-harness");
    });
    expect(copyA).not.toBe(copyB);

    copyA.resetHarnessStore();
    copyA.harnessStorePut("shared/1", Buffer.from("1"), "text/plain");
    expect(copyB.harnessStoreList("shared/")).toEqual([{ key: "shared/1", size: 1 }]);

    copyA.harnessFailNextDeletes(1);
    expect(() => copyB.harnessStoreDelete("shared/1")).toThrow(/injected/i);
  });
});
