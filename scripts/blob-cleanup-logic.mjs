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

/**
 * Some blob pathnames are referenced ONLY inside other blobs (e.g. tutor-
 * inserted whiteboard image assets live inside the events.json blob's
 * Excalidraw scene state), so the DB-cross-reference orphan check would
 * falsely flag them and deleting them would 404 the next replay.
 *
 * Until the orphan detector learns to also parse events.json contents
 * (slotted as a follow-up), these patterns are PROTECTED — kept regardless
 * of DB-reference state. Cost: a small amount of genuinely-orphaned
 * storage stays around. Benefit: zero risk of breaking real sessions.
 *
 * Maintained in lockstep with the upload pathname patterns in:
 *   - src/lib/whiteboard/upload.ts (whiteboard-sessions/.../assets/...)
 *   - src/app/api/whiteboard/[sessionId]/checkpoint/route.ts
 *     (whiteboard-checkpoints/...)
 *
 * @param {string} pathname  The Vercel Blob `pathname` (path-only, no host).
 * @returns {boolean}
 */
export function isPathProtected(pathname) {
  if (typeof pathname !== "string") return false;
  // Tutor-inserted whiteboard assets — referenced only inside events.json.
  if (/^whiteboard-sessions\/[^/]+\/[^/]+\/assets\//.test(pathname)) return true;
  // Whiteboard recovery checkpoints — not referenced in any DB column.
  if (/^whiteboard-checkpoints\//.test(pathname)) return true;
  return false;
}
