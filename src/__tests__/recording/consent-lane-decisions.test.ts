/**
 * Consent wave C2 — the pure per-lane gate decisions (plan § 2.3, rows A1, A2, A5, A6, A8, N1-N4).
 *
 * Oracle: the plan's behavior table, typed below as DATA (switch positions + lane -> allowed or refused). The
 * decisions are computed from capabilities that `deriveSessionCapabilities` builds from toggles, but nothing in an
 * expectation is read from the code under test, and no expectation is derived from `capabilities.*` flags.
 */
import {
  decideAudioSegment,
  decideNotesDraft,
  decideTranscription,
  deriveSessionCapabilities,
  isLearnerLane,
  speakerTranscriptStreamId,
  studentMicStreamId,
  type CapabilitySessionMode,
  type SessionCapabilities,
} from "@/lib/recording/session-capabilities";

const TUTOR = "tutor:mic";
const PEER = "student:peer-p1:mic";
const SPEAKER = "speaker:learner-1:transcript";
/** A stream id nobody builds: it must be treated as a learner lane (fail closed). */
const UNKNOWN = "mystery:lane";

const LANES: ReadonlyArray<{ name: string; streamId: string; learner: boolean }> = [
  { name: "tutor:mic", streamId: TUTOR, learner: false },
  { name: "student peer lane", streamId: PEER, learner: true },
  { name: "speaker transcript lane", streamId: SPEAKER, learner: true },
  { name: "unknown lane", streamId: UNKNOWN, learner: true },
];

function caps(
  audio: boolean,
  notes: boolean,
  mode: CapabilitySessionMode,
  notesForbidden = false
): SessionCapabilities {
  return deriveSessionCapabilities({
    hasConsentSnapshot: true,
    toggles: { audio, whiteboard: true, notes },
    sessionMode: mode,
    notesForbidden,
  });
}

// ---------------------------------------------------------------------------
// Behavior table. For each switch position: which lanes may be STORED as audio, which may be TRANSCRIBED, and
// whether notes may be drafted. `tx` reasons: a string = exactly that reason; an array = any of these (the plan
// only requires "refused" when two off-switches overlap).
// ---------------------------------------------------------------------------
type Reason = string | string[];
type Row = {
  name: string;
  audioToggle: boolean;
  notesToggle: boolean;
  mode: CapabilitySessionMode;
  notesForbidden?: boolean;
  /** tutor lane / learner lanes */
  audio: { tutor: boolean; learner: boolean };
  tx: { tutor: true | Reason; learner: true | Reason };
  notes: true | Reason;
};

const ROWS: Row[] = [
  {
    name: "A1: audio on, notes on, online: everything allowed",
    audioToggle: true,
    notesToggle: true,
    mode: "LIVE",
    audio: { tutor: true, learner: true },
    tx: { tutor: true, learner: true },
    notes: true,
  },
  {
    name: "A1: audio on, notes on, in person: everything allowed",
    audioToggle: true,
    notesToggle: true,
    mode: "IN_PERSON",
    audio: { tutor: true, learner: true },
    tx: { tutor: true, learner: true },
    notes: true,
  },
  {
    name: "A2/A5: online, audio off, notes on: tutor kept, learner refused everywhere",
    audioToggle: false,
    notesToggle: true,
    mode: "LIVE",
    audio: { tutor: true, learner: false },
    tx: { tutor: true, learner: "audio_off" },
    notes: true,
  },
  {
    name: "A6: in person, audio off, notes on: all audio and transcription refused, nothing to draft from",
    audioToggle: false,
    notesToggle: true,
    mode: "IN_PERSON",
    audio: { tutor: false, learner: false },
    tx: { tutor: "audio_off", learner: "audio_off" },
    notes: "no_audio",
  },
  {
    name: "N1: audio on, notes off, online: audio still stored, nothing transcribed or drafted",
    audioToggle: true,
    notesToggle: false,
    mode: "LIVE",
    audio: { tutor: true, learner: true },
    tx: { tutor: "notes_off", learner: "notes_off" },
    notes: "notes_off",
  },
  {
    name: "N1: audio on, notes off, in person: audio still stored, nothing transcribed or drafted",
    audioToggle: true,
    notesToggle: false,
    mode: "IN_PERSON",
    audio: { tutor: true, learner: true },
    tx: { tutor: "notes_off", learner: "notes_off" },
    notes: "notes_off",
  },
  {
    name: "N2: online, audio off AND notes off: tutor audio kept, learner audio refused, no transcript, no notes",
    audioToggle: false,
    notesToggle: false,
    mode: "LIVE",
    audio: { tutor: true, learner: false },
    tx: { tutor: ["notes_off", "audio_off"], learner: ["notes_off", "audio_off"] },
    notes: "notes_off",
  },
  {
    name: "N2: in person, audio off AND notes off: nothing at all",
    audioToggle: false,
    notesToggle: false,
    mode: "IN_PERSON",
    audio: { tutor: false, learner: false },
    tx: { tutor: ["notes_off", "audio_off"], learner: ["notes_off", "audio_off"] },
    notes: ["no_audio", "notes_off"],
  },
  {
    name: "N4: org no-notes flag (notesForbidden), audio on: audio kept, no transcript, no notes",
    audioToggle: true,
    notesToggle: true,
    mode: "LIVE",
    notesForbidden: true,
    audio: { tutor: true, learner: true },
    tx: { tutor: "notes_forbidden", learner: "notes_forbidden" },
    notes: "notes_forbidden",
  },
];

function expectDecision(
  actual: { allow: boolean; reason?: string },
  expected: true | Reason,
  label: string
): void {
  if (expected === true) {
    expect({ label, allow: actual.allow }).toEqual({ label, allow: true });
    return;
  }
  expect({ label, allow: actual.allow }).toEqual({ label, allow: false });
  const allowedReasons = Array.isArray(expected) ? expected : [expected];
  expect({ label, reasonOk: allowedReasons.includes(actual.reason ?? "") }).toEqual({ label, reasonOk: true });
}

describe("lane identity helpers feed the gates (unknown fails closed)", () => {
  test("builders and parser agree on which lanes are learner lanes", () => {
    expect(isLearnerLane(TUTOR)).toBe(false);
    expect(isLearnerLane(studentMicStreamId("p9"))).toBe(true);
    expect(isLearnerLane(speakerTranscriptStreamId("s9"))).toBe(true);
    expect(isLearnerLane(UNKNOWN)).toBe(true);
    expect(isLearnerLane("")).toBe(true);
  });
});

describe.each(ROWS)("$name", (row) => {
  const c = caps(row.audioToggle, row.notesToggle, row.mode, row.notesForbidden ?? false);

  test.each(LANES)("audio segment on $name", ({ streamId, learner }) => {
    const expected = learner ? row.audio.learner : row.audio.tutor;
    const d = decideAudioSegment(c, streamId);
    expect(d.allow).toBe(expected);
    if (!d.allow) expect(d.reason).toBe("audio_off");
  });

  test.each(LANES)("transcription on $name", ({ streamId, learner }) => {
    const expected = learner ? row.tx.learner : row.tx.tutor;
    expectDecision(decideTranscription(c, row.notesForbidden ?? false, streamId), expected, streamId);
  });

  test("notes draft", () => {
    expectDecision(decideNotesDraft(c, row.notesForbidden ?? false), row.notes, "notes");
  });
});

describe("A8 invariant: a refused lane never becomes allowed by omitting or relabeling it", () => {
  const onlineAudioOff = caps(false, true, "LIVE");

  test("the learner transcript lane is refused while the tutor lane in the same session is allowed", () => {
    expect(decideTranscription(onlineAudioOff, false, SPEAKER).allow).toBe(false);
    expect(decideTranscription(onlineAudioOff, false, TUTOR).allow).toBe(true);
  });

  test("an unrecognized stream id is refused in the same position (no label opens the gate)", () => {
    expect(decideAudioSegment(onlineAudioOff, UNKNOWN).allow).toBe(false);
    expect(decideTranscription(onlineAudioOff, false, UNKNOWN).allow).toBe(false);
  });
});
