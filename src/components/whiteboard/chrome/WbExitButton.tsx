"use client";

import { WbIconEndSession } from "@/components/whiteboard/chrome/wb-icons";

export type WbExitButtonProps = {
  onExit: () => void;
};

/** Student live top-bar exit control — shared by narrow and non-narrow layouts. */
export function WbExitButton({ onExit }: WbExitButtonProps) {
  return (
    <button
      type="button"
      className="mynk-wb-tb-btn mynk-wb-tb-btn--exit"
      data-testid="wb-student-exit"
      aria-label="Exit"
      title="Exit"
      onClick={onExit}
    >
      <WbIconEndSession size={14} />
      <span className="mynk-wb-sr-only">Exit</span>
    </button>
  );
}
