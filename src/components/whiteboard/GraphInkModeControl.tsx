"use client";

import type { SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";

export type GraphInkMode = "pan" | "point" | "draw";

const MODES: { id: GraphInkMode; label: string }[] = [
  { id: "pan", label: "Pan" },
  { id: "point", label: "Point" },
  { id: "draw", label: "Draw" },
];

/**
 * Pan / Point / Draw for a graph embed. Composes the shared Button.
 * Pan is the default. Point and Draw are selected with aria-pressed.
 */
export function GraphInkModeControl({
  mode,
  onMode,
  onPointerDown,
}: {
  mode: GraphInkMode;
  onMode: (mode: GraphInkMode) => void;
  onPointerDown?: (event: SyntheticEvent) => void;
}) {
  return (
    <div
      className="wb-graph-ink-modes"
      role="group"
      aria-label="Graph tool"
      data-testid="wb-graph-ink-modes"
    >
      {MODES.map((item) => (
        <Button
          key={item.id}
          type="button"
          size="sm"
          variant={mode === item.id ? "secondary" : "outline"}
          aria-pressed={mode === item.id}
          data-testid={`wb-graph-mode-${item.id}`}
          onPointerDown={onPointerDown}
          onMouseDown={onPointerDown}
          onClick={() => onMode(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
