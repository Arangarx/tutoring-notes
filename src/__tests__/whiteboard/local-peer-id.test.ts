/**
 * @jest-environment jsdom
 */
/**
 * Unit tests for `src/lib/whiteboard/local-peer-id.ts`
 *
 * Covers the identity-peerid workstream additions:
 *   - Tutor path (no identityKey) — existing sessionStorage-backed behavior.
 *   - Student path (identityKey provided) — deterministic localStorage-backed
 *     device id + identity key compound format.
 *   - `parseStudentPeerId` — round-trip format validation.
 *   - Dedup decision logic — pure function isolating the "is this device
 *     superseded?" predicate so the invariant is machine-checked.
 *
 * Runs in jsdom (default jest environment). We mock sessionStorage and
 * localStorage via plain objects so the helpers behave identically to
 * a real browser and we can control storage state between tests.
 */

import {
  getOrCreateLocalPeerId,
  getOrCreateDeviceId,
  parseStudentPeerId,
  _clearLocalPeerId,
  _clearDeviceId,
  _STORAGE_KEY_PREFIX,
  _DEVICE_ID_KEY,
} from "@/lib/whiteboard/local-peer-id";

// ---------------------------------------------------------------------------
// Storage mocks — inject into the global window
// ---------------------------------------------------------------------------

function makeMemoryStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

let fakeSession: Storage;
let fakeLocal: Storage;

beforeEach(() => {
  fakeSession = makeMemoryStorage();
  fakeLocal = makeMemoryStorage();
  Object.defineProperty(window, "sessionStorage", {
    get: () => fakeSession,
    configurable: true,
  });
  Object.defineProperty(window, "localStorage", {
    get: () => fakeLocal,
    configurable: true,
  });
});

// ---------------------------------------------------------------------------
// Tutor path (no identityKey) — existing behavior unchanged
// ---------------------------------------------------------------------------

describe("tutor path (no identityKey)", () => {
  const SESSION_ID = "session-tutor-01";

  it("mints a fresh id of shape tutor-<uuid> on first call", () => {
    const id = getOrCreateLocalPeerId(SESSION_ID, "tutor");
    expect(id).toMatch(/^tutor-/);
    expect(id.length).toBeGreaterThan(8);
  });

  it("returns the SAME id on a second call within the same session (persisted)", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "tutor");
    const b = getOrCreateLocalPeerId(SESSION_ID, "tutor");
    expect(a).toBe(b);
  });

  it("mints a NEW id after _clearLocalPeerId", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "tutor");
    _clearLocalPeerId(SESSION_ID);
    const b = getOrCreateLocalPeerId(SESSION_ID, "tutor");
    expect(a).not.toBe(b);
  });

  it("student prefix when rolePrefix='student' and no identityKey", () => {
    const id = getOrCreateLocalPeerId(SESSION_ID, "student");
    expect(id).toMatch(/^student-[a-f0-9-]{32,}/);
  });

  it("returns a transient id for empty session id (no storage key)", () => {
    const id = getOrCreateLocalPeerId("", "tutor");
    expect(id).toMatch(/^tutor-/);
  });
});

// ---------------------------------------------------------------------------
// Student path (identityKey provided) — identity-peerid workstream
// ---------------------------------------------------------------------------

describe("student path (identityKey provided)", () => {
  const SESSION_ID = "session-student-01";
  const IDENTITY_KEY = "a1b2c3d4e5f6"; // 12 hex chars

  it("returns id of shape student-<identityKey>-<deviceId>", () => {
    const id = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    expect(id).toMatch(/^student-[0-9a-f]+-[0-9a-f]+$/);
    const parts = id.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("student");
    expect(parts[1]).toBe(IDENTITY_KEY);
  });

  it("is STABLE across calls on the same 'browser' (same localStorage)", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    const b = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    expect(a).toBe(b);
  });

  it("is STABLE across different sessionIds (device-level, not session-level)", () => {
    const a = getOrCreateLocalPeerId("session-A", "student", IDENTITY_KEY);
    const b = getOrCreateLocalPeerId("session-B", "student", IDENTITY_KEY);
    // Same deviceId (same localStorage) → same peerId regardless of sessionId.
    // Tutor path uses sessionId for scoping; student identity path does not
    // need it because identityKey already provides session-scoping.
    expect(a).toBe(b);
  });

  it("DIFFERS when the device id changes (simulating different browser)", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    // Simulate a different browser by clearing localStorage
    _clearDeviceId();
    const b = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    expect(a).not.toBe(b);
    // Both still have same identityKey segment
    const parsedA = parseStudentPeerId(a);
    const parsedB = parseStudentPeerId(b);
    expect(parsedA?.identityKey).toBe(IDENTITY_KEY);
    expect(parsedB?.identityKey).toBe(IDENTITY_KEY);
    expect(parsedA?.deviceId).not.toBe(parsedB?.deviceId);
  });

  it("DIFFERS for different identityKeys even on the same device", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "student", "aaaaaaaaaaaa");
    const b = getOrCreateLocalPeerId(SESSION_ID, "student", "bbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("ignores _clearLocalPeerId (student path does not use sessionStorage)", () => {
    const a = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    _clearLocalPeerId(SESSION_ID); // clears sessionStorage; student path ignores
    const b = getOrCreateLocalPeerId(SESSION_ID, "student", IDENTITY_KEY);
    // Should still be equal (localStorage deviceId unchanged)
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateDeviceId
// ---------------------------------------------------------------------------

describe("getOrCreateDeviceId", () => {
  it("returns an 8-char hex string", () => {
    const id = getOrCreateDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("is stable across calls (persisted in localStorage)", () => {
    const a = getOrCreateDeviceId();
    const b = getOrCreateDeviceId();
    expect(a).toBe(b);
  });

  it("mints a new id after _clearDeviceId", () => {
    const a = getOrCreateDeviceId();
    _clearDeviceId();
    const b = getOrCreateDeviceId();
    expect(a).not.toBe(b);
  });

  it("writes to the expected localStorage key", () => {
    _clearDeviceId();
    getOrCreateDeviceId();
    expect(fakeLocal.getItem(_DEVICE_ID_KEY)).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// parseStudentPeerId
// ---------------------------------------------------------------------------

describe("parseStudentPeerId", () => {
  it("parses a well-formed identity-derived peerId", () => {
    const result = parseStudentPeerId("student-a1b2c3d4e5f6-deadbeef");
    expect(result).toEqual({ identityKey: "a1b2c3d4e5f6", deviceId: "deadbeef" });
  });

  it("returns null for a tutor peerId", () => {
    expect(parseStudentPeerId("tutor-some-uuid-here")).toBeNull();
  });

  it("returns null for a legacy student peerId (uuid format, not identity-derived)", () => {
    // Legacy: student-<uuid> produces parts.length > 3 after split by "-"
    expect(parseStudentPeerId("student-550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseStudentPeerId("")).toBeNull();
  });

  it("round-trips with getOrCreateLocalPeerId output", () => {
    const IDENTITY_KEY = "c0ffee000000";
    const id = getOrCreateLocalPeerId("session-rt", "student", IDENTITY_KEY);
    const parsed = parseStudentPeerId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.identityKey).toBe(IDENTITY_KEY);
    expect(parsed!.deviceId).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ---------------------------------------------------------------------------
// Dedup decision logic — pure predicate, mirrors the useEffect in
// WhiteboardWorkspaceClient. Tests the invariant: "newest joinedAt wins;
// tiebreak on lexicographically greater peerId."
// ---------------------------------------------------------------------------

/**
 * Pure port of the takeover predicate from WhiteboardWorkspaceClient's
 * dual-device detection useEffect. Testing this as a pure function ensures
 * the edge cases are machine-checked independently of React lifecycle.
 */
function isDeviceSuperseded(opts: {
  myPeerId: string;
  myJoinedAt: number;
  remotePeerId: string;
  remoteJoinedAt: number | undefined;
  remoteIdentityKey: string | undefined;
  myIdentityKey: string;
}): boolean {
  const { myPeerId, myJoinedAt, remotePeerId, remoteJoinedAt, remoteIdentityKey, myIdentityKey } = opts;
  if (!remoteIdentityKey || remoteIdentityKey !== myIdentityKey) return false;
  if (remotePeerId === myPeerId) return false; // same device
  const peerJoinedAt = remoteJoinedAt ?? 0;
  return (
    peerJoinedAt > myJoinedAt ||
    (peerJoinedAt === myJoinedAt && remotePeerId > myPeerId)
  );
}

describe("dedup decision — isDeviceSuperseded predicate", () => {
  const IDENTITY_KEY = "a1b2c3d4e5f6";
  const MY_PEER = "student-a1b2c3d4e5f6-aaaaaaaa";
  const OTHER_PEER = "student-a1b2c3d4e5f6-bbbbbbbb";

  it("newer joinedAt → superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 1000,
      remotePeerId: OTHER_PEER, remoteJoinedAt: 2000,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(true);
  });

  it("older joinedAt → NOT superseded (we are newer)", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 2000,
      remotePeerId: OTHER_PEER, remoteJoinedAt: 1000,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });

  it("equal joinedAt, lexicographically greater remote peerId → superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: "student-a1b2c3d4e5f6-aaaaaaaa",
      myJoinedAt: 1000,
      remotePeerId: "student-a1b2c3d4e5f6-zzzzzzzz",
      remoteJoinedAt: 1000,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(true);
  });

  it("equal joinedAt, lexicographically smaller remote peerId → NOT superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: "student-a1b2c3d4e5f6-zzzzzzzz",
      myJoinedAt: 1000,
      remotePeerId: "student-a1b2c3d4e5f6-aaaaaaaa",
      remoteJoinedAt: 1000,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });

  it("different identityKey → NOT superseded (different learner)", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 1000,
      remotePeerId: "student-ffffffffffff-cccccccc",
      remoteJoinedAt: 2000,
      remoteIdentityKey: "ffffffffffff", // different key
      myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });

  it("missing remoteIdentityKey (legacy/tutor peer) → NOT superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 1000,
      remotePeerId: "tutor-some-uuid",
      remoteJoinedAt: 2000,
      remoteIdentityKey: undefined,
      myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });

  it("same peerId (reload = same device) → NOT superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 1000,
      remotePeerId: MY_PEER, // same peerId = same device
      remoteJoinedAt: 2000,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });

  it("missing remoteJoinedAt treated as 0 (very old) → NOT superseded", () => {
    expect(isDeviceSuperseded({
      myPeerId: MY_PEER, myJoinedAt: 1,
      remotePeerId: OTHER_PEER,
      remoteJoinedAt: undefined,
      remoteIdentityKey: IDENTITY_KEY, myIdentityKey: IDENTITY_KEY,
    })).toBe(false);
  });
});
