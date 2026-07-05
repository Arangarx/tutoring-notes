"use client";

import { useEffect } from "react";

import {
  attemptChunkRecoveryReload,
  clearChunkRecoveryFlag,
  clearDeferredChunkRecovery,
  isChunkLoadError,
} from "@/lib/deploy/chunk-load-error";
import { useDeployFreshness } from "@/hooks/useDeployFreshness";

/**
 * Global deploy-freshness client guards (chunk recovery + version poll).
 */
export function DeployClientGuards() {
  useDeployFreshness();
  useEffect(() => {
    clearDeferredChunkRecovery();
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
