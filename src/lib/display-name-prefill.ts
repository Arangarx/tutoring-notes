/**
 * Prefill tutor-visible display names from legal names (first + last initial).
 * Family id is the login handle, not the display name.
 */

export function firstNameLastInitial(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const initial = last.charAt(0).toUpperCase();
  return initial ? `${first} ${initial}.` : first;
}
