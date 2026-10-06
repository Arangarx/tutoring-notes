/**
 * @jest-environment node
 *
 * Spec: an embed the user activated stays active when its element object is
 * replaced (graph persist, remote apply). Hover, deletion, and an already
 * current reference are left alone. Real-browser behavior is the Playwright
 * @wb-graph spec; this pins the decision rule.
 */

import { staleActiveEmbeddableReplacement } from "@/lib/whiteboard/active-embeddable-rebind";

const original = { id: "g1" };

describe("staleActiveEmbeddableReplacement", () => {
  it("returns the new object when the active embed was replaced", () => {
    const replaced = { id: "g1" };
    expect(
      staleActiveEmbeddableReplacement([{ id: "x" }, replaced], { element: original, state: "active" })
    ).toBe(replaced);
  });

  it("does nothing when the reference is still current (no update loop)", () => {
    expect(
      staleActiveEmbeddableReplacement([original], { element: original, state: "active" })
    ).toBeNull();
  });

  it("does nothing for hover", () => {
    expect(
      staleActiveEmbeddableReplacement([{ id: "g1" }], { element: original, state: "hover" })
    ).toBeNull();
  });

  it("does nothing when no embed is active", () => {
    expect(staleActiveEmbeddableReplacement([{ id: "g1" }], null)).toBeNull();
    expect(staleActiveEmbeddableReplacement([{ id: "g1" }], undefined)).toBeNull();
  });

  it("does not resurrect a deleted or missing embed", () => {
    expect(
      staleActiveEmbeddableReplacement([{ id: "g1", isDeleted: true }], { element: original, state: "active" })
    ).toBeNull();
    expect(
      staleActiveEmbeddableReplacement([{ id: "other" }], { element: original, state: "active" })
    ).toBeNull();
  });
});
