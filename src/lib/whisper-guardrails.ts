/**
 * Whisper often hallucinates stock phrases when given silence, room tone, or
 * a bad/muted mic — especially short clips. See OpenAI community reports,
 * the tutoring pilot (Apr 2026), and Tyson's 2026-10-28 session review.
 *
 * Decision (conservative, whole-chunk): drop a transcript only when it is
 * empty or made entirely of silence-hallucination material. A short real
 * sentence is kept even if the clip is brief — "The log of x." must survive.
 * Filler that is the entire chunk ("OK.", "Bye.", "Thank you.") is dropped.
 * The same filler, or "thanks for watching", after real speech in the same
 * chunk does not drop the chunk: "trigonometric functions work again,
 * finally. The log of x. OK." is kept. We do not surgically delete an outro
 * out of a chunk that also contains tutoring speech.
 *
 * Clip length is not a drop signal. The old "≤ 2s and < 40 chars" rule
 * deleted real short utterances, so duration is not an argument.
 */

import { TRANSCRIPTION_LANGUAGE } from "@/lib/transcribe-constants";

export type SilenceDropReason =
  | "empty"
  | "phrase"
  | "filler"
  | "sound"
  | "number_unit"
  | "repetition"
  | "non_latin";

const PHRASE_SOURCES: readonly string[] = [
  "thanks?\\s+for\\s+watching",
  "thank\\s+you\\s+for\\s+watching",
  "please\\s+subscribe",
  "hit\\s+(?:that\\s+)?like\\s+button",
  "like\\s+and\\s+subscribe",
  "don'?t\\s+forget\\s+to\\s+subscribe",
  "see\\s+you\\s+(?:in\\s+the\\s+)?next\\s+(?:video|one)",
];

/** Entire-chunk fillers. Not applied when any other real word is present. */
const FILLER_WORDS = new Set([
  "ok",
  "okay",
  "bye",
  "goodbye",
  "thank",
  "thanks",
  "you",
]);

const SOUND_WORDS = new Set([
  "silence",
  "silent",
  "exhaling",
  "exhale",
  "exhales",
  "whistling",
  "whistle",
  "whistles",
  "humming",
  "hum",
  "hums",
  "clicking",
  "click",
  "clicks",
  "sigh",
  "sighs",
  "sighing",
  "inhaling",
  "inhale",
]);

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "is",
  "it",
  "that",
  "this",
  "with",
  "from",
  "as",
  "be",
  "was",
  "were",
  "are",
  "i",
  "we",
  "he",
  "she",
  "they",
  "my",
  "your",
  "so",
  "if",
  "but",
]);

const REASON_PRIORITY: readonly SilenceDropReason[] = [
  "phrase",
  "number_unit",
  "repetition",
  "non_latin",
  "sound",
  "filler",
];

function wordsOf(text: string): string[] {
  const normalized = text
    .replace(/\*\*/g, " ")
    .replace(/['’]/g, "")
    .replace(/-/g, " ");
  return normalized.toLowerCase().match(/[a-z]+/g) ?? [];
}

function hasSubstantive(text: string): boolean {
  return wordsOf(text).some(
    (word) =>
      word.length >= 3 &&
      !FILLER_WORDS.has(word) &&
      !SOUND_WORDS.has(word) &&
      !STOPWORDS.has(word)
  );
}

const PHRASE_TESTS = PHRASE_SOURCES.map((source) => new RegExp(source, "i"));
const PHRASE_STRIPS = PHRASE_SOURCES.map((source) => new RegExp(source, "gi"));

/** Number + mm/cm token. Fresh copies are taken at use so lastIndex stays put. */
const NUMBER_UNIT_RE = /(\d+(?:\.\d+)?)\s*(mm|cm)\b/gi;

/**
 * Wrapped caption: ** ** , * * , [ ], or ( ).
 * Or a standalone "sound(s) of <gerund>" line with no finite verb.
 */
const WRAPPED_SOUND_OF =
  /^(?:\*\*|\*|\[|\()\s*sounds?\s+of\b[\s\S]*?(?:\*\*|\]|\)|\*)[.!?]?\s*$/i;
/**
 * The gerund has to be the next word. Bare "Sounds of birds chirping" stays
 * on purpose: a looser "sounds of …" match would also drop "Sounds of the
 * letter B", which is real speech.
 */
const SOUND_OF_GERUND_LINE = /^sounds?\s+of\s+\p{L}+ing\b/iu;
const FINITE_CLAUSE =
  /\b(?:is|are|was|were|am|means|mean|has|have|had|does|do|did)\b/i;

function matchesPhrase(text: string): boolean {
  return PHRASE_TESTS.some((re) => re.test(text));
}

function stripPhrases(text: string): string {
  let out = text;
  for (const re of PHRASE_STRIPS) {
    re.lastIndex = 0;
    out = out.replace(re, " ");
  }
  return out;
}

/**
 * Millimetre counting runs from Tyson's session ("5.5mm 6mm 7mm" and the
 * long strictly-increasing run) are junk. A 3-token run drops only when it
 * is millimetres or starts on a decimal — that is the Tyson 3-token fixture.
 * "3 cm 4 cm 5 cm" is three whole centimetres, so it stays. Four or more
 * mm/cm tokens drop when they strictly increase or are the same value
 * repeated ("5mm 5mm 5mm 5mm").
 */
function isNumberUnitOnly(text: string): boolean {
  const tokenRe = new RegExp(NUMBER_UNIT_RE.source, "gi");
  const units: { value: number; unit: string }[] = [];
  for (const match of text.matchAll(tokenRe)) {
    units.push({ value: Number(match[1]), unit: match[2].toLowerCase() });
  }
  if (units.length < 3) return false;
  const rest = text
    .replace(new RegExp(NUMBER_UNIT_RE.source, "gi"), " ")
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
  if (rest.length > 0) return false;

  const values = units.map((unit) => unit.value);
  const strictlyIncreasing = values.every(
    (value, index) => index === 0 || value > values[index - 1]
  );
  const exactRepeat = values.every((value) => value === values[0]);
  if (!strictlyIncreasing && !exactRepeat) return false;
  if (units.length >= 4) return true;

  const millimetres = units.every((unit) => unit.unit === "mm");
  const fractionalStart = !Number.isInteger(values[0]);
  return millimetres || fractionalStart;
}

/** "SKIP SKIP SKIP" / "Skip. Skip. Skip." — a single "Skip it." is speech. */
function isRepeatedSkipOnly(text: string): boolean {
  const words = wordsOf(text);
  return words.length >= 2 && words.every((word) => word === "skip");
}

function isSoundOfCaption(text: string): boolean {
  const trimmed = text.trim();
  if (WRAPPED_SOUND_OF.test(trimmed)) return true;
  return SOUND_OF_GERUND_LINE.test(trimmed) && !FINITE_CLAUSE.test(trimmed);
}

function isCharRepetition(text: string): boolean {
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < 8) return false;
  const counts = new Map<string, number>();
  for (const ch of letters) {
    const key = ch.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let top = "";
  let max = 0;
  for (const [key, count] of counts) {
    if (count > max) {
      max = count;
      top = key;
    }
  }
  if (max < 8 || max / letters.length < 0.8) return false;
  const rest = [...text].filter((ch) => ch.toLocaleLowerCase() !== top).join("");
  return !hasSubstantive(rest);
}

function isNonLatinDominant(text: string): boolean {
  if (TRANSCRIPTION_LANGUAGE !== "en") return false;
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
  if (letters.length < 8) return false;
  let nonLatin = 0;
  for (const ch of letters) {
    if (!/\p{Script=Latin}/u.test(ch)) nonLatin += 1;
  }
  if (nonLatin / letters.length < 0.5) return false;
  return !hasSubstantive(text);
}

function isSoundOnly(text: string): boolean {
  if (isSoundOfCaption(text)) return true;
  const words = wordsOf(text);
  if (words.length === 0) return false;
  let sound = 0;
  for (const word of words) {
    if (SOUND_WORDS.has(word)) {
      sound += 1;
      continue;
    }
    if (FILLER_WORDS.has(word) || STOPWORDS.has(word)) continue;
    return false;
  }
  return sound > 0;
}

function isFillerOnly(text: string): boolean {
  const words = wordsOf(text);
  if (words.length === 0) return false;
  let filler = 0;
  for (const word of words) {
    if (FILLER_WORDS.has(word)) {
      filler += 1;
      continue;
    }
    if (STOPWORDS.has(word)) continue;
    return false;
  }
  return filler > 0;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<!\d)[.!?。！？]+(?!\d)|\n+/u);
}

function classifySentence(sentence: string): SilenceDropReason | "keep" | "ignore" {
  const text = sentence.trim();
  if (!text) return "ignore";
  if (!/\p{L}/u.test(text)) {
    return isNumberUnitOnly(text) ? "number_unit" : "ignore";
  }
  if (matchesPhrase(text)) {
    return hasSubstantive(stripPhrases(text)) ? "keep" : "phrase";
  }
  if (isCharRepetition(text)) return "repetition";
  if (isNumberUnitOnly(text)) return "number_unit";
  if (isNonLatinDominant(text)) return "non_latin";
  if (isSoundOnly(text)) return "sound";
  if (isFillerOnly(text)) return "filler";
  return "keep";
}

/**
 * Why this transcript should be discarded, or null when it contains tutoring
 * speech worth keeping. Callers persist "" on a non-null reason.
 */
export function silenceHallucinationReason(
  transcript: string
): SilenceDropReason | null {
  const original = transcript.trim();
  if (!original) return "empty";
  if (isRepeatedSkipOnly(original)) return "filler";

  const reasons: SilenceDropReason[] = [];
  for (const sentence of splitSentences(original)) {
    const klass = classifySentence(sentence);
    if (klass === "keep") return null;
    if (klass !== "ignore") reasons.push(klass);
  }

  if (reasons.length === 0) return "empty";
  for (const reason of REASON_PRIORITY) {
    if (reasons.includes(reason)) return reason;
  }
  return reasons[0] ?? "empty";
}

/**
 * Returns true when the transcript is very likely a silence / junk artifact
 * rather than a tutoring session. Callers skip or delete that segment.
 */
export function looksLikeSilenceHallucination(transcript: string): boolean {
  return silenceHallucinationReason(transcript) !== null;
}
