"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { persistEncryptionKey } from "@/lib/whiteboard/encryption-key";

/**
 * Writes the server-held live key into `#k=` before any key reader runs.
 * The readers (tutor `useEncryptionKeyInHash`, student hash read) are
 * passive effects; every layout effect in a commit runs before any passive
 * effect, so a layout effect here is always first.
 *
 * The server key overrides whatever the fragment held: every device on the
 * session then agrees on one key. `liveKey={null}` (legacy sessions) is a
 * pass-through. Learner devices get the hash only — no localStorage shelf.
 */
export function ServerLiveKeySeeder({
  sessionId,
  liveKey,
  role,
  children,
}: {
  sessionId: string;
  liveKey: string | null;
  role: "tutor" | "learner";
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (!liveKey) return;
    persistEncryptionKey(sessionId, liveKey, window, {
      storage: role === "tutor",
    });
  }, [sessionId, liveKey, role]);
  return <>{children}</>;
}
