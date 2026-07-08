"use client";

import { useEffect, useState } from "react";

/**
 * Whiteboard chrome layout modes × orientation matrix
 *
 * Touch-primary devices (phones/tablets) use width breakpoints for compact
 * chrome. Desktop/laptop with mouse + fine pointer keeps **desktop** chrome
 * when the window is resized — half-screen on a monitor must not flip to
 * phone overflow layout (Andrew 2026-06-24 smoke).
 *
 * | layoutMode        | example viewport | orientation | touch? |
 * |-------------------|------------------|-------------|--------|
 * | narrow            | 390×844          | portrait    | yes    |
 * | tablet-portrait   | 768×1024         | portrait    | yes    |
 * | phone-landscape   | 844×390          | landscape   | yes    |
 * | desktop           | 1280×800         | landscape   | no     |
 * | desktop           | 640×700          | portrait    | no     |
 *
 * Detection order on **touch-primary** (first match wins):
 * 1. w < 768 → narrow
 * 2. w < 1024 && h > w → tablet-portrait
 * 3. w > h && h < 500 → phone-landscape
 * 4. else → desktop
 *
 * **Non-touch** (mouse/trackpad): always desktop unless w < 400 (emergency).
 */

export type WbLayoutMode =
  | "desktop"
  | "narrow"
  | "tablet-portrait"
  | "phone-landscape";

export type WbOrientation = "portrait" | "landscape";

export interface WbLayoutState {
  layoutMode: WbLayoutMode;
  orientation: WbOrientation;
}

/** Short-edge ceiling for phone-landscape (e.g. iPhone 14 landscape h≈390). */
const PHONE_LANDSCAPE_MAX_H = 500;

const NARROW_MAX_W = 768;
const TABLET_MAX_W = 1024;
/** Below this width even mouse users get narrow chrome (unusable otherwise). */
const DESKTOP_NARROW_FALLBACK_W = 400;

/** True when the primary input is touch (phone/tablet), not a resized desktop window. */
export function isTouchPrimaryDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

function detectOrientation(w: number, h: number): WbOrientation {
  return w > h ? "landscape" : "portrait";
}

/** Exported for unit tests — pass `touchPrimary` explicitly. */
export function detectLayoutMode(
  w: number,
  h: number,
  touchPrimary: boolean = isTouchPrimaryDevice()
): WbLayoutMode {
  if (!touchPrimary) {
    if (w < DESKTOP_NARROW_FALLBACK_W) return "narrow";
    return "desktop";
  }
  if (w < NARROW_MAX_W) return "narrow";
  if (w < TABLET_MAX_W && h > w) return "tablet-portrait";
  if (w > h && h < PHONE_LANDSCAPE_MAX_H) return "phone-landscape";
  return "desktop";
}

function detectLayoutState(): WbLayoutState {
  if (typeof window === "undefined") {
    return { layoutMode: "desktop", orientation: "landscape" };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    layoutMode: detectLayoutMode(w, h),
    orientation: detectOrientation(w, h),
  };
}

/** Responsive layout + orientation for live board chrome. */
export function useWbLayoutMode(): WbLayoutState {
  const [state, setState] = useState<WbLayoutState>({
    layoutMode: "desktop",
    orientation: "landscape",
  });

  useEffect(() => {
    const update = () => setState(detectLayoutState());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const onMq = () => update();
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  return state;
}

export function isTouchLayout(mode: WbLayoutMode): boolean {
  return (
    mode === "narrow" ||
    mode === "tablet-portrait" ||
    mode === "phone-landscape"
  );
}
