"use client";

import { useEffect, useState } from "react";

function readDebugQueryFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("debug") === "1" || params.get("wbdebug") === "1";
  } catch {
    return false;
  }
}

/** Session debug overlay (footer HUD) — local dev or explicit ?debug=1 / ?wbdebug=1 only. */
export function useWbChromeDebugOverlayVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readDebugQueryFlag()) {
      setVisible(true);
      return;
    }
    setVisible(process.env.NODE_ENV === "development");
  }, []);

  return visible;
}
