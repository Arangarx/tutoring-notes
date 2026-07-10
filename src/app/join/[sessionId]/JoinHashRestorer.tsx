"use client";

import { useEffect } from "react";
import { JOIN_HASH_STORAGE_PREFIX } from "./JoinAuthGate";

/**
 * Restores the URL fragment (#k=...) from sessionStorage when the student
 * returns to /join/[sessionId] after logging in.
 *
 * The encryption key lives in the URL fragment. Fragments are not sent to
 * the server (HTTP spec), so when the student is redirected to /students/login
 * and back, the fragment is lost. JoinAuthGate saves it; this component
 * restores it so the student client's readStudentKeyFromHash() succeeds.
 *
 * Runs on the authenticated render path only. Restores before children mount
 * so the whiteboard key-read effect sees the fragment.
 */
export function JoinHashRestorer({
  sessionId,
  children,
}: {
  sessionId: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const currentHash = window.location.hash;
    // Only restore if the hash is missing or empty (post-login redirect cleared it)
    if (!currentHash || currentHash.length <= 1) {
      const stored = sessionStorage.getItem(JOIN_HASH_STORAGE_PREFIX + sessionId);
      if (stored) {
        // Restore without triggering a navigation; location.hash setter is synchronous.
        window.location.hash = stored.startsWith("#") ? stored.slice(1) : stored;
        sessionStorage.removeItem(JOIN_HASH_STORAGE_PREFIX + sessionId);
      }
    }
  }, [sessionId]);

  return <>{children}</>;
}
