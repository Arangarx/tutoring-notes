"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** sessionStorage key prefix for saved URL fragments (see JoinHashRestorer). */
export const JOIN_HASH_STORAGE_PREFIX = "mynk_join_hash_";

/**
 * Client component rendered when the student hits /join/[sessionId] without
 * a valid session (neither learner session nor account-holder self-learner session).
 *
 * A server redirect cannot preserve the #k= fragment (fragments are not sent
 * to the server per HTTP spec). This component:
 *   1. Saves window.location.hash to sessionStorage before navigating.
 *   2. Redirects to the correct login for this session's learner type:
 *      - isSelfLearner=true  → /account/login (email+password)  [WB-JOIN-ADULT-LEARNER]
 *      - isSelfLearner=false → /students/login (child PIN login)
 *
 * JoinHashRestorer restores the fragment after successful login.
 */
export function JoinAuthGate({
  sessionId,
  isSelfLearner,
}: {
  sessionId: string;
  isSelfLearner: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      sessionStorage.setItem(JOIN_HASH_STORAGE_PREFIX + sessionId, hash);
    }
    const loginPath = isSelfLearner
      ? `/account/login?returnTo=${encodeURIComponent("/join/" + sessionId)}`
      : `/students/login?returnTo=${encodeURIComponent("/join/" + sessionId)}`;
    router.replace(loginPath);
  }, [sessionId, isSelfLearner, router]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center">
      <div className="text-muted-foreground">Redirecting to sign-in…</div>
    </main>
  );
}
