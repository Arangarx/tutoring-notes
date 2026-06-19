"use client";

import type { ReactNode } from "react";

export type WbToolBtnProps = {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  pulldown?: boolean;
  /** If provided, the pulldown chevron gets its own click handler (split-button). */
  onPulldown?: () => void;
  accent?: boolean;
  collapseControl?: boolean;
};

/** Shared whiteboard tool-strip button — tutor + student chrome. */
export function WbToolBtn({
  icon,
  label,
  active,
  onClick,
  disabled,
  pulldown,
  onPulldown,
  accent,
  collapseControl,
}: WbToolBtnProps) {
  return (
    <button
      type="button"
      className={`mynk-wb-tool-btn${active ? " mynk-wb-tool-btn--active" : ""}${accent ? " mynk-wb-tool-btn--accent" : ""}${collapseControl ? " mynk-wb-strip__collapse-btn" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      style={accent ? { color: "var(--accent-text)" } : undefined}
    >
      {icon}
      {pulldown && (
        <span
          className="mynk-wb-pulldown-chevron"
          onClick={
            onPulldown
              ? (e) => {
                  e.stopPropagation();
                  onPulldown();
                }
              : undefined
          }
          aria-label={onPulldown ? "Open shape picker" : undefined}
        >
          ▾
        </span>
      )}
    </button>
  );
}
