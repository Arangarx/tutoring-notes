import {
  FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE,
  shouldTreatAsTranscriptionTimeout,
} from "@/app/admin/students/[id]/transcribe-result";

describe("transcription timeout UX helpers", () => {
  test("detects FUNCTION_INVOCATION_TIMEOUT substring", () => {
    expect(
      shouldTreatAsTranscriptionTimeout(new Error("FUNCTION_INVOCATION_TIMEOUT hit"), 1000)
    ).toBe(true);
  });

  test("detects TimeoutError name", () => {
    const e = new Error("boom");
    e.name = "TimeoutError";
    expect(shouldTreatAsTranscriptionTimeout(e, 1000)).toBe(true);
  });

  test("elapsed ≥290s triggers copy path", () => {
    expect(shouldTreatAsTranscriptionTimeout(new Error("other"), 290_000)).toBe(true);
  });

  test("generic errors below elapsed threshold do not match", () => {
    expect(shouldTreatAsTranscriptionTimeout(new Error("ECONNRESET"), 5000)).toBe(false);
  });

  test("friendly timeout message matches bootstrapper wording", () => {
    expect(FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE).toContain("Voice Memos");
    expect(FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE).toContain("Audacity");
  });
});
