"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/lib/theme";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "System", Icon: Monitor },
];

/** Compact system / light / dark menu for the whiteboard top bar (TU-13). */
export function WbThemeToggle() {
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const active = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[2];
  const ActiveIcon = active.Icon;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
          setOpen((v) => !v);
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
          {OPTIONS.map(({ mode: optionMode, label, Icon }) => (
            <button
              key={optionMode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === optionMode}
              className={`mynk-wb-theme-item${mode === optionMode ? " mynk-wb-theme-item--active" : ""}`}
              onClick={() => {
                setMode(optionMode);
                setOpen(false);
              }}
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
