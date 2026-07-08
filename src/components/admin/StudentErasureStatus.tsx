"use client";

import { AlertTriangle } from "lucide-react";
import { ErasureGraceCountdown } from "@/components/admin/ErasureGraceCountdown";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { StudentErasureDisplayState } from "@/lib/erasure/student-erasure-display";
import { cn } from "@/lib/utils";

type StudentErasureStatusProps = {
  state: StudentErasureDisplayState;
  className?: string;
};

export function StudentErasurePendingBadge({
  state,
  className,
}: StudentErasureStatusProps) {
  if (state.kind === "none") return null;

  if (state.kind === "purged") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-muted-foreground/30 bg-muted/60 font-normal text-muted-foreground",
          className
        )}
        data-testid="student-erasure-badge"
      >
        Deleted
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-warning/30 bg-warning/10 font-normal text-warning",
        className
      )}
      data-testid="student-erasure-badge"
    >
      <AlertTriangle className="size-3" aria-hidden />
      Pending erasure
    </Badge>
  );
}

export function StudentErasurePendingBanner({ state }: StudentErasureStatusProps) {
  if (state.kind === "none") return null;

  if (state.kind === "purged") {
    return (
      <Alert
        className="border-muted-foreground/30"
        data-testid="student-erasure-banner"
      >
        <AlertTitle>This learner has been deleted</AlertTitle>
        <AlertDescription>
          <p>
            This student&apos;s personal data was permanently removed. Session
            billing metadata may still appear for your records.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      className="border-warning/40 bg-warning/5"
      data-testid="student-erasure-banner"
    >
      <AlertTriangle className="text-warning" aria-hidden />
      <AlertTitle>Pending erasure — access suspended</AlertTitle>
      <AlertDescription>
        <p>
          This learner&apos;s account is deactivated and login is disabled. You
          cannot start new sessions or view this student&apos;s content during
          the grace period.
        </p>
        {state.purgeEligibleAt ? (
          <p className="mt-2">
            Permanent deletion scheduled after{" "}
            <LocalDateTimeText dateTime={state.purgeEligibleAt} />
            {". "}
            <ErasureGraceCountdown
              purgeEligibleAt={state.purgeEligibleAt}
              className="text-warning"
            />
          </p>
        ) : null}
        <p className="mt-2 text-muted-foreground">
          To cancel erasure and restore access, contact your operator (Admin →
          Erasure).
        </p>
      </AlertDescription>
    </Alert>
  );
}
