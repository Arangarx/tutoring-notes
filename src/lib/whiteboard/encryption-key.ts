/**
 * Per-session AES-GCM encryption-key plumbing for the whiteboard
 * workspace.
 *
 * Why this module exists (May 15, pilot smoke fallout):
 *
 *   The encryption key the tutor uses to scramble live-sync messages
 *   lives in `window.location.hash` (`#k=…`) so the server NEVER
 *   sees it. That part of the threat model is unchanged. But the
 *   original implementation TREATED the hash as the only source of
 *   truth — minting a fresh key whenever the hash was empty, which
 *   silently happened any time the tutor opened the workspace via a
 *   non-hash-bearing URL: the "Continue" link in
 *   `ActiveWhiteboardSessionsList`, a tab restore from the browser's
 *   history without the fragment, a copy/paste of the workspace URL
 *   omitting the fragment, etc.
 *
 *   When that happened MID-SESSION (e.g. tutor closed the tab, hit
 *   Continue from the dashboard), the new tab minted a brand-new key
 *   K2 while every other participant was still on K1 — every
 *   inbound signaling/presence message produced a
 *   `[sync-client] decrypt/parse failed` warning, the WebRTC mesh
 *   could not exchange SDP/ICE, and live A/V collapsed to "Connecting…"
 *   for everyone except via a brute-force hard refresh on every
 *   participant.
 *
 *   The fix is to make the tutor's tab REMEMBER the key it minted
 *   for a given session, scoped to its origin, so any subsequent
 *   mount of the same workspace recovers the same key. localStorage
 *   is the right shelf: same-origin only, persists across tab close,
 *   never traverses the network, opaque to the server. Storing the
 *   key here is no worse than storing it in the URL hash (which is
 *   also same-origin JS-readable); the threat surface is unchanged.
 *
 * Lifecycle:
 *
 *   1. **First mount of session S** — hash empty, localStorage empty.
 *      Mint K_fresh, write to BOTH hash and localStorage[`wb-key:S`].
 *      Subsequent refreshes / re-opens of S find the key in either
 *      place and reuse it.
 *
 *   2. **Refresh** — hash retains the key, we read it, AND we
 *      backfill localStorage just in case (covers a tutor who
 *      pasted a hash-bearing URL into the address bar, etc.).
 *
 *   3. **Continue from dashboard** — hash empty, localStorage has K.
 *      We restore K to the hash via `replaceState` so the URL is
 *      shareable again, and use K. Wife's still-open tab with the
 *      ORIGINAL link (which carried K in its hash) now decrypts the
 *      tutor's traffic cleanly.
 *
 *   4. **End session** — call `clearEncryptionKeyForSession(s)` so
 *      the persisted key doesn't linger after the session is dead.
 *      A future re-open of the same session URL (read-only review)
 *      doesn't need the key; minting a new one for a brand-new
 *      session is correct.
 *
 * Multi-device caveat (knowingly accepted, NOT a fix):
 *
 *   localStorage is per-device. If a tutor opens the same session
 *   on both phone and laptop, each device mints its own K_initial.
 *   Whichever device joined first defines the room's key (everyone
 *   else's traffic fails to decrypt). For the pilot this is
 *   acceptable — Sarah works from one device per session. A real
 *   fix would key-on-server, but that breaks the "server never sees
 *   the key" invariant and needs a separate threat-model review.
 */

import { useEffect, useState } from "react";
import { generateEncryptionKeyBase64Url } from "@/lib/whiteboard/sync-client";

/**
 * Minimum length for a key value we'll trust as "looks like a key".
 * AES-GCM 256-bit keys serialized as base64url come out to ~43
 * chars; the 16-char floor is conservative defense against a
 * malformed hash (e.g. `#k=foo` written by hand) being treated as
 * a real key. Keep in sync with the floor in the (now-deleted)
 * inline implementation that used to live in
 * `WhiteboardWorkspaceClient.tsx`.
 */
const MIN_KEY_LEN = 16;

/**
 * Per-session localStorage key. The `wb-key:` prefix matches the
 * per-session ID logging convention (`wbsid=…` in console output) so
 * the storage entry is easy to spot in DevTools when debugging.
 */
function lsKeyForSession(sessionId: string): string {
  return `wb-key:${sessionId}`;
}

/**
 * Pull the encryption key for `sessionId` from the URL hash if it's
 * there, falling back to localStorage. Returns null when neither
 * source has a usable key — the caller's responsibility to then
 * mint one and call `persistEncryptionKey`. Tested as a pure
 * function (window stubs in unit tests) so the hook below stays
 * small.
 *
 * Side effect: when the hash carried a usable key, we backfill
 * localStorage with it. This covers a tutor who pastes a
 * hash-bearing URL into a fresh tab — without the backfill, the
 * NEXT mount of the same session in this browser would mint a new
 * key because localStorage was empty.
 */
export function readPersistedEncryptionKey(
  sessionId: string,
  win: Window
): string | null {
  const hash = win.location.hash;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );
  const fromHash = params.get("k");
  if (fromHash && fromHash.length >= MIN_KEY_LEN) {
    // Backfill localStorage if it isn't already aligned. Fail soft —
    // localStorage can throw QuotaExceededError or be unavailable in
    // a sandboxed iframe; we still return the key from hash.
    try {
      const lsKey = lsKeyForSession(sessionId);
      if (win.localStorage.getItem(lsKey) !== fromHash) {
        win.localStorage.setItem(lsKey, fromHash);
      }
    } catch {
      /* localStorage unavailable; not fatal */
    }
    return fromHash;
  }
  // Hash empty / unusable — try localStorage.
  try {
    const fromLs = win.localStorage.getItem(lsKeyForSession(sessionId));
    if (fromLs && fromLs.length >= MIN_KEY_LEN) {
      return fromLs;
    }
  } catch {
    /* localStorage unavailable; treat as miss */
  }
  return null;
}

/**
 * Persist the encryption key for this session to BOTH the URL hash
 * (via `replaceState` so we don't push a history entry) and
 * localStorage. Idempotent: writing the same key twice is fine.
 *
 * `replaceState` keeps the back button pointing at the previous
 * page (the student detail page), which is the original UX choice
 * we want to preserve from the inline implementation.
 */
export function persistEncryptionKey(
  sessionId: string,
  key: string,
  win: Window
): void {
  // localStorage first — if hash writing throws (e.g. due to a
  // CSP-blocked replaceState in some embed context), we still want
  // the key in storage so the next mount can recover.
  try {
    win.localStorage.setItem(lsKeyForSession(sessionId), key);
  } catch {
    /* not fatal — hash still serves as the primary handoff */
  }
  try {
    const params = new URLSearchParams(
      win.location.hash.startsWith("#")
        ? win.location.hash.slice(1)
        : win.location.hash
    );
    params.set("k", key);
    win.history.replaceState(null, "", `#${params.toString()}`);
  } catch {
    /* not fatal — localStorage still anchors recovery */
  }
}

/**
 * Drop the persisted key for a session. Called on End-session so
 * the persisted state matches reality: ended sessions don't have a
 * live encryption key to recover.
 *
 * Safe to call from anywhere — in particular it does NOT touch the
 * URL hash (the tab may have already navigated to the review page,
 * in which case fiddling with the hash would be wasted; and if it
 * hasn't, leaving the hash alone gives a window for the
 * read-only review page to still decrypt local-only state if any).
 */
export function clearEncryptionKeyForSession(sessionId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(lsKeyForSession(sessionId));
  } catch {
    /* not fatal */
  }
}

/**
 * Hook surface — drop-in replacement for the prior inline
 * `useEncryptionKeyInHash(): string | null` in
 * `WhiteboardWorkspaceClient.tsx`. Takes `sessionId` now so the
 * persisted key is scoped per session (a tutor with multiple
 * sessions in different tabs gets independent keys).
 *
 * Returns null until the mount-time client-only code path runs
 * (server render, first hydration tick). After that the value is
 * stable for the lifetime of the workspace mount.
 *
 * `enabled` — when false the hook is completely inert: no read, no
 * mint, no write, returns null. Used to make this hook a no-op for
 * the student role, where the student has its own key-read path
 * (readStudentKeyFromHash / sessionStorage fallback) and MUST NOT
 * have a fresh key minted on the post-login-redirect path.
 */
export function useEncryptionKeyInHash(
  sessionId: string,
  { enabled = true }: { enabled?: boolean } = {}
): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const existing = readPersistedEncryptionKey(sessionId, window);
    if (existing) {
      // Make sure the hash carries it too (covers the
      // localStorage-hit-but-hash-empty case — the "Continue from
      // dashboard" flow).
      persistEncryptionKey(sessionId, existing, window);
      setKey(existing);
      return;
    }
    const fresh = generateEncryptionKeyBase64Url();
    persistEncryptionKey(sessionId, fresh, window);
    setKey(fresh);
  }, [sessionId, enabled]);
  return key;
}
