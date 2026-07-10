/**
 * Approved parent consent toggle copy (Block B 5b, Andrew 2026-06-30).
 * Product-specific consent UI — not umbrella-derived (see docs/LEGAL-SYNC.md).
 */

export const LIVE_SESSION_CONSENT_COPY = {
  label: "Allow live tutoring sessions",
  description:
    "Your child can join real-time video and audio with this tutor, and everything drawn on the shared whiteboard during the session is saved for later review.",
} as const;

export const AUDIO_RECORDING_CONSENT_COPY = {
  label: "Allow session audio recording",
  description:
    "Allows this tutor to record session audio for notes and review. For in-person sessions, one microphone captures everyone in the room. For online sessions, your child's voice is recorded separately from the tutor's. Live conversation is always available when live sessions are allowed — this toggle only controls what is saved.",
} as const;

export const CONSENT_DECLINE_WARNING = {
  title: "Are you sure?",
  pendingInvite:
    "If you continue without enabling any options, your child will not be able to join the live tutoring session they've already been invited to. You can change these preferences later from your account dashboard.",
  plain:
    "Until you set preferences, your child cannot participate in live tutoring sessions with this tutor. You can update preferences any time from your account dashboard.",
} as const;
