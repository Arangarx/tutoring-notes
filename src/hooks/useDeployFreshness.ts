"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import {
  isCaptureDeferred,
  subscribeCaptureDefer,
  triggerDeployReload,
} from "@/lib/deploy/capture-defer-registry";

const VERSION_TOAST =
  "A new version is ready — it'll apply automatically when your session ends.";

function getClientBuildSha(): string | null {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === "1") {
    const override = (window as Window & { __TN_PW_CLIENT_SHA__?: string }).__TN_PW_CLIENT_SHA__;
    if (override) {
      return override;
    }
  }

  const sha = process.env.NEXT_PUBLIC_BUILD_SHA;
  if (!sha || sha === "development") {
    return null;
  }
  return sha;
}

async function fetchRemoteSha(): Promise<string | null> {
  try {
    const res = await fetch("/api/version", { cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { sha?: unknown };
    return typeof data.sha === "string" ? data.sha : null;
  } catch {
    return null;
  }
}

/**
 * Event-driven deploy freshness: poll /api/version on tab focus and route
 * change; reload when remote SHA differs from the client-baked build SHA.
 * Defers reload while any capture surface holds the defer registry active.
 */
export function useDeployFreshness(): void {
  const pathname = usePathname();
  const pendingReloadRef = useRef(false);
  const toastShownRef = useRef(false);
  const deferUnsubRef = useRef<(() => void) | null>(null);
  const reloadCommittedRef = useRef(false);

  useEffect(() => {
    const clientSha = getClientBuildSha();
    if (!clientSha) {
      return;
    }

    let cancelled = false;
    reloadCommittedRef.current = false;

    function clearDeferSubscription(): void {
      deferUnsubRef.current?.();
      deferUnsubRef.current = null;
    }

    function commitReload(wasDeferred: boolean): void {
      if (reloadCommittedRef.current) {
        return;
      }
      reloadCommittedRef.current = true;
      pendingReloadRef.current = false;
      clearDeferSubscription();
      console.info(`[dfr] action=reload_commit source=poll deferred=${wasDeferred}`);
      triggerDeployReload();
    }

    function scheduleReloadWhenDeferClears(): void {
      if (deferUnsubRef.current) {
        return;
      }

      deferUnsubRef.current = subscribeCaptureDefer(() => {
        if (pendingReloadRef.current && !isCaptureDeferred()) {
          commitReload(true);
        }
      });
    }

    async function checkVersion(): Promise<void> {
      const remoteSha = await fetchRemoteSha();
      if (cancelled || !remoteSha || reloadCommittedRef.current) {
        return;
      }

      if (remoteSha === clientSha) {
        toastShownRef.current = false;
        pendingReloadRef.current = false;
        clearDeferSubscription();
        return;
      }

      if (!isCaptureDeferred()) {
        commitReload(false);
        return;
      }

      pendingReloadRef.current = true;

      if (!toastShownRef.current) {
        toastShownRef.current = true;
        toast(VERSION_TOAST);
      }

      scheduleReloadWhenDeferClears();
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    }

    void checkVersion();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearDeferSubscription();
    };
  }, [pathname]);
}
