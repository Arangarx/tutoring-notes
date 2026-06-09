"use client";

import { useEffect, useState } from "react";

export type WbLayoutMode = "desktop" | "narrow" | "tablet-portrait";

function detectLayoutMode(): WbLayoutMode {
  if (typeof window === "undefined") return "desktop";
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 768) return "narrow";
  if (w < 1024 && h > w) return "tablet-portrait";
  return "desktop";
}

/** Responsive layout for live board chrome — mirrors session shell mock ┬º7.x */
export function useWbLayoutMode(): WbLayoutMode {
  const [mode, setMode] = useState<WbLayoutMode>("desktop");

  useEffect(() => {
    const update = () => setMode(detectLayoutMode());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return mode;
}

export function isTouchLayout(mode: WbLayoutMode): boolean {
  return mode === "narrow" || mode === "tablet-portrait";
}
