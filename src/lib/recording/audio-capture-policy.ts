export type AudioCapturePolicy = "full" | "tutor_only" | "none";

export type WtrSessionModeForPolicy = "LIVE" | "IN_PERSON";

export type DeriveAudioCapturePolicyInput = {
  allowAudioRecording: boolean | null;
  hasConsentSnapshot: boolean;
  sessionMode: WtrSessionModeForPolicy;
};

/**
 * Session-frozen consent + locally-selected mode → capture policy.
 * Pure client module — no server imports.
 */
export function deriveAudioCapturePolicy(
  input: DeriveAudioCapturePolicyInput
): AudioCapturePolicy {
  const { allowAudioRecording, hasConsentSnapshot, sessionMode } = input;

  if (!hasConsentSnapshot) {
    return "none";
  }

  if (allowAudioRecording === true) {
    return "full";
  }

  if (allowAudioRecording === false) {
    return sessionMode === "IN_PERSON" ? "none" : "tutor_only";
  }

  return "none";
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
 *  - `policy === "none"` (IN_PERSON / audio denied): follow `wbEventsActive`
 *    (CF-2 / CF-2.1 — stroke logs persist even with no audio).
 *  - audio modes: capture while the FSM is `recording` OR `paused`. `armed`
 *    / `idle` / `stopping` still gate capture OFF, preserving the CF-2.1
 *    armed-gate contract (armed is NOT paused).
 */
export function deriveWbCaptureActive(input: {
  policy: AudioCapturePolicy;
  /** FSM presence `recordingActive` (true only while state === "recording"). */
  recordingActive: boolean;
  /** FSM `state === "paused"` — the disconnect/network gap window. */
  isPaused: boolean;
  /** Tutor session-active gate (role/phase/userWantsRecording). */
  wbEventsActive: boolean;
}): boolean {
  if (input.policy === "none") return input.wbEventsActive;
  return input.recordingActive || input.isPaused;
}

/** Gate E: remote streams enter the recording mixdown only when policy is full. */
export function shouldAttachRemoteStreamToRecordingMixdown(
  policy: AudioCapturePolicy
): boolean {
  return policy === "full";
}

/**
 * Gate F: per-peer recording gain — 0 when manually muted OR student audio
 * consent denied (tutor_only). Live A/V playback is independent.
 */
export function resolveRemoteRecordingGainLinear(
  policy: AudioCapturePolicy,
  peerId: string,
  mutedPeerIdsInRecording: ReadonlySet<string>
): number {
  if (policy === "tutor_only") return 0;
  return mutedPeerIdsInRecording.has(peerId) ? 0 : 1;
}
