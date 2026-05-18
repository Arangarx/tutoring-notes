import {
  getPageViewState,
  isWhiteboardBoardDocumentV1,
  setPageViewState,
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

  it("accepts optional valid viewState on page rows", () => {
    const doc = {
      ...minimal,
      pageList: [
        {
          id: "p1",
          title: "Page 1",
          viewState: { panX: 10, panY: -20, zoom: 1.25 },
        },
      ],
    };
    expect(isWhiteboardBoardDocumentV1(doc)).toBe(true);
  });

  it("rejects malformed viewState (missing field)", () => {
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        pageList: [{ id: "p1", title: "x", viewState: { panX: 0, panY: 0 } }],
      })
    ).toBe(false);
  });

  it("rejects malformed viewState (NaN / non-finite)", () => {
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        pageList: [
          {
            id: "p1",
            title: "x",
            viewState: { panX: NaN, panY: 0, zoom: 1 },
          },
        ],
      })
    ).toBe(false);
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        pageList: [
          {
            id: "p1",
            title: "x",
            viewState: { panX: 0, panY: 0, zoom: Infinity },
          },
        ],
      })
    ).toBe(false);
  });

  it("rejects malformed viewState (wrong types)", () => {
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        pageList: [
          {
            id: "p1",
            title: "x",
            viewState: { panX: "0", panY: 0, zoom: 1 },
          },
        ],
      })
    ).toBe(false);
    expect(
      isWhiteboardBoardDocumentV1({
        ...minimal,
        pageList: [
          { id: "p1", title: "x", viewState: "nope" },
        ],
      })
    ).toBe(false);
  });
});

describe("getPageViewState / setPageViewState", () => {
  const base: WhiteboardBoardDocumentV1 = {
    v: 1,
    pageList: [
      { id: "p1", title: "A" },
      {
        id: "p2",
        title: "B",
        viewState: { panX: 1, panY: 2, zoom: 3 },
      },
    ],
    activePageId: "p1",
    pages: { p1: [], p2: [] },
  };

  it("getPageViewState returns undefined when absent", () => {
    expect(getPageViewState(base, "p1")).toBeUndefined();
  });

  it("getPageViewState returns stored state when present", () => {
    expect(getPageViewState(base, "p2")).toEqual({
      panX: 1,
      panY: 2,
      zoom: 3,
    });
  });

  it("setPageViewState returns a new document and does not mutate the original", () => {
    const vs = { panX: 100, panY: 200, zoom: 0.5 };
    const next = setPageViewState(base, "p1", vs);
    expect(next).not.toBe(base);
    expect(base.pageList[0].viewState).toBeUndefined();
    expect(next.pageList[0].viewState).toEqual(vs);
    expect(next.pageList[1]).toEqual(base.pageList[1]);
  });

  it("setPageViewState updates only the matching row", () => {
    const vs = { panX: -1, panY: -2, zoom: 4 };
    const next = setPageViewState(base, "p2", vs);
    expect(next.pageList[0]).toEqual(base.pageList[0]);
    expect(next.pageList[1].viewState).toEqual(vs);
  });

  it("JSON round-trip preserves viewState on page rows", () => {
    const doc: WhiteboardBoardDocumentV1 = {
      v: 1,
      pageList: [
        {
          id: "p1",
          title: "A",
          viewState: { panX: 1, panY: 2, zoom: 1.25 },
        },
      ],
      activePageId: "p1",
      pages: { p1: [] },
    };
    const parsed = JSON.parse(JSON.stringify(doc)) as unknown;
    expect(isWhiteboardBoardDocumentV1(parsed)).toBe(true);
    expect(getPageViewState(parsed as WhiteboardBoardDocumentV1, "p1")).toEqual(
      doc.pageList[0]!.viewState
    );
  });

  it("setPageViewState returns original doc when pageId is unknown", () => {
    const vs = { panX: 0, panY: 0, zoom: 1 };
    const next = setPageViewState(base, "missing", vs);
    expect(next).toBe(base);
  });
});
