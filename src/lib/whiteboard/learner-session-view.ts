/**
 * What a connected learner device is told about its session: the mode, the capabilities, and whether the family's
 * online switch now keeps it out (consent wave plan § 4.1 item 6, C3c; Q9). One answer for the `join-timer` poll
 * (both auth branches) and the `/join` page's first render.
 *
 *   - PENDING: the live record decides (§ 2.6). One resolver read with mode UNKNOWN (the stored mode is the column
 *     default until Start), plus the entry inputs for the online decision.
 *   - Started with a frozen snapshot: the snapshot row the caller already joined into its session read answers both.
 *     No live-record read and no resolver query (M17); this runs every 3.5 s per connected learner.
 *   - Started without a snapshot (legacy): the resolver and the entry inputs, as while PENDING.
 *
 * `onlineOff` (the eviction signal) only ever means "the family's switch is off". `onlineDecision` is the same entry
 * rule's full online answer, built from the SAME inputs with no extra read: the `/join` page refuses on it, for every
 * principal and every reason (C5). The poll evicts on `onlineOff` only.
 *
 * SERVER-ONLY.
 */

import { capabilitiesFromConsentToggles, resolveSessionCapabilities, type ConsentToggleCeiling } from "@/lib/consent-scope";
import type { CapabilitySessionMode, SessionCapabilities } from "@/lib/recording/session-capabilities";
import { loadSessionEntryInputs } from "@/lib/scheduling/session-entry-loader";
import {
  decisionReason,
  sessionEntryState,
  type EntryDecision,
  type SessionEntryInputs,
} from "@/lib/scheduling/session-entry";

/** The frozen toggles, selected as a relation of the session row (`consentSnapshot`). */
export const LEARNER_VIEW_SNAPSHOT_SELECT = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
} as const;

/** The session fields the view needs; callers add them to the read they already make. */
export type LearnerViewSession = {
  id: string;
  studentId: string;
  adminUserId: string;
  sessionPhase: string;
  sessionMode: string;
  notesForbidden: boolean;
  consentSnapshot: ConsentToggleCeiling | null;
  student: {
    adminUserId: string | null;
    organizationId: string | null;
    learnerProfileId: string | null;
    learnerProfile: { isSelfLearner: boolean } | null;
  };
};

export type LearnerSessionView = {
  /** The family's online switch is off: the learner device may not stay (Q9). */
  onlineOff: boolean;
  /** The entry rule's full online answer (any reason). `/join` refuses on it; the poll does not read it. */
  onlineDecision: EntryDecision;
  sessionMode: CapabilitySessionMode;
  sessionCapabilities: SessionCapabilities;
};

/** Only the online switch evicts here. Other entry reasons are `/join`'s refusal, not a live-session eviction. */
function onlineSwitchOff(inputs: SessionEntryInputs): boolean {
  return decisionReason(sessionEntryState(inputs).online) === "live_off";
}

export async function resolveLearnerSessionView(session: LearnerViewSession): Promise<LearnerSessionView> {
  const pending = session.sessionPhase === "PENDING";
  const storedMode: CapabilitySessionMode = session.sessionMode === "IN_PERSON" ? "IN_PERSON" : "LIVE";
  const snapshot = session.consentSnapshot;

  if (!pending && snapshot) {
    // Start already passed erasure and org admission for this session and froze the online switch.
    const inputs: SessionEntryInputs = {
      erasureSuspended: false,
      org: null,
      claimed: session.student.learnerProfileId != null,
      isSelfLearner: session.student.learnerProfile?.isSelfLearner === true,
      consent: { allowLiveSession: snapshot.allowLiveSession },
    };
    return {
      onlineOff: onlineSwitchOff(inputs),
      onlineDecision: sessionEntryState(inputs).online,
      sessionMode: storedMode,
      sessionCapabilities: capabilitiesFromConsentToggles(snapshot, storedMode, session.notesForbidden),
    };
  }

  const sessionMode: CapabilitySessionMode = pending ? "UNKNOWN" : storedMode;
  const [inputs, sessionCapabilities] = await Promise.all([
    loadSessionEntryInputs({
      studentId: session.studentId,
      adminUserId: session.adminUserId,
      student: session.student,
    }),
    resolveSessionCapabilities(session.id, undefined, { sessionMode }),
  ]);
  return {
    onlineOff: onlineSwitchOff(inputs),
    onlineDecision: sessionEntryState(inputs).online,
    sessionMode,
    sessionCapabilities,
  };
}
