/**
 * Follow mode B: tutor and student share the same scene-coordinate viewport
 * center at matched zoom. Wire carries tutor `centerSceneX/Y` + `zoom`; each
 * peer applies using its own measured viewport via Excalidraw's transforms
 * (vendored in `excalidraw-viewport-coords.ts`).
 */

import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  viewportCoordsToSceneCoords,
  type ViewportCoordTransform,
} from "@/lib/whiteboard/excalidraw-viewport-coords";
import type { WhiteboardWireFollow } from "@/lib/whiteboard/sync-client";

export {
  viewportCoordsToSceneCoords,
  sceneCoordsToViewportCoords,
} from "@/lib/whiteboard/excalidraw-viewport-coords";

export type ViewportSize = {
  viewportWidth: number;
  viewportHeight: number;
};

function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function coordSlice(
  scrollX: number,
  scrollY: number,
  zoomValue: number,
  viewportWidth: number,
  viewportHeight: number,
  offsetLeft = 0,
  offsetTop = 0
): ViewportCoordTransform & { width: number; height: number } {
  return {
    scrollX,
    scrollY,
    zoom: { value: zoomValue },
    offsetLeft,
    offsetTop,
    width: viewportWidth,
    height: viewportHeight,
  };
}

/** Scene point at the center of a viewport described by scroll/zoom/size. */
export function viewportSceneCenterFromScroll(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  offsetLeft = 0,
  offsetTop = 0
): { x: number; y: number } {
  return viewportCoordsToSceneCoords(
    {
      clientX: offsetLeft + viewportWidth / 2,
      clientY: offsetTop + viewportHeight / 2,
    },
    coordSlice(
      scrollX,
      scrollY,
      zoom,
      viewportWidth,
      viewportHeight,
      offsetLeft,
      offsetTop
    )
  );
}

/** scrollX/scrollY so `centerScene` sits at the viewport center. */
export function scrollForViewportSceneCenter(
  centerSceneX: number,
  centerSceneY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  _offsetLeft = 0,
  _offsetTop = 0
): { scrollX: number; scrollY: number } {
  // Inverse of center at client (offset + size/2): scene = (size/2)/zoom - scroll.
  // Offsets cancel in the forward transform; scroll must not depend on them.
  const scrollX = viewportWidth / 2 / zoom - centerSceneX;
  const scrollY = viewportHeight / 2 / zoom - centerSceneY;
  return { scrollX, scrollY };
}

export function hasFollowSceneCenter(
  follow: WhiteboardWireFollow
): follow is WhiteboardWireFollow & {
  centerSceneX: number;
  centerSceneY: number;
} {
  return (
    isPositiveFinite(follow.centerSceneX) &&
    isPositiveFinite(follow.centerSceneY) &&
    isPositiveFinite(follow.zoom)
  );
}

/** Build wire follow from tutor appState (requires measured width/height). */
export function followWireFromTutorAppState(st: {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  width?: number;
  height?: number;
  offsetLeft?: number;
  offsetTop?: number;
}): WhiteboardWireFollow | null {
  const w = st.width;
  const h = st.height;
  if (!isPositiveFinite(w) || !isPositiveFinite(h)) return null;
  const offsetLeft = isPositiveFinite(st.offsetLeft) ? st.offsetLeft : 0;
  const offsetTop = isPositiveFinite(st.offsetTop) ? st.offsetTop : 0;
  const center = viewportSceneCenterFromScroll(
    st.scrollX,
    st.scrollY,
    st.zoom.value,
    w,
    h,
    offsetLeft,
    offsetTop
  );
  return {
    centerSceneX: center.x,
    centerSceneY: center.y,
    zoom: st.zoom.value,
    scrollX: st.scrollX,
    scrollY: st.scrollY,
  };
}

export function studentScrollFromFollowCenter(
  follow: Pick<WhiteboardWireFollow, "centerSceneX" | "centerSceneY" | "zoom">,
  studentViewportWidth: number,
  studentViewportHeight: number,
  offsetLeft = 0,
  offsetTop = 0
): { scrollX: number; scrollY: number; zoom: number } {
  const { scrollX, scrollY } = scrollForViewportSceneCenter(
    follow.centerSceneX,
    follow.centerSceneY,
    follow.zoom,
    studentViewportWidth,
    studentViewportHeight,
    offsetLeft,
    offsetTop
  );
  return { scrollX, scrollY, zoom: follow.zoom };
}

export function readViewportSizeFromAppState(appState: unknown): ViewportSize | null {
  if (!appState || typeof appState !== "object") return null;
  const o = appState as {
    width?: unknown;
    height?: unknown;
    offsetLeft?: unknown;
    offsetTop?: unknown;
  };
  if (isPositiveFinite(o.width) && isPositiveFinite(o.height)) {
    return { viewportWidth: o.width, viewportHeight: o.height };
  }
  return null;
}

function readOffsetsFromAppState(appState: unknown): {
  offsetLeft: number;
  offsetTop: number;
} {
  if (!appState || typeof appState !== "object") {
    return { offsetLeft: 0, offsetTop: 0 };
  }
  const o = appState as { offsetLeft?: unknown; offsetTop?: unknown };
  return {
    offsetLeft: isPositiveFinite(o.offsetLeft) ? o.offsetLeft : 0,
    offsetTop: isPositiveFinite(o.offsetTop) ? o.offsetTop : 0,
  };
}

const MAX_RAF_RETRIES = 2;

export type ApplyViewportAlignedOptions = {
  wbsid?: string;
  wba?: string;
  pageId?: string;
  onDefer?: (retry: number) => void;
  onApplied?: (scrollX: number, scrollY: number, zoom: number) => void;
  onHold?: (reason: string) => void;
};

function formatCenterLog(
  centerSceneX: number,
  centerSceneY: number,
  zoom: number
): string {
  return `(${centerSceneX.toFixed(1)},${centerSceneY.toFixed(1)}) z${zoom}`;
}

/**
 * Apply tutor follow (centerScene + zoom) on the student canvas. Holds the
 * current camera when centerScene is missing or student dims are not measured.
 */
export function applyViewportAligned(
  api: ExcalidrawApiLike,
  tutorFollow: WhiteboardWireFollow,
  options?: ApplyViewportAlignedOptions
): void {
  if (!hasFollowSceneCenter(tutorFollow)) {
    options?.onHold?.("missing-center-scene");
    return;
  }

  let rafRetries = 0;
  let applied = false;

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

    if (options?.wba) {
      const studentSize = readViewportSizeFromAppState(api.getAppState());
      const offsets = readOffsetsFromAppState(api.getAppState());
      if (studentSize) {
        const studentCenter = viewportSceneCenterFromScroll(
          scrollX,
          scrollY,
          zoom,
          studentSize.viewportWidth,
          studentSize.viewportHeight,
          offsets.offsetLeft,
          offsets.offsetTop
        );
        const tag = options.wbsid ? `wbsid=${options.wbsid} ` : "";
        const page = options.pageId ? ` pvs=${options.pageId}` : "";
        console.info(
          `[student-apply] ${tag}wba=${options.wba} action=viewport-follow` +
            ` tutorCenter=${formatCenterLog(
              tutorFollow.centerSceneX,
              tutorFollow.centerSceneY,
              tutorFollow.zoom
            )} studentCenter=${formatCenterLog(
              studentCenter.x,
              studentCenter.y,
              zoom
            )}${page}`
        );
      }
    }
  };

  const attempt = () => {
    if (applied) return;
    const studentSize = readViewportSizeFromAppState(api.getAppState());
    if (!studentSize) {
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
      options?.onHold?.("zero-dimensions");
      return;
    }

    const offsets = readOffsetsFromAppState(api.getAppState());
    const aligned = studentScrollFromFollowCenter(
      tutorFollow,
      studentSize.viewportWidth,
      studentSize.viewportHeight,
      offsets.offsetLeft,
      offsets.offsetTop
    );
    writeAppState(aligned.scrollX, aligned.scrollY, aligned.zoom);
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(attempt);
  } else {
    attempt();
  }
}

export function resolveStudentScrollForFollow(
  api: ExcalidrawApiLike,
  follow: WhiteboardWireFollow
): { scrollX: number; scrollY: number; zoom: number } | null {
  if (!hasFollowSceneCenter(follow)) return null;
  const studentSize = readViewportSizeFromAppState(api.getAppState());
  if (!studentSize) return null;
  const offsets = readOffsetsFromAppState(api.getAppState());
  return studentScrollFromFollowCenter(
    follow,
    studentSize.viewportWidth,
    studentSize.viewportHeight,
    offsets.offsetLeft,
    offsets.offsetTop
  );
}
