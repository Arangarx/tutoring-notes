/**
 * @jest-environment jsdom
 */

/**
 * Unit coverage for `src/lib/whiteboard/encryption-key.ts`.
 *
 * The bugs this module fixes were observed in the pilot (May 15
 * smoke): a tutor closing the workspace tab and reopening via
 * "Continue" landed on `/workspace` with no hash fragment, the
 * inline hook minted a fresh key, and every still-connected
 * participant's signaling cascade started failing decrypt against
 * the new key. Tests below pin the fix surface:
 *
 *   1. Hash carries key → returned, AND backfilled to localStorage
 *      so the next mount can recover even if the hash gets stripped.
 *   2. Hash empty, localStorage carries key → recovered to BOTH the
 *      returned value AND written back to the hash via replaceState
 *      so the URL stays shareable.
 *   3. Both empty → fresh key minted, persisted to both shelves.
 *   4. Malformed hash (`#k=foo` with sub-16-char value) treated as
 *      empty — falls to localStorage / fresh mint.
 *   5. `clearEncryptionKeyForSession` removes the localStorage row.
 *   6. localStorage unavailable / throwing → read/write helpers do
 *      not propagate the error.
 *   7. Per-session scoping: two different sessions get independent
 *      localStorage rows.
 */

import {
  clearEncryptionKeyForSession,
  persistEncryptionKey,
  readPersistedEncryptionKey,
} from "@/lib/whiteboard/encryption-key";

// `generateEncryptionKeyBase64Url` lives in sync-client and pulls
// from `crypto.getRandomValues`. We don't need to stub it for the
// pure helpers under test — only the hook would exercise that path,
// and the hook tests live alongside the workspace DOM tests where a
// mock is already wired.

const KEY_LONG = "0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdef"; // 52 chars

function ls(): Storage {
  return window.localStorage;
}

beforeEach(() => {
  // jsdom shares window across tests in the same suite — reset state
  // explicitly so prior writes don't bleed into the next test.
  ls().clear();
  window.history.replaceState(null, "", "/");
});

describe("readPersistedEncryptionKey", () => {
  test("hash-carries-key path: returns the key and backfills localStorage", () => {
    window.history.replaceState(null, "", `/some/path#k=${KEY_LONG}`);

    const result = readPersistedEncryptionKey("sess-1", window);

    expect(result).toBe(KEY_LONG);
    expect(ls().getItem("wb-key:sess-1")).toBe(KEY_LONG);
  });

  test("hash-carries-key with OTHER params preserves the others on backfill (URLSearchParams round-trip)", () => {
    window.history.replaceState(null, "", `/p#k=${KEY_LONG}&other=value`);

    const result = readPersistedEncryptionKey("sess-1", window);

    expect(result).toBe(KEY_LONG);
    // backfill only touches localStorage; hash isn't modified by
    // the READ function — only persistEncryptionKey touches hash.
    expect(window.location.hash).toBe(`#k=${KEY_LONG}&other=value`);
  });

  test("hash empty, localStorage has key → returns localStorage value", () => {
    ls().setItem("wb-key:sess-1", KEY_LONG);
    window.history.replaceState(null, "", "/");

    const result = readPersistedEncryptionKey("sess-1", window);

    expect(result).toBe(KEY_LONG);
  });

  test("hash AND localStorage both empty → returns null (caller mints)", () => {
    const result = readPersistedEncryptionKey("sess-1", window);
    expect(result).toBeNull();
  });

  test("hash has a too-short value → treated as empty, falls through to localStorage", () => {
    window.history.replaceState(null, "", "/p#k=tooShort");
    ls().setItem("wb-key:sess-1", KEY_LONG);

    const result = readPersistedEncryptionKey("sess-1", window);

    expect(result).toBe(KEY_LONG);
  });

  test("localStorage too-short → also treated as miss", () => {
    ls().setItem("wb-key:sess-1", "tooShort");
    const result = readPersistedEncryptionKey("sess-1", window);
    expect(result).toBeNull();
  });

  test("per-session scoping: sess-A and sess-B persist independently", () => {
    ls().setItem("wb-key:sess-A", KEY_LONG);
    ls().setItem("wb-key:sess-B", `Z${KEY_LONG}`);

    expect(readPersistedEncryptionKey("sess-A", window)).toBe(KEY_LONG);
    expect(readPersistedEncryptionKey("sess-B", window)).toBe(`Z${KEY_LONG}`);
  });

  test("localStorage throwing on getItem does not propagate", () => {
    const original = ls().getItem.bind(ls());
    jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation((key: string) => {
        if (key.startsWith("wb-key:")) throw new Error("LS unavailable");
        return original(key);
      });
    try {
      // hash empty, localStorage throws → null, no throw.
      expect(() => readPersistedEncryptionKey("sess-1", window)).not.toThrow();
      expect(readPersistedEncryptionKey("sess-1", window)).toBeNull();
    } finally {
      jest.restoreAllMocks();
    }
  });
});

describe("persistEncryptionKey", () => {
  test("writes to BOTH localStorage and the URL hash via replaceState", () => {
    persistEncryptionKey("sess-1", KEY_LONG, window);

    expect(ls().getItem("wb-key:sess-1")).toBe(KEY_LONG);
    expect(window.location.hash).toBe(`#k=${KEY_LONG}`);
  });

  test("preserves other hash params already present", () => {
    window.history.replaceState(null, "", "/p#existing=foo");
    persistEncryptionKey("sess-1", KEY_LONG, window);

    // Both params should be in the hash, order depends on
    // URLSearchParams serialization (existing first, then k).
    const params = new URLSearchParams(window.location.hash.slice(1));
    expect(params.get("k")).toBe(KEY_LONG);
    expect(params.get("existing")).toBe("foo");
  });

  test("idempotent: writing the same key twice is fine", () => {
    persistEncryptionKey("sess-1", KEY_LONG, window);
    persistEncryptionKey("sess-1", KEY_LONG, window);
    expect(ls().getItem("wb-key:sess-1")).toBe(KEY_LONG);
    expect(window.location.hash).toBe(`#k=${KEY_LONG}`);
  });

  test("localStorage throwing on setItem does not propagate (hash still written)", () => {
    jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementationOnce(() => {
        throw new Error("QuotaExceeded");
      });
    expect(() => persistEncryptionKey("sess-1", KEY_LONG, window)).not.toThrow();
    // Hash write happens AFTER the localStorage attempt, so it still
    // landed even though LS threw.
    expect(window.location.hash).toBe(`#k=${KEY_LONG}`);
    jest.restoreAllMocks();
  });
});

describe("clearEncryptionKeyForSession", () => {
  test("removes the localStorage row for the given session", () => {
    ls().setItem("wb-key:sess-1", KEY_LONG);
    ls().setItem("wb-key:sess-2", `Z${KEY_LONG}`);

    clearEncryptionKeyForSession("sess-1");

    expect(ls().getItem("wb-key:sess-1")).toBeNull();
    // Sibling session untouched.
    expect(ls().getItem("wb-key:sess-2")).toBe(`Z${KEY_LONG}`);
  });

  test("does NOT modify the URL hash (read-only-review surface should still decrypt local state)", () => {
    window.history.replaceState(null, "", `/p#k=${KEY_LONG}`);
    ls().setItem("wb-key:sess-1", KEY_LONG);

    clearEncryptionKeyForSession("sess-1");

    expect(window.location.hash).toBe(`#k=${KEY_LONG}`);
  });

  test("calling clear on a session with no persisted key is a no-op (no throw)", () => {
    expect(() => clearEncryptionKeyForSession("sess-never-stored")).not.toThrow();
  });
});

describe("readPersistedEncryptionKey + persistEncryptionKey integration", () => {
  test("round-trip: persist then read recovers the same key", () => {
    persistEncryptionKey("sess-1", KEY_LONG, window);

    // Simulate the "Continue from dashboard" path: navigate to a
    // URL with NO hash, then read.
    window.history.replaceState(null, "", "/admin/.../workspace");
    expect(window.location.hash).toBe("");

    const recovered = readPersistedEncryptionKey("sess-1", window);
    expect(recovered).toBe(KEY_LONG);
  });

  test("the actual regression scenario: hash empty, localStorage holds K from prior mount → recovered key matches", () => {
    // Step 1 — first mount, no hash, no LS: mint + persist.
    persistEncryptionKey("sess-1", KEY_LONG, window);

    // Step 2 — tab closed. Simulate that by clearing the hash but
    // leaving localStorage alone.
    window.history.replaceState(null, "", "/admin/.../workspace");

    // Step 3 — "Continue" navigation. Read should pull from LS and
    // (when the hook calls persist afterwards) restore the hash.
    const recovered = readPersistedEncryptionKey("sess-1", window);
    expect(recovered).toBe(KEY_LONG);
    persistEncryptionKey("sess-1", recovered!, window);
    expect(window.location.hash).toBe(`#k=${KEY_LONG}`);
  });
});
