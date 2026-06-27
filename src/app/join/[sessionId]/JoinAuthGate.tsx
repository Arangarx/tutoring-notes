"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** sessionStorage key prefix for saved URL fragments (see JoinHashRestorer). */
export const JOIN_HASH_STORAGE_PREFIX = "mynk_join_hash_";

/**
 * Client component rendered when the student hits /join/[sessionId] without
 * a learner session.
 *
 * A server redirect cannot preserve the #k= fragment (fragments are not sent
 * to the server per HTTP spec). This component:
 *   1. Saves window.location.hash to sessionStorage before navigating.
 *   2. Redirects to /students/login?returnTo=/join/<sessionId>.
 *
 * JoinHashRestorer restores the fragment after successful login.
 */
export function JoinAuthGate({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      sessionStorage.setItem(JOIN_HASH_STORAGE_PREFIX + sessionId, hash);
    }
    router.replace(
      "/students/login?returnTo=" + encodeURIComponent("/join/" + sessionId)
    );
  }, [sessionId, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center">
      <div className="text-muted-foreground">Redirecting to sign-in…</div>
    </main>
  );
}
