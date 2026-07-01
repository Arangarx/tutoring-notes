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
