/**
 * Approved parent consent toggle copy (Block B 5b, Andrew 2026-06-30).
 * Product-specific consent UI — not umbrella-derived (see docs/LEGAL-SYNC.md).
 */

import type { OffEffectByMode, SwitchCapability } from "@/lib/recording/session-capabilities";

export const LIVE_SESSION_CONSENT_COPY = {
  label: "Allow online sessions",
  description:
    "Your child can join online sessions with video and audio. In person is not affected by this switch. You can also join an online session as your child from your parent account when they need help signing in.",
} as const;

export const AUDIO_RECORDING_CONSENT_COPY = {
  label: "Allow session audio recording",
  description:
    "Allows this tutor to record session audio for notes and review. For in-person sessions, one microphone captures everyone in the room. For online sessions, your child's voice is recorded separately from the tutor's. Live conversation is always available when live sessions are allowed — this toggle only controls what is saved.",
} as const;

/** Accepted self-learner audio help. Andrew 2026-11-17 (consent copy item 34). */
export const SELF_LEARNER_AUDIO_HELP =
  "Off means your voice is left out of the saved recording. Online, your tutor's microphone can still be saved. In person, no audio is saved. The whiteboard follows its own setting. Nothing is transcribed if notes are off.";

/** Accepted self-learner agreement. Andrew 2026-11-17 (item 35). */
export const SELF_LEARNER_AGREEMENT =
  "I agree that my tutoring sessions may be recorded — the shared whiteboard and the audio — and that Mynk may draft session notes from them. I can turn any of this off later. Open Manage, then Privacy.";

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

/** Restored parent-editor copy. Shown under a recommended switch. Andrew 2026-11-17 (item 36). */
export const RECOMMENDED_CONSENT_NOTE =
  "You can turn this off, but Mynk recommends keeping this on for the best experience.";

/** Under the switches on the parent, child, and self-learner privacy pages (item 1). */
export const NEXT_SESSION_APPLIES_COPY =
  "A change applies to a session that has not started, including one whose room is already open. A session that has started keeps what it started with.";

/** Parent always-block copy (item 7). */
export const RESTRICTION_AUDIO_DESCRIPTION =
  "Applies to every tutor, including an organization's instructors. Online, your child's voice is left out; the tutor's voice can still be saved. In person, no audio is saved. The whiteboard follows its own setting.";
export const RESTRICTION_WHITEBOARD_LABEL = "Always block whiteboard recording";
export const RESTRICTION_WHITEBOARD_DESCRIPTION =
  "Applies to every tutor, including an organization's instructors. The board still works during the session. After it ends, the saved board is deleted from our servers.";
export const RESTRICTION_BLOCK_APPLIES_COPY =
  "A block applies to sessions that have not started yet. A session that has started keeps what it started with. A recording already saved stays until the tutor deletes that session, or you ask Mynk to delete it.";

/** In-session banner: one line per switch that is off (item 5). */
export const RECORDING_OFF_AUDIO_ONLINE_TUTOR =
  "This student's voice is not being saved. Your microphone can still be saved.";
export const RECORDING_OFF_AUDIO_ONLINE_STUDENT =
  "Your voice is not being saved. Your tutor's microphone can still be saved.";
export const RECORDING_OFF_AUDIO_NONE = "Session audio is not being saved.";
export const RECORDING_OFF_WHITEBOARD =
  "The board is not being saved. It still works during this session. After the session ends, we delete the saved board from our servers.";
export const RECORDING_OFF_NOTES = "Notes are off for this session. Nothing is transcribed.";

/**
 * Self-learner switch lines (approved items 29–33). The parent page keeps its own descriptions.
 * The self page must not say "your child".
 */
export const SELF_SWITCH_DESCRIPTION = {
  allowLiveSession:
    "You can join online sessions with video and audio. In person is not affected by this switch.",
  allowAudioRecording:
    "Session audio is recorded. If this is off, online sessions leave your voice out, and your tutor's microphone can still be saved. In person, no audio is saved. The whiteboard follows its own setting.",
  allowWhiteboardRecording:
    "The board is saved and can be replayed. If this is off, the board still works during the session. After the session ends, the saved board is deleted from our servers.",
  allowNoteSending:
    "Session notes are drafted from the audio. Transcription is for English speech. If this is off, nothing is transcribed and no notes are drafted, even if audio was saved.",
} as const;

/** Shown on the self-learner page when online sessions are off (item 30). */
export const SELF_LIVE_OFF_NOTE =
  "With online sessions off, online sessions cannot be started or joined. In person is not affected.";

export function recordingOffBannerLines(input: {
  audience: "tutor" | "student";
  audioMode: "full" | "tutor_only" | "none";
  whiteboardOff: boolean;
  notesOff: boolean;
}): string[] {
  const lines: string[] = [];
  if (input.audioMode === "tutor_only") {
    lines.push(
      input.audience === "tutor" ? RECORDING_OFF_AUDIO_ONLINE_TUTOR : RECORDING_OFF_AUDIO_ONLINE_STUDENT
    );
  } else if (input.audioMode === "none") {
    lines.push(RECORDING_OFF_AUDIO_NONE);
  }
  if (input.whiteboardOff) lines.push(RECORDING_OFF_WHITEBOARD);
  if (input.notesOff) lines.push(RECORDING_OFF_NOTES);
  return lines;
}

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
