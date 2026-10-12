"use client";

import { WbIconRecenter } from "@/components/whiteboard/chrome/wb-icons";

export type WbRecenterViewButtonProps = {
  onRecenter: () => void;
  /** Top-bar icon, or the overflow menu row on a narrow tutor layout. */
  variant?: "icon" | "menu";
};

/** Tutor-only control. Returns the tutor camera to the content center. */
export function WbRecenterViewButton({
  onRecenter,
  variant = "icon",
}: WbRecenterViewButtonProps) {
  if (variant === "menu") {
    return (
      <button
        type="button"
        className="mynk-wb-menu-item"
        data-testid="wb-recenter-view-menu"
        aria-label="Recenter view"
        title="Recenter view"
        onClick={(e) => {
          e.stopPropagation();
          onRecenter();
        }}
      >
        <span className="mynk-wb-menu-item__icon" aria-hidden>
          <WbIconRecenter size={14} />
        </span>
        <span>Recenter view</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
      data-testid="wb-recenter-view"
      aria-label="Recenter view"
      title="Recenter view"
      onClick={(e) => {
        e.stopPropagation();
        onRecenter();
      }}
    >
      <WbIconRecenter size={14} />
    </button>
  );
}
