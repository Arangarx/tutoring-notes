import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Shown when a child has no username and PIN yet.
 * A parent can already join that child's live session from this account
 * inside the appointment window. The child's own login is only for the
 * child signing in on their device.
 */
export function ParentJoinGapCallout({
  setupLoginHref,
}: {
  /** Optional deep-link to set up this child's login (child detail page). */
  setupLoginHref?: string;
}) {
  return (
    <Alert
      data-testid="parent-join-gap-callout"
      className="border-border border-l-[3px] border-l-accent bg-accent-soft/40"
    >
      <AlertTitle className="text-foreground">
        You can join live sessions for your child
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        <p>
          From Upcoming sessions, Join opens the whiteboard for your child
          when the appointment window is open. You do not need their PIN for
          that.
        </p>
        <p className="mt-2">
          {setupLoginHref ? (
            <>
              If they will join on their own device,{" "}
              <Link
                href={setupLoginHref}
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                set up this child&apos;s login
              </Link>{" "}
              and have them sign in on the{" "}
              <Link
                href="/students/login"
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                student login page
              </Link>
              . You can still view their notes from this account.
            </>
          ) : (
            <>
              If they will join on their own device, open <strong>Manage</strong>{" "}
              on a learner and set up their username and PIN, then have them
              sign in on the{" "}
              <Link
                href="/students/login"
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                student login page
              </Link>
              . You can still view their notes from this account.
            </>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
}
