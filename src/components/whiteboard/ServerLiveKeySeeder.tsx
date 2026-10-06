"use client";

import { useState, type ReactNode } from "react";
import { persistEncryptionKey } from "@/lib/whiteboard/encryption-key";

/**
 * Writes the server-held live key into `#k=` (and the tutor's per-session
 * localStorage shelf) before any child effect runs. The workspace's key
 * readers run in child effects, which fire before a parent's effects, so the
 * write happens in the first client render via a lazy state initializer.
 *
 * The server key overrides whatever the fragment held: every device on the
 * session then agrees on one key. `liveKey={null}` (legacy sessions) is a
 * pass-through.
 */
export function ServerLiveKeySeeder({
  sessionId,
  liveKey,
  children,
}: {
  sessionId: string;
  liveKey: string | null;
  children: ReactNode;
}) {
  useState(() => {
    if (liveKey && typeof window !== "undefined") {
      persistEncryptionKey(sessionId, liveKey, window);
    }
    return true;
  });
  return <>{children}</>;
}
