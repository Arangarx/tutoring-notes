"use client";

import { useEffect } from "react";

/**
 * Client component that bridges old /w/[joinToken]#k=<key> links to the
 * authenticated /join/[sessionId]#k=<key> path.
 *
 * A server redirect() cannot preserve the #k= fragment (fragments are
 * never sent to the server per HTTP spec). This component reads
 * window.location.hash at mount time and appends it to the destination.
 */
export function JoinTokenRedirect({ sessionId }: { sessionId: string }) {
  useEffect(() => {
    const hash = window.location.hash || "";
    window.location.replace(`/join/${sessionId}${hash}`);
  }, [sessionId]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center">
      <div className="text-muted-foreground">Joining session…</div>
    </main>
  );
}
