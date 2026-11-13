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

describe("consent guards (§ 6i)", () => {
  it("C1: consent single resolver: no product file outside the allowlist calls consentRecord.find*/count/aggregate", () => {
    const offenders: string[] = [];
    for (const file of listProductFiles(SRC_ROOT)) {
      const name = rel(file);
      if (CONSENT_READ_ALLOWLIST.has(name)) continue;
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
  describe("C4c: the reaper is the fifth caller of the shared stale-end helper (G7, § 6i)", () => {
    const STAMP_HELPER = "lib/whiteboard/stale-session-stamp.ts";
    /** The tutor End path: the one other place that ends a session in a transaction. */
    const END_PATH = "app/admin/students/[id]/whiteboard/actions.ts";
    /** Test-only seeding routes; gated by `isPlaywrightTestEnvEnabled`, never a product End. */
    const TEST_ROUTE_PREFIX = "app/api/test/";

    /** Product files (tests and test routes excluded) whose code matches `pattern`. */
    function filesMatching(pattern: RegExp, opts?: { includeTestRoutes?: boolean }): string[] {
      return listProductFiles(SRC_ROOT)
        .map(rel)
        .filter((name) => opts?.includeTestRoutes || !name.startsWith(TEST_ROUTE_PREFIX))
        .filter((name) => pattern.test(codeOnlyForGuard(fs.readFileSync(path.join(SRC_ROOT, name), "utf8"))))
        .sort();
    }

    /** Drops comment-only lines and trailing `// ...` so prose that names a call is not a hit. */
    function codeOnlyForGuard(text: string): string {
      return text
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .map((line) => line.replace(/\s\/\/.*$/, ""))
        .join("\n");
    }

    /** A CALL (not the definition) of `name`. */
    const callOf = (name: string) => new RegExp(`(?<!function\\s)(?<![.\\w])${name}\\s*\\(`);
    /** A write of `endedAt` into a WhiteboardSession row, by update, updateMany or upsert. */
    const ENDED_AT_WRITE = /whiteboardSession\s*\.\s*(?:update|updateMany|upsert)\s*\(\s*\{[\s\S]{0,400}?data\s*:\s*\{[\s\S]{0,300}?\bendedAt\s*:/;

    it("stampBoardPurgeIntent and freezeConsentSnapshotAtEndTx are called only by the stale-end helper and the tutor End path", () => {
      expect(filesMatching(callOf("stampBoardPurgeIntent"))).toEqual([END_PATH, STAMP_HELPER].sort());
      expect(filesMatching(callOf("freezeConsentSnapshotAtEndTx"))).toEqual([END_PATH, STAMP_HELPER].sort());
    });

    it("no product file other than the stale-end helper and the tutor End path writes a WhiteboardSession endedAt", () => {
      expect(filesMatching(ENDED_AT_WRITE)).toEqual([END_PATH, STAMP_HELPER].sort());
    });

    it("stampStaleWhiteboardSessionEnd has exactly five callers: the forced-end paths and the reaper", () => {
      expect(filesMatching(callOf("stampStaleWhiteboardSessionEnd"))).toEqual(
        [END_PATH, "lib/org-scope.ts", "lib/org-force-end-touch.ts", "lib/whiteboard/stale-session-reaper.ts"].sort()
      );
    });

    it("the reaper ends a session only through the helper, passing the last-activity instant as endedAt and intent source reaper", () => {
      const reaper = codeOnlyForGuard(
        fs.readFileSync(path.join(SRC_ROOT, "lib/whiteboard/stale-session-reaper.ts"), "utf8")
      );
      expect(reaper).toMatch(
        /stampStaleWhiteboardSessionEnd\(\s*tx\s*,\s*id\s*,\s*locked\.lastActivityAt\s*,\s*false\s*,\s*"reaper"\s*\)/
      );
      // It never writes the end, the intent or the freeze itself, and never back-dates the server-time stamps.
      expect(reaper).not.toMatch(ENDED_AT_WRITE);
      expect(reaper).not.toMatch(callOf("stampBoardPurgeIntent"));
      expect(reaper).not.toMatch(callOf("freezeConsentSnapshotAtEndTx"));
      expect(reaper).not.toMatch(/\b(?:frozenAt|revokedAt)\b/);
    });

    it("the guard itself: matches a call, a write and an import-free definition correctly", () => {
      expect(callOf("stampBoardPurgeIntent").test("await stampBoardPurgeIntent(tx, id, {})")).toBe(true);
      expect(callOf("stampBoardPurgeIntent").test("export async function stampBoardPurgeIntent(tx) {")).toBe(false);
      expect(callOf("stampBoardPurgeIntent").test("x.stampBoardPurgeIntent(tx)")).toBe(false);
      expect(
        ENDED_AT_WRITE.test("await tx.whiteboardSession.updateMany({\n  where: { id },\n  data: { endedAt: now },\n});")
      ).toBe(true);
      expect(ENDED_AT_WRITE.test("db.whiteboardSession.findUnique({ where: { id }, select: { endedAt: true } })")).toBe(false);
      expect(ENDED_AT_WRITE.test("db.impersonationLog.update({ where: { id }, data: { endedAt: new Date() } })")).toBe(false);
    });
  });
  describe("C6: replay single decision function (§ 2.9, § 6i)", () => {
    /** Every site that decides what of an ended session may be replayed. Each routes through the one function. */
    const REPLAY_DECISION_SITES = [
      "lib/share/replay-access.ts",
      "lib/share/loadWhiteboardReplayIdsForNotes.ts",
      "lib/share/learner-replay-access.ts",
      "lib/share/proxy-share-resource.ts",
      "lib/learner-home-notes.ts",
      "app/api/audio/[recordingId]/route.ts",
      "app/api/whiteboard/[sessionId]/public-events/route.ts",
      "app/api/whiteboard/[sessionId]/public-snapshot/route.ts",
      "app/api/whiteboard/[sessionId]/public-concat-audio/route.ts",
      "app/api/whiteboard/[sessionId]/tutor-asset/route.ts",
      "app/s/[token]/whiteboard/[whiteboardSessionId]/page.tsx",
      "app/join/notes/[whiteboardSessionId]/whiteboard/page.tsx",
      "app/s/[token]/page.tsx",
      "app/s/[token]/all/page.tsx",
    ];
    const REPLAY_MODULE = "lib/share/replay-access.ts";

    /** The four consent switch columns and the frozen snapshot / restriction tables. Named once, here, as the spec. */
    const CONSENT_COLUMNS =
      /\b(allowLiveSession|allowAudioRecording|allowWhiteboardRecording|allowNoteSending)\b|\bsessionConsentSnapshot\b|\bconsentRestriction\b/;
    /** A live consent read: the resolvers that read the family's current record. */
    const LIVE_RESOLVER = /\b(resolveEffectiveConsentForStudent|readLatestConsentPerOwner|resolveSessionCapabilities)\s*\(/;
    /** What a site calls to get the decision. Every decision site calls one of these. */
    const DECISION_ENTRY =
      /\b(resolveReplayAccess|applyReplayAccessToNotes|resolveLearnerWhiteboardReplay|assertWhiteboardReplayRequestAccess|replayResourceDeniedResponse)\b/;

    function replayCodeOnly(file: string): string {
      return fs
        .readFileSync(path.join(SRC_ROOT, file), "utf8")
        .split(/\r?\n/)
        .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
        .map((line) => line.replace(/\s\/\/.*$/, ""))
        .join("\n");
    }

    it("no replay decision site reads a consent switch column, the snapshot table or the restriction table", () => {
      const offenders = REPLAY_DECISION_SITES.filter((file) => CONSENT_COLUMNS.test(replayCodeOnly(file)));
      expect(offenders).toEqual([]);
    });

    it("only replay-access.ts calls a live consent resolver, and only for a session with no snapshot (the legacy function)", () => {
      const outside = REPLAY_DECISION_SITES.filter(
        (file) => file !== REPLAY_MODULE && LIVE_RESOLVER.test(replayCodeOnly(file))
      );
      expect(outside).toEqual([]);

      // Inside the module the live read lives in exactly one function, the legacy (no snapshot) board read. Cutting
      // that function out must leave no live resolver call behind.
      const code = replayCodeOnly(REPLAY_MODULE);
      const start = code.indexOf("async function legacyBoardAllowed");
      expect(start).toBeGreaterThan(-1);
      const end = code.indexOf("\n}\n", start);
      expect(end).toBeGreaterThan(start);
      const withoutLegacy = code.slice(0, start) + code.slice(end + 3);
      expect(LIVE_RESOLVER.test(withoutLegacy)).toBe(false);
    });

    it("every replay decision site gets its answer from the one function", () => {
      const missing = REPLAY_DECISION_SITES.filter(
        (file) => file !== REPLAY_MODULE && !DECISION_ENTRY.test(replayCodeOnly(file))
      );
      expect(missing).toEqual([]);
    });

    it("the guard itself: catches a column, the snapshot and restriction tables and a live resolver call; ignores an import and prose", () => {
      for (const code of [
        "where: { allowWhiteboardRecording: true }",
        "db.sessionConsentSnapshot.findUnique({})",
        "await db.consentRestriction.findUnique({})",
      ]) {
        expect(CONSENT_COLUMNS.test(code)).toBe(true);
      }
      expect(LIVE_RESOLVER.test("await resolveEffectiveConsentForStudent(id, s)")).toBe(true);
      expect(LIVE_RESOLVER.test("import { resolveEffectiveConsentForStudent } from 'x'")).toBe(false);
      expect(CONSENT_COLUMNS.test("// whiteboard consent switch")).toBe(false);
    });
  });
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
      // C5: the ONE entry rule (`sessionEntryState`) replaced the second existence check, the unreferenced
      // live-record denial table and its assert, and the loader's reason-recovery helper.
      "assertConsentRecordExists",
      "assertConsentFromLiveRecord",
      "LIVE_RECORD_DENIAL_COPY",
      "CONSENT_RECORD_REQUIRED_MESSAGE",
      "consentRecordRefusalReason",
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
  // C4b O1 (org stamp loops O(1) per session, against the real test database) lives in org/org-stamp-loop.integration.test.ts.
  // C3a S14(a) and C4b S14(a2) (End statement order through the purge intent) live in whiteboard/end-statement-order.test.ts;
  // C4b S14(c) (the checkpoint batch re-check under the lock) lives in api/checkpoint-batch-lock.test.ts.
  it.todo("C3c: M17 join-timer ACTIVE poll cost: one snapshot read, no live-record read");
  it.todo("each wave: [cns] / [slc] / [txc] / [tnt] log lines are emitted (§ 8 observability)");
  it.todo("W21 (run in C0's gate and again in C4b, unmodified): blob-inventory.test.ts, process-erasure-job.test.ts, erasure-lifecycle.integration.test.ts, erasure-access-suspension.integration.test.ts, share-link-erasure-guard.integration.test.ts");
});
