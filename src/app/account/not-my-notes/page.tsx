/**
 * Neutral denial page for share-link access by a logged-in user who does not
 * own the linked student.
 *
 * Reachable only via a redirect from assertCanAccessShareLink after it has
 * confirmed: (a) the share token is valid and not revoked, and (b) the
 * authenticated session belongs to a different account.  Not reachable
 * anonymously (anonymous users are redirected to login, not here).
 *
 * This replaces the previous notFound() call for the non-owner case, which
 * produced a generic 404 that gave no actionable guidance.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Notes not linked to your account",
  robots: { index: false, follow: false },
};

export default function NotMyNotesPage() {
  return (
    <AuthShell
      title="Notes not linked to your account"
      description="This notes link isn&apos;t associated with your account."
    >
      <p className="mb-6 text-sm text-muted-foreground">
        If you think this is a mistake, ask the tutor to resend the link to
        your registered email address, or check that you&apos;re signed in with
        the correct account.
      </p>

      <Button asChild variant="accent" className="min-h-11 w-full text-base">
        <Link href="/account/dashboard">Go to your dashboard</Link>
      </Button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link
          href="/account/login"
          className="text-brand underline-offset-2 hover:underline"
        >
          Sign in with a different account
        </Link>
      </p>
    </AuthShell>
  );
}
