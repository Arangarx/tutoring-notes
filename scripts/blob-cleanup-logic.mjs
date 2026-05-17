/**
 * Pure helpers shared by blob-cleanup CLI and unit tests (Jest imports this module).
 * @typedef {{ url: string, size: number, uploadedAt: Date }} ListedBlobLike
 */

/**
 * @param {string} url
 * @param {Set<string>} prodRefs
 * @param {Set<string>} devRefs
 * @returns {"prod"|"dev"|"prod,dev"|null} null when unreferenced in both
 */
export function referencedWhere(url, prodRefs, devRefs) {
  const p = prodRefs.has(url);
  const d = devRefs.has(url);
  if (!p && !d) return null;
  if (p && d) return "prod,dev";
  if (p) return "prod";
  return "dev";
}

/**
 * @param {string} url
 * @param {Set<string>} prodRefs
 * @param {Set<string>} devRefs
 * @param {Date} uploadedAt
 * @param {number} minAgeMs
 */
export function isOrphanCandidate(url, prodRefs, devRefs, uploadedAt, minAgeMs) {
  if (referencedWhere(url, prodRefs, devRefs) !== null) return false;
  return Date.now() - uploadedAt.getTime() >= minAgeMs;
}

/**
 * Sort oldest first for deterministic caps.
 * @param {ListedBlobLike[]} orphans
 */
export function applyDeletionCap(orphans, maxDeletions, noLimit) {
  if (noLimit) return { selected: orphans, refusedExcess: 0 };
  const sorted = [...orphans].sort(
    (a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime()
  );
  if (sorted.length <= maxDeletions)
    return { selected: sorted, refusedExcess: 0 };
  return {
    selected: sorted.slice(0, maxDeletions),
    refusedExcess: sorted.length - maxDeletions,
  };
}

/**
 * Mirrors `--delete` cap logic in blob-cleanup.mjs.
 * @returns {boolean} true → refuse deletion run upfront
 */
export function refuseDeletionOverCap(orphanCount, maxDeletions, noLimit) {
  if (noLimit) return false;
  return orphanCount > maxDeletions;
}
