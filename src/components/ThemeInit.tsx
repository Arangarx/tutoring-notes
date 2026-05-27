"use client";

import { useEffect } from "react";

const STORAGE_KEY = "tutoring-notes-dev-theme";

/**
 * Dev-only theme override: ?theme=light|dark or localStorage flag.
 * System prefers-color-scheme is handled in CSS (tokens.css); this only
 * sets data-theme when explicitly requested.
 */
export function ThemeInit() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("theme");
    const fromStorage =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(STORAGE_KEY)
        : null;
    const theme = fromUrl ?? fromStorage;
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
      if (fromUrl) {
        localStorage.setItem(STORAGE_KEY, theme);
      }
    }
  }, []);

  return null;
}
