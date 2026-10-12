/**
 * Stops pan/zoom gestures from reaching Excalidraw while the student view
 * is locked. Capture + passive:false, and only for events whose target is
 * the Excalidraw canvas, so menus and chat still scroll.
 *
 * The existing follow revert stays in place as a backstop. This guard does
 * not change that path.
 */

export type LockedViewBlockKind = "wheel" | "pointer2" | "gesture" | "key";

const NUDGE_MS = 700;
const LOG_MS = 1000;

const CAPTURE: AddEventListenerOptions = { capture: true, passive: false };

export function attachLockedViewGestureGuard(
  mount: HTMLElement,
  opts?: { onBlocked?: (kind: LockedViewBlockKind) => void }
): () => void {
  const liveTouch = new Set<number>();
  const swallowed = new Set<number>();
  const lastLog: Partial<Record<LockedViewBlockKind, number>> = {};
  let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  const blocked = (kind: LockedViewBlockKind) => {
    mount.removeAttribute("data-wb-lock-nudge");
    void mount.offsetWidth;
    mount.setAttribute("data-wb-lock-nudge", "1");
    if (nudgeTimer !== null) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => {
      mount.removeAttribute("data-wb-lock-nudge");
      nudgeTimer = null;
    }, NUDGE_MS);
    const now = Date.now();
    const prev = lastLog[kind] ?? 0;
    if (now - prev >= LOG_MS) {
      lastLog[kind] = now;
      console.info(`[wvl] action=blocked kind=${kind}`);
    }
    opts?.onBlocked?.(kind);
  };

  const onWheel = (event: WheelEvent) => {
    if (!isExcalidrawCanvasTarget(mount, event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked("wheel");
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!isExcalidrawCanvasTarget(mount, event.target)) return;
    if (event.pointerType !== "touch") return;
    if (liveTouch.size === 0) {
      liveTouch.add(event.pointerId);
      return;
    }
    swallowed.add(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked("pointer2");
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!swallowed.has(event.pointerId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onPointerUp = (event: PointerEvent) => {
    liveTouch.delete(event.pointerId);
    if (!swallowed.has(event.pointerId)) return;
    swallowed.delete(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onMultiTouch = (event: TouchEvent) => {
    if (!isExcalidrawCanvasTarget(mount, event.target)) return;
    if (event.touches.length < 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked("pointer2");
  };

  const onGesture = (event: Event) => {
    if (!isExcalidrawCanvasTarget(mount, event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked("gesture");
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    if (isCanvasScopedPanZoomKey(event)) {
      if (!isCanvasScopedKeyTarget(event.target)) return;
    } else if (!isGlobalPanZoomKey(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    blocked("key");
  };

  mount.addEventListener("wheel", onWheel, CAPTURE);
  mount.addEventListener("pointerdown", onPointerDown, CAPTURE);
  mount.addEventListener("pointermove", onPointerMove, CAPTURE);
  mount.addEventListener("pointerup", onPointerUp, CAPTURE);
  mount.addEventListener("pointercancel", onPointerUp, CAPTURE);
  mount.addEventListener("touchstart", onMultiTouch, CAPTURE);
  mount.addEventListener("touchmove", onMultiTouch, CAPTURE);
  window.addEventListener("gesturestart", onGesture, CAPTURE);
  window.addEventListener("gesturechange", onGesture, CAPTURE);
  window.addEventListener("gestureend", onGesture, CAPTURE);
  window.addEventListener("keydown", onKeyDown, CAPTURE);

  return () => {
    mount.removeEventListener("wheel", onWheel, CAPTURE);
    mount.removeEventListener("pointerdown", onPointerDown, CAPTURE);
    mount.removeEventListener("pointermove", onPointerMove, CAPTURE);
    mount.removeEventListener("pointerup", onPointerUp, CAPTURE);
    mount.removeEventListener("pointercancel", onPointerUp, CAPTURE);
    mount.removeEventListener("touchstart", onMultiTouch, CAPTURE);
    mount.removeEventListener("touchmove", onMultiTouch, CAPTURE);
    window.removeEventListener("gesturestart", onGesture, CAPTURE);
    window.removeEventListener("gesturechange", onGesture, CAPTURE);
    window.removeEventListener("gestureend", onGesture, CAPTURE);
    window.removeEventListener("keydown", onKeyDown, CAPTURE);
    if (nudgeTimer !== null) clearTimeout(nudgeTimer);
    mount.removeAttribute("data-wb-lock-nudge");
    liveTouch.clear();
    swallowed.clear();
  };
}

function eventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function isExcalidrawCanvasTarget(mount: HTMLElement, target: EventTarget | null): boolean {
  const el = eventElement(target);
  if (!el || !mount.contains(el)) return false;
  const scene = mount.querySelector(".excalidraw");
  return scene instanceof Element && scene.contains(el);
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = eventElement(target);
  if (!el) return false;
  const editable = el.closest("input, textarea, [contenteditable]");
  if (!editable) return false;
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    return true;
  }
  const flag = editable.getAttribute("contenteditable");
  return flag !== null && flag.toLowerCase() !== "false";
}

/** Space, hand tool, and zoom keys: only while the canvas itself has the key. */
function isCanvasScopedPanZoomKey(event: KeyboardEvent): boolean {
  const key = event.key;
  if (key === " " || event.code === "Space") {
    return !event.ctrlKey && !event.metaKey && !event.altKey;
  }
  if (key === "h" || key === "H") {
    return !event.ctrlKey && !event.metaKey && !event.altKey;
  }
  if (key === "+" || key === "-" || key === "=" || key === "_") return true;
  return false;
}

/** Reset-zoom and the shift+digit zoom presets stay blocked outside editors. */
function isGlobalPanZoomKey(event: KeyboardEvent): boolean {
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && key === "0") return true;
  if (
    event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.code === "Digit1" ||
      event.code === "Digit2" ||
      event.code === "Digit3" ||
      key === "1" ||
      key === "2" ||
      key === "3")
  ) {
    return true;
  }
  return false;
}

function isInteractiveKeyTarget(el: Element): boolean {
  return (
    el.closest("button, a, select, [role='button'], [role='menuitem']") !== null
  );
}

function isCanvasScopedKeyTarget(target: EventTarget | null): boolean {
  const el = eventElement(target);
  if (!el || isInteractiveKeyTarget(el)) return false;
  if (el === document.body) return true;
  if (el instanceof HTMLCanvasElement) return true;
  return el.closest(".excalidraw") instanceof Element;
}
