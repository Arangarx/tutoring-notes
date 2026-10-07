"use client";

import { useEffect, type RefObject } from "react";

const INVERTED = "__mynkWheelInverted";

/**
 * Excalidraw pans on a plain wheel and zooms when Ctrl/Cmd is held.
 * Flip that modifier in the capture phase before the library's wheel
 * listener (bound on the inner `.excalidraw` container) sees the event.
 * Shift+wheel is left alone (library horizontal pan). Space-to-pan is a
 * key handler and is not touched here.
 */
export function useInvertWheelZoom(args: {
  canvasMountRef: RefObject<HTMLElement | null>;
}): void {
  const { canvasMountRef } = args;

  useEffect(() => {
    let detach: (() => void) | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const onWheel = (event: Event) => {
      const e = event as WheelEvent & { [INVERTED]?: boolean };
      if (e[INVERTED]) return;
      if (e.shiftKey) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      const scene = target.closest(".excalidraw");
      if (!(scene instanceof HTMLElement)) return;
      // The library ignores wheel events whose target is not the canvas.
      const canvas =
        target instanceof HTMLCanvasElement
          ? target
          : scene.querySelector("canvas.interactive");
      const dispatchOn =
        canvas instanceof HTMLCanvasElement
          ? canvas
          : scene.querySelector("canvas");
      if (!(dispatchOn instanceof HTMLCanvasElement)) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const plainWheel = !(e.ctrlKey || e.metaKey);
      const clone = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        // Library zooms when ctrlKey or metaKey is set.
        ctrlKey: plainWheel,
        metaKey: false,
        altKey: e.altKey,
        shiftKey: false,
        button: e.button,
        buttons: e.buttons,
      });
      Object.defineProperty(clone, INVERTED, { value: true });
      dispatchOn.dispatchEvent(clone);
    };

    const attach = () => {
      if (cancelled) return;
      const el = canvasMountRef.current;
      if (!el) {
        retry = setTimeout(attach, 50);
        return;
      }
      el.addEventListener("wheel", onWheel, { capture: true, passive: false });
      detach = () => {
        el.removeEventListener("wheel", onWheel, { capture: true });
      };
    };

    attach();
    return () => {
      cancelled = true;
      if (retry !== null) clearTimeout(retry);
      detach?.();
    };
  }, [canvasMountRef]);
}
