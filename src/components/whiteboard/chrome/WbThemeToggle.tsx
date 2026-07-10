"use client";

import { useThemeDropdown } from "@/hooks/useThemeDropdown";

/** Compact system / light / dark menu for the whiteboard top bar (TU-13). */
export function WbThemeToggle({
  open: controlledOpen,
  onOpenChange,
}: {
  /** When provided, the component operates in controlled mode — opening/closing
   *  is driven by the parent (wired into the single-open `openMenu` state). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const { mode, open, setOpen, menuId, rootRef, active, options, selectMode } =
    useThemeDropdown({ open: controlledOpen, onOpenChange });

  const ActiveIcon = active.Icon;

  return (
    <div ref={rootRef} className="mynk-wb-theme-menu">
      <button
        type="button"
        className="mynk-wb-tb-btn mynk-wb-tb-btn--icon"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={`Theme: ${active.label}`}
        data-testid="wb-theme-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <ActiveIcon size={14} aria-hidden />
        <span className="sr-only">Theme: {active.label}. Change theme</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="mynk-wb-theme-dropdown"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map(({ mode: optionMode, label, Icon }) => (
            <button
              key={optionMode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === optionMode}
              className={`mynk-wb-theme-item${mode === optionMode ? " mynk-wb-theme-item--active" : ""}`}
              onClick={() => selectMode(optionMode)}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
