import {
  isWhiteboardBoardDocumentV1,
  type WhiteboardBoardDocumentV1,
} from "@/lib/whiteboard/board-document-snapshot";

describe("isWhiteboardBoardDocumentV1", () => {
  const minimal: WhiteboardBoardDocumentV1 = {
    v: 1,
    pageList: [{ id: "p1", title: "Page 1" }],
    activePageId: "p1",
    pages: { p1: [] },
  };

  it("accepts legacy docs without section / sections", () => {
    expect(isWhiteboardBoardDocumentV1(minimal)).toBe(true);
  });

  it("accepts optional section on page rows", () => {
    const doc = {
      ...minimal,
      pageList: [
        { id: "p1", title: "Page 1" },
        {
          id: "p2",
          title: "Worksheet p.1",
          section: "pdf-abc",
        },
      ],
      pages: { ...minimal.pages, p2: [] },
    };
    expect(isWhiteboardBoardDocumentV1(doc)).toBe(true);
  });

  it("accepts optional sections registry", () => {
    const doc = {
      ...minimal,
      sections: {
        "pdf-abc": { label: "Worksheet Jan 12" },
      },
    };
    expect(isWhiteboardBoardDocumentV1(doc)).toBe(true);
  });

  it("rejects section when not a string", () => {
    const doc = {
      ...minimal,
      pageList: [{ id: "p1", title: "x", section: 1 }],
    };
    expect(isWhiteboardBoardDocumentV1(doc)).toBe(false);
  });

  it("rejects malformed sections map entries", () => {
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        sections: { x: {} },
      })
    ).toBe(false);
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        sections: { x: { label: 1 } },
      })
    ).toBe(false);
  });

  it("rejects non-object sections root", () => {
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        sections: "nope",
      })
    ).toBe(false);
  });
});
