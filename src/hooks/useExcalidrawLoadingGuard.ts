"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  EXCALIDRAW_BG_DARK_HEX,
  EXCALIDRAW_BG_LIGHT_HEX,
  EXCALIDRAW_STROKE_HEX,
} from "@/styles/token-values";

/** B2 — stable ref; never inline on ExcalidrawDynamic (remount wipes live strokes). */
export const STUDENT_EXCALIDRAW_INITIAL_DATA = {
  elements: [] as const,
  appState: {
    isLoading: false,
    viewBackgroundColor: EXCALIDRAW_BG_LIGHT_HEX,
    currentItemRoughness: 0,
    currentItemRoundness: "sharp" as const,
    currentItemStrokeWidth: 0.5,
    currentItemStrokeColor: EXCALIDRAW_STROKE_HEX,
    gridModeEnabled: false,
    scrollToContent: false,
  },
  scrollToContent: false,
};

const LOADING_WATCHDOG_MS = 5000;

type WjgLogger = (
  action: string,
  extra?: Record<string, string | number>
) => void;

type WbChromeApiExt = ExcalidrawApiLike & {
  getAppState?: () => { isLoading?: boolean };
  updateScene?: (data: {
    appState?: Record<string, unknown>;
  }) => void;
};

export function useExcalidrawLoadingGuard({
  excalidrawAPI,
  wjgLog,
}: {
  excalidrawAPI: ExcalidrawApiLike | null;
  wjgLog: WjgLogger;
}) {
  const [stuckLoading, setStuckLoading] = useState(false);
  const [dismissedStuck, setDismissedStuck] = useState(false);
  const clearedRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markLoadingCleared = useCallback(
    (source: "initial" | "watchdog" | "remote_scene") => {
      const api = excalidrawAPI as WbChromeApiExt | null;
      const forceSpinnerOff = () => {
        api?.updateScene?.({ appState: { isLoading: false } });
        setStuckLoading(false);
      };

      if (clearedRef.current) {
        forceSpinnerOff();
        return;
      }
      clearedRef.current = true;
      wjgLog("loading_cleared", { source });
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      forceSpinnerOff();
    },
    [excalidrawAPI, wjgLog]
  );

  useEffect(() => {
    if (!excalidrawAPI) return;
    wjgLog("excalidraw_api_ready");

    const api = excalidrawAPI as WbChromeApiExt;

    // Sync/scene may have cleared loading before the API ref landed — still
    // dismiss Excalidraw's isLoading spinner (Andrew 2026-06-24 phone smoke).
    if (clearedRef.current) {
      api.updateScene?.({ appState: { isLoading: false } });
      setStuckLoading(false);
      return;
    }

    const appState = api.getAppState?.() as { isLoading?: boolean } | undefined;
    const isLoading = appState?.isLoading;
    if (isLoading === false) {
      markLoadingCleared("initial");
      return;
    }

    watchdogRef.current = setTimeout(() => {
      if (clearedRef.current) return;
      const stillAppState = api.getAppState?.() as { isLoading?: boolean } | undefined;
      const stillLoading = stillAppState?.isLoading;
      if (stillLoading !== true) {
        markLoadingCleared("watchdog");
        return;
      }
      api.updateScene?.({ appState: { isLoading: false } });
      setStuckLoading(true);
      wjgLog("loading_stuck", { ageMs: LOADING_WATCHDOG_MS });
    }, LOADING_WATCHDOG_MS);

    return () => {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
    };
  }, [excalidrawAPI, markLoadingCleared, wjgLog]);

  const reloadFromGuard = useCallback(() => {
    wjgLog("student_reload", { reason: "loading_guard" });
    window.location.reload();
  }, [wjgLog]);

  const showLoadingGuardBanner = stuckLoading && !dismissedStuck;

  return {
    initialData: STUDENT_EXCALIDRAW_INITIAL_DATA,
    stuckLoading,
    showLoadingGuardBanner,
    dismissStuckLoading: () => setDismissedStuck(true),
    reloadFromGuard,
    markLoadingCleared,
  };
}

/** Resolve board background for initialData when theme changes (does not mutate const). */
export function excalidrawBoardBgHex(theme: "light" | "dark"): string {
  return theme === "dark" ? EXCALIDRAW_BG_DARK_HEX : EXCALIDRAW_BG_LIGHT_HEX;
}
