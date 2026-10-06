"use client";

import { useFormStatus } from "react-dom";
import { joinScheduledSession } from "@/app/join/scheduled-actions";
import { Button } from "@/components/ui/button";

function JoinSubmit({
  scheduledSessionId,
  joinWindowOpen,
}: {
  scheduledSessionId: string;
  joinWindowOpen: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="sm"
      className="min-h-10 rounded-full whitespace-nowrap"
      disabled={!joinWindowOpen || pending}
      data-testid={`join-scheduled-session-${scheduledSessionId}`}
    >
      {pending ? "Joining…" : "Join"}
    </Button>
  );
}

export function JoinScheduledSessionButton({
  scheduledSessionId,
  joinWindowOpen,
}: {
  scheduledSessionId: string;
  joinWindowOpen: boolean;
}) {
  if (!joinWindowOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 rounded-full whitespace-nowrap"
        disabled
        data-testid={`join-scheduled-session-${scheduledSessionId}`}
      >
        Join
      </Button>
    );
  }

  const joinAction = joinScheduledSession.bind(null, scheduledSessionId);

  return (
    <form action={joinAction}>
      <JoinSubmit
        scheduledSessionId={scheduledSessionId}
        joinWindowOpen={joinWindowOpen}
      />
    </form>
  );
}
