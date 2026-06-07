/**
 * Status values for TranscriptChunk rows (stored as String in Prisma).
 * Log prefix: txc — see AGENTS.md § Conventions.
 */
export const TRANSCRIPT_CHUNK_STATUSES = [
  "pending",
  "transcribing",
  "done",
  "failed",
] as const;

export type TranscriptChunkStatus = (typeof TRANSCRIPT_CHUNK_STATUSES)[number];

export function isTranscriptChunkStatus(value: string): value is TranscriptChunkStatus {
  return (TRANSCRIPT_CHUNK_STATUSES as readonly string[]).includes(value);
}

/**
 * Status values for TutorNote rows (stored as String in Prisma).
 * Log prefix: tnt — see AGENTS.md § Conventions.
 */
export const TUTOR_NOTE_STATUSES = [
  "pending",
  "generating",
  "done",
  "failed",
  "partial",
] as const;

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
