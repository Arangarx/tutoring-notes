"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "wbdebug";

function readQueryFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("wbdebug") === "1";
  } catch {
    return false;
  }
}

function readStoredFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * True when `?wbdebug=1` is present or was set earlier this tab session.
 * Persists across client navigations/re-renders via sessionStorage.
 */
export function useWbDebugEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const fromQuery = readQueryFlag();
    if (fromQuery) {
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch {
        /* ignore */
      }
      setEnabled(true);
      return;
    }
    setEnabled(readStoredFlag());
  }, []);

  return enabled;
}
