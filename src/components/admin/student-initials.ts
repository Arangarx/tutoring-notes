/** Derive 1–2 letter initials for avatar display from a display name. */
export function studentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Stable hue bucket from name for avatar background (CSS token classes). */
export function studentAvatarHueClass(name: string): string {
  const hues = [
    "bg-brand/25 text-brand",
    "bg-accent-soft text-accent-text",
    "bg-secondary text-secondary-foreground",
    "bg-muted text-foreground",
  ] as const;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % 997;
  return hues[hash % hues.length]!;
}
