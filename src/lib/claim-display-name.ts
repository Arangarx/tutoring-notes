/** Stored claim display names: no control characters, no markup brackets, at most 80 characters. */
export const CLAIM_DISPLAY_NAME_MAX = 80;

/**
 * Normalize a claim-setup display name. Returns null when nothing visible remains.
 * The cap is applied after stripping, so a long padded name cannot smuggle extra characters.
 */
export function sanitizeClaimDisplayName(raw: string): string | null {
  const stripped = raw
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.slice(0, CLAIM_DISPLAY_NAME_MAX);
}
