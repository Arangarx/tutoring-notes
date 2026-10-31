/**
 * Status values for TranscriptChunk rows (stored as String in Prisma, so a new member needs no migration).
 * Log prefix: txc — see AGENTS.md § Conventions.
 *
 * `refused` is TERMINAL (consent wave C2, plan § 2.3): the server declined to transcribe this chunk because the
 * session's capabilities forbid its lane or notes. It is written instead of leaving the row `pending`, because the
 * sweep orders by `updatedAt asc` with a `take`, so a refused row left pending would sit at the head forever and
 * starve newer rows. The sweep predicate (`findStaleTranscriptChunksForSweep`) only selects pending, transcribing and
 * retryable failed rows, so `done` and `refused` are the two settled states.
 */
export const TRANSCRIPT_CHUNK_STATUSES = [
  "pending",
  "transcribing",
  "done",
  "failed",
  "refused",
] as const;

export type TranscriptChunkStatus = (typeof TRANSCRIPT_CHUNK_STATUSES)[number];

export function isTranscriptChunkStatus(value: string): value is TranscriptChunkStatus {
  return (TRANSCRIPT_CHUNK_STATUSES as readonly string[]).includes(value);
}

/**
 * Status values for TutorNote rows (stored as String in Prisma).
 * Log prefix: tnt — see AGENTS.md § Conventions.
 *
 * `skipped` is TERMINAL (consent wave C2, plan § 2.3): notes are off for the session (consent, the org "no notes"
 * flag, or no audio to draft from), so no draft will ever be written. The notes sweep selects only `pending` and
 * `generating`, so a skipped row leaves the sweep instead of starving the oldest-10 batch, and the review card stops
 * polling (it polls only while pending or generating).
 */
export const TUTOR_NOTE_STATUSES = [
  "pending",
  "generating",
  "done",
  "failed",
  "partial",
  "skipped",
] as const;

/**
 * The one line for "notes are off for this session": the `skipped` note card (client) and the refused notes
 * actions (server) both show it, so it lives in this shared pure module and not in the client component. It is
 * the consent wave plan's exact sentence (docs/handoff/consent-wave-plan.md § 2.3). The plan wants it to come from
 * `CONSENT_SWITCHES[*].effectWhenOff`, but that copy field lands with C7, which replaces this constant with the
 * table lookup.
 */
export const NOTES_SKIPPED_COPY = "Notes are off for this session";

export type TutorNoteStatus = (typeof TUTOR_NOTE_STATUSES)[number];

export function isTutorNoteStatus(value: string): value is TutorNoteStatus {
  return (TUTOR_NOTE_STATUSES as readonly string[]).includes(value);
}

/** Structured map-step fields persisted as JSON strings on TranscriptChunkExtraction. */
export type ChunkExtractionPayload = {
  topics: string[];
  studentQuestions: string[];
  corrections: string[];
  followUps: string[];
};

export function serializeChunkExtraction(payload: ChunkExtractionPayload): {
  topics: string;
  studentQuestions: string;
  corrections: string;
  followUps: string;
} {
  return {
    topics: JSON.stringify(payload.topics),
    studentQuestions: JSON.stringify(payload.studentQuestions),
    corrections: JSON.stringify(payload.corrections),
    followUps: JSON.stringify(payload.followUps),
  };
}

export function parseChunkExtraction(row: {
  topics: string;
  studentQuestions: string;
  corrections: string;
  followUps: string;
}): ChunkExtractionPayload {
  return {
    topics: JSON.parse(row.topics) as string[],
    studentQuestions: JSON.parse(row.studentQuestions) as string[],
    corrections: JSON.parse(row.corrections) as string[],
    followUps: JSON.parse(row.followUps) as string[],
  };
}
