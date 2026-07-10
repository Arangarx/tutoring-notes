/** Derive 1–2 letter initials for avatar display from a display name. */
export function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Curated on-brand avatar palette — see tokens.css `--avatar-1` … `--avatar-8`. */
const AVATAR_PALETTE = [
  "var(--avatar-1)",
  "var(--avatar-2)",
  "var(--avatar-3)",
  "var(--avatar-4)",
  "var(--avatar-5)",
  "var(--avatar-6)",
  "var(--avatar-7)",
  "var(--avatar-8)",
] as const;

/** Normalize display name for stable palette indexing (trim + case-fold). */
function normalizeNameForAvatar(name: string): string {
  return name.trim().toLowerCase();
}

/** FNV-1a 32-bit — same distribution as live-A/V initials (initials-from-label.ts). */
function hashToPaletteSlot(input: string): number {
  if (!input) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash % AVATAR_PALETTE.length;
}

/** Stable `--avatar-N` fill from display name (deterministic across surfaces). */
export function studentAvatarColor(name: string): string {
  const slot = hashToPaletteSlot(normalizeNameForAvatar(name));
  return AVATAR_PALETTE[slot]!;
}
