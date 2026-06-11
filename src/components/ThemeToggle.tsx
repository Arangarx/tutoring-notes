"use client";

import { useThemeDropdown } from "@/hooks/useThemeDropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, open, toggleOpen, menuId, rootRef, active, options, selectMode } =
    useThemeDropdown();
  const ActiveIcon = active.Icon;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggleOpen}
        title={`Theme: ${active.label}`}
      >
        <ActiveIcon className="size-5" aria-hidden />
        <span className="sr-only">Theme: {active.label}. Change theme</span>
      </Button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="absolute right-0 top-full z-[60] mt-1 min-w-[9.5rem] rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {options.map(({ mode: optionMode, label, Icon }) => (
            <button
              key={optionMode}
              type="button"
              role="menuitemradio"
              aria-checked={mode === optionMode}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm text-popover-foreground",
                "hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                mode === optionMode && "bg-accent-soft text-foreground"
              )}
              onClick={() => selectMode(optionMode)}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
