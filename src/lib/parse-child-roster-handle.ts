/**
 * Parse child roster identifier `username@familyid` (same shape as learner login handle).
 * Used when a tutor adds a child by existing family login handle — not for PIN verify.
 */

export function parseChildRosterHandle(raw: string): { username: string; familyId: string } | null {
  const handle = raw.trim().toLowerCase();
  if (!handle.includes("@")) return null;
  const atIdx = handle.lastIndexOf("@");
  if (atIdx <= 0) return null;
  const username = handle.slice(0, atIdx).trim();
  const familyId = handle.slice(atIdx + 1).trim();
  if (!username || !familyId) return null;
  return { username, familyId };
}
