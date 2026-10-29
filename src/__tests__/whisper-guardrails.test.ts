import {
  looksLikeSilenceHallucination,
  silenceHallucinationReason,
} from "@/lib/whisper-guardrails";

/**
 * Independent oracle: the exact strings Whisper stored on Tyson's 2026-10-28
 * session (docs/handoff/tyson-feedback-2026-10-28.md) plus the real sentences
 * in those same blocks. Duration is 30s so the old "clip ≤ 2s" rule cannot
 * make a junk string pass by accident, and 1.5s on real phrases so that rule
 * cannot hide a false drop.
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
];

describe("looksLikeSilenceHallucination", () => {
  test("flags classic YouTube-style Whisper hallucination", () => {
    expect(
      looksLikeSilenceHallucination(
        "thanks for watching please subscribe and hit that like button....",
        5
      )
    ).toBe(true);
  });

  test("does not flag a normal short tutoring phrase", () => {
    expect(
      looksLikeSilenceHallucination(
        "We reviewed factoring and she had trouble with negative signs.",
        45
      )
    ).toBe(false);
  });

  test("flags empty transcript", () => {
    expect(looksLikeSilenceHallucination("", 0)).toBe(true);
    expect(looksLikeSilenceHallucination("   ", 12)).toBe(true);
  });

  /** Sarah Apr 2026 — Neon transcript exact match; Whisper hallucination on weak audio. */
  test('flags "Thank you for watching." (23 chars)', () => {
    expect(looksLikeSilenceHallucination("Thank you for watching.", 23)).toBe(true);
  });

  test.each(JUNK_AT_LONG_DURATION)(
    "flags Tyson silence hallucination %j",
    (transcript) => {
      expect(looksLikeSilenceHallucination(transcript, 30)).toBe(true);
    }
  );

  test.each(REAL_SPEECH)(
    "keeps real speech even on a short clip %j",
    (transcript) => {
      expect(looksLikeSilenceHallucination(transcript, 1.5)).toBe(false);
      expect(looksLikeSilenceHallucination(transcript, 45)).toBe(false);
    }
  );

  test("reports a reason code for each junk class", () => {
    expect(silenceHallucinationReason("", 30)).toBe("empty");
    expect(silenceHallucinationReason("   ", 30)).toBe("empty");
    expect(silenceHallucinationReason("Thanks for watching!", 30)).toBe("phrase");
    expect(silenceHallucinationReason("5.5mm 6mm 7mm", 30)).toBe("number_unit");
    expect(silenceHallucinationReason("ä ä ä ä ä ä ä ä ä ä ä ä", 30)).toBe("repetition");
    expect(silenceHallucinationReason("如果您的電話沒有充電,請先關機。", 30)).toBe("non_latin");
    expect(silenceHallucinationReason("Silence. Exhaling.", 30)).toBe("sound");
    expect(silenceHallucinationReason("**whistling** **humming**", 30)).toBe("sound");
    expect(silenceHallucinationReason("Bye. Bye.", 30)).toBe("filler");
    expect(silenceHallucinationReason("OK.", 30)).toBe("filler");
    expect(silenceHallucinationReason("The log of x.", 1.5)).toBeNull();
    expect(
      silenceHallucinationReason(
        "trigonometric functions work again, finally. The log of x.",
        1.5
      )
    ).toBeNull();
  });
});
