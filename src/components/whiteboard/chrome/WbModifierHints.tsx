"use client";

import { useState } from "react";
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

/** Short prompts on the board, plus a fuller shortcut list. */
export function WbModifierHints({ activeTool }: { activeTool: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const shapeHint =
    activeTool === "rectangle"
      ? { keys: "Shift", label: "Square" }
      : activeTool === "ellipse"
        ? { keys: "Shift", label: "Circle" }
        : null;

  return (
    <div className="mynk-wb-modifier-hints" data-testid="wb-modifier-hints">
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
      <button
        type="button"
        className="mynk-wb-modifier-hints__help"
        data-testid="wb-shortcut-help"
        aria-expanded={helpOpen}
        aria-controls="wb-shortcut-help-panel"
        onClick={() => setHelpOpen((open) => !open)}
      >
        Shortcuts
      </button>
      {helpOpen ? (
        <div
          id="wb-shortcut-help-panel"
          className="mynk-wb-shortcut-help"
          role="dialog"
          aria-label="Keyboard and mouse shortcuts"
          data-testid="wb-shortcut-help-panel"
        >
          <ul className="mynk-wb-shortcut-help__list">
            {FULL_SHORTCUTS.map((row) => (
              <li key={`${row.keys}-${row.label}`}>
                <kbd className="mynk-wb-modifier-hints__keys">{row.keys}</kbd>
                {row.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
