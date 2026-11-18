/**
 * Canonical map + reduce prompts for AI session notes.
 * Workers and the abstain eval import this module. Do not copy these strings.
 *
 * Reduce field semantics mirror src/lib/ai.ts generateSessionNote (v7):
 *  - topics: subjects covered, comma list, past tense
 *  - assessment: where the student stands (strengths, struggles, mastery)
 *  - nextSteps: what to do next, including any homework (Plan)
 *  - links: URLs mentioned, one per line, "" if none
 * homework is omitted from the AI output (REQ-S3-4: it folds into nextSteps).
 */

import {
  EMPTY_STRUCTURED_NOTE,
  type StructuredNoteFields,
} from "../note-content";
import type { ChunkExtractionPayload } from "./transcript-types";

/**
 * One abstain rule, shared by the map prompt and the reduce prompt.
 * Non-teaching speech is not a lesson, even when it really happened.
 */
export const NOTES_ABSTAIN_RULE = `ABSTAIN WHEN NOTHING WAS TAUGHT: A note records only teaching — a subject, skill, problem, passage, explanation, practice, or a correction of the student's work. Greetings, small talk, scheduling, rescheduling, calendar invites, billing, invoices, and tech setup (microphone, camera, echo, headset, screen share, "can you hear me") are not teaching. If the source contains no teaching, return empty values for every field. Do not invent a lesson. Do not record the chit-chat as a topic, an assessment, or a next step. Moving Thursday's session, sending a calendar invite, an invoice, picking a headset, and fixing echo are not notes. The words "none", "N/A", and "null" are not allowed; an empty field is the empty string.`;

/** gpt-4o-mini reduce temperature. The abstain eval uses this same value. */
export const REDUCE_TEMPERATURE = 0.3;

export const REDUCE_MAX_TOKENS = 800;

export const REDUCE_RESPONSE_FORMAT = { type: "json_object" as const };

export const REDUCE_SYSTEM_PROMPT = `You are an expert tutoring assistant. Given structured session data (per-segment extractions of topics, student questions, corrections, and follow-ups), synthesize a concise session note as JSON.

STRICT RULES:
(1) Be terse — short phrases or comma lists, not full sentences. A parent should scan in under 10 seconds.
(2) Only include teaching that is present in the source — do not fabricate. Non-teaching speech is not a note.
(3) assessment: where the student stands on what was taught — strengths, struggles, mastery level. Include both EXPLICIT comments in corrections/questions AND clear in-session reactions: "almost!" / "try again" / "not quite" → wrestling with that topic; "yes!" / "got it" / "perfect" / "right on" → has it. Cluster by topic when possible. Do NOT fabricate observations the session never contained or implied. Empty string "" when nothing was taught, and also when there is neither explicit commentary nor a reaction signal on understanding.
(4) nextSteps covers DISTINCT academic follow-ups and any assigned homework — the complete "Plan" including homework. Merge semantically-duplicate follow-ups from different chunks into ONE phrase (e.g. the same future action stated twice → include once). One item per distinct future action; keep completeness for distinct actions but do not repeat the same plan in different words. Logistics (a new meeting time, a text, an invoice) are not next steps.
(5) If a field has no teaching to record, return empty string "".
(6) ${NOTES_ABSTAIN_RULE} When this applies, the only valid JSON is {"topics":"","assessment":"","nextSteps":"","links":""}. If topics is "", the other three fields are "" too.

Respond with JSON ONLY — no markdown fences, no commentary:
{"topics":"...","assessment":"...","nextSteps":"...","links":"..."}`;

export const EXTRACT_SYSTEM_PROMPT = `You extract structured information from tutoring session audio transcripts.

Given a transcript segment, identify:
- topics: subject topics introduced or discussed (math, science, etc.)
- studentQuestions: questions the student asked (verbatim or tight paraphrase)
- corrections: errors or misconceptions the tutor corrected, including those signaled by in-session reactions ("almost!" / "not quite" / "try again" imply wrestling; "yes!" / "got it" / "perfect" imply mastery on that point)
- followUps: homework, practice problems, or next-session items mentioned

STRICT RULES:
(1) Only include teaching supported by the transcript — explicit statements or clear in-session reactions. Do not invent or fabricate content. Non-teaching speech is not a topic.
(2) Be terse — short phrases, not full sentences.
(3) Use empty arrays when nothing was found for a field.
(4) ${NOTES_ABSTAIN_RULE} When this applies, respond {"topics":[],"studentQuestions":[],"corrections":[],"followUps":[]}. Do not put scheduling, small talk, or tech setup into topics.

Respond in JSON only — no markdown fences, no commentary:
{"topics":[],"studentQuestions":[],"corrections":[],"followUps":[]}`;

export type ReduceExtraction = ChunkExtractionPayload & {
  speakerLabel?: string | null;
};

export type ReduceTranscript = {
  text: string;
  speakerLabel?: string | null;
};

export function buildReducePrompt(
  extractions: readonly ReduceExtraction[],
  rawTranscripts?: readonly ReduceTranscript[]
): string {
  if (extractions.length > 0) {
    const chunks = extractions
      .map((e, i) => {
        const speakerLine =
          e.speakerLabel && e.speakerLabel.length > 0
            ? `Speaker: ${e.speakerLabel}\n`
            : "";
        return `### Chunk ${i + 1}
${speakerLine}Topics: ${e.topics.join(", ") || "none"}
Student Questions: ${e.studentQuestions.join("; ") || "none"}
Corrections: ${e.corrections.join("; ") || "none"}
Follow-ups: ${e.followUps.join("; ") || "none"}`;
      })
      .join("\n\n");
    return `Synthesize a structured session note from these per-segment extractions (ordered by recording time; speaker labels identify who spoke). Include only teaching the extractions support — do not fabricate. Map in-session reactions in corrections to assessment meaning when synthesizing.

${NOTES_ABSTAIN_RULE}

${chunks}`;
  }

  if (rawTranscripts && rawTranscripts.length > 0) {
    const joined = rawTranscripts
      .map((t, i) => {
        const speakerLine =
          t.speakerLabel && t.speakerLabel.length > 0
            ? `[${t.speakerLabel}] `
            : "";
        const body =
          rawTranscripts.length > 1
            ? `[Segment ${i + 1}]\n${speakerLine}${t.text}`
            : `${speakerLine}${t.text}`;
        return body;
      })
      .join("\n\n");
    return `Synthesize a structured session note from this tutoring session transcript (ordered by recording time; speaker prefixes identify who spoke). Include only teaching the transcript supports — do not fabricate. Map tutor reactions ("almost!", "yes!", etc.) to assessment meaning when present.

${NOTES_ABSTAIN_RULE}

${joined}`;
  }

  return "Synthesize a structured session note. No audio transcript was available.";
}

export function buildExtractPrompt(transcript: string): string {
  return `Extract structured information from this tutoring session transcript segment.

Rules: include only teaching the transcript supports; map tutor reactions to corrections when they signal misunderstanding or mastery; use terse phrases.

${NOTES_ABSTAIN_RULE}

Transcript:
${transcript}

Respond with JSON only.`;
}

/** Chat-completion fields shared by the reduce worker and the abstain eval. Model is set by the caller. */
export function reduceCompletionParams(userPrompt: string): {
  temperature: number;
  max_tokens: number;
  response_format: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
} {
  return {
    temperature: REDUCE_TEMPERATURE,
    max_tokens: REDUCE_MAX_TOKENS,
    response_format: REDUCE_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: REDUCE_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  };
}

/**
 * Parse the JSON reduce response, tolerating minor formatting issues.
 * Returns null on parse failure.
 */
export function parseReduceResponse(text: string): StructuredNoteFields | null {
  const trimmed = text.trim();
  const jsonText = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return {
      topics: typeof parsed.topics === "string" ? parsed.topics : "",
      assessment: typeof parsed.assessment === "string" ? parsed.assessment : "",
      nextSteps:
        typeof parsed.nextSteps === "string"
          ? parsed.nextSteps
          : typeof parsed.plan === "string"
            ? parsed.plan
            : "",
      links: typeof parsed.links === "string" ? parsed.links : "",
    };
  } catch {
    return null;
  }
}

/** Blank fields become the canonical empty note. Whitespace-only counts as empty. */
const EMPTY_FIELD_SENTINELS = new Set([
  "none",
  "n/a",
  "na",
  "null",
  "undefined",
  "-",
]);

function cleanNoteField(value: string): string {
  const trimmed = value.trim();
  const token = trimmed.toLowerCase().replace(/\.+$/, "");
  if (EMPTY_FIELD_SENTINELS.has(token)) return "";
  return trimmed;
}

export function normalizeStructuredNote(
  fields: StructuredNoteFields
): StructuredNoteFields {
  const normalized: StructuredNoteFields = {
    topics: cleanNoteField(fields.topics),
    assessment: cleanNoteField(fields.assessment),
    nextSteps: cleanNoteField(fields.nextSteps),
    links: cleanNoteField(fields.links),
  };
  if (
    normalized.topics === "" &&
    normalized.assessment === "" &&
    normalized.nextSteps === "" &&
    normalized.links === ""
  ) {
    return { ...EMPTY_STRUCTURED_NOTE };
  }
  return normalized;
}

export function extractionHasTeaching(extraction: ChunkExtractionPayload): boolean {
  return [
    extraction.topics,
    extraction.studentQuestions,
    extraction.corrections,
    extraction.followUps,
  ].some((items) => items.some((item) => item.trim().length > 0));
}
