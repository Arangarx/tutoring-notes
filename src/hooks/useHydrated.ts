"use client";

import { useEffect, useState } from "react";

/**
 * False in server HTML and until the first client effect.
 * Keep action buttons disabled across that gap: a click on the SSR
 * markup never reaches React's onClick.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
