"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RecordedViewportCamera } from "@/lib/whiteboard/event-log";
import {
  replayScrollFromRecordedViewport,
  type ReplayCameraMode,
} from "@/lib/whiteboard/viewport-align";

const ALIGN_RETRIES = 4;

export type ReplayCameraAppStateSource = {
  getAppState?: () => unknown;
};

function readFiniteOffsets(api: ReplayCameraAppStateSource | null): {
  offsetLeft: number;
  offsetTop: number;
} {
  let offsetLeft = 0;
  let offsetTop = 0;
  try {
    const st = api?.getAppState?.();
    if (st && typeof st === "object") {
      const o = st as { offsetLeft?: unknown; offsetTop?: unknown };
      if (typeof o.offsetLeft === "number" && Number.isFinite(o.offsetLeft)) {
        offsetLeft = o.offsetLeft;
      }
      if (typeof o.offsetTop === "number" && Number.isFinite(o.offsetTop)) {
        offsetTop = o.offsetTop;
      }
    }
  } catch {
    // best-effort — offsets only affect center-match when non-zero
  }
  return { offsetLeft, offsetTop };
}

/**
 * Shared recorded-camera glue for both replay players (full-page
 * WhiteboardReplay and in-frame ReplayCanvasSurface).
 *
 * Measures the replay container, center-matches the recorded tutor camera
 * (`preserve` keeps tutor zoom; `fit` uses one uniform zoom), and re-applies
 * the last painted time when `cameraMode` changes. A 0×0 container retries
 * on rAF up to four times, then re-enters `applySceneAtRef`.
 */
export function useReplayRecordedCamera(args: {
  cameraMode: ReplayCameraMode;
  containerRef: { readonly current: HTMLElement | null };
  applySceneAtRef: React.MutableRefObject<(timeMs: number) => void>;
}): {
  lastAppliedTimeRef: React.MutableRefObject<number | null>;
  alignRecordedViewport: (
    timeMs: number,
    vp: RecordedViewportCamera | null,
    api: ReplayCameraAppStateSource | null
  ) => { panX: number; panY: number; zoom: number } | undefined;
} {
  const { cameraMode, containerRef, applySceneAtRef } = args;
  const lastAppliedTimeRef = useRef<number | null>(null);
  /** Mode whose scene has already been painted. Null until the first commit. */
  const appliedModeRef = useRef<ReplayCameraMode | null>(null);
  /**
   * Full-page Excalidraw (no zen mode) can apply `initialData` on a later
   * frame and wipe the first updateScene back to zoom 1 and an empty scene.
   * In-frame often survives because a 0×0 measure already schedules a retry.
   * One bounded burst per mode re-asserts elements + camera after that reset.
   */
  const needsReassertRef = useRef(true);

  const alignRecordedViewport = useCallback(
    (
      timeMs: number,
      vp: RecordedViewportCamera | null,
      api: ReplayCameraAppStateSource | null
    ) => {
      lastAppliedTimeRef.current = timeMs;
      if (!vp) return undefined;
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const { offsetLeft, offsetTop } = readFiniteOffsets(api);
        const aligned = replayScrollFromRecordedViewport(
          vp,
          rect.width,
          rect.height,
          offsetLeft,
          offsetTop,
          { allowLegacyRecordSizeFallback: true, mode: cameraMode }
        );
        if (aligned) {
          if (needsReassertRef.current && typeof window !== "undefined") {
            needsReassertRef.current = false;
            let framesLeft = ALIGN_RETRIES;
            const reassert = () => {
              if (framesLeft <= 0) return;
              framesLeft -= 1;
              if (lastAppliedTimeRef.current === timeMs) {
                applySceneAtRef.current(timeMs);
              }
              window.requestAnimationFrame(reassert);
            };
            window.requestAnimationFrame(reassert);
          }
          return {
            panX: aligned.scrollX,
            panY: aligned.scrollY,
            zoom: aligned.zoom,
          };
        }
        return { panX: vp.panX, panY: vp.panY, zoom: vp.zoom };
      }
      if (container && typeof window !== "undefined") {
        // Share replay shell layout race: rect can be 0×0 on the first paint
        // before the flex height chain resolves — retry on rAF (same pattern as
        // createCameraFitter in scene-paint.ts).
        let retriesLeft = ALIGN_RETRIES;
        const retryAlign = () => {
          if (retriesLeft <= 0) return;
          retriesLeft -= 1;
          const retryRect = container.getBoundingClientRect();
          if (!(retryRect.width > 0 && retryRect.height > 0)) {
            window.requestAnimationFrame(retryAlign);
            return;
          }
          applySceneAtRef.current(timeMs);
        };
        window.requestAnimationFrame(retryAlign);
      }
      return { panX: vp.panX, panY: vp.panY, zoom: vp.zoom };
    },
    [applySceneAtRef, cameraMode, containerRef]
  );

  useEffect(() => {
    needsReassertRef.current = true;
    if (appliedModeRef.current === cameraMode) return;
    const timeMs = lastAppliedTimeRef.current;
    if (timeMs == null) {
      // Initial paint applies this mode itself. Remember it so a Strict Mode
      // effect replay does not schedule a second pass before any scene exists.
      appliedModeRef.current = cameraMode;
      return;
    }
    let cancelled = false;
    // After sibling effects assign applySceneAtRef. A microtask cancelled by
    // Strict Mode's extra effect pass is rescheduled, because appliedModeRef
    // updates only when the reapply actually runs.
    queueMicrotask(() => {
      if (cancelled) return;
      appliedModeRef.current = cameraMode;
      applySceneAtRef.current(timeMs);
    });
    return () => {
      cancelled = true;
    };
  }, [applySceneAtRef, cameraMode]);

  return { lastAppliedTimeRef, alignRecordedViewport };
}
