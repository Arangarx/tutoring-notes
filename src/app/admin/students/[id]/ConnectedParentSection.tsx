"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { disconnectLearnerProfile } from "./actions";

export type ConnectedParent = {
  email: string;
  displayName: string | null;
  emailVerifiedAt: Date | null;
  claimedAt: Date | null;
};

/**
 * IAC-13 (a) + (b): Shows the connected AccountHolder identity and provides a
 * confirm-gated "Disconnect parent account" action.
 *
 * Rendered only when the student has a LearnerProfile (alreadyClaimed=true).
 * The disconnect action scopes its effect to THIS Student row only — the
 * shared LearnerProfile and all other tutors' Student rows are unaffected.
 */
export function ConnectedParentSection({
  studentId,
  learnerName,
  connectedParent,
}: {
  studentId: string;
  /** Parent-facing learner name (LearnerProfile.displayName), not the tutor's Student.name. */
  learnerName: string;
  connectedParent: ConnectedParent;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { email, displayName, emailVerifiedAt, claimedAt } = connectedParent;
  const displayIdentity = displayName ? `${displayName} (${email})` : email;
  const connectedSince = claimedAt
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(claimedAt))
    : null;

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectLearnerProfile(studentId);
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 space-y-1">
        <p className="text-sm font-medium truncate" title={email}>
          {displayIdentity}
        </p>
        {connectedSince ? (
          <p className="text-xs text-muted-foreground">Connected since {connectedSince}</p>
        ) : null}
        {!emailVerifiedAt ? (
          <p className="text-xs text-amber-600">Email not verified</p>
        ) : null}
      </div>

      {confirming ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-3">
          <p className="text-sm font-medium text-destructive">Disconnect parent account?</p>
          <p className="text-xs text-muted-foreground">
            This disconnects <strong>{displayIdentity}</strong> from learner{" "}
            <strong>{learnerName}</strong> on your account only. The parent keeps access through
            their other tutors and the learner stays signed in elsewhere. You can send a new claim
            invite afterward.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isPending}
            >
              {isPending ? "Disconnecting…" : "Yes, disconnect"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:border-destructive/60"
          onClick={() => setConfirming(true)}
        >
          Disconnect parent account
        </Button>
      )}
    </div>
  );
}
