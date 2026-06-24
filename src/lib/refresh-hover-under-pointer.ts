/**
 * Force the browser to re-evaluate `:hover` after a class change while the
 * pointer is stationary (mic/cam on/off toggles). Without this, stale hover
 * paint can stick until the user nudges the mouse.
 */
export function refreshHoverUnderPointer(element: HTMLElement | null): void {
  if (!element) return;
  requestAnimationFrame(() => {
    const prev = element.style.pointerEvents;
    element.style.pointerEvents = "none";
    requestAnimationFrame(() => {
      element.style.pointerEvents = prev;
    });
  });
}

/** Run a toggle handler, then refresh hover once React can repaint. */
export function afterToggleRefreshHover(
  element: HTMLElement,
  toggle: () => void | Promise<void>
): void {
  void Promise.resolve(toggle()).then(() => {
    refreshHoverUnderPointer(element);
  });
}
