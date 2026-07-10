"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useTheme } from "@/components/ThemeProvider";
import type { ThemeMode } from "@/lib/theme";

export const THEME_DROPDOWN_OPTIONS: {
  mode: ThemeMode;
  label: string;
  Icon: typeof Sun;
}[] = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "System", Icon: Monitor },
];

export function useThemeDropdown(controlled?: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { mode, setMode } = useTheme();
  const [localOpen, setLocalOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const controlledOpen = controlled?.open;
  const onOpenChange = controlled?.onOpenChange;

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : localOpen;

  const setOpen = useCallback(
    (v: boolean) => {
      if (!isControlled) setLocalOpen(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange]
  );

  const active =
    THEME_DROPDOWN_OPTIONS.find((o) => o.mode === mode) ?? THEME_DROPDOWN_OPTIONS[2];

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
  }, [open, setOpen]);

  const selectMode = useCallback(
    (optionMode: ThemeMode) => {
      setMode(optionMode);
      setOpen(false);
    },
    [setMode, setOpen]
  );

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  return {
    mode,
    open,
    setOpen,
    toggleOpen,
    menuId,
    rootRef,
    active,
    options: THEME_DROPDOWN_OPTIONS,
    selectMode,
  };
}
