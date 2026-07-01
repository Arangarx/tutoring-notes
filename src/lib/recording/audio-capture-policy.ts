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
