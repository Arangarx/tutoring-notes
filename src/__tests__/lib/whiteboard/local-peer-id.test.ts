/**
 * @jest-environment jsdom
 */

import {
  _clearLocalPeerId,
  _STORAGE_KEY_PREFIX,
  getOrCreateLocalPeerId,
} from "@/lib/whiteboard/local-peer-id";

afterEach(() => {
  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.clear();
  }
});

describe("getOrCreateLocalPeerId — Phase 4d stable per-session peerId", () => {
  test("first call mints + persists; second call returns the same id (reload reuse)", () => {
    const first = getOrCreateLocalPeerId("session-A", "tutor");
    expect(first).toMatch(/^tutor-/);
    expect(first.length).toBeGreaterThan("tutor-".length);
    const second = getOrCreateLocalPeerId("session-A", "tutor");
    expect(second).toBe(first);
  });

  test("different whiteboardSessionId → different id (sessions don't alias)", () => {
    const a = getOrCreateLocalPeerId("session-A", "tutor");
    const b = getOrCreateLocalPeerId("session-B", "tutor");
    expect(a).not.toBe(b);
  });

  test("role prefix lands in the minted id for log readability", () => {
    const t = getOrCreateLocalPeerId("session-T", "tutor");
    const s = getOrCreateLocalPeerId("session-S", "student");
    expect(t.startsWith("tutor-")).toBe(true);
    expect(s.startsWith("student-")).toBe(true);
  });

  test("role prefix on a PERSISTED id is preserved across reloads (no surprise re-prefixing)", () => {
    // Pre-seed the storage entry with a different prefix to
    // simulate a stale persisted id from an earlier code path.
    window.sessionStorage.setItem(
      `${_STORAGE_KEY_PREFIX}session-stale`,
      "tutor-abc-123"
    );
    // A subsequent call with a DIFFERENT rolePrefix must NOT
    // overwrite the persisted entry — the persisted value wins.
    // This is intentional: changing the prefix mid-session would
    // change the peer-mesh role assignment for the same physical
    // peer, which would silently break in-flight PCs.
    const got = getOrCreateLocalPeerId("session-stale", "student");
    expect(got).toBe("tutor-abc-123");
  });

  test("empty / whitespace whiteboardSessionId → transient unscoped id (defensive default)", () => {
    const a = getOrCreateLocalPeerId("", "tutor");
    const b = getOrCreateLocalPeerId("", "tutor");
    // Each call mints fresh because we refuse to write under an
    // empty storage key (would alias every "empty session" peer).
    expect(a).not.toBe(b);
    expect(a).toMatch(/^tutor-/);
    expect(b).toMatch(/^tutor-/);
  });

  test("storage clear between calls (e.g. user manually cleared storage) → fresh id minted on next call", () => {
    const first = getOrCreateLocalPeerId("session-clear", "tutor");
    expect(_clearLocalPeerId("session-clear")).toBe(true);
    const second = getOrCreateLocalPeerId("session-clear", "tutor");
    expect(second).not.toBe(first);
    // The new id is now persisted; calling again returns it.
    expect(getOrCreateLocalPeerId("session-clear", "tutor")).toBe(second);
  });

  test("id format is non-empty and contains the prefix + a separator", () => {
    const id = getOrCreateLocalPeerId("session-fmt", "tutor");
    expect(id.includes("-")).toBe(true);
    expect(id.length).toBeGreaterThan(10);
  });

  test("multiple peers (different role prefixes for different SESSIONS) coexist in storage", () => {
    const t = getOrCreateLocalPeerId("session-coexist-A", "tutor");
    const s = getOrCreateLocalPeerId("session-coexist-B", "student");
    expect(getOrCreateLocalPeerId("session-coexist-A", "tutor")).toBe(t);
    expect(getOrCreateLocalPeerId("session-coexist-B", "student")).toBe(s);
    expect(t).not.toBe(s);
  });

  test("storage entries land under the documented key shape (wb-peer-id:<sessionId>)", () => {
    const id = getOrCreateLocalPeerId("session-key", "tutor");
    const persisted = window.sessionStorage.getItem(
      `${_STORAGE_KEY_PREFIX}session-key`
    );
    expect(persisted).toBe(id);
  });
});

describe("getOrCreateLocalPeerId — defensive fallback when sessionStorage throws", () => {
  test("throw-on-setItem (Safari private-mode quirk) → returns transient id", () => {
    const orig = window.sessionStorage.setItem;
    // Force a throw on the probe write at the very first call.
    window.sessionStorage.setItem = function () {
      throw new DOMException("QuotaExceededError");
    } as unknown as typeof orig;
    try {
      const id = getOrCreateLocalPeerId("session-throw", "tutor");
      expect(id).toMatch(/^tutor-/);
    } finally {
      window.sessionStorage.setItem = orig;
    }
  });
});
