"use client";

import type { ReactNode } from "react";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * One critical-step card. The sentence is passed in. A setup card passes
 * ClaimInviteSection as children, under the sentence.
 */
export function StudentCriticalCard({
  text,
  purgeEligibleAt = null,
  children,
}: {
  text: string;
  purgeEligibleAt?: string | null;
  children?: ReactNode;
}) {
  return (
    <Alert data-testid="student-critical-card" className="border-warning/40">
      <AlertDescription>
        <p>{text}</p>
        {purgeEligibleAt ? (
          <p>
            <LocalDateTimeText dateTime={purgeEligibleAt} />
          </p>
        ) : null}
        {children ? <div className="mt-3 w-full">{children}</div> : null}
      </AlertDescription>
    </Alert>
  );
}
