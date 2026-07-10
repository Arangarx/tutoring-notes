/**
 * Synthetic Ctrl/Cmd-Z dispatch for an explicit visible Undo / Redo
 * button in our whiteboard toolbar.
 *
 * Sarah's pilot ask (Apr 24, 2026): she wanted an undo button visible
 * on the whiteboard. Excalidraw 0.18 ships the default footer with
 * undo/redo, BUT (a) those icons are small / easy to miss for new
 * users, (b) on touch-only devices they're tap-only and the affordance
 * isn't obvious, and (c) Sarah explicitly asked for a visible toolbar
 * button. The simpler product fix is to add a button in OUR toolbar
 * and route it to Excalidraw's keyboard handler.
 *
 * Why not use the imperative API:
 *
 *   `ExcalidrawImperativeAPI.history` only exposes `clear()` —
 *   there's no public `undo()` / `redo()` method (verified against
 *   `@excalidraw/excalidraw@0.18.1` types). Excalidraw's keyboard
 *   handler is the only public surface that triggers undo/redo, so
 *   we synthesize the keydown event the handler is listening for.
 *
 * Why dispatch on the Excalidraw container (not window):
 *
 *   Excalidraw attaches its keyboard listener to its own canvas
 *   wrapper (`<div class="excalidraw">…`). Dispatching on `window`
 *   would still bubble into Next.js' own listeners (e.g., it would
 *   trigger a router undo if one ever existed) and would NOT bubble
 *   DOWN into the Excalidraw subtree. We resolve the container at
 *   click time so we don't need to thread refs through three
 *   components.
 *
 * Cross-platform: we set BOTH `ctrlKey` and `metaKey` so the same
 * synthetic event matches Excalidraw's check on Windows / Linux
 * (`event.ctrlKey`) AND on macOS (`event.metaKey`). The `code` field
 * matches what Excalidraw's `KeyboardCode` import uses.
 */

export type UndoRedoTrigger = (
  doc?: Document
) => { ok: true } | { ok: false; reason: string };

const EXCALIDRAW_CONTAINER_SELECTOR = ".excalidraw, .excalidraw-container";

function findExcalidrawTarget(doc: Document): HTMLElement | null {
  // Most reliable: the canvas wrapper element. We don't want the
  // outer page or a sidebar — those wouldn't route to Excalidraw's
  // keyboard handler.
  const el = doc.querySelector<HTMLElement>(EXCALIDRAW_CONTAINER_SELECTOR);
  return el ?? null;
}

function dispatchShortcut(
  doc: Document,
  spec: { key: string; code: string; shiftKey: boolean }
): { ok: true } | { ok: false; reason: string } {
  const target = findExcalidrawTarget(doc);
  if (!target) {
    return { ok: false, reason: "excalidraw-container-not-found" };
  }
  // When clicking a toolbar button (undo/redo), focus moves to the button
  // and away from the Excalidraw canvas. Excalidraw 0.18 checks whether
  // the focused element is within its component before processing keyboard
  // shortcuts, so we must transfer focus back to the canvas before
  // dispatching the synthetic event. tabIndex=-1 makes it programmatically
  // focusable without inserting it into the tab order.
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
  // We dispatch on the container itself; Excalidraw's listener is on
  // window in some versions and on the wrapper in others. Bubbling
  // up from the wrapper covers both.
  const event = new KeyboardEvent("keydown", {
    key: spec.key,
    code: spec.code,
    ctrlKey: true,
    metaKey: true,
    shiftKey: spec.shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return { ok: true };
}

/** Trigger Excalidraw's undo via Ctrl/Cmd+Z. */
export const triggerUndo: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "z", code: "KeyZ", shiftKey: false });

/** Trigger Excalidraw's redo via Ctrl/Cmd+Shift+Z (works on both platforms). */
export const triggerRedo: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "z", code: "KeyZ", shiftKey: true });

/** Trigger send-to-back via Ctrl/Cmd+Shift+[. */
export const triggerSendToBack: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "[", code: "BracketLeft", shiftKey: true });

/** Trigger send-backward via Ctrl/Cmd+[. */
export const triggerSendBackward: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "[", code: "BracketLeft", shiftKey: false });

/** Trigger bring-forward via Ctrl/Cmd+]. */
export const triggerBringForward: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "]", code: "BracketRight", shiftKey: false });

/** Trigger bring-to-front via Ctrl/Cmd+Shift+]. */
export const triggerBringToFront: UndoRedoTrigger = (doc = document) =>
  dispatchShortcut(doc, { key: "]", code: "BracketRight", shiftKey: true });

/**
 * Finalize an in-progress multipoint line/arrow (same as Enter/Escape).
 * Excalidraw has no public finalize API — synthetic key on the canvas wrapper.
 */
export const triggerFinalize = (
  doc = document
): { ok: true } | { ok: false; reason: string } => {
  const target = findExcalidrawTarget(doc);
  if (!target) {
    return { ok: false, reason: "excalidraw-container-not-found" };
  }
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll: true });
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    })
  );
  return { ok: true };
};

/** Trigger delete selected via Delete key. */
export const triggerDeleteSelected = (doc = document): { ok: true } | { ok: false; reason: string } => {
  const target = findExcalidrawTarget(doc);
  if (!target) return { ok: false, reason: "excalidraw-container-not-found" };
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Delete", code: "Delete", bubbles: true, cancelable: true })
  );
  return { ok: true };
};
