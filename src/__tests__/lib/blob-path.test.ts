import { safeName } from "@/lib/blob-path";

/**
 * Independent oracle for the blob pathname sanitizer.
 *
 * Spec (not derived from the implementation under test):
 * - Allow only ASCII letters, digits, `.`, `_`, and `-`.
 * - Replace every other character with `_`.
 * - If the sanitised result is empty, return `emptyFallback` as-is.
 * - No length cap; no Unicode normalisation beyond the allowlist replace.
 */
function oracle(filename: string, emptyFallback: string): string {
  const allowed = new Set(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-".split("")
  );
  let out = "";
  for (const ch of filename) {
    out += allowed.has(ch) ? ch : "_";
  }
  return out.length === 0 ? emptyFallback : out;
}

/** Fallbacks historically used by each call site — must stay exact. */
const RECORDING_FALLBACK = "recording.bin";
const WHITEBOARD_FALLBACK = "blob.bin";

describe("safeName", () => {
  describe("matches independent oracle", () => {
    const cases: Array<{ name: string; input: string; fallback: string }> = [
      { name: "plain ascii", input: "session.webm", fallback: RECORDING_FALLBACK },
      { name: "spaces", input: "my recording file.webm", fallback: RECORDING_FALLBACK },
      { name: "path slashes", input: "foo/bar\\baz.webm", fallback: WHITEBOARD_FALLBACK },
      { name: "unicode", input: "café-录音.webm", fallback: WHITEBOARD_FALLBACK },
      {
        name: "special chars",
        input: "a!@#$%^&*()+=[]{}|;:'\",<>?.webm",
        fallback: RECORDING_FALLBACK,
      },
      { name: "empty string", input: "", fallback: RECORDING_FALLBACK },
      { name: "empty string whiteboard fallback", input: "", fallback: WHITEBOARD_FALLBACK },
      { name: "only disallowed chars", input: "!!!", fallback: WHITEBOARD_FALLBACK },
      { name: "already safe", input: "a-b_c.D1", fallback: RECORDING_FALLBACK },
      {
        name: "very long name (no length cap)",
        input: `${"a".repeat(500)} ${"b".repeat(500)}.webm`,
        fallback: RECORDING_FALLBACK,
      },
    ];

    it.each(cases)("$name", ({ input, fallback }) => {
      expect(safeName(input, fallback)).toBe(oracle(input, fallback));
    });
  });

  describe("preserves historical call-site outputs exactly", () => {
    // Locked outputs from the pre-dedupe local copies:
    //   recording:  filename.replace(/[^a-zA-Z0-9._-]/g, "_") || "recording.bin"
    //   whiteboard: name.replace(/[^a-zA-Z0-9._-]/g, "_") || "blob.bin"
    it("recording fallback for empty / all-stripped inputs", () => {
      expect(safeName("", RECORDING_FALLBACK)).toBe("recording.bin");
      expect(safeName("   ", RECORDING_FALLBACK)).toBe("___");
      expect(safeName("!!!", RECORDING_FALLBACK)).toBe("___");
    });

    it("whiteboard fallback for empty / all-stripped inputs", () => {
      expect(safeName("", WHITEBOARD_FALLBACK)).toBe("blob.bin");
      expect(safeName("@@@", WHITEBOARD_FALLBACK)).toBe("___");
    });

    it("normal recording-style names", () => {
      expect(safeName("segment-1.webm", RECORDING_FALLBACK)).toBe("segment-1.webm");
      expect(safeName("Sarah's take 2.m4a", RECORDING_FALLBACK)).toBe("Sarah_s_take_2.m4a");
    });

    it("normal whiteboard-style names", () => {
      expect(safeName("page-3.png", WHITEBOARD_FALLBACK)).toBe("page-3.png");
      expect(safeName("Homework #4 (final).pdf", WHITEBOARD_FALLBACK)).toBe(
        "Homework__4__final_.pdf"
      );
    });

    it("slashes and unicode match prior replace behavior", () => {
      expect(safeName("a/b/c.png", WHITEBOARD_FALLBACK)).toBe("a_b_c.png");
      expect(safeName("résumé.pdf", WHITEBOARD_FALLBACK)).toBe("r_sum_.pdf");
    });
  });

  it("does not truncate long names", () => {
    const long = `file-${"x".repeat(2000)}.bin`;
    expect(safeName(long, RECORDING_FALLBACK)).toBe(long);
    expect(safeName(long, RECORDING_FALLBACK).length).toBe(long.length);
  });
});
