"use client";

import { useSyncExternalStore } from "react";

type ExcalidrawTheme = "light" | "dark";

function getSnapshot(): ExcalidrawTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Hydration MUST use the visitor's actual `prefers-color-scheme` on the browser.
 * Returning a constant `"light"` here left client components (replay, workspace shells)
 * on a stale light snapshot until a later passive effect — Excalidraw then painted white
 * on first frame for dark‑mode tutors.
 *
 * SSR still returns `"light"` from `getSnapshot()` when `window` is undefined.
 */
function getServerSnapshot(): ExcalidrawTheme {
  return getSnapshot();
}

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/**
 * Drives Excalidraw's `theme` from `prefers-color-scheme` so we don't force
 * dark mode on the board; the canvas follows the visitor's system setting
 * and updates if they change it (e.g. scheduled dark mode on mobile).
 */
export function useExcalidrawThemeFromSystem(): ExcalidrawTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
