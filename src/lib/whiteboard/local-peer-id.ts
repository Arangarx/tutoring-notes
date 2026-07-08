/**
 * Stable per-session local peer id — Phase 4d Group B bug fix.
 *
 * Before 4d, both the tutor workspace and the student page minted a
 * fresh `localPeerId` via `crypto.randomUUID()` on every mount. When
 * a peer hard-reloaded their browser tab mid-session, a NEW id was
 * minted and the relay/peer-mesh treated it as a brand-new peer —
 * the OLD presence + PC entries lingered (stale tile with broken
 * WebRTC) while a fresh tile appeared from the new id. Sarah's
 * pilot smoke 2026-05-15 with her wife's tab reload reproduced
 * this exactly.
 *
 * The fix here is the sessionStorage-backed peerId — per the
 * BACKLOG "Duplicate participant tile when a peer reloads
 * mid-session" entry. Storing the id under
 * `sessionStorage[wb-peer-id:<whiteboardSessionId>]` means:
 *
 *   - A tab reload reuses the same id → the relay's presence entry
 *     for the old socket evicts on socket-close, then re-emerges
 *     under the SAME id → peer-mesh's
 *     `event=add-skip reason=already-present` idempotency handles
 *     the rejoin as "the peer is already there, just re-establish
 *     the PC" rather than as a brand-new peer.
 *
 *   - Different tabs (or different browsers, incognito sessions,
 *     cleared storage) still get distinct ids — `sessionStorage`
 *     is per-tab so we automatically segregate physical peers.
 *
 *   - The id is bound to a specific `whiteboardSessionId`, so
 *     opening a NEW session in the same tab does NOT inherit the
 *     prior session's peerId. That keeps role/polite assignment
 *     clean across sessions even on a long-lived tab.
 *
 * Format: `<rolePrefix>-<uuid>`. The role prefix is purely a
 * readability affordance for logs + debug — peer-mesh + signaling
 * treat the id as an opaque string. Without the prefix, scanning
 * logs from a multi-peer smoke session is painful (every id looks
 * the same UUID-shape; you can't tell tutor from student at a
 * glance).
 *
 * IDENTITY-DERIVED peerId (identity-peerid workstream):
 * When an `identityKey` is provided (authenticated student path),
 * the format changes to `student-<identityKey>-<deviceId>` where:
 *   - `identityKey` is a session-scoped opaque hex string computed
 *     server-side (sha256(learnerProfileId:sessionId)[:12]) — stable
 *     for the same learner within a session, not correlatable across
 *     sessions.
 *   - `deviceId` is a per-DEVICE stable random hex string persisted
 *     in localStorage (key `wb-device-id`) — minted once per browser,
 *     stable across page reloads and new tabs.
 *
 * This format allows dual-device detection: if another peer in the
 * room has the SAME identityKey but a DIFFERENT deviceId (hence a
 * different peerId) with a NEWER joinedAt timestamp, the older device
 * self-bumps (shows "joined on another device"). Same device reloads
 * (same localStorage deviceId) always produce the same peerId, so the
 * warm-rejoin path (invariant 9 in LIVE-AV.md) is unaffected.
 *
 * SSR-safe: when `window.sessionStorage` is unavailable (SSR
 * pre-hydration; legacy browsers; quirky storage-disabled modes),
 * the helper returns a transient id and does NOT throw. The
 * transient id is still stable for the lifetime of the JS
 * runtime — important so the same render pass uses one id even if
 * the storage was unavailable briefly.
 */

type PeerRole = "tutor" | "student";

const STORAGE_KEY_PREFIX = "wb-peer-id:";
/** localStorage key for the stable per-device id (identity-peerid workstream). */
const DEVICE_ID_KEY = "wb-device-id";

function storageKey(whiteboardSessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${whiteboardSessionId}`;
}

function newUuid(): string {
  try {
    const g = globalThis as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === "function") {
      return g.crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.sessionStorage;
    if (!s) return null;
    // Some embedded browsers expose sessionStorage but throw on
    // getItem/setItem (Safari private mode quirk historically).
    // Touch it once to surface that early.
    const probe = "__wb_peer_id_probe__";
    s.setItem(probe, probe);
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    if (!s) return null;
    const probe = "__wb_device_id_probe__";
    s.setItem(probe, probe);
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Get or mint a stable per-device random id persisted in localStorage.
 * Survives tab closes, page reloads, and new tabs in the same browser.
 * Each physical browser (profile) gets a unique id — ideal for
 * dual-device detection where "same browser = same device".
 *
 * Returns an 8-char hex string (4 bytes of entropy — sufficient for
 * per-session peer disambiguation). When localStorage is unavailable
 * (SSR, incognito with storage blocked), falls back to a transient
 * id for this JS lifetime.
 */
export function getOrCreateDeviceId(): string {
  const storage = safeLocalStorage();
  if (storage) {
    try {
      const existing = storage.getItem(DEVICE_ID_KEY);
      if (typeof existing === "string" && existing.length > 0) return existing;
      // Mint a fresh 8-char hex device id (4 random bytes)
      const id = newUuid().replace(/-/g, "").slice(0, 8);
      storage.setItem(DEVICE_ID_KEY, id);
      return id;
    } catch {
      // Storage quota or DOM exception — fall through to transient
    }
  }
  // Transient fallback (SSR / blocked storage): still unique per JS runtime
  return newUuid().replace(/-/g, "").slice(0, 8);
}

/**
 * Parse the identityKey and deviceId segments out of an
 * identity-derived student peerId (`student-<identityKey>-<deviceId>`).
 * Returns null for tutor peerIds or any non-conforming shape.
 */
export function parseStudentPeerId(
  peerId: string
): { identityKey: string; deviceId: string } | null {
  const parts = peerId.split("-");
  // Exactly 3 hyphen-separated parts: "student", identityKey, deviceId.
  // identityKey and deviceId are hex strings (no hyphens within them).
  if (parts.length !== 3 || parts[0] !== "student") return null;
  const identityKey = parts[1];
  const deviceId = parts[2];
  if (!identityKey || !deviceId) return null;
  return { identityKey, deviceId };
}

/**
 * Resolve the stable local peer id for `whiteboardSessionId`.
 *
 * **Tutor path (no identityKey):** mints + persists a fresh id of shape
 * `<rolePrefix>-<uuid>` backed by `sessionStorage` — per-tab stable,
 * survives reloads within the same tab, regenerated in new tabs.
 *
 * **Student path (identityKey provided):** peerId format is
 * `student-<identityKey>-<deviceId>` where `deviceId` is a per-browser
 * stable random hex string from `localStorage`. This is deterministic
 * from the two inputs, so no sessionStorage persistence is needed —
 * any reload on the same browser produces the same peerId (invariant 9
 * in LIVE-AV.md preserved), while a different browser produces a
 * different `deviceId` suffix → different peerId with the same
 * `identityKey` segment → detectable as dual-device.
 *
 * The helper is idempotent within a render — calling it twice with
 * the same arguments always returns the same value.
 *
 * @param identityKey Optional session-scoped opaque identity token
 *   (student path only). When present the returned peerId embeds
 *   identityKey + a stable per-device random suffix.
 */
export function getOrCreateLocalPeerId(
  whiteboardSessionId: string,
  rolePrefix: PeerRole,
  identityKey?: string
): string {
  // Guard pathological inputs — falling back to a transient
  // unscoped id is safer than persisting under an empty key
  // (which would alias every "empty session" peer to the same
  // entry in storage).
  if (!whiteboardSessionId || whiteboardSessionId.trim().length === 0) {
    if (identityKey) return `student-${identityKey}-${getOrCreateDeviceId()}`;
    return `${rolePrefix}-${newUuid()}`;
  }

  // Identity-derived student path: deterministic from stable inputs.
  // No sessionStorage needed — same browser = same localStorage deviceId
  // = same peerId on reload (warm-rejoin path preserved).
  if (identityKey) {
    const deviceId = getOrCreateDeviceId();
    return `student-${identityKey}-${deviceId}`;
  }

  // Tutor / legacy student path: sessionStorage-backed random uuid.
  const storage = safeSessionStorage();
  if (!storage) {
    return `${rolePrefix}-${newUuid()}`;
  }

  const key = storageKey(whiteboardSessionId);
  try {
    const existing = storage.getItem(key);
    if (typeof existing === "string" && existing.length > 0) {
      return existing;
    }
    const minted = `${rolePrefix}-${newUuid()}`;
    storage.setItem(key, minted);
    return minted;
  } catch {
    // Storage-quota or DOM exception — still better to return a
    // transient id than to throw and break the workspace mount.
    return `${rolePrefix}-${newUuid()}`;
  }
}

/**
 * Test-only: drop the persisted id so the next call mints fresh.
 * Exported for unit suites; production code never calls this.
 * Returns whether storage was available + an entry was removed.
 */
export function _clearLocalPeerId(
  whiteboardSessionId: string
): boolean {
  const storage = safeSessionStorage();
  if (!storage) return false;
  try {
    storage.removeItem(storageKey(whiteboardSessionId));
    return true;
  } catch {
    return false;
  }
}

/**
 * Test-only: drop the persisted device id so the next call mints fresh.
 * Exported for unit suites; production code never calls this.
 */
export function _clearDeviceId(): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  try {
    storage.removeItem(DEVICE_ID_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Test-only: expose the storage key shape so tests can poke at
 * the underlying entries without re-deriving the key prefix.
 */
export const _STORAGE_KEY_PREFIX = STORAGE_KEY_PREFIX;
/** Test-only: expose the device id storage key. */
export const _DEVICE_ID_KEY = DEVICE_ID_KEY;
