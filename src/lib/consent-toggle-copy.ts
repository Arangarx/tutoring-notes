/**
 * Approved parent consent toggle copy (Block B 5b, Andrew 2026-06-30).
 * Product-specific consent UI — not umbrella-derived (see docs/LEGAL-SYNC.md).
 */

export const LIVE_SESSION_CONSENT_COPY = {
  label: "Allow live tutoring sessions",
  description:
    "Your child can join real-time video and audio with this tutor, and everything drawn on the shared whiteboard during the session is saved for later review. You can also join a live session as your child from your parent account when they need help signing in.",
} as const;

export const AUDIO_RECORDING_CONSENT_COPY = {
  label: "Allow session audio recording",
  description:
    "Allows this tutor to record session audio for notes and review. For in-person sessions, one microphone captures everyone in the room. For online sessions, your child's voice is recorded separately from the tutor's. Live conversation is always available when live sessions are allowed — this toggle only controls what is saved.",
} as const;

/** Accepted self-learner audio help. Andrew 2026-10-11. */
export const SELF_LEARNER_AUDIO_HELP =
  "Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, nothing is saved.";

/** Accepted self-learner agreement. Andrew 2026-10-11. */
export const SELF_LEARNER_AGREEMENT =
  "I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk drafts session notes from them. I can turn any of this off later. Open Manage, then Privacy.";

export const WHITEBOARD_RECORDING_CONSENT_COPY = {
  label: "Allow whiteboard recording",
  description: "The shared whiteboard can be saved and replayed.",
} as const;

export const SESSION_NOTES_CONSENT_COPY = {
  label: "Allow session notes",
  description: "Mynk can draft session notes from the session.",
} as const;

/** Restored parent-editor copy. Shown above the live-session switch. */
export const LIVE_SESSION_SCHEDULING_NOTE =
  "Without live sessions, Mynk is effectively just a scheduling calendar — your child cannot join tutoring on the whiteboard. You can decline, but there is little reason to use the app if this stays off.";

/** Restored parent-editor copy. Shown under a recommended switch. */
export const RECOMMENDED_CONSENT_NOTE =
  "You can turn this off, but most families keep it on so sessions are useful after class ends.";

/** The one switch list. Parent editor, claim setup, and self-learner settings all use it. */
export const CONSENT_SWITCHES = [
  {
    key: "allowLiveSession" as const,
    ...LIVE_SESSION_CONSENT_COPY,
    emphasis: "critical" as const,
    banner: LIVE_SESSION_SCHEDULING_NOTE,
  },
  {
    key: "allowAudioRecording" as const,
    ...AUDIO_RECORDING_CONSENT_COPY,
    emphasis: "recommended" as const,
    notice: RECOMMENDED_CONSENT_NOTE,
  },
  {
    key: "allowWhiteboardRecording" as const,
    ...WHITEBOARD_RECORDING_CONSENT_COPY,
    emphasis: "standard" as const,
  },
  {
    key: "allowNoteSending" as const,
    ...SESSION_NOTES_CONSENT_COPY,
    emphasis: "standard" as const,
  },
] as const;

export const CONSENT_DECLINE_WARNING = {
  title: "Are you sure?",
  pendingInvite:
    "If you continue without enabling any options, your child will not be able to join the live tutoring session they've already been invited to. You can change these preferences later from your account dashboard.",
  plain:
    "Until you set preferences, your child cannot participate in live tutoring sessions with this tutor. You can update preferences any time from your account dashboard.",
  /** Pending-invite warning for the person whose own sessions these are. */
  selfLearnerPending:
    "Consent has not been given yet. You cannot join a session until you give consent, including the live tutoring session you have already been invited to. Open Manage, then Privacy.",
  /** No consent yet. Does not address a parent. */
  selfLearner:
    "Consent has not been given yet. You cannot join a session until you give consent. Open Manage, then Privacy.",
} as const;
