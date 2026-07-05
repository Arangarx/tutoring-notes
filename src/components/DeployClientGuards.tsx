"use client";

import { useEffect } from "react";

import {
  attemptChunkRecoveryReload,
  clearChunkRecoveryFlag,
  isChunkLoadError,
} from "@/lib/deploy/chunk-load-error";

/**
 * Global deploy-freshness client guards (chunk recovery today; version poll in deliverable 2).
 */
export function DeployClientGuards() {
  useEffect(() => {
    clearChunkRecoveryFlag();

    const handleError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error ?? event.message)) {
        attemptChunkRecoveryReload();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        attemptChunkRecoveryReload();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
