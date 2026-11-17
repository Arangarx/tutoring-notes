/**
 * Compare npm audit's high/critical package names to scripts/audit-allow.json.
 *
 * The sets must match. A reported package that is not listed fails the job.
 * A listed package that is no longer high or critical is a stale exception
 * and also fails the job.
 *
 * @param {string[]} reportedNames
 * @param {Array<{ name?: unknown, reason?: unknown }>} entries
 * @returns {{ ok: boolean, unexpected: string[], stale: string[], invalid: string[] }}
 */
function compareAuditAllowlist(reportedNames, entries) {
  const invalid = [];
  const allowNames = [];
  if (!Array.isArray(entries)) {
    return {
      ok: false,
      unexpected: [],
      stale: [],
      invalid: ["packages must be an array"],
    };
  }
  for (const entry of entries) {
    const name = entry && typeof entry.name === "string" ? entry.name.trim() : "";
    const reason = entry && typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!name) {
      invalid.push("entry missing package name");
      continue;
    }
    if (!reason) {
      invalid.push(`${name} missing reason`);
      continue;
    }
    allowNames.push(name);
  }
  const reportedSet = new Set(reportedNames);
  const allowSet = new Set(allowNames);
  const unexpected = [...reportedSet].filter((name) => !allowSet.has(name)).sort();
  const stale = [...allowSet].filter((name) => !reportedSet.has(name)).sort();
  return {
    ok: invalid.length === 0 && unexpected.length === 0 && stale.length === 0,
    unexpected,
    stale,
    invalid,
  };
}

module.exports = { compareAuditAllowlist };
