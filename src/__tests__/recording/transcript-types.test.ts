import {
  isTranscriptChunkStatus,
  isTutorNoteStatus,
  parseChunkExtraction,
  serializeChunkExtraction,
  TRANSCRIPT_CHUNK_STATUSES,
  TUTOR_NOTE_STATUSES,
} from "@/lib/recording/transcript-types";

describe("transcript-types", () => {
  test("TRANSCRIPT_CHUNK_STATUSES matches design doc values", () => {
    expect(TRANSCRIPT_CHUNK_STATUSES).toEqual([
      "pending",
      "transcribing",
      "done",
      "failed",
    ]);
  });

  test("TUTOR_NOTE_STATUSES matches design doc values", () => {
    expect(TUTOR_NOTE_STATUSES).toEqual([
      "pending",
      "generating",
      "done",
      "failed",
      "partial",
    ]);
  });

  test("status guards accept known values only", () => {
    expect(isTranscriptChunkStatus("done")).toBe(true);
    expect(isTranscriptChunkStatus("generating")).toBe(false);
    expect(isTutorNoteStatus("partial")).toBe(true);
    expect(isTutorNoteStatus("transcribing")).toBe(false);
  });

  test("serializeChunkExtraction round-trips via parseChunkExtraction", () => {
    const payload = {
      topics: ["fractions", "decimals"],
      studentQuestions: ["why invert?"],
      corrections: ["sign error"],
      followUps: ["practice sheet 3"],
    };
    const row = serializeChunkExtraction(payload);
    expect(parseChunkExtraction(row)).toEqual(payload);
  });
});
