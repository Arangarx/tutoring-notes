/**
 * Same-origin return path for login, signup, and tutor email confirmation.
 * Rejects protocol-relative and absolute URLs.
 */
export function safeRelativeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return null;
  }
  if (trimmed.includes("\\") || trimmed.includes("://")) return null;
  if (!/^\/[A-Za-z0-9\-/_?=&%.~]*$/.test(trimmed)) return null;
  return trimmed;
}
