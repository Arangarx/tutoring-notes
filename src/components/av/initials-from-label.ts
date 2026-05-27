/**
 * Deterministic initials + colour generation for the cam-off /
 * cam-denied placeholder — Phase 4d polish.
 *
 * Replaces the plain-text "Camera off" placeholder with a coloured
 * circle showing the participant's initials. The colour is hashed
 * from `peerId` so it stays stable across renders AND across
 * reloads (once Phase 4d Commit 4 stabilises peerId via
 * sessionStorage). Until then the colour rolls per mount, which is
 * still better than the random palette shuffle the alternative
 * (e.g. hashing the label) would produce when labels change.
 *
 * Palette: saturated dark-mode-friendly colours that read well as
 * a backdrop for white text. Picked so adjacent peers (peerIds
 * that hash to adjacent slots) don't accidentally collide on a
 * near-identical shade — see the unit suite for the rotation
 * coverage.
 */

const PALETTE: ReadonlyArray<string> = Object.freeze([
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
  "var(--avatar-6)",
  "var(--avatar-7)",
  "var(--avatar-8)",
]);

/**
 * Return 1–2 initials derived from `label`. Falls back to the
 * role-derived initial when label is empty/whitespace/undefined.
 *
 *   "Sarah"            → "S"
 *   "Sarah Johnson"    → "SJ"
 *   "Liam P. Mortensen" → "LM"  (first + last, skipping middle)
 *   ""  + tutor         → "T"
 *   ""  + student       → "S"
 *   undefined + null    → "?"
 */
export function getInitialsFromLabel(
  label: string | undefined | null,
  role?: "tutor" | "student"
): string {
  if (typeof label === "string") {
    const cleaned = label
      .trim()
      .split(/\s+/u)
      .filter((w) => w.length > 0);
    if (cleaned.length >= 2) {
      const first = firstAlphaChar(cleaned[0]!);
      const last = firstAlphaChar(cleaned[cleaned.length - 1]!);
      const combined = `${first}${last}`;
      if (combined.length > 0) return combined.toUpperCase();
    } else if (cleaned.length === 1) {
      const single = firstAlphaChar(cleaned[0]!);
      if (single.length > 0) return single.toUpperCase();
    }
  }
  if (role === "tutor") return "T";
  if (role === "student") return "S";
  return "?";
}

function firstAlphaChar(word: string): string {
  for (const ch of word) {
    if (/[\p{L}\p{N}]/u.test(ch)) return ch;
  }
  return "";
}

/**
 * Deterministic colour from the palette indexed by a stable hash of
 * `peerId`. Same peerId → same colour, every time, in every browser.
 *
 * Hash is the classic 32-bit FNV-1a variant — small + deterministic
 * + spreads adjacent inputs across the palette evenly enough for
 * our 8-slot ring.
 */
export function getDeterministicColorFromPeerId(peerId: string): string {
  const slot = hashToPaletteSlot(peerId);
  return PALETTE[slot]!;
}

function hashToPaletteSlot(input: string): number {
  if (!input || typeof input !== "string") return 0;
  // FNV-1a 32-bit. Sufficient distribution for an 8-slot palette.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash % PALETTE.length;
}

/**
 * Exported solely for tests. Callers should use the higher-level
 * helpers above.
 */
export const _testing = { PALETTE, hashToPaletteSlot };
