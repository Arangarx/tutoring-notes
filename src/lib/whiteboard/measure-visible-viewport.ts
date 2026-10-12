import {
  readVisibleViewportRect,
  readVisualViewportBox,
  type VisibleViewportRect,
} from "@/lib/whiteboard/visible-viewport";

/** Container ∩ visualViewport. Chrome sits beside the canvas, not over it. */
export function measureVisibleViewport(container: HTMLElement): VisibleViewportRect | null {
  const r = container.getBoundingClientRect();
  return readVisibleViewportRect({
    container: { left: r.left, top: r.top, width: r.width, height: r.height },
    visualViewport: readVisualViewportBox(),
  });
}
