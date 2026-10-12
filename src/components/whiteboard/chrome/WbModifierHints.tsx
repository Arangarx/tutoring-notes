"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import "./WbModifierHints.css";

const FULL_SHORTCUTS = [
  { keys: "Wheel", label: "Zoom" },
  { keys: "Ctrl or Cmd + wheel", label: "Pan up and down" },
  { keys: "Space", label: "Pan (hold)" },
  { keys: "Shift", label: "Square, while the rectangle tool is selected" },
  { keys: "Shift", label: "Circle, while the ellipse tool is selected" },
  { keys: "Ctrl or Cmd + Z", label: "Undo" },
  { keys: "Ctrl or Cmd + Shift + Z", label: "Redo" },
  { keys: "Ctrl + Y", label: "Redo (Windows)" },
  { keys: "Delete or Backspace", label: "Delete the selection" },
  { keys: "V", label: "Select" },
  { keys: "P", label: "Pencil" },
  { keys: "E", label: "Eraser" },
  { keys: "T", label: "Text" },
  { keys: "H", label: "Hand" },
  { keys: "R", label: "Rectangle" },
  { keys: "O", label: "Ellipse" },
  { keys: "D", label: "Diamond" },
  { keys: "L", label: "Line" },
  { keys: "A", label: "Arrow" },
  { keys: "Ctrl or Cmd + D", label: "Duplicate" },
  { keys: "Ctrl or Cmd + [", label: "Send backward" },
  { keys: "Ctrl or Cmd + Shift + [", label: "Send to back (Option on Mac)" },
  { keys: "Ctrl or Cmd + ]", label: "Bring forward" },
  { keys: "Ctrl or Cmd + Shift + ]", label: "Bring to front (Option on Mac)" },
  { keys: "Arrow keys", label: "Nudge the selection" },
  { keys: "Enter", label: "Edit text on the selection" },
  { keys: "Escape", label: "Finish a line or arrow" },
] as const;

/** A few pixels of air between the hints and whatever covers the board bottom. */
const HINT_GAP_PX = 6;

function shownTop(el: Element | null): number | null {
  if (!(el instanceof HTMLElement)) return null;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  const rect = el.getBoundingClientRect();
  if (rect.height < 1 || rect.width < 1) return null;
  if (rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
  return rect.top;
}

/**
 * Resting top of the open styles sheet. The sheet slides up with a transform,
 * so the animated box is ignored in favor of where it will sit.
 */
function openSheetTop(sheet: HTMLElement): number | null {
  const style = getComputedStyle(sheet);
  if (style.display === "none" || style.visibility === "hidden") return null;
  if (sheet.offsetHeight < 1) return null;
  const rect = sheet.getBoundingClientRect();
  let translateY = 0;
  if (style.transform && style.transform !== "none") {
    translateY = new DOMMatrix(style.transform).m42;
  }
  return rect.top - translateY;
}

/** Top edge of the styles sheet when it is open, otherwise the bottom toolbar or page strip. */
function coverTopPx(): number {
  const sheet = document.querySelector("[data-testid='wb-props-sheet']");
  if (
    sheet instanceof HTMLElement &&
    sheet.classList.contains("mynk-wb-action-sheet--open")
  ) {
    const top = openSheetTop(sheet);
    if (top !== null) return top;
  }
  const toolbarTop = shownTop(document.querySelector("[data-testid='wb-bottom-toolbar']"));
  if (toolbarTop !== null) return toolbarTop;
  const stripTop = shownTop(document.querySelector(".mynk-wb-pagestrip"));
  if (stripTop !== null) return stripTop;
  return window.innerHeight;
}

function placeHints(root: HTMLElement) {
  root.style.left = "";
  root.style.bottom = "";
  const rect = root.getBoundingClientRect();
  if (rect.height < 1) return;
  const coverTop = coverTopPx();
  let desiredBottom = coverTop - HINT_GAP_PX;
  let nextLeft: string | null = null;
  const canvas = document.querySelector(
    "[data-testid='student-whiteboard-canvas-mount'], [data-testid='tutor-whiteboard-canvas-mount'], [data-testid='wb-replay-canvas-mount']"
  );
  if (canvas instanceof HTMLElement) {
    const board = canvas.getBoundingClientRect();
    if (board.height > 1) {
      const visibleBottom = Math.min(board.bottom, coverTop);
      desiredBottom = Math.min(desiredBottom, visibleBottom - HINT_GAP_PX);
      const minEdge = board.top + rect.height;
      if (desiredBottom < minEdge) desiredBottom = minEdge;
      if (rect.left < board.left) {
        nextLeft = `${board.left + 4}px`;
      } else if (rect.right > board.right) {
        nextLeft = `${Math.max(board.left + 4, board.right - rect.width - 4)}px`;
      }
    }
  }
  if (nextLeft !== null) root.style.left = nextLeft;
  const delta = rect.bottom - desiredBottom;
  if (Math.abs(delta) < 0.5) return;
  const base = Number.parseFloat(getComputedStyle(root).bottom);
  const cssBottom = Number.isFinite(base) ? base : 0;
  root.style.bottom = `${cssBottom + delta}px`;
}

function keepSpaceForPan(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
  }
}

/** Short prompts on the board, plus a fuller shortcut list. */
export function WbModifierHints({ activeTool }: { activeTool: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shapeHint =
    activeTool === "rectangle"
      ? { keys: "Shift", label: "Square" }
      : activeTool === "ellipse"
        ? { keys: "Shift", label: "Circle" }
        : null;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    let later = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        placeHints(root);
        requestAnimationFrame(() => placeHints(root));
      });
    };
    const afterMotion = () => {
      schedule();
      window.clearTimeout(later);
      later = window.setTimeout(schedule, 320);
    };
    placeHints(root);
    schedule();

    const ro =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const chrome = root.closest(".mynk-wb-chrome");
    const watchResize = () => {
      if (!ro) return;
      for (const el of [
        document.querySelector("[data-testid='wb-bottom-toolbar']"),
        document.querySelector("[data-testid='wb-props-sheet']"),
        document.querySelector(".mynk-wb-pagestrip"),
        document.querySelector("[data-testid='student-whiteboard-canvas-mount']"),
        document.querySelector("[data-testid='tutor-whiteboard-canvas-mount']"),
      ]) {
        if (el instanceof Element) ro.observe(el);
      }
    };
    watchResize();

    const pieceAttrs = {
      attributes: true,
      attributeFilter: ["class", "style"],
    };
    const mo = new MutationObserver(() => {
      watchResize();
      observePieces();
      afterMotion();
    });
    const observePieces = () => {
      mo.disconnect();
      const toolbar = document.querySelector("[data-testid='wb-bottom-toolbar']");
      const sheet = document.querySelector("[data-testid='wb-props-sheet']");
      if (toolbar instanceof Element) mo.observe(toolbar, pieceAttrs);
      if (sheet instanceof Element) mo.observe(sheet, pieceAttrs);
      if (chrome instanceof Element) {
        mo.observe(chrome, {
          attributes: true,
          attributeFilter: ["data-layout"],
        });
      }
    };
    observePieces();
    const onTransitionEnd = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.dataset.testid === "wb-props-sheet"
      ) {
        schedule();
      }
    };
    chrome?.addEventListener("transitionend", onTransitionEnd);
    window.addEventListener("resize", schedule);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      chrome?.removeEventListener("transitionend", onTransitionEnd);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="mynk-wb-modifier-hints"
      data-testid="wb-modifier-hints"
    >
      {shapeHint ? (
        <span className="mynk-wb-modifier-hints__item" data-testid="wb-hint-shift">
          <kbd className="mynk-wb-modifier-hints__keys">{shapeHint.keys}</kbd>
          {shapeHint.label}
        </span>
      ) : null}
      <span className="mynk-wb-modifier-hints__item" data-testid="wb-hint-space">
        <kbd className="mynk-wb-modifier-hints__keys">Space</kbd>
        Pan
      </span>
      <Popover open={helpOpen} onOpenChange={setHelpOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mynk-wb-modifier-hints__help"
            data-testid="wb-shortcut-help"
            aria-controls="wb-shortcut-help-panel"
            onKeyDown={keepSpaceForPan}
            onKeyUp={keepSpaceForPan}
          >
            Shortcuts
          </button>
        </PopoverTrigger>
        <PopoverContent
          id="wb-shortcut-help-panel"
          className="mynk-wb-shortcut-help w-auto p-0"
          role="dialog"
          aria-label="Keyboard and mouse shortcuts"
          data-testid="wb-shortcut-help-panel"
          side="top"
          align="start"
          sideOffset={6}
        >
          <ul className="mynk-wb-shortcut-help__list">
            {FULL_SHORTCUTS.map((row) => (
              <li key={`${row.keys}-${row.label}`}>
                <kbd className="mynk-wb-modifier-hints__keys">{row.keys}</kbd>
                {row.label}
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
