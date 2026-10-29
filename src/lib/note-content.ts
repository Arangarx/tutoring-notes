/**
 * TutorNote structured JSON. homework folds into nextSteps (REQ-S3-4).
 * Leaf module: the notes UI and the server reduce worker share this
 * without importing each other.
 */
export type StructuredNoteFields = {
  topics: string;
  assessment: string;
  /** UI label "Plan". Includes follow-ups + homework per REQ-S3-4. */
  nextSteps: string;
  links: string;
};

/**
 * Canonical empty structured note. Do not mutate this object.
 * Callers that store or return it spread a copy.
 */
export const EMPTY_STRUCTURED_NOTE: StructuredNoteFields = Object.freeze({
  topics: "",
  assessment: "",
  nextSteps: "",
  links: "",
});
