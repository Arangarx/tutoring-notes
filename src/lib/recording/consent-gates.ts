import "server-only";

/**
 * Consent wave C2 — the ONE server wrapper for the per-lane audio, transcription and notes gates
 * (docs/handoff/consent-wave-plan.md § 2.3).
 *
 * Every server entry that stores audio, transcribes a chunk or drafts notes asks one of these three functions
 * instead of reading toggles. Each resolves the session's capabilities once (`resolveSessionCapabilityContext`),
 * applies the PURE decision from `session-capabilities.ts`, and logs a refusal under the registered prefixes:
 *
 *   [cns] wbsid=<id> action=learner_lane_refused surface=segment|chunk|queue|kick|sweep streamId=<id>
 *   [txc] wbsid=<id> action=refused reason=audio_off|notes_off|notes_forbidden surface=<surface> streamId=<id>
 *   [tnt] wbsid=<id> action=skip reason=notes_off|no_audio|notes_forbidden surface=<surface>
 *
 * A refusal is not an error: it logs at `log` level so it never pages, and the callers turn it into a terminal row
 * status (`refused` / `skipped`) or a quiet return. Nothing here writes a row.
 */

import { resolveSessionCapabilityContext } from "@/lib/consent-scope";
import {
  decideAudioSegment,
  decideNotesDraft,
  decideTranscription,
  isLearnerLane,
  type AudioRefusalReason,
  type GateDecision,
  type NotesRefusalReason,
  type TranscriptionRefusalReason,
} from "@/lib/recording/session-capabilities";

/** Where a lane refusal happened. `segment` = segment registration; the rest are the transcription entries. */
export type LaneGateSurface = "segment" | "chunk" | "queue" | "kick" | "sweep";

/** Where a notes refusal happened. */
export type NotesGateSurface =
  | "generate"
  | "trigger"
  | "regenerate"
  | "enqueue"
  | "reduce"
  | "live_reduce";

function logLearnerLaneRefused(sessionId: string, surface: LaneGateSurface, streamId: string): void {
  console.log(
    `[cns] wbsid=${sessionId} action=learner_lane_refused surface=${surface} streamId=${streamId}`
  );
}

/** May an audio segment on `streamId` be registered? Never throws on denial; the caller decides what to return. */
export async function gateAudioSegment(
  sessionId: string,
  streamId: string,
  surface: Extract<LaneGateSurface, "segment">
): Promise<GateDecision<AudioRefusalReason>> {
  const { capabilities } = await resolveSessionCapabilityContext(sessionId);
  const decision = decideAudioSegment(capabilities, streamId);
  if (!decision.allow && isLearnerLane(streamId)) {
    logLearnerLaneRefused(sessionId, surface, streamId);
  }
  return decision;
}

/** May a chunk on `streamId` be transcribed? Called at every transcription entry and again inside the worker. */
export async function gateTranscription(
  sessionId: string,
  streamId: string,
  surface: Exclude<LaneGateSurface, "segment">
): Promise<GateDecision<TranscriptionRefusalReason>> {
  const { capabilities, notesForbidden } = await resolveSessionCapabilityContext(sessionId);
  const decision = decideTranscription(capabilities, notesForbidden, streamId);
  if (!decision.allow) {
    console.log(
      `[txc] wbsid=${sessionId} action=refused reason=${decision.reason} surface=${surface} streamId=${streamId}`
    );
    if (isLearnerLane(streamId) && decision.reason === "audio_off") {
      logLearnerLaneRefused(sessionId, surface, streamId);
    }
  }
  return decision;
}

/** May a tutor-notes draft be created, generated or retried for this session? */
export async function gateNotesDraft(
  sessionId: string,
  surface: NotesGateSurface
): Promise<GateDecision<NotesRefusalReason>> {
  const { capabilities, notesForbidden } = await resolveSessionCapabilityContext(sessionId);
  const decision = decideNotesDraft(capabilities, notesForbidden);
  if (!decision.allow) {
    console.log(`[tnt] wbsid=${sessionId} action=skip reason=${decision.reason} surface=${surface}`);
  }
  return decision;
}
