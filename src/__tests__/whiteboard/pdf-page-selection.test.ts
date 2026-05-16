import {
  formatPdfSelectionPreview,
  parsePdfCustomRanges,
} from "@/lib/whiteboard/pdf-page-selection";

describe("parsePdfCustomRanges", () => {
  it("parses comma-separated singles and inclusive ranges", () => {
    const r = parsePdfCustomRanges("1-5,8,10-12", 20);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.indices).toEqual([1, 2, 3, 4, 5, 8, 10, 11, 12]);
  });

  it("rejects malformed tokens", () => {
    expect(parsePdfCustomRanges("1-,abc", 5).ok).toBe(false);
  });

  it("rejects out-of-range pages", () => {
    expect(parsePdfCustomRanges("1-99", 10).ok).toBe(false);
  });
});

describe("formatPdfSelectionPreview", () => {
  it("joins entries and truncates with ellipsis", () => {
    const s = formatPdfSelectionPreview([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s).toContain("…");
  });
});
