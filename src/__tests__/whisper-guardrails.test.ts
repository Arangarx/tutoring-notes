import {
  looksLikeSilenceHallucination,
  silenceHallucinationReason,
} from "@/lib/whisper-guardrails";

/**
 * Independent oracle: the exact strings Whisper stored on Tyson's 2026-10-28
 * session (docs/handoff/tyson-feedback-2026-10-28.md) plus the real sentences
 * in those same blocks. Clip length is not an input — the strings themselves
 * are the oracle. Tyson's junk must drop; real tutoring speech must stay.
 */
const JUNK_AT_LONG_DURATION: string[] = [
  "Thanks for watching!",
  "Thank you for watching!",
  "Thank you for watching.",
  "thanks for watching please subscribe and hit that like button....",
  "Silence.",
  "Exhaling.",
  "Silence. Exhaling.",
  "Silence. Exhaling. Silence. Exhaling. Silence. Exhaling.",
  "Bye.",
  "Bye. Bye.",
  "Bye. Bye. Bye. Bye. Bye. Bye. Bye.",
  "Okay.",
  "Okay. Okay. Okay. Okay.",
  "Thank you.",
  "Thank you. Thank you.",
  "Bye. Okay. Okay. Thank you. Bye. Bye. Bye. Bye. Bye. Bye. Bye.",
  "Thank you. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Okay. Bye-bye.",
  "Bye-bye.",
  "OK.",
  "**whistling** **humming**",
  "whistling humming clicking clicking",
  "Sound of typing on computer screen.",
  "5.5mm 6mm 7mm",
  "5.5mm 6mm 7mm 8mm 9mm 10mm 11mm 12mm 13mm 14mm 15mm 16mm 17mm 18mm 19mm 20mm",
  "5mm 5mm 5mm 5mm",
  "3 mm 3 mm 3 mm",
  "Skip. Skip. Skip.",
  "[Sound of typing]",
  "(sound of typing)",
  "*sounds of birds chirping*",
  "**Sound of rain falling**",
  "ä ä ä ä ä ä ä ä ä ä ä ä ä ä ä ä",
  "Ä, Ä, ä, ä, ä, ä, ä, ä, ä, ä, ä, ä",
  "SKIP SKIP SKIP SKIP SKIP",
  "点击【下方】的【选择】键,然后点击【OK】键,然后点击【OK】键。",
  "如果您的電話沒有充電,請先關機。",
  "如果您的電話沒有充電,請先關機。 如果您的電話沒有充電,請先關機。 如果您的電話沒有充電,請先關機。",
];

/** Real speech. Must survive even when the clip is under two seconds. */
const REAL_SPEECH: string[] = [
  "We reviewed factoring and she had trouble with negative signs.",
  "trigonometric functions work again, finally. The log of x.",
  "The log of x.",
  "Okay, it worked. Not sure how.",
  "That's not even possible!",
  "Go to third stroke, and while still holding, click pan.",
  "I'm not seeing that. Anywhere.",
  "you Let's see if the notes are better this time. Actually, I should probably draw something.",
  "Student struggled with factoring.",
  "Reviewed quadratic formula today.",
  // Filler or an outro after real speech is the same chunk — keep the speech.
  "trigonometric functions work again, finally. The log of x. OK.",
  "trigonometric functions work again, finally. The log of x. Thank you for watching!",
  "Draw. Draw. How? That's not even possible!",
  "Yes.",
  "No.",
  "Skip it.",
  "Sound of music is a movie.",
  "Sounds of the letter B.",
  "3 cm 4 cm 5 cm",
  "θ = π/2",
  "x² + y² = r²",
  "∫ f(x) dx = F(x) + C",
  "El estudiante resolvió la ecuación cuadrática.",
  "Wir haben heute die quadratische Formel geübt.",
];

describe("looksLikeSilenceHallucination", () => {
  test("flags classic YouTube-style Whisper hallucination", () => {
    expect(
      looksLikeSilenceHallucination(
        "thanks for watching please subscribe and hit that like button...."
      )
    ).toBe(true);
  });

  test("does not flag a normal short tutoring phrase", () => {
    expect(
      looksLikeSilenceHallucination(
        "We reviewed factoring and she had trouble with negative signs."
      )
    ).toBe(false);
  });

  test("flags empty transcript", () => {
    expect(looksLikeSilenceHallucination("")).toBe(true);
    expect(looksLikeSilenceHallucination("   ")).toBe(true);
  });

  /** Sarah Apr 2026 — Neon transcript exact match; Whisper hallucination on weak audio. */
  test('flags "Thank you for watching." (23 chars)', () => {
    expect(looksLikeSilenceHallucination("Thank you for watching.")).toBe(true);
  });

  test.each(JUNK_AT_LONG_DURATION)(
    "flags Tyson silence hallucination %j",
    (transcript) => {
      expect(looksLikeSilenceHallucination(transcript)).toBe(true);
    }
  );

  test.each(REAL_SPEECH)(
    "keeps real speech even on a short clip %j",
    (transcript) => {
      expect(looksLikeSilenceHallucination(transcript)).toBe(false);
    }
  );

  test("reports a reason code for each junk class", () => {
    expect(silenceHallucinationReason("")).toBe("empty");
    expect(silenceHallucinationReason("   ")).toBe("empty");
    expect(silenceHallucinationReason("Thanks for watching!")).toBe("phrase");
    expect(silenceHallucinationReason("5.5mm 6mm 7mm")).toBe("number_unit");
    expect(silenceHallucinationReason("3 mm 3 mm 3 mm")).toBe("number_unit");
    expect(silenceHallucinationReason("ä ä ä ä ä ä ä ä ä ä ä ä")).toBe("repetition");
    expect(silenceHallucinationReason("如果您的電話沒有充電,請先關機。")).toBe("non_latin");
    expect(silenceHallucinationReason("Silence. Exhaling.")).toBe("sound");
    expect(silenceHallucinationReason("**whistling** **humming**")).toBe("sound");
    expect(silenceHallucinationReason("Bye. Bye.")).toBe("filler");
    expect(silenceHallucinationReason("OK.")).toBe("filler");
    expect(silenceHallucinationReason("Okay.")).toBe("filler");
    expect(silenceHallucinationReason("Thank you.")).toBe("filler");
    expect(silenceHallucinationReason("The log of x.")).toBeNull();
    expect(
      silenceHallucinationReason(
        "trigonometric functions work again, finally. The log of x."
      )
    ).toBeNull();
  });
});
