"use client";

import "./WbModifierHints.css";

const HINTS = [
  { keys: "Shift", label: "Square or circle" },
  { keys: "Space", label: "Pan" },
] as const;

/** Small control hints, bottom-right, like a game's button prompts. */
export function WbModifierHints() {
  return (
    <div className="mynk-wb-modifier-hints" data-testid="wb-modifier-hints" aria-hidden="true">
      {HINTS.map((hint) => (
        <span key={hint.keys} className="mynk-wb-modifier-hints__item">
          <kbd className="mynk-wb-modifier-hints__keys">{hint.keys}</kbd>
          {hint.label}
        </span>
      ))}
    </div>
  );
}
