/**
 * Shared Vercel Blob pathname segment sanitizers.
 *
 * Call sites historically inlined the same allowlist with different
 * empty-string fallbacks (recording vs whiteboard). Keep the fallback
 * as a required parameter so each consumer's output stays identical.
 */

/**
 * Sanitise a user-supplied filename for use in a Vercel Blob pathname.
 * Vercel itself accepts the full character set, but we're conservative
 * here so log lines and URLs stay copy-pasteable.
 *
 * Allowlist: `a-zA-Z0-9._-`. Every other character becomes `_`.
 * If the result is empty, returns `emptyFallback` unchanged.
 */
export function safeName(filename: string, emptyFallback: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_") || emptyFallback;
}
