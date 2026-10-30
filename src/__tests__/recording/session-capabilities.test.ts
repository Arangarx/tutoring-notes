/**
 * Consent wave C1 — the pure capability table (plan § 2.2).
 *
 * Oracle: the plan's truth table and prose rules, typed here as data / independent boolean logic. Nothing is
 * read back from `CONSENT_SWITCHES[*].offEffect` to compute an expectation (that would pass by construction).
 */
import {
  acceptsAudioSegments,
  deriveSessionCapabilities,
  mergeRestrictive,
  type CapabilityFields,
  type CapabilitySessionMode,
  type SessionCapabilities,
  type SessionCapabilityInput,
} from "@/lib/recording/session-capabilities";
import { CONSENT_SWITCHES } from "@/lib/consent-toggle-copy";

type Toggles = SessionCapabilityInput["toggles"];

const ALL_ON: Omit<SessionCapabilities, "off"> = {
  audio: { mode: "full" },
  mic: { acquire: "yes" },
  transcript: { tutorVoice: true, learnerVoice: true },
  whiteboard: { persist: true },
  notes: { draft: true },
  replay: { audio: true, board: true },
};

function derive(
  toggles: Toggles,
  sessionMode: CapabilitySessionMode,
  extra: Partial<SessionCapabilityInput> = {}
): SessionCapabilities {
  return deriveSessionCapabilities({ hasConsentSnapshot: true, toggles, sessionMode, notesForbidden: false, ...extra });
}

const T = (audio: boolean, whiteboard: boolean, notes: boolean): Toggles => ({ audio, whiteboard, notes });

// ---------------------------------------------------------------------------
// The brief's truth table, row by row (plan § 2.2). `online` is not a column (F3).
// ---------------------------------------------------------------------------
type Row = {
  name: string;
  toggles: Toggles;
  mode: CapabilitySessionMode;
  expected: Omit<SessionCapabilities, "off">;
};

const TRUTH_TABLE: Row[] = [
  { name: "on/on/on LIVE", toggles: T(true, true, true), mode: "LIVE", expected: ALL_ON },
  { name: "on/on/on IN_PERSON", toggles: T(true, true, true), mode: "IN_PERSON", expected: ALL_ON },
  {
    name: "off/on/on LIVE",
    toggles: T(false, true, true),
    mode: "LIVE",
    expected: {
      ...ALL_ON,
      audio: { mode: "tutor_only" },
      transcript: { tutorVoice: true, learnerVoice: false },
    },
  },
  {
    name: "off/on/on IN_PERSON",
    toggles: T(false, true, true),
    mode: "IN_PERSON",
    expected: {
      audio: { mode: "none" },
      mic: { acquire: "no" },
      transcript: { tutorVoice: false, learnerVoice: false },
      whiteboard: { persist: true },
      notes: { draft: false },
      replay: { audio: false, board: true },
    },
  },
  {
    name: "off/on/on UNKNOWN",
    toggles: T(false, true, true),
    mode: "UNKNOWN",
    expected: {
      audio: { mode: "none" },
      mic: { acquire: "defer" },
      transcript: { tutorVoice: false, learnerVoice: false },
      whiteboard: { persist: true },
      notes: { draft: false },
      replay: { audio: false, board: true },
    },
  },
  ...(["LIVE", "IN_PERSON", "UNKNOWN"] as const).map(
    (mode): Row => ({
      name: `on/off/on ${mode}`,
      toggles: T(true, false, true),
      mode,
      expected: { ...ALL_ON, whiteboard: { persist: false }, replay: { audio: true, board: false } },
    })
  ),
  ...(["LIVE", "IN_PERSON", "UNKNOWN"] as const).map(
    (mode): Row => ({
      name: `on/on/off ${mode}`,
      toggles: T(true, true, false),
      mode,
      expected: {
        ...ALL_ON,
        transcript: { tutorVoice: false, learnerVoice: false },
        notes: { draft: false },
      },
    })
  ),
  {
    name: "off/off/off LIVE",
    toggles: T(false, false, false),
    mode: "LIVE",
    expected: {
      audio: { mode: "tutor_only" },
      mic: { acquire: "yes" },
      transcript: { tutorVoice: false, learnerVoice: false },
      whiteboard: { persist: false },
      notes: { draft: false },
      replay: { audio: true, board: false },
    },
  },
];

describe("deriveSessionCapabilities — the brief's truth table", () => {
  it.each(TRUTH_TABLE.map((r) => [r.name, r] as const))("%s", (_name, row) => {
    const { off: _off, ...fields } = derive(row.toggles, row.mode);
    expect(fields).toEqual(row.expected);
  });
});

// ---------------------------------------------------------------------------
// Every toggle x mode combination against independent per-field rules (plan prose, not the table).
// ---------------------------------------------------------------------------
describe("deriveSessionCapabilities — every combination against the per-field rules", () => {
  const modes: CapabilitySessionMode[] = ["LIVE", "IN_PERSON", "UNKNOWN"];
  const bools = [true, false];
  const cases: Array<[boolean, boolean, boolean, CapabilitySessionMode]> = [];
  for (const a of bools) for (const w of bools) for (const n of bools) for (const m of modes) cases.push([a, w, n, m]);

  it.each(cases)("audio=%s wb=%s notes=%s mode=%s", (audio, wb, notes, mode) => {
    const audioNothingSaved = !audio && mode !== "LIVE"; // in person / waiting room with audio off
    const got = derive(T(audio, wb, notes), mode);

    expect(got.audio.mode).toBe(audio ? "full" : mode === "LIVE" ? "tutor_only" : "none");
    expect(got.mic.acquire).toBe(audio || mode === "LIVE" ? "yes" : mode === "IN_PERSON" ? "no" : "defer");
    expect(got.transcript.tutorVoice).toBe(notes && !audioNothingSaved);
    expect(got.transcript.learnerVoice).toBe(notes && audio);
    expect(got.whiteboard.persist).toBe(wb);
    expect(got.notes.draft).toBe(notes && !audioNothingSaved);
    expect(got.replay.audio).toBe(!audioNothingSaved);
    expect(got.replay.board).toBe(wb);

    const expectedOff: SessionCapabilities["off"] = [];
    if (!audio) expectedOff.push("audio");
    if (!wb) expectedOff.push("whiteboard");
    if (!notes) expectedOff.push("notes");
    expect(got.off).toEqual(expectedOff);
  });
});

// ---------------------------------------------------------------------------
// Flipping exactly one switch changes exactly the fields the brief names for it.
// ---------------------------------------------------------------------------
function leafPaths(c: Omit<SessionCapabilities, "off">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [group, leaves] of Object.entries(c)) {
    for (const [leaf, value] of Object.entries(leaves as Record<string, unknown>)) out[`${group}.${leaf}`] = value;
  }
  return out;
}

function changedPaths(a: SessionCapabilities, b: SessionCapabilities): string[] {
  const { off: _a, ...fa } = a;
  const { off: _b, ...fb } = b;
  const la = leafPaths(fa);
  const lb = leafPaths(fb);
  return Object.keys(la).filter((k) => la[k] !== lb[k]).sort();
}

describe("deriveSessionCapabilities — one switch off changes only the brief's fields", () => {
  const BRIEF: Array<{ switchName: string; toggles: Toggles; mode: CapabilitySessionMode; changed: string[] }> = [
    { switchName: "audio", toggles: T(false, true, true), mode: "LIVE", changed: ["audio.mode", "transcript.learnerVoice"] },
    {
      switchName: "audio",
      toggles: T(false, true, true),
      mode: "IN_PERSON",
      changed: ["audio.mode", "mic.acquire", "notes.draft", "replay.audio", "transcript.learnerVoice", "transcript.tutorVoice"],
    },
    {
      switchName: "audio",
      toggles: T(false, true, true),
      mode: "UNKNOWN",
      changed: ["audio.mode", "mic.acquire", "notes.draft", "replay.audio", "transcript.learnerVoice", "transcript.tutorVoice"],
    },
    ...(["LIVE", "IN_PERSON", "UNKNOWN"] as const).flatMap((mode) => [
      { switchName: "whiteboard", toggles: T(true, false, true), mode, changed: ["replay.board", "whiteboard.persist"] },
      {
        switchName: "notes",
        toggles: T(true, true, false),
        mode,
        changed: ["notes.draft", "transcript.learnerVoice", "transcript.tutorVoice"],
      },
    ]),
  ];

  it.each(BRIEF.map((b) => [`${b.switchName} off, ${b.mode}`, b] as const))("%s", (_name, b) => {
    const base = derive(T(true, true, true), b.mode);
    expect(changedPaths(base, derive(b.toggles, b.mode))).toEqual(b.changed);
  });

  it("every capability field is reachable from some switch, or is constant", () => {
    // Typed independently: the eight behavior fields of § 2.2. A new field added to SessionCapabilities without a
    // switch effect fails the second expectation below.
    const FIELDS = [
      "audio.mode",
      "mic.acquire",
      "notes.draft",
      "replay.audio",
      "replay.board",
      "transcript.learnerVoice",
      "transcript.tutorVoice",
      "whiteboard.persist",
    ];
    const reachable = new Set<string>();
    for (const row of BRIEF) for (const p of row.changed) reachable.add(p);
    expect([...reachable].sort()).toEqual(FIELDS);
    expect(Object.keys(leafPaths(derive(T(true, true, true), "LIVE"))).sort()).toEqual(FIELDS);
  });
});

// ---------------------------------------------------------------------------
// notesForbidden folds into the notes switch ("End it now, and no notes").
// ---------------------------------------------------------------------------
describe("deriveSessionCapabilities — notesForbidden", () => {
  it.each(["LIVE", "IN_PERSON", "UNKNOWN"] as const)(
    "forces notes.draft and both transcript flags off whatever the toggles say (%s)",
    (mode) => {
      const got = derive(T(true, true, true), mode, { notesForbidden: true });
      expect(got.notes.draft).toBe(false);
      expect(got.transcript).toEqual({ tutorVoice: false, learnerVoice: false });
      expect(got.off).toEqual(["notes"]);
      // Nothing else moves: audio, whiteboard and replay are untouched.
      expect(got.audio).toEqual({ mode: "full" });
      expect(got.whiteboard).toEqual({ persist: true });
      expect(got.replay).toEqual({ audio: true, board: true });
    }
  );

  it("is a no-op when notes were already off", () => {
    expect(derive(T(true, true, false), "LIVE", { notesForbidden: true })).toEqual(derive(T(true, true, false), "LIVE"));
  });
});

// ---------------------------------------------------------------------------
// Legacy: a session frozen before consent existed behaves as the client always did (no audio).
// ---------------------------------------------------------------------------
describe("deriveSessionCapabilities — no consent snapshot (legacy)", () => {
  it.each(["LIVE", "IN_PERSON"] as const)("no snapshot %s -> audio none, everything else unrestricted, nothing listed off", (mode) => {
    // toggles are ignored on purpose: there is no frozen record to read them from.
    const got = deriveSessionCapabilities({
      hasConsentSnapshot: false,
      toggles: T(true, false, false),
      sessionMode: mode,
      notesForbidden: false,
    });
    expect(got.audio).toEqual({ mode: "none" });
    expect(got.whiteboard).toEqual({ persist: true });
    expect(got.notes).toEqual({ draft: true });
    expect(got.off).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mergeRestrictive: the one merge. Plan: false over true, no over defer over yes, none over tutor_only over full.
// ---------------------------------------------------------------------------
describe("mergeRestrictive", () => {
  const base = (over: Partial<CapabilityFields> = {}): CapabilityFields => ({ ...ALL_ON, ...over });

  it.each([
    ["tutor_only", "none", "none"],
    ["none", "tutor_only", "none"],
    ["full", "tutor_only", "tutor_only"],
    ["tutor_only", "full", "tutor_only"],
  ] as const)("audio mode %s then %s -> %s", (start, apply, expected) => {
    const merged = mergeRestrictive(base({ audio: { mode: start } }), { audio: { mode: apply } });
    expect(merged.audio.mode).toBe(expected);
  });

  it.each([
    ["yes", "defer", "defer"],
    ["defer", "yes", "defer"],
    ["defer", "no", "no"],
    ["no", "defer", "no"],
    ["yes", "no", "no"],
    ["no", "yes", "no"],
  ] as const)("mic %s then %s -> %s", (start, apply, expected) => {
    const merged = mergeRestrictive(base({ mic: { acquire: start } }), { mic: { acquire: apply } });
    expect(merged.mic.acquire).toBe(expected);
  });

  it("booleans: false beats true in both orders", () => {
    expect(mergeRestrictive(base(), { notes: { draft: false } }).notes.draft).toBe(false);
    expect(mergeRestrictive(base({ notes: { draft: false } }), { notes: { draft: true } }).notes.draft).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const start = base();
    const snapshot = JSON.stringify(start);
    mergeRestrictive(start, { audio: { mode: "none" }, whiteboard: { persist: false } });
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// The server's audio gate (replaces the old mode-aware allow/deny).
// ---------------------------------------------------------------------------
describe("acceptsAudioSegments", () => {
  it.each([
    ["full", true],
    ["tutor_only", true],
    ["none", false],
  ] as const)("audio mode %s -> %s", (mode, expected) => {
    expect(acceptsAudioSegments({ ...derive(T(true, true, true), "LIVE"), audio: { mode } })).toBe(expected);
  });

  it("matches the product rule end to end: online keeps the tutor mixdown, in person with audio off refuses", () => {
    expect(acceptsAudioSegments(derive(T(false, true, true), "LIVE"))).toBe(true);
    expect(acceptsAudioSegments(derive(T(false, true, true), "IN_PERSON"))).toBe(false);
    expect(acceptsAudioSegments(derive(T(true, true, true), "IN_PERSON"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// One table: copy and behavior share it.
// ---------------------------------------------------------------------------
describe("CONSENT_SWITCHES — the one switch table", () => {
  it("lists the four switches once each, in the order the editors render them", () => {
    expect(CONSENT_SWITCHES.map((s) => s.key)).toEqual([
      "allowLiveSession",
      "allowAudioRecording",
      "allowWhiteboardRecording",
      "allowNoteSending",
    ]);
    expect(CONSENT_SWITCHES.map((s) => s.capability)).toEqual(["online", "audio", "whiteboard", "notes"]);
  });

  it("every entry still carries its label and description (copy half)", () => {
    for (const entry of CONSENT_SWITCHES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("the online switch carries no behavior: entry is sessionEntryState (F3)", () => {
    const online = CONSENT_SWITCHES.find((s) => s.capability === "online");
    expect(online).toBeDefined();
    expect(online && "offEffect" in online).toBe(false);
  });

  it.todo("C7: every CONSENT_SWITCHES entry carries effectWhenOff copy that the notice, editors, decline dialog and privacy page render");
});
