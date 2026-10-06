"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/PageShell";

/** sessionStorage key prefix for saved URL fragments (see JoinHashRestorer). */
export const JOIN_HASH_STORAGE_PREFIX = "mynk_join_hash_";

type SignInLink = {
  href: string;
  testId: string;
  label: string;
  variant: "accent" | "outline";
};

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

  const links: SignInLink[] = isSelfLearner
    ? [
        {
          href: parentLoginHref,
          testId: "join-auth-gate-self-sign-in",
          label: "Sign in",
          variant: "accent",
        },
      ]
    : [
        {
          href: childLoginHref,
          testId: "join-auth-gate-child-sign-in",
          label: "Child sign in",
          variant: "accent",
        },
        {
          href: parentLoginHref,
          testId: "join-auth-gate-parent-sign-in",
          label: "Parent sign in",
          variant: "outline",
        },
      ];

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
            <div className={links.length > 1 ? "flex flex-col gap-2" : undefined}>
              {links.map((link) => (
                <Button
                  key={link.testId}
                  asChild
                  variant={link.variant}
                  className="w-full min-h-11 rounded-full"
                >
                  <Link href={link.href} data-testid={link.testId}>
                    {link.label}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
