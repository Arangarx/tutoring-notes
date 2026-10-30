/**
 * Approved parent consent toggle copy (Block B 5b, Andrew 2026-06-30).
 * Product-specific consent UI — not umbrella-derived (see docs/LEGAL-SYNC.md).
 */

import type { OffEffectByMode, SwitchCapability } from "@/lib/recording/session-capabilities";

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

/**
 * The one switch table (consent wave plan D5). Each entry carries BOTH halves: the copy the parent editor,
 * claim setup and self-learner settings render, and the behavior (`offEffect`) that
 * `deriveSessionCapabilities` applies when the switch is off. Editing behavior and copy is one edit, here.
 * The online switch has no `offEffect`: its behavior is `sessionEntryState` (org W4, F3).
 *
 * `effectWhenOff` (per-mode copy for the notice) and per-audience descriptions land with the copy waves (C7),
 * which need Andrew's approval of the text; nothing here authors new consent copy.
 */
export type ConsentSwitchEntry = {
  key: "allowLiveSession" | "allowAudioRecording" | "allowWhiteboardRecording" | "allowNoteSending";
  capability: SwitchCapability;
  label: string;
  description: string;
  emphasis: "critical" | "recommended" | "standard";
  banner?: string;
  notice?: string;
  offEffect?: OffEffectByMode;
};

export const CONSENT_SWITCHES = [
  {
    key: "allowLiveSession" as const,
    capability: "online" as const,
    ...LIVE_SESSION_CONSENT_COPY,
    emphasis: "critical" as const,
    banner: LIVE_SESSION_SCHEDULING_NOTE,
  },
  {
    key: "allowAudioRecording" as const,
    capability: "audio" as const,
    ...AUDIO_RECORDING_CONSENT_COPY,
    emphasis: "recommended" as const,
    notice: RECOMMENDED_CONSENT_NOTE,
    offEffect: {
      // Online: the learner's voice is left out of the saved recording; the tutor's mic is still saved.
      online: {
        audio: { mode: "tutor_only" },
        transcript: { learnerVoice: false },
      },
      // In person one mic captures everyone, so nothing is saved: no audio, no transcript, nothing to draft from.
      inPerson: {
        audio: { mode: "none" },
        mic: { acquire: "no" },
        transcript: { tutorVoice: false, learnerVoice: false },
        notes: { draft: false },
        replay: { audio: false },
      },
      // Waiting room, mode not chosen yet: capture nothing and ask for the mic later.
      unknown: {
        audio: { mode: "none" },
        mic: { acquire: "defer" },
        transcript: { tutorVoice: false, learnerVoice: false },
        notes: { draft: false },
        replay: { audio: false },
      },
    },
  },
  {
    key: "allowWhiteboardRecording" as const,
    capability: "whiteboard" as const,
    ...WHITEBOARD_RECORDING_CONSENT_COPY,
    emphasis: "standard" as const,
    offEffect: {
      always: { whiteboard: { persist: false }, replay: { board: false } },
    },
  },
  {
    key: "allowNoteSending" as const,
    capability: "notes" as const,
    ...SESSION_NOTES_CONSENT_COPY,
    emphasis: "standard" as const,
    offEffect: {
      always: {
        transcript: { tutorVoice: false, learnerVoice: false },
        notes: { draft: false },
      },
    },
  },
] as const satisfies readonly ConsentSwitchEntry[];

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
