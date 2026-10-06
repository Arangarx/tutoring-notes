"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";

/** sessionStorage key prefix for saved URL fragments (see JoinHashRestorer). */
export const JOIN_HASH_STORAGE_PREFIX = "mynk_join_hash_";

/**
 * Client component rendered when the student hits /join/[sessionId] without
 * a valid session (neither learner session nor account-holder self-learner session).
 *
 * Saves the URL fragment before navigation (HTTP strips `#k=` on server redirects).
 * Child sessions offer both child PIN login and parent account login.
 */
export function JoinAuthGate({
  sessionId,
  isSelfLearner,
}: {
  sessionId: string;
  isSelfLearner: boolean;
}) {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      sessionStorage.setItem(JOIN_HASH_STORAGE_PREFIX + sessionId, hash);
    }
  }, [sessionId]);

  const returnTo = encodeURIComponent("/join/" + sessionId);
  const childLoginHref = `/students/login?returnTo=${returnTo}`;
  const parentLoginHref = `/account/login?returnTo=${returnTo}`;

  if (isSelfLearner) {
    return (
      <PageShell realm="student">
        <div
          className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-8"
          data-testid="join-auth-gate"
        >
          <Card className="w-full rounded-[10px] border-border">
            <CardContent className="space-y-4 px-6 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Sign in to join this tutoring session.
              </p>
              <Button asChild variant="accent" className="w-full min-h-11 rounded-full">
                <Link href={parentLoginHref} data-testid="join-auth-gate-self-sign-in">
                  Sign in
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell realm="student">
      <div
        className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-8"
        data-testid="join-auth-gate"
      >
        <Card className="w-full rounded-[10px] border-border">
          <CardContent className="space-y-4 px-6 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to join this tutoring session.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="accent" className="w-full min-h-11 rounded-full">
                <Link href={childLoginHref} data-testid="join-auth-gate-child-sign-in">
                  Child sign in
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full min-h-11 rounded-full">
                <Link href={parentLoginHref} data-testid="join-auth-gate-parent-sign-in">
                  Parent sign in
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
