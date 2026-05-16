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
 * SSR-safe: when `window.sessionStorage` is unavailable (SSR
 * pre-hydration; legacy browsers; quirky storage-disabled modes),
 * the helper returns a transient id and does NOT throw. The
 * transient id is still stable for the lifetime of the JS
 * runtime — important so the same render pass uses one id even if
 * the storage was unavailable briefly.
 */

type PeerRole = "tutor" | "student";

const STORAGE_KEY_PREFIX = "wb-peer-id:";

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

/**
 * Resolve the stable local peer id for `whiteboardSessionId`.
 *
 * On the first call (or after storage clear) mints + persists a
 * fresh id of shape `<rolePrefix>-<uuid>`. On subsequent calls
 * within the same tab returns the persisted id.
 *
 * The helper is idempotent within a render — calling it twice with
 * the same `whiteboardSessionId` always returns the same value.
 */
export function getOrCreateLocalPeerId(
  whiteboardSessionId: string,
  rolePrefix: PeerRole
): string {
  // Guard pathological inputs — falling back to a transient
  // unscoped id is safer than persisting under an empty key
  // (which would alias every "empty session" peer to the same
  // entry in storage).
  if (!whiteboardSessionId || whiteboardSessionId.trim().length === 0) {
    return `${rolePrefix}-${newUuid()}`;
  }

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
 * Test-only: expose the storage key shape so tests can poke at
 * the underlying entries without re-deriving the key prefix.
 */
export const _STORAGE_KEY_PREFIX = STORAGE_KEY_PREFIX;
