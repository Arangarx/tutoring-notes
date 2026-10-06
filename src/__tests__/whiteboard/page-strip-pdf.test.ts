import {
  enrichPageStripRow,
  isPdfBoardSection,
} from "@/lib/whiteboard/page-strip-pdf";

describe("isPdfBoardSection", () => {
  it("returns true for pdf- UUID sections", () => {
    expect(isPdfBoardSection("pdf-a1b2c3d4-e5f6-7890-abcd-ef1234567890")).toBe(
      true
    );
  });

  it("returns true for pdf_ fallback sections", () => {
    expect(isPdfBoardSection("pdf_abc123_1a2b3c")).toBe(true);
  });

  it("returns false for missing or non-PDF sections", () => {
    expect(isPdfBoardSection(undefined)).toBe(false);
    expect(isPdfBoardSection("")).toBe(false);
    expect(isPdfBoardSection("worksheet-jan")).toBe(false);
  });
});

describe("enrichPageStripRow", () => {
  it("derives isPdf from section when not set", () => {
    const row = enrichPageStripRow({
      id: "p2",
      title: "quiz p.1",
      section: "pdf-uuid",
    });
    expect(row.isPdf).toBe(true);
  });

  it("derives image boards from an img- section and does not mark them as PDFs", () => {
    const row = enrichPageStripRow({
      id: "p-img",
      title: "photo.png",
      section: "img-abc",
    });
    expect(row.isImage).toBe(true);
    expect(row.isPdf).toBe(false);
  });

  it("derives a pdf_ section as a PDF board and not an image board", () => {
    const row = enrichPageStripRow({
      id: "p-pdf",
      title: "packet p.1",
      section: "pdf_abc123",
    });
    expect(row.isPdf).toBe(true);
    expect(row.isImage).toBe(false);
  });

  it("sets isPdf false for regular pages", () => {
    const row = enrichPageStripRow({ id: "p1", title: "Page 1" });
    expect(row.isPdf).toBe(false);
  });
});
