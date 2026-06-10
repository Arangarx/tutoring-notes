"use client";

import { useEffect, useState } from "react";

/**
 * Whiteboard chrome layout modes × orientation matrix
 *
 * | layoutMode        | example viewport | orientation | touch? |
 * |-------------------|------------------|-------------|--------|
 * | narrow            | 390×844          | portrait    | yes    |
 * | tablet-portrait   | 768×1024         | portrait    | yes    |
 * | phone-landscape   | 844×390          | landscape   | yes    |
 * | desktop           | 1280×800         | landscape   | no     |
 * | desktop           | 1024×768         | landscape   | no     |
 * | desktop           | 900×600          | landscape   | no     |
 *
 * Detection order (first match wins):
 * 1. w < 768 → narrow (phone portrait and small phones)
 * 2. w < 1024 && h > w → tablet-portrait
 * 3. w > h && h < 500 → phone-landscape (short landscape viewport = phone;
 *    fixes 844×390 etc. that previously fell through to desktop)
 * 4. else → desktop (includes tablet landscape 768–1023w with h ≥ 500)
 *
 * `data-orientation` on `.mynk-wb-chrome` (portrait | landscape) is derived
 * independently: landscape when w > h, else portrait.
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

function detectOrientation(w: number, h: number): WbOrientation {
  return w > h ? "landscape" : "portrait";
}

function detectLayoutMode(w: number, h: number): WbLayoutMode {
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
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
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
