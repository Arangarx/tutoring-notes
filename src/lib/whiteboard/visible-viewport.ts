/**
 * Visible board rectangle: the canvas container intersected with
 * window.visualViewport. Persistent chrome is a flex sibling of the canvas,
 * so it does not cover this rect. Width and height stay in CSS pixels.
 * Callers must not divide by zoom.
 */

export type CssBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type VisibleViewportRect = {
  /** CSS px from the container's top-left. */
  left: number;
  top: number;
  width: number;
  height: number;
};

type Edges = { left: number; top: number; right: number; bottom: number };

export function roundViewportPx(n: number): number {
  return Math.round(n * 10) / 10;
}

function toEdges(box: CssBox): Edges | null {
  if (![box.left, box.top, box.width, box.height].every((n) => Number.isFinite(n))) {
    return null;
  }
  if (!(box.width > 0 && box.height > 0)) return null;
  return {
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  };
}

function intersect(a: Edges, b: Edges): Edges | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (!(right - left > 0 && bottom - top > 0)) return null;
  return { left, top, right, bottom };
}

export function readVisibleViewportRect(input: {
  container: CssBox;
  visualViewport: CssBox | null;
}): VisibleViewportRect | null {
  const container = toEdges(input.container);
  if (!container) return null;
  let visible = container;
  if (input.visualViewport) {
    const vv = toEdges(input.visualViewport);
    if (!vv) return null;
    const hit = intersect(container, vv);
    if (!hit) return null;
    visible = hit;
  }
  const width = visible.right - visible.left;
  const height = visible.bottom - visible.top;
  if (!(width > 0 && height > 0)) return null;
  return {
    left: roundViewportPx(visible.left - container.left),
    top: roundViewportPx(visible.top - container.top),
    width: roundViewportPx(width),
    height: roundViewportPx(height),
  };
}

export type VisibleViewportWireFields = {
  viewportWidth?: number;
  viewportHeight?: number;
  visibleLeft?: number;
  visibleTop?: number;
};

/**
 * Wire fields for a measured visible rect. When measurement fails, width and
 * height fall back to Excalidraw's appState size; the inset is omitted.
 */
export function visibleViewportWireFields(
  visible: VisibleViewportRect | null,
  fallback?: { width?: number; height?: number } | null
): VisibleViewportWireFields {
  if (visible && visible.width > 0 && visible.height > 0) {
    return {
      viewportWidth: visible.width,
      viewportHeight: visible.height,
      visibleLeft: visible.left,
      visibleTop: visible.top,
    };
  }
  const width = fallback?.width;
  const height = fallback?.height;
  if (
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
  ) {
    return { viewportWidth: width, viewportHeight: height };
  }
  return {};
}

export function readVisualViewportBox(): CssBox | null {
  if (typeof window === "undefined") return null;
  const vv = window.visualViewport;
  if (!vv || !(vv.width > 0) || !(vv.height > 0)) return null;
  return {
    left: vv.offsetLeft,
    top: vv.offsetTop,
    width: vv.width,
    height: vv.height,
  };
}

/** Layout-viewport edges when the visual viewport is missing. */
export function readVisualViewportEdges(): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} | null {
  if (typeof window === "undefined") return null;
  const box = readVisualViewportBox();
  if (!box) {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  }
  return {
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  };
}

/** Shared resize/scroll subscription. Callers read the box via {@link readVisualViewportBox}. */
export function subscribeVisualViewport(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const vv = window.visualViewport;
  if (!vv) return () => undefined;
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
  };
}
