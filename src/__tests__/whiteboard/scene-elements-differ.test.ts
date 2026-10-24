import { sceneElementsDiffer } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";

const el = (id: string, version: number, versionNonce: number) =>
  ({ id, version, versionNonce }) as ExcalidrawLikeElement;

describe("sceneElementsDiffer", () => {
  it("is false for the same (id, version, versionNonce) set in any order", () => {
    expect(
      sceneElementsDiffer([el("a", 1, 1), el("b", 2, 5)], [el("b", 2, 5), el("a", 1, 1)])
    ).toBe(false);
    expect(sceneElementsDiffer([], [])).toBe(false);
  });

  it("is true when a version or versionNonce changed", () => {
    expect(sceneElementsDiffer([el("a", 2, 1)], [el("a", 1, 1)])).toBe(true);
    expect(sceneElementsDiffer([el("a", 1, 2)], [el("a", 1, 1)])).toBe(true);
  });

  it("is true when an element was added, removed or swapped for another id", () => {
    expect(sceneElementsDiffer([el("a", 1, 1), el("b", 1, 1)], [el("a", 1, 1)])).toBe(true);
    expect(sceneElementsDiffer([el("a", 1, 1)], [el("a", 1, 1), el("b", 1, 1)])).toBe(true);
    expect(sceneElementsDiffer([el("a", 1, 1)], [el("c", 1, 1)])).toBe(true);
  });

  it("is true for duplicate ids that hide a missing element", () => {
    expect(sceneElementsDiffer([el("a", 1, 1), el("b", 1, 1)], [el("a", 1, 1), el("a", 1, 1)])).toBe(
      true
    );
  });
});
