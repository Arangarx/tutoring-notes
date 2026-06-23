/**
 * Recording lifecycle finite state machine.
 *
 * Single source of truth for "is the workspace currently capturing?"
 * across the audio recorder, the whiteboard event-log recorder, the
 * end-session button, the recording pill, the auto-pause banner, and
 * (Phase 4+) any live-A/V stream that participates in capture.
 *
 * Design (Pillar 1 of the master plan):
 *
 *   Pure function from typed inputs to typed outputs. The host (the
 *   workspace client) owns any latches that need to persist across
 *   re-renders (e.g. `everHadParticipants`) and threads them into the
 *   inputs. There are no class instances, no event emitters, no
 *   internal mutable state — making this trivially testable with
 *   plain Jest assertions and no DOM.
 *
 * Multi-stream from day one:
 *
 *   Today the workspace wires exactly one capture stream
 *   (`tutor:mic`) into the FSM. Phase 4 will add `student:peer-X:mic`
 *   entries (and later video tracks). Adding a stream is *just* a new
 *   `inputStreams` map entry — nothing else in this file changes.
 *   Per-stream capture is gated by both the global lifecycle state
 *   (e.g. paused → no capture) and the stream's own health.
 *
 * Multi-participant from day one:
 *
 *   `participants` is a `ReadonlySet<string>` of peer ids (the tutor
 *   is implicit). 1:1 sessions are just `participants.size === 1`;
 *   small group sessions (siblings, study groups) are
 *   `participants.size >= 2`. The FSM treats "any participant
 *   present" as the gate, not "both" — so a group session with one
 *   student dropping out continues recording as long as at least one
 *   other student is in the room. All-students-disconnected flips us
 *   into `paused`.
 *
 * Why a separate file from `recording-presence.ts`:
 *
 *   `recording-presence.ts` was the Phase 0 stop-gap — a `bothPresent`
 *   boolean, a couple of banner-copy strings, a single recording flag.
 *   It worked for solo + 1:1 but doesn't extend to N participants or
 *   N input streams without adding entirely new code paths. The Phase
 *   1 scope (this file) is the structural replacement; once the
 *   workspace consumes the FSM, the old file goes away.
 *
 * Tests: `src/__tests__/recording/lifecycle-machine.test.ts`.
 */

// -----------------------------------------------------------------
// Inputs
// -----------------------------------------------------------------

/**
 * Health signal for a single capture input stream. The host queries
 * the stream (e.g. via `MediaStreamTrack.readyState` or the per-peer
 * RTCPeerConnection state) and reports one of these values.
 *
 * - `ok`        — stream is live and being captured normally.
 * - `degraded`  — stream is live but encountering issues (audio level
 *                 dropouts, packet loss, recoverable container
 *                 fragmentation). The FSM still asks the outbox to
 *                 capture; the host may want to surface a warning.
 * - `failed`    — stream is unrecoverable for this session. The FSM
 *                 will not ask the outbox to capture from it.
 */
export type StreamHealth = "ok" | "degraded" | "failed";

/**
 * Inputs to {@link evaluateLifecycle}. The host re-evaluates on every
 * render; reading the same inputs always produces the same outputs.
 */
export type LifecycleInputs = {
  /**
   * Tutor's button-press intent. `true` after they press Start;
   * `false` after they press Pause or before any Start. Independent
   * of whether anyone else is in the room.
   */
  tutorWantsRecording: boolean;

  /**
   * Live participants other than the tutor (the tutor is implicit).
   * Peer ids are opaque strings minted by the sync layer. Today this
   * comes from `sync-client.peerCount > 0` (we don't yet track
   * individual peer ids on the workspace side); Phase 4 will add
   * real peer-id tracking when the WebRTC mesh lands.
   *
   * `participants.size === 0` + tutor wants recording → either solo
   * rehearsal (if `soloEnabled`) or paused/armed.
   */
  participants: ReadonlySet<string>;

  /**
   * Has the room ever had at least one non-tutor participant during
   * this session? Sticky latch — set by the host the first time
   * `participants.size >= 1` and kept true thereafter. Drives the
   * choice between "armed (waiting for first student)" copy and
   * "paused (all students disconnected)" copy.
   */
  everHadParticipants: boolean;

  /**
   * Per-peer audio-flow signal (Phase 4d Commit 6). Optional.
   *
   * Set of peer ids whose remote audio track is currently flowing
   * — i.e. WebRTC has negotiated far enough that audio frames are
   * arriving, confirmed by `MediaStreamTrack.muted === false` for a
   * minimum debounce window (200ms by host convention; the FSM
   * doesn't enforce the window, it just reads the resulting set).
   *
   * When provided AND `everHadAudioFlow` is still false AND the
   * intersection with `participants` is empty, the FSM holds in
   * `armed` with reason `awaiting_audio_flow` instead of
   * transitioning to `recording`. This fixes the
   * "recording-starts-2s-before-peer-audio-is-flowing" bug — Sarah
   * loses any student speech that lands during the gap between
   * presence flipping and WebRTC convergence.
   *
   * When undefined (legacy callers, solo modes, tests that don't
   * care about the gate), the FSM treats every participant as
   * audio-flowing — preserving the pre-4d behaviour for backward
   * compatibility.
   */
  participantsWithFlowingAudio?: ReadonlySet<string>;

  /**
   * Sticky latch — flipped to true the first time the FSM
   * transitions to `recording` via the audio-flow path. Once true,
   * a mid-session audio-flow blip does NOT re-arm the FSM (which
   * would cause record-stop/restart churn). Host responsibility
   * to maintain — same pattern as `everHadParticipants`.
   */
  everHadAudioFlow?: boolean;

  /**
   * If true, the FSM allows recording while `participants.size === 0`
   * provided the tutor wants it AND no participant has ever joined
   * yet. Mirrors today's `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT`
   * behavior — useful for tutor solo rehearsal / smoke testing. Once
   * any participant has joined this session (`everHadParticipants`),
   * the FSM falls back to the standard "need at least one
   * participant" gate; flipping back to solo mode mid-session would
   * be misleading.
   */
  soloEnabled: boolean;

  /**
   * If false, the workspace is in tutor-solo mode (no
   * `WHITEBOARD_SYNC_URL`). Participants tracking is meaningless;
   * the FSM behaves like a solo recorder.
   */
  syncEnabled: boolean;

  /**
   * Per-stream capture health. The host adds a stream id when capture
   * begins (e.g. `tutor:mic` once the mic is acquired) and removes /
   * marks failed when it stops. Empty map = no streams to capture.
   *
   * Phase 1a: only `tutor:mic` is ever populated. Phase 4 adds
   * `student:peer-<id>:mic` and (later) `tutor:cam` /
   * `student:peer-<id>:cam`.
   */
  inputStreams: ReadonlyMap<string, StreamHealth>;

  /**
   * Best-effort network health. False = browser thinks we're offline
   * or sync transport reports persistent disconnect. The FSM doesn't
   * stop recording on a transient network blip (the outbox handles
   * that), but a sustained offline state surfaces as a paused-network
   * sub-reason for UI copy.
   */
  networkOk: boolean;

  /**
   * Whiteboard clock value at evaluation time, in milliseconds along
   * the audio clock. Mirrors `getAudioMs()` from the host. Passed
   * through to the output as `wbClockMs` so downstream consumers
   * (event log writers, debug overlays) read one source of truth.
   */
  audioClockMs: number;

  /**
   * Number of segments currently in flight in the outbox (not yet
   * registered server-side). Driven by the outbox observer in Phase
   * 1b. The End button reads this to decide whether to show
   * "Saving last N segment(s)…". Defaults to 0 in Phase 1a where
   * the outbox isn't wired yet.
   */
  inFlightStreamCount?: number;

  /**
   * Has the end-session flow been initiated? Set by the host when the
   * tutor clicks End. Drives the FSM into stopping → uploading →
   * done. Defaults to false.
   *
   * Sub-cases:
   *   - `endIntent === "stopping"` — tutor clicked End; awaiting
   *     outbox drain.
   *   - `endIntent === "uploading"` — outbox drained; awaiting the
   *     atomic server action.
   *   - `endIntent === "done"` — server action succeeded; UI should
   *     navigate to review.
   *   - `endIntent === "failed"` — terminal error; surface to UI.
   */
  endIntent?: EndIntent;
};

export type EndIntent = "stopping" | "uploading" | "done" | "failed";

// -----------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------

/**
 * Lifecycle state. Strict subset of the runtime states the UI can
 * render — the FSM never produces a value outside this enum.
 *
 * Transition rules (informal — see {@link evaluateLifecycle} for the
 * exact decision tree):
 *
 *   `idle`       no tutor intent.
 *   `armed`      tutor wants but conditions not yet met (waiting on
 *                first participant, or input stream not yet healthy).
 *   `recording`  capturing all healthy streams + WB events.
 *   `paused`     tutor wants but capture has been put on hold (all
 *                participants dropped, or sustained network outage).
 *                Surfaces an auto-pause banner.
 *   `stopping`   end-session initiated; outbox draining.
 *   `uploading`  outbox drained; atomic end-session action in flight.
 *   `done`       session ended. Terminal — no further transitions.
 *   `failed`     terminal error from the end-session flow.
 */
export type LifecycleState =
  | "idle"
  | "armed"
  | "recording"
  | "paused"
  | "stopping"
  | "uploading"
  | "done"
  | "failed";

/**
 * Why we're in `armed` (machine-readable; UI maps to copy).
 *
 * - `awaiting_first_participant` — tutor pressed Start, sync mode,
 *   no participant has joined yet.
 * - `awaiting_audio_flow`        — Phase 4d: at least one
 *   participant is in the room AND `participantsWithFlowingAudio`
 *   was provided AND no participant's audio has flowed yet AND
 *   we have not previously transitioned to recording. Held to
 *   prevent the MediaRecorder from capturing 200-2000ms of
 *   empty-remote-channel before WebRTC converges.
 * - `awaiting_solo_grace`        — tutor pressed Start, sync mode,
 *   solo rehearsal allowed but no streams healthy yet (rare; mainly
 *   the sub-second window before the mic acquires).
 * - `awaiting_input_streams`     — tutor pressed Start but no
 *   capture streams are reporting healthy yet.
 */
export type ArmedReason =
  | "awaiting_first_participant"
  | "awaiting_audio_flow"
  | "awaiting_solo_grace"
  | "awaiting_input_streams";

/**
 * Why we're in `paused`.
 *
 * - `all_participants_disconnected` — sync mode, ≥1 participant had
 *   joined, all have now dropped.
 * - `network_offline`               — sustained `networkOk === false`.
 * - `manual`                        — tutor explicitly cleared
 *   `tutorWantsRecording` to pause, distinct from "auto" pause.
 *   (Reserved; today this is `idle`-from-paused conceptually.)
 */
export type PausedReason =
  | "all_participants_disconnected"
  | "network_offline"
  | "manual";

/**
 * UI pill kind — coarse classification for the recording status pill.
 * Distinct from `state` because two states (e.g. `armed` and `paused`)
 * can both render the same coloured pill ("waiting for student").
 */
export type UiPillKind =
  | "off"
  | "armed"
  | "recording"
  | "paused"
  | "saving"
  | "error";

/**
 * Outputs of {@link evaluateLifecycle}. Pure data — no functions
 * other than the per-stream `shouldCapture` predicate (which is
 * itself derived from `state` + `inputStreams` and is a closure for
 * caller convenience).
 */
export type LifecycleOutputs = {
  /** Coarse machine state. */
  state: LifecycleState;

  /**
   * Sub-reason for `armed` state. Undefined when state !== "armed".
   */
  armedReason?: ArmedReason;

  /**
   * Sub-reason for `paused` state. Undefined when state !== "paused".
   */
  pausedReason?: PausedReason;

  /**
   * Should the whiteboard event-log recorder be on? Equivalent to
   * `state === "recording"`. Whiteboard events are not a "stream"
   * in the audio sense — they're per-session log entries — but the
   * gate is the same.
   */
  shouldCaptureWB: boolean;

  /**
   * Per-stream capture predicate. Returns true iff:
   *   1. The state is `recording` (or `stopping`, so in-flight final
   *      segments still flush).
   *   2. The stream is in `inputStreams`.
   *   3. The stream's health is `ok` or `degraded` (failed = no).
   *
   * Use this to gate `MediaRecorder.start()` per stream.
   */
  shouldCapture: (streamId: string) => boolean;

  /** Whiteboard clock value the FSM was evaluated at (passthrough). */
  wbClockMs: number;

  /** Coarse UI pill classification. */
  uiPillKind: UiPillKind;

  /**
   * Number of segments currently in flight in the outbox. Mirrors
   * the input; exposed as an output so consumers can read it from
   * the FSM result without re-threading.
   */
  inFlightStreamCount: number;

  /**
   * Backwards-compat boolean for the existing workspace UI.
   * Equivalent to `state === "recording"`. The audio bridge effect
   * + workspace gating still reads a flat boolean; the FSM provides
   * it as a derived output so existing call sites don't have to be
   * rewritten.
   */
  recordingActive: boolean;
};

// -----------------------------------------------------------------
// Evaluator
// -----------------------------------------------------------------

const NO_PARTICIPANTS_FROZEN: ReadonlySet<string> = new Set();
const NO_INPUT_STREAMS_FROZEN: ReadonlyMap<string, StreamHealth> = new Map();

/**
 * Pure evaluation of the lifecycle FSM.
 *
 * Decision tree (precedence top-to-bottom):
 *
 *   1. End intent set: state derived from `endIntent` (stopping /
 *      uploading / done / failed). End-session takes priority over
 *      everything else — once the tutor clicks End, no other input
 *      can revive a "live" state.
 *
 *   2. Tutor doesn't want recording: state = `idle`.
 *
 *   3. Sync disabled (tutor solo): tutor wants → `recording`. No
 *      participant gating, no auto-pause logic.
 *
 *   4. Sync enabled, tutor wants:
 *      a. Network offline → `paused` (network_offline).
 *      b. ≥1 participant present → `recording`.
 *      c. 0 participants, soloEnabled, never had any → `recording`
 *         (solo rehearsal grace window).
 *      d. 0 participants, never had any → `armed`
 *         (awaiting_first_participant).
 *      e. 0 participants, did have some → `paused`
 *         (all_participants_disconnected).
 *
 * Stream health gates are applied *within* the recording state
 * via `shouldCapture` — they do NOT downgrade the global state. A
 * single failed mic doesn't pause the session; it just stops being
 * captured. (A future axis could flip the global state on
 * "all-streams-failed", but Phase 1 keeps that out of scope.)
 */
export function evaluateLifecycle(inputs: LifecycleInputs): LifecycleOutputs {
  const {
    tutorWantsRecording,
    participants = NO_PARTICIPANTS_FROZEN,
    everHadParticipants,
    soloEnabled,
    syncEnabled,
    inputStreams = NO_INPUT_STREAMS_FROZEN,
    networkOk,
    audioClockMs,
    inFlightStreamCount = 0,
    endIntent,
    participantsWithFlowingAudio,
    everHadAudioFlow = false,
  } = inputs;

  // Step 1: end-session lifecycle takes precedence.
  if (endIntent) {
    return finalize(
      endIntent === "failed" ? "failed" : endIntent,
      undefined,
      undefined,
      inputs
    );
  }

  // Step 2: no tutor intent.
  if (!tutorWantsRecording) {
    return finalize("idle", undefined, undefined, inputs);
  }

  // Step 3: tutor solo mode (no live sync).
  if (!syncEnabled) {
    return finalize("recording", undefined, undefined, inputs);
  }

  // Step 4a: sustained network outage.
  if (!networkOk) {
    return finalize("paused", undefined, "network_offline", inputs);
  }

  const haveParticipant = participants.size >= 1;
  if (haveParticipant) {
    // Step 4b (Phase 4d): audio-flow gate on the FIRST transition.
    // When the host has provided `participantsWithFlowingAudio` AND
    // none of the present participants are in that set AND we have
    // never previously transitioned to recording, hold in `armed`
    // with reason `awaiting_audio_flow`. Prevents the MediaRecorder
    // from capturing 200-2000ms of empty-remote-channel before
    // WebRTC convergence.
    //
    // Once `everHadAudioFlow` is true (sticky latch the host
    // maintains), the gate releases — a mid-session audio blip
    // does NOT re-arm the FSM and cause record-stop/restart churn.
    if (
      !everHadAudioFlow &&
      participantsWithFlowingAudio !== undefined &&
      !hasIntersection(participants, participantsWithFlowingAudio)
    ) {
      return finalize("armed", "awaiting_audio_flow", undefined, inputs);
    }
    return finalize("recording", undefined, undefined, inputs);
  }

  // Step 4c: solo rehearsal grace.
  if (soloEnabled && !everHadParticipants) {
    return finalize("recording", undefined, undefined, inputs);
  }

  // Step 4d / 4e: no participants right now.
  if (everHadParticipants) {
    return finalize("paused", undefined, "all_participants_disconnected", inputs);
  }
  return finalize("armed", "awaiting_first_participant", undefined, inputs);
}

function hasIntersection(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): boolean {
  if (a.size === 0 || b.size === 0) return false;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of smaller) {
    if (larger.has(x)) return true;
  }
  return false;
}

function finalize(
  state: LifecycleState,
  armedReason: ArmedReason | undefined,
  pausedReason: PausedReason | undefined,
  inputs: LifecycleInputs
): LifecycleOutputs {
  const { inputStreams = NO_INPUT_STREAMS_FROZEN } = inputs;
  const inFlightStreamCount = inputs.inFlightStreamCount ?? 0;
  const recordingActive = state === "recording";
  const captureAllowed = state === "recording" || state === "stopping";

  // The closure captures `inputStreams` + `captureAllowed` so callers
  // can pass it around; it stays a thin wrapper around a Map lookup.
  const shouldCapture = (streamId: string): boolean => {
    if (!captureAllowed) return false;
    const health = inputStreams.get(streamId);
    if (health === undefined) return false;
    return health !== "failed";
  };

  return {
    state,
    armedReason,
    pausedReason,
    shouldCaptureWB: recordingActive,
    shouldCapture,
    wbClockMs: inputs.audioClockMs,
    uiPillKind: pillKindForState(state),
    inFlightStreamCount,
    recordingActive,
  };
}

function pillKindForState(state: LifecycleState): UiPillKind {
  switch (state) {
    case "idle":
      return "off";
    case "armed":
      return "armed";
    case "recording":
      return "recording";
    case "paused":
      return "paused";
    case "stopping":
    case "uploading":
      return "saving";
    case "done":
      return "off";
    case "failed":
      return "error";
    default: {
      // Exhaustiveness check — TypeScript will fail compilation if a
      // new state is added to LifecycleState without updating this
      // switch.
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

// -----------------------------------------------------------------
// Presentation adapter (legacy `recording-presence.ts` shape)
// -----------------------------------------------------------------

/**
 * UI presentation derived from the FSM result. Intentionally shaped
 * to match the existing `RecordingPresenceState` so the workspace
 * consumes it without rewiring the banner / pill JSX.
 *
 * Kept in this module (rather than a separate file) so anyone editing
 * the FSM state machine sees the UI strings change in the same diff
 * — preventing the "states drifted from copy" failure mode.
 */
export type LifecyclePresentation = {
  recordingActive: boolean;
  /** True when tutor wants recording but the gate is auto-paused. */
  autoPaused: boolean;
  /**
   * True when auto-paused and no participant has *ever* joined this
   * session. Drives the "we'll start when they join" copy vs the
   * "we'll resume automatically" copy.
   */
  awaitingStart: boolean;
  /** Banner copy. Empty string = no banner. */
  bannerMessage: string;
  /** Pill copy. */
  pillLabel: string;
  /** Pill colour. */
  pillColor: "red" | "amber" | "grey";
};

/**
 * Build the presentation strings for the workspace UI. Reads the FSM
 * outputs + a couple of upstream inputs the FSM doesn't bubble up
 * (number of participants for "Solo rehearsal" copy, ever-had latch
 * for the start-vs-resume distinction).
 *
 * Pure function — same inputs always produce the same strings. Copy
 * tweaks should land here, not in the workspace JSX, so they're
 * covered by the FSM unit tests.
 */
export function derivePresentation(
  out: LifecycleOutputs,
  ctx: {
    tutorWantsRecording: boolean;
    participants: ReadonlySet<string>;
    everHadParticipants: boolean;
    syncEnabled: boolean;
    /** True when sync roster reports ≥1 student peer (relay), even if WebRTC is dead. */
    syncRosterHasStudent?: boolean;
    pausedReason?: PausedReason;
    armedReason?: ArmedReason;
  }
): LifecyclePresentation {
  const { tutorWantsRecording, participants, everHadParticipants, syncEnabled } = ctx;
  const pausedReason = out.pausedReason ?? ctx.pausedReason;
  const armedReason = out.armedReason ?? ctx.armedReason;

  // Tutor-solo mode: collapse to the simple Recording / Paused pair.
  if (!syncEnabled) {
    return {
      recordingActive: out.recordingActive,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage: "",
      pillLabel: out.recordingActive ? "Recording" : "Paused",
      pillColor: out.recordingActive ? "red" : "grey",
    };
  }

  if (out.state === "recording") {
    if (participants.size === 0) {
      // Solo rehearsal: hook is hot but no peer in the room (the
      // soloEnabled grace window).
      return {
        recordingActive: true,
        autoPaused: false,
        awaitingStart: false,
        bannerMessage:
          "Solo rehearsal: strokes are being logged while you wait. The session timer stays at 0 until your student joins.",
        pillLabel: "Solo rehearsal",
        pillColor: "amber",
      };
    }
    return {
      recordingActive: true,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage: "",
      pillLabel: "Recording",
      pillColor: "red",
    };
  }

  if (out.state === "armed") {
    if (armedReason === "awaiting_first_participant") {
      return {
        recordingActive: false,
        autoPaused: true,
        awaitingStart: true,
        bannerMessage:
          "Waiting for your student to join — recording will start automatically once they connect.",
        pillLabel: "Waiting for student",
        pillColor: "amber",
      };
    }
    if (armedReason === "awaiting_audio_flow") {
      // Student is in the room (presence flipped) but their audio
      // hasn't started arriving yet (WebRTC still converging).
      // Distinct copy from "Waiting for student" so the tutor can
      // tell "they haven't shown up" apart from "they're here but
      // I can't hear them yet" — important because the
      // troubleshooting actions are different (refresh-the-link vs
      // wait-a-moment / check-your-mic-on-their-side).
      return {
        recordingActive: false,
        autoPaused: true,
        awaitingStart: false,
        bannerMessage:
          "Student is here — waiting for their audio to start flowing before recording.",
        pillLabel: "Waiting for audio…",
        pillColor: "amber",
      };
    }
    // Generic "armed but waiting" fallback (input stream not healthy
    // yet, etc.). Same colour as the waiting-for-student case so the
    // tutor sees a consistent "almost there" colour.
    return {
      recordingActive: false,
      autoPaused: true,
      awaitingStart: true,
      bannerMessage:
        "Preparing to record — checking microphone and capture sources.",
      pillLabel: "Preparing…",
      pillColor: "amber",
    };
  }

  if (out.state === "paused") {
    if (pausedReason === "network_offline") {
      return {
        recordingActive: false,
        autoPaused: true,
        awaitingStart: !everHadParticipants,
        bannerMessage:
          "We're offline — recording is paused. We'll resume automatically when the connection comes back.",
        pillLabel: "Auto-paused (offline)",
        pillColor: "amber",
      };
    }
    if (
      pausedReason === "all_participants_disconnected" &&
      ctx.syncRosterHasStudent
    ) {
      return {
        recordingActive: false,
        autoPaused: true,
        awaitingStart: false,
        bannerMessage:
          "Audio/video not connected — recording paused until the call connects.",
        pillLabel: "Auto-paused (A/V reconnecting)",
        pillColor: "amber",
      };
    }
    return {
      recordingActive: false,
      autoPaused: true,
      awaitingStart: false,
      bannerMessage:
        "Student disconnected — recording paused. We'll resume automatically when they reconnect.",
      pillLabel: "Auto-paused (student offline)",
      pillColor: "amber",
    };
  }

  if (
    out.state === "stopping" ||
    out.state === "uploading" ||
    out.state === "done"
  ) {
    return {
      recordingActive: false,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage: "",
      pillLabel: out.state === "done" ? "Saved" : "Saving…",
      pillColor: "grey",
    };
  }

  if (out.state === "failed") {
    return {
      recordingActive: false,
      autoPaused: false,
      awaitingStart: false,
      bannerMessage:
        "Could not finalize the recording — please try ending again. Your data isn't lost.",
      pillLabel: "Error",
      pillColor: "amber",
    };
  }

  // Default: idle (tutor hasn't pressed Start, or pressed Pause).
  void tutorWantsRecording; // referenced for completeness; idle copy is the same regardless
  return {
    recordingActive: false,
    autoPaused: false,
    awaitingStart: false,
    bannerMessage: "",
    pillLabel: "Paused",
    pillColor: "grey",
  };
}

// -----------------------------------------------------------------
// Convenience helpers for hosts
// -----------------------------------------------------------------

/**
 * Wraps a single audio recorder's capture stream id. Exported so the
 * workspace + future participant code refer to the same string
 * literal — typos in stream ids would silently fail to capture.
 */
export const TUTOR_MIC_STREAM_ID = "tutor:mic";

/**
 * Build a `student:peer-<peerId>:mic` stream id for Phase 4. Lives
 * here so all code refers to one shape; if we ever change the prefix
 * convention, every consumer follows automatically.
 */
export function studentMicStreamId(peerId: string): string {
  return `student:peer-${peerId}:mic`;
}
