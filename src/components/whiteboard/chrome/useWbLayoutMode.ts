"use client";

import { useSyncExternalStore } from "react";

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

const SERVER_LAYOUT: WbLayoutState = {
  layoutMode: "desktop",
  orientation: "landscape",
};

let clientLayout: WbLayoutState = SERVER_LAYOUT;

function getClientLayoutSnapshot(): WbLayoutState {
  const next = detectLayoutState();
  if (
    clientLayout.layoutMode === next.layoutMode &&
    clientLayout.orientation === next.orientation
  ) {
    return clientLayout;
  }
  clientLayout = next;
  return clientLayout;
}

function getServerLayoutSnapshot(): WbLayoutState {
  return SERVER_LAYOUT;
}

function subscribeLayoutMode(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("resize", onStoreChange);
  window.addEventListener("orientationchange", onStoreChange);
  const mq =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: none), (pointer: coarse)")
      : null;
  mq?.addEventListener("change", onStoreChange);
  return () => {
    window.removeEventListener("resize", onStoreChange);
    window.removeEventListener("orientationchange", onStoreChange);
    mq?.removeEventListener("change", onStoreChange);
  };
}

/**
 * Responsive layout + orientation for live board chrome.
 * The client snapshot is read on the first client render (including a graph
 * that mounts later), so a phone does not paint the desktop panel for a frame.
 * SSR still reports desktop; hydration reconciles after that.
 */
export function useWbLayoutMode(): WbLayoutState {
  return useSyncExternalStore(
    subscribeLayoutMode,
    getClientLayoutSnapshot,
    getServerLayoutSnapshot
  );
}

export function isTouchLayout(mode: WbLayoutMode): boolean {
  return (
    mode === "narrow" ||
    mode === "tablet-portrait" ||
    mode === "phone-landscape"
  );
}

/**
 * Phones only: portrait `narrow` and `phone-landscape`.
 * Tablet portrait and desktop stay on the desktop chrome path.
 * A mouse window under 400px is already classified as `narrow`.
 */
export function isPhoneLayout(mode: WbLayoutMode): boolean {
  return mode === "narrow" || mode === "phone-landscape";
}
