/**
 * Consent wave — jest/grep guards and statement-count bounds (docs/handoff/consent-wave-plan.md § 6i).
 *
 * Entries still marked `it.todo` are owned by the wave named beside them. A todo is replaced by a real test in
 * the wave that lands the behavior, with red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 * Jest is the right layer here: the oracle is a grep or a statement count, not rendered behavior.
 */

import fs from "node:fs";
import path from "node:path";
import {
  TUTOR_MIC_STREAM_ID,
  isLearnerLane,
  parseLane,
  speakerTranscriptStreamId,
  studentMicStreamId,
} from "@/lib/recording/session-capabilities";

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

  describe("C2a lane literal guard (§ 2.3, § 6i)", () => {
    const LANE_MODULE = "lib/recording/session-capabilities.ts";
    const LANE_MODULE_IMPORT = "@/lib/recording/session-capabilities";

    /** The wire formats of a stream id. A product line that holds one of these builds or parses a lane by hand. */
    const LANE_LITERAL = /tutor:mic|speaker:|student:peer-|:transcript\b/;

    /** Lane symbols that exist once, in the module. Nobody else defines, re-exports or imports them elsewhere. */
    const LANE_SYMBOLS = [
      "TUTOR_MIC_STREAM_ID",
      "studentMicStreamId",
      "speakerTranscriptStreamId",
      "peerIdFromStudentMicStreamId",
      "parseLane",
      "isLearnerLane",
    ];

    /** Drops comment-only lines and a trailing `// ...` comment, so prose that names the format is not a hit. */
    function codeOnly(text: string): string {
      return text
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .map((line) => line.replace(/\s\/\/.*$/, ""))
        .join("\n");
    }

    it("no product file outside session-capabilities.ts contains a lane literal", () => {
      const offenders: string[] = [];
      for (const file of listProductFiles(SRC_ROOT)) {
        const name = rel(file);
        if (name === LANE_MODULE) continue;
        const hit = codeOnly(fs.readFileSync(file, "utf8")).match(LANE_LITERAL);
        if (hit) offenders.push(`${name}: ${hit[0]}`);
      }
      expect(offenders).toEqual([]);
    });

    it("the guard itself: catches every lane literal in code, ignores the same text in comments", () => {
      for (const code of [
        'const id = "tutor:mic";',
        "const id = `student:peer-${peerId}:mic`;",
        "const id = `speaker:${speakerId}:transcript`;",
        'if (streamId.startsWith("speaker:")) return 1;',
        "s.replace(/:transcript$/, '');",
        "const re = /^student:peer-(.+):mic$/;",
      ]) {
        expect(codeOnly(code).match(LANE_LITERAL)).not.toBeNull();
      }
      for (const prose of [
        "// tutor:mic is the mixdown",
        "  /** Build a `student:peer-<peerId>:mic` stream id. */",
        "   * `speaker:<id>:transcript` lanes",
        "const x = 1; // tutor:mic",
      ]) {
        expect(codeOnly(prose).match(LANE_LITERAL)).toBeNull();
      }
    });

    it("no product file outside session-capabilities.ts defines, re-exports or imports a lane symbol from elsewhere", () => {
      const offenders: string[] = [];
      for (const file of listAllFiles(SRC_ROOT)) {
        const name = rel(file);
        if (name === LANE_MODULE || path.resolve(file) === path.resolve(__filename)) continue;
        const code = codeOnly(fs.readFileSync(file, "utf8"));
        for (const symbol of LANE_SYMBOLS) {
          const defined = new RegExp(`\\b(?:function|const|let|var)\\s+${symbol}\\b`).test(code);
          const reExported = new RegExp(`\\bexport\\s*(?:type\\s*)?\\{[^}]*\\b${symbol}\\b[^}]*\\}`).test(code);
          if (defined || reExported) offenders.push(`${name}: defines or re-exports ${symbol}`);
        }
        for (const match of code.matchAll(/\bimport\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
          const [, names, from] = match;
          if (from === LANE_MODULE_IMPORT) continue;
          for (const symbol of LANE_SYMBOLS) {
            if (new RegExp(`\\b${symbol}\\b`).test(names)) offenders.push(`${name}: imports ${symbol} from ${from}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });
  it.todo("C4c: reaper is the fifth caller (G7): one shared stampStaleWhiteboardSessionEnd; no other file writes a stale/forced endedAt or calls stampBoardPurgeIntent/freezeConsentSnapshotTx outside the helper and the two End paths");
  it.todo("C6: replay single decision function: no replay decision site reads consent or snapshot columns outside replay-access.ts");
  it.todo("C7: consent copy covers every switch effect (§ 2.8)");
  describe("C2a lane identity (§ 2.3): parseLane / isLearnerLane", () => {
    // The wire formats are persisted in SessionRecording / TranscriptChunk rows and outbox rows, so they are pinned
    // here as literals: this is the contract, not something derived from the builders under test.
    it("the lane constant and every builder keep the persisted wire format", () => {
      expect(TUTOR_MIC_STREAM_ID).toBe("tutor:mic");
      expect(studentMicStreamId("alpha")).toBe("student:peer-alpha:mic");
      expect(studentMicStreamId("alpha")).not.toBe(studentMicStreamId("beta"));
      expect(speakerTranscriptStreamId("spk-1")).toBe("speaker:spk-1:transcript");
    });

    it("isLearnerLane fails closed on unknown stream ids", () => {
      // Only the exact tutor mixdown lane is not a learner lane. Anything unrecognised is treated as a learner's,
      // so a malformed or future lane id can never slip past a "learner audio is off" gate as tutor audio.
      for (const unknown of [
        "",
        " ",
        "tutor",
        "tutor:cam",
        "Tutor:Mic",
        " tutor:mic",
        "tutor:mic ",
        "tutor:mic:extra",
        "tutor-mic",
        "student:mic",
        "student:peer-:mic",
        "student:peer-abc",
        "student:peer-abc:cam",
        "student:peer-abc:mic:extra",
        "speaker",
        "speaker-abc:transcript",
        "mic",
        "undefined",
        "null",
        "\u0000",
      ]) {
        expect(parseLane(unknown).kind).toBe("unknown");
        expect(isLearnerLane(unknown)).toBe(true);
      }
      expect(isLearnerLane(TUTOR_MIC_STREAM_ID)).toBe(false);
    });

    it("parseLane classifies every stream-id format in the codebase", () => {
      expect(parseLane("tutor:mic")).toEqual({ kind: "tutor" });
      expect(parseLane("student:peer-abc:mic")).toEqual({ kind: "learner", peerId: "abc" });
      expect(parseLane("speaker:spk-1:transcript")).toEqual({ kind: "learner", speakerId: "spk-1" });
      // Legacy shape the notes labeller always accepted: a speaker lane without the transcript suffix.
      expect(parseLane("speaker:spk-1")).toEqual({ kind: "learner", speakerId: "spk-1" });
      for (const learner of ["student:peer-abc:mic", "speaker:spk-1:transcript", "speaker:spk-1"]) {
        expect(isLearnerLane(learner)).toBe(true);
      }
    });

    it("parseLane(builder(x)) round-trips for every builder", () => {
      const ids = ["a", "peer-1", "spk-1", "x y", "a:b", "tutor", "mic", "learner:xyz", "a:transcript", "9f1c-77aa-uuid"];
      expect(parseLane(TUTOR_MIC_STREAM_ID)).toEqual({ kind: "tutor" });
      for (const id of ids) {
        expect(parseLane(studentMicStreamId(id))).toEqual({ kind: "learner", peerId: id });
        expect(parseLane(speakerTranscriptStreamId(id))).toEqual({ kind: "learner", speakerId: id });
      }
      // The empty speaker id is legal for the transcript builder and round-trips too.
      expect(parseLane(speakerTranscriptStreamId(""))).toEqual({ kind: "learner", speakerId: "" });
    });

    it("every lane builder in the module is covered by the round-trip above (a new builder needs a new row)", () => {
      const source = fs.readFileSync(path.join(SRC_ROOT, "lib/recording/session-capabilities.ts"), "utf8");
      const exported = [
        ...[...source.matchAll(/export function (\w*StreamId)\b/g)].map((m) => m[1]),
        ...[...source.matchAll(/export const (\w*STREAM_ID)\b/g)].map((m) => m[1]),
      ].sort();
      expect(exported).toEqual(["TUTOR_MIC_STREAM_ID", "speakerTranscriptStreamId", "studentMicStreamId"]);
    });
  });
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
