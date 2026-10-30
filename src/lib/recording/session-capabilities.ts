/**
 * Session capabilities: the ONE answer to "what may this session capture, transcribe, draft and replay"
 * (consent wave plan § 2.2, D5). Pure and isomorphic: no server imports, so the workspace client and the
 * server gates read the same derivation.
 *
 * Behavior lives in `CONSENT_SWITCHES[*].offEffect` (consent-toggle-copy.ts): the function starts from the
 * all-on value of every capability field and applies, for each switch that is off, that entry's effect for
 * the current mode. Nothing else writes a field (the single exception is the pre-consent legacy rule below).
 * The online switch (`allowLiveSession`) is NOT an input: who may start or join is org W4's
 * `sessionEntryState` (F3). `resolveSessionCapabilities` (consent-scope.ts) is the server projection.
 */

import { CONSENT_SWITCHES } from "@/lib/consent-toggle-copy";

export type AudioMode = "full" | "tutor_only" | "none";
export type MicAcquire = "yes" | "defer" | "no";

/** UNKNOWN = the waiting room, before the tutor has chosen online or in person. */
export type CapabilitySessionMode = "LIVE" | "IN_PERSON" | "UNKNOWN";

/** Which capability a consent switch controls. `online` is entry (org W4), not a capability field. */
export type SwitchCapability = "online" | "audio" | "whiteboard" | "notes";

export type SessionCapabilities = {
  audio: { mode: AudioMode };
  mic: { acquire: MicAcquire };
  transcript: { tutorVoice: boolean; learnerVoice: boolean };
  /** Server persistence and replay only; the on-device crash-recovery checkpoint is not gated by it. */
  whiteboard: { persist: boolean };
  notes: { draft: boolean };
  replay: { audio: boolean; board: boolean };
  /** Derived, never hand-written: a switch is listed when it is off and its entry has an effect in this mode. */
  off: Array<"audio" | "whiteboard" | "notes">;
};

/** Every behavior field (all of `SessionCapabilities` except the derived `off`). `offEffect` may set any of them. */
export type CapabilityFields = Omit<SessionCapabilities, "off">;

/** A partial value of `CapabilityFields`, one level deep (`{ transcript: { learnerVoice: false } }`). */
export type CapabilityEffect = {
  [Group in keyof CapabilityFields]?: Partial<CapabilityFields[Group]>;
};

/** What a switch does when off, per mode. `always` applies in every mode. */
export type OffEffectByMode = {
  always?: CapabilityEffect;
  online?: CapabilityEffect;
  inPerson?: CapabilityEffect;
  unknown?: CapabilityEffect;
};

export type SessionCapabilityInput = {
  /** false = legacy session frozen before consent existed (pre-B2). Behaves as the client always did: no audio. */
  hasConsentSnapshot: boolean;
  toggles: { audio: boolean; whiteboard: boolean; notes: boolean };
  sessionMode: CapabilitySessionMode;
  /** Org "End it now, and no notes". Treated exactly like the notes switch being off. */
  notesForbidden: boolean;
};

const ALL_ON: CapabilityFields = {
  audio: { mode: "full" },
  mic: { acquire: "yes" },
  transcript: { tutorVoice: true, learnerVoice: true },
  whiteboard: { persist: true },
  notes: { draft: true },
  replay: { audio: true, board: true },
};

/**
 * Most restrictive first. Every string field holds values from one family only (audio mode, mic acquire), so
 * one ordering covers both: none < tutor_only < full, and no < defer < yes. Booleans: false beats true.
 */
const RESTRICTIVE_ORDER: readonly string[] = ["none", "no", "tutor_only", "defer", "yes", "full"];

/**
 * Pre-consent sessions (no frozen snapshot) never captured audio on the client. The only rule that is not a
 * switch effect; it applies on top of the all-on value and changes nothing else. Living outside `CONSENT_SWITCHES`
 * is INTENDED (consent wave plan § 2.2, "legacy behavior preserved": existing sessions are not touched), not an
 * oversight: there is no switch whose off-effect this is.
 */
const LEGACY_NO_SNAPSHOT_EFFECT: CapabilityEffect = { audio: { mode: "none" } };

function pickRestrictive(a: unknown, b: unknown): unknown {
  if (typeof a === "boolean" && typeof b === "boolean") return a && b;
  return RESTRICTIVE_ORDER.indexOf(String(a)) <= RESTRICTIVE_ORDER.indexOf(String(b)) ? a : b;
}

/** The one merge: where two effects write the same field the more restrictive value wins. */
export function mergeRestrictive(base: CapabilityFields, effect: CapabilityEffect): CapabilityFields {
  const out = Object.fromEntries(
    Object.entries(base).map(([group, leaves]) => [group, { ...leaves }])
  ) as Record<string, Record<string, unknown>>;
  for (const [group, leaves] of Object.entries(effect)) {
    for (const [leaf, value] of Object.entries(leaves ?? {})) {
      out[group][leaf] = pickRestrictive(out[group][leaf], value);
    }
  }
  return out as unknown as CapabilityFields;
}

const MODE_KEY = { LIVE: "online", IN_PERSON: "inPerson", UNKNOWN: "unknown" } as const;

function effectsFor(
  offEffect: OffEffectByMode | undefined,
  mode: CapabilitySessionMode
): CapabilityEffect[] {
  if (!offEffect) return [];
  return [offEffect.always, offEffect[MODE_KEY[mode]]].filter(
    (e): e is CapabilityEffect => e !== undefined && Object.keys(e).length > 0
  );
}

/** Session-frozen (or live, while PENDING) consent + the selected mode → capabilities. */
export function deriveSessionCapabilities(input: SessionCapabilityInput): SessionCapabilities {
  if (!input.hasConsentSnapshot) {
    return { ...mergeRestrictive(ALL_ON, LEGACY_NO_SNAPSHOT_EFFECT), off: [] };
  }

  const toggleOn: Record<SwitchCapability, boolean> = {
    online: true,
    audio: input.toggles.audio,
    whiteboard: input.toggles.whiteboard,
    notes: input.toggles.notes && !input.notesForbidden,
  };

  let fields = ALL_ON;
  const off: SessionCapabilities["off"] = [];
  for (const entry of CONSENT_SWITCHES) {
    if (toggleOn[entry.capability]) continue;
    const effects = effectsFor("offEffect" in entry ? entry.offEffect : undefined, input.sessionMode);
    if (effects.length === 0) continue;
    for (const effect of effects) fields = mergeRestrictive(fields, effect);
    if (entry.capability !== "online") off.push(entry.capability);
  }
  return { ...fields, off };
}

/**
 * Server gate: may an audio segment or chunk be registered, stored or transcribed? Online with audio off keeps
 * the tutor-only mixdown (`tutor_only`), so only `none` refuses. C2 narrows this per lane.
 */
export function acceptsAudioSegments(capabilities: SessionCapabilities): boolean {
  return capabilities.audio.mode !== "none";
}

/**
 * p3-clock (disconnect pause/freeze): should the whiteboard event recorder
 * be capturing strokes right now?
 *
 * WB event capture is intentionally BROADER than audio recording during a
 * pause. On a stable student disconnect (the FSM's
 * `all_participants_disconnected` pause — or any FSM `paused` state), audio
 * recording pauses and the session clock freezes, but the tutor keeps
 * teaching and drawing. Those gap strokes must NOT be lost: they are
 * captured and stamped at the FROZEN clock offset, so on replay they
 * collapse to the pause instant (ratified accepted artifact, Andrew
 * 2026-07-02). The clock freeze itself is owned by the session clock (keyed
 * off FSM `recordingActive`, false while paused); this gate only decides
 * whether strokes are recorded during that frozen window.
 *
 * Rules:
 *  - `audioMode === "none"` (IN_PERSON / audio denied): follow `wbEventsActive`
 *    (CF-2 / CF-2.1 — stroke logs persist even with no audio).
 *  - audio modes: capture while the FSM is `recording` OR `paused`. `armed`
 *    / `idle` / `stopping` still gate capture OFF, preserving the CF-2.1
 *    armed-gate contract (armed is NOT paused).
 */
export function deriveWbCaptureActive(input: {
  /** `audio.mode` of the session capabilities. */
  audioMode: AudioMode;
  /** FSM presence `recordingActive` (true only while state === "recording"). */
  recordingActive: boolean;
  /** FSM `state === "paused"` — the disconnect/network gap window. */
  isPaused: boolean;
  /** Tutor session-active gate (role/phase/userWantsRecording). */
  wbEventsActive: boolean;
}): boolean {
  if (input.audioMode === "none") return input.wbEventsActive;
  return input.recordingActive || input.isPaused;
}

/** Gate E: remote streams enter the recording mixdown only when the audio mode is full. */
export function shouldAttachRemoteStreamToRecordingMixdown(
  audioMode: AudioMode
): boolean {
  return audioMode === "full";
}

/**
 * Gate F: per-peer recording gain — 0 when manually muted OR student audio
 * consent denied (tutor_only). Live A/V playback is independent.
 */
export function resolveRemoteRecordingGainLinear(
  audioMode: AudioMode,
  peerId: string,
  mutedPeerIdsInRecording: ReadonlySet<string>
): number {
  if (audioMode === "tutor_only") return 0;
  return mutedPeerIdsInRecording.has(peerId) ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Lane identity (consent wave plan § 2.3, D5, F4). The ONE place a stream id is built or parsed.
//
// A lane is carried only in `streamId`: `tutor:mic` (the tutor mixdown), `student:peer-<peerId>:mic` (a learner
// device's recorder/transport id), `speaker:<speakerId>:transcript` (a learner's transcript lane, keyed on the
// stable speaker identity). Nobody else spells these formats; every other file imports from here, and
// consent-guards.test.ts fails on any literal left behind.
// ---------------------------------------------------------------------------

/** The tutor mixdown lane. Also the default lane of a segment or chunk that does not name one. */
export const TUTOR_MIC_STREAM_ID = "tutor:mic";

const SPEAKER_LANE_PREFIX = "speaker:";
const SPEAKER_LANE_SUFFIX = ":transcript";
const PEER_LANE_PATTERN = /^student:peer-(.+):mic$/;

/** Per-device recorder / transport lane for one remote learner peer: `student:peer-<peerId>:mic`. */
export function studentMicStreamId(peerId: string): string {
  return `student:peer-${peerId}:mic`;
}

/**
 * Transcript lane keyed on the STABLE speaker identity (not the per-device peer id, which can change on a device
 * switch): `speaker:<speakerId>:transcript`.
 */
export function speakerTranscriptStreamId(speakerId: string): string {
  return `speaker:${speakerId}:transcript`;
}

/** What a stream id names. `unknown` is anything this module did not build; it is treated as a learner lane. */
export type Lane =
  | { kind: "tutor" }
  | { kind: "learner"; peerId: string; speakerId?: undefined }
  | { kind: "learner"; speakerId: string; peerId?: undefined }
  | { kind: "unknown" };

/**
 * The one parser. Accepts exactly what the three builders produce, plus the legacy speaker lane without the
 * `:transcript` suffix that the notes labeller has always accepted.
 */
export function parseLane(streamId: string): Lane {
  if (streamId === TUTOR_MIC_STREAM_ID) return { kind: "tutor" };
  if (streamId.startsWith(SPEAKER_LANE_PREFIX)) {
    const rest = streamId.slice(SPEAKER_LANE_PREFIX.length);
    const speakerId = rest.endsWith(SPEAKER_LANE_SUFFIX) ? rest.slice(0, -SPEAKER_LANE_SUFFIX.length) : rest;
    return { kind: "learner", speakerId };
  }
  const peer = PEER_LANE_PATTERN.exec(streamId);
  if (peer) return { kind: "learner", peerId: peer[1] };
  return { kind: "unknown" };
}

/**
 * Is this stream a learner's? `kind !== "tutor"`, so an UNKNOWN id fails closed as a learner lane: a gate that
 * refuses learner audio can never be bypassed by a malformed, future or relabeled stream id.
 */
export function isLearnerLane(streamId: string): boolean {
  return parseLane(streamId).kind !== "tutor";
}
