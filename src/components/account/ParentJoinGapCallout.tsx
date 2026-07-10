import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Interim honesty: parent AH session cannot join /join as a non-self-learner
 * child (parent_session_select / learner picker is fast-follow, not built).
 * Shown on parent dashboard + child detail when a child has no own login.
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
        Live sessions need the child&apos;s own login (for now)
      </AlertTitle>
      <AlertDescription className="text-muted-foreground">
        <p>
          Learners without their own username + PIN can&apos;t join a live
          whiteboard session yet — and signing in as the parent doesn&apos;t
          open the session as that child. A &quot;pick which learner&quot; step
          is coming soon.
        </p>
        <p className="mt-2">
          {setupLoginHref ? (
            <>
              Until then,{" "}
              <Link
                href={setupLoginHref}
                className="font-medium text-accent-text underline-offset-2 hover:underline"
              >
                set up this child&apos;s login
              </Link>{" "}
              so they can sign in on the{" "}
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
              Until then, open <strong>Manage</strong> on a learner and set up
              their own login, then have them sign in on the{" "}
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
