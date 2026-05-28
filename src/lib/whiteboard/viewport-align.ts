/**
 * Pan/zoom alignment so two peers with different viewport sizes share the
 * same scene-coordinate center (Excalidraw scroll convention).
 */

import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { WhiteboardWireFollow } from "@/lib/whiteboard/sync-client";

export type ViewportPanZoom = {
  panX: number;
  panY: number;
  zoom: number;
};

export type ViewportSize = {
  viewportWidth: number;
  viewportHeight: number;
};

export function sceneCenterFromScroll(
  panX: number,
  panY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  return {
    x: panX + viewportWidth / 2 / zoom,
    y: panY + viewportHeight / 2 / zoom,
  };
}

export function scrollFromSceneCenter(
  centerX: number,
  centerY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { scrollX: number; scrollY: number } {
  return {
    scrollX: centerX - viewportWidth / 2 / zoom,
    scrollY: centerY - viewportHeight / 2 / zoom,
  };
}

/**
 * Given tutor pan/zoom (+ tutor viewport size), compute student scroll so
 * both viewports show the same scene center at the tutor's zoom.
 */
export function alignStudentScrollToTutorCenter(
  tutor: ViewportPanZoom & ViewportSize,
  studentViewportWidth: number,
  studentViewportHeight: number
): { scrollX: number; scrollY: number; zoom: number } {
  const center = sceneCenterFromScroll(
    tutor.panX,
    tutor.panY,
    tutor.zoom,
    tutor.viewportWidth,
    tutor.viewportHeight
  );
  const { scrollX, scrollY } = scrollFromSceneCenter(
    center.x,
    center.y,
    tutor.zoom,
    studentViewportWidth,
    studentViewportHeight
  );
  return { scrollX, scrollY, zoom: tutor.zoom };
}

function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function readViewportSizeFromAppState(appState: unknown): ViewportSize | null {
  if (!appState || typeof appState !== "object") return null;
  const o = appState as { width?: unknown; height?: unknown };
  if (isPositiveFinite(o.width) && isPositiveFinite(o.height)) {
    return { viewportWidth: o.width, viewportHeight: o.height };
  }
  return null;
}

const MAX_RAF_RETRIES = 2;
const LAYOUT_TIMEOUT_MS = 500;

export type ApplyViewportAlignedOptions = {
  wbsid?: string;
  wba?: string;
  pageId?: string;
  onDefer?: (retry: number) => void;
  onApplied?: (scrollX: number, scrollY: number, zoom: number) => void;
  onTimeoutFallback?: () => void;
};

/**
 * Apply tutor follow viewport to the student canvas. Retries on rAF when
 * appState width/height are zero; after 500ms applies raw scroll (legacy).
 */
export function applyViewportAligned(
  api: ExcalidrawApiLike,
  tutorFollow: WhiteboardWireFollow,
  options?: ApplyViewportAlignedOptions
): void {
  let rafRetries = 0;
  let applied = false;
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  const writeAppState = (scrollX: number, scrollY: number, zoom: number) => {
    if (applied) return;
    applied = true;
    const prev = api.getAppState() as Record<string, unknown>;
    const a = api as ExcalidrawApiLike & {
      updateScene: (s: { appState?: unknown }) => void;
    };
    a.updateScene({
      appState: {
        ...prev,
        scrollX,
        scrollY,
        zoom: { value: zoom },
      },
    });
    options?.onApplied?.(scrollX, scrollY, zoom);
  };

  const applyRawFollow = () => {
    options?.onTimeoutFallback?.();
    writeAppState(tutorFollow.scrollX, tutorFollow.scrollY, tutorFollow.zoom);
  };

  const attempt = () => {
    if (applied) return;
    const studentSize = readViewportSizeFromAppState(api.getAppState());
    const tutorW = tutorFollow.viewportWidth;
    const tutorH = tutorFollow.viewportHeight;
    const hasTutorSize =
      isPositiveFinite(tutorW) && isPositiveFinite(tutorH);
    const hasStudentSize = studentSize !== null;

    if (!hasStudentSize) {
      const elapsed =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        startedAt;
      if (elapsed >= LAYOUT_TIMEOUT_MS) {
        applyRawFollow();
        return;
      }
      if (rafRetries < MAX_RAF_RETRIES) {
        rafRetries += 1;
        options?.onDefer?.(rafRetries);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(attempt);
        } else {
          setTimeout(attempt, 16);
        }
        return;
      }
      applyRawFollow();
      return;
    }

    if (hasTutorSize && studentSize) {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: tutorFollow.scrollX,
          panY: tutorFollow.scrollY,
          zoom: tutorFollow.zoom,
          viewportWidth: tutorW,
          viewportHeight: tutorH,
        },
        studentSize.viewportWidth,
        studentSize.viewportHeight
      );
      writeAppState(aligned.scrollX, aligned.scrollY, aligned.zoom);
      return;
    }

    writeAppState(tutorFollow.scrollX, tutorFollow.scrollY, tutorFollow.zoom);
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(attempt);
  } else {
    attempt();
  }

  setTimeout(() => {
    if (!applied) {
      applyRawFollow();
    }
  }, LAYOUT_TIMEOUT_MS);
}

export function resolveStudentScrollForTutorViewport(
  api: ExcalidrawApiLike,
  tutorPanX: number,
  tutorPanY: number,
  tutorZoom: number,
  tutorViewport?: Pick<WhiteboardWireFollow, "viewportWidth" | "viewportHeight">
): { scrollX: number; scrollY: number; zoom: number } {
  const studentSize = readViewportSizeFromAppState(api.getAppState());
  if (
    studentSize &&
    isPositiveFinite(tutorViewport?.viewportWidth) &&
    isPositiveFinite(tutorViewport?.viewportHeight)
  ) {
    return alignStudentScrollToTutorCenter(
      {
        panX: tutorPanX,
        panY: tutorPanY,
        zoom: tutorZoom,
        viewportWidth: tutorViewport.viewportWidth,
        viewportHeight: tutorViewport.viewportHeight,
      },
      studentSize.viewportWidth,
      studentSize.viewportHeight
    );
  }
  return { scrollX: tutorPanX, scrollY: tutorPanY, zoom: tutorZoom };
}
