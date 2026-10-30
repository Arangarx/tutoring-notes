/**
 * Consent wave — jest/grep guards and statement-count bounds (docs/handoff/consent-wave-plan.md § 6i).
 *
 * C0 SKELETON: every entry is `it.todo`, owned by the wave named beside it. A todo is replaced by a real test in
 * the wave that lands the behavior, with red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 * Jest is the right layer here: the oracle is a grep or a statement count, not rendered behavior.
 */

import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(__dirname, "..");

function listProductFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      listProductFiles(full, out);
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function listAllFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("test-results")) continue;
      listAllFiles(full, out);
    } else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative, forward-slash path, so the allowlist below reads the same on Windows. */
function rel(file: string): string {
  return path.relative(SRC_ROOT, file).split(path.sep).join("/");
}

/** A direct read of the ConsentRecord table: find*, count, aggregate, groupBy. Whitespace-tolerant. */
const DIRECT_CONSENT_RECORD_READ = /\bconsentRecord\s*\.\s*(find\w*|count|aggregate|groupBy)\b/g;

/**
 * § 6i `consent single resolver` (§ 2.1 table). The complete allowlist, with the reason each is allowed:
 *   - consent-scope.ts: the one reader.
 *   - consent-write.ts: a version counter on the write path, not a consent decision.
 *   - account/children/[id]/consent/page.tsx: the raw record the parent edits.
 * Not allowlisted (fixed in C1): claim/[token]/setup/page.tsx and child-consent.ts.
 */
const CONSENT_READ_ALLOWLIST = new Set([
  "lib/consent-scope.ts",
  "lib/consent-write.ts",
  "app/account/children/[id]/consent/page.tsx",
]);

/**
 * Named C6 exception, NOT an allowlist entry: the replay loader still ANDs the live record with the snapshot
 * until C6 deletes those reads (§ 2.1, § 6i wave split). C6 removes this constant and the guard then fails on
 * any remaining read.
 */
const NAMED_C6_EXCEPTION = new Set(["lib/share/loadWhiteboardReplayIdsForNotes.ts"]);

describe("consent guards (§ 6i)", () => {
  it("C1: consent single resolver: no product file outside the allowlist calls consentRecord.find*/count/aggregate", () => {
    const offenders: string[] = [];
    for (const file of listProductFiles(SRC_ROOT)) {
      const name = rel(file);
      if (CONSENT_READ_ALLOWLIST.has(name) || NAMED_C6_EXCEPTION.has(name)) continue;
      const text = fs.readFileSync(file, "utf8");
      const hits = text.match(DIRECT_CONSENT_RECORD_READ);
      if (hits) offenders.push(`${name}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("C1: the guard itself catches a direct read (self-test on a synthetic source line)", () => {
    for (const line of [
      "await db.consentRecord.findFirst({ where })",
      "await tx.consentRecord.findMany()",
      "client\n    .consentRecord\n    .count()",
      "db.consentRecord . aggregate({})",
    ]) {
      expect(line.match(DIRECT_CONSENT_RECORD_READ)).not.toBeNull();
    }
    // Writes and unrelated names are not reads.
    for (const line of ["db.consentRecord.create({})", "db.consentRecord.deleteMany({})", "resolveRecordedConsentX()"]) {
      expect(line.match(DIRECT_CONSENT_RECORD_READ)).toBeNull();
    }
  });

  it.todo("C2a: lane literal guard: no product file outside session-capabilities.ts contains the lane literals or its own parseLane/isLearnerLane");
  it.todo("C4c: reaper is the fifth caller (G7): one shared stampStaleWhiteboardSessionEnd; no other file writes a stale/forced endedAt or calls stampBoardPurgeIntent/freezeConsentSnapshotTx outside the helper and the two End paths");
  it.todo("C6: replay single decision function: no replay decision site reads consent or snapshot columns outside replay-access.ts");
  it.todo("C7: consent copy covers every switch effect (§ 2.8)");
  it.todo("C1: capabilities truth table, against the brief's table typed as data in the test");
  it.todo("C2a: isLearnerLane fails closed on unknown stream ids; parseLane classifies every stream-id format in the codebase");
  it("C1: no alias survives: the replaced consent symbols have zero references anywhere in src/, tests/ or scripts/", () => {
    const repoRoot = path.resolve(SRC_ROOT, "..");
    const REPLACED = [
      "deriveAudioCapturePolicy",
      "modeAwareAudioDecision",
      "resolveModeAwareAudioRecordingConsent",
      "assertEffectiveConsent",
      "resolveRecordedConsent",
      "audio-capture-policy",
    ];
    const self = path.resolve(__filename);
    const offenders: string[] = [];
    for (const root of ["src", "tests", "scripts"]) {
      const dir = path.join(repoRoot, root);
      if (!fs.existsSync(dir)) continue;
      for (const file of listAllFiles(dir)) {
        if (path.resolve(file) === self) continue;
        const text = fs.readFileSync(file, "utf8");
        for (const name of REPLACED) {
          if (new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(text)) {
            offenders.push(`${path.relative(repoRoot, file).split(path.sep).join("/")}: ${name}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("C1: deriveSessionCapabilities is NOT on the removal list: product code still wraps it", () => {
    const users = listProductFiles(SRC_ROOT).filter((f) => /\bderiveSessionCapabilities\b/.test(fs.readFileSync(f, "utf8")));
    expect(users.map(rel).sort()).toEqual(
      expect.arrayContaining([
        "app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx",
        "lib/consent-scope.ts",
      ])
    );
  });

  it.todo("C6: appointmentLiveEntryAllowed has zero references");
  it.todo("C4b/C4c: O1 org stamp loops do O(1) extra work per session: same statement count for 1 and 500 WhiteboardEventBatch rows, zero batch deleteMany, zero blob calls, and a pinned STAMP_MAX_STATEMENTS_PER_SESSION ceiling");
  it.todo("C3a: S14(a) statement order: the End and checkpoint-batch transactions take the session-row lock first, through the snapshot write");
  it.todo("C4b: S14(a2) the intent statement and S14(c) the batch re-check follow the lock");
  it.todo("C3c: M17 join-timer ACTIVE poll cost: one snapshot read, no live-record read");
  it.todo("each wave: [cns] / [slc] / [txc] / [tnt] log lines are emitted (§ 8 observability)");
  it.todo("W21 (run in C0's gate and again in C4b, unmodified): blob-inventory.test.ts, process-erasure-job.test.ts, erasure-lifecycle.integration.test.ts, erasure-access-suspension.integration.test.ts, share-link-erasure-guard.integration.test.ts");
});
