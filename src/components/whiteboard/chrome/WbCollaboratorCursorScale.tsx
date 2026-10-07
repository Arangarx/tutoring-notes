"use client";

import { useEffect } from "react";
import "./WbCollaboratorCursor.css";

/** Excalidraw collaborator pointer-down ring, viewport pixels. */
const LIBRARY_CURSOR_RING = 15;

type PatchedContext = CanvasRenderingContext2D & { __mynkCursorRing?: boolean };

/**
 * Shrink the other person's cursor ring by the chrome CSS scale.
 * The ring is a canvas arc, so the scale lives in component CSS and is
 * applied only to that library radius. Laser trails are a separate SVG.
 */
export function WbCollaboratorCursorScale() {
  useEffect(() => {
    const root = document.querySelector(".mynk-wb-chrome");
    if (!(root instanceof HTMLElement)) return;
    const scale = Number.parseFloat(
      getComputedStyle(root).getPropertyValue("--mynk-wb-collab-cursor-scale")
    );
    if (!(scale > 0 && scale < 1)) return;
    const nextRadius = LIBRARY_CURSOR_RING * scale;

    const patch = (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d") as PatchedContext | null;
      if (!ctx || ctx.__mynkCursorRing) return;
      const orig = ctx.arc.bind(ctx);
      ctx.arc = ((x, y, radius, start, end, counterclockwise) => {
        const r = radius === LIBRARY_CURSOR_RING ? nextRadius : radius;
        return orig(x, y, r, start, end, counterclockwise);
      }) as CanvasRenderingContext2D["arc"];
      ctx.__mynkCursorRing = true;
    };

    const scan = () => {
      root.querySelectorAll(".excalidraw canvas").forEach((node) => {
        if (node instanceof HTMLCanvasElement) patch(node);
      });
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
