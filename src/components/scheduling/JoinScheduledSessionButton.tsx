"use client";

import { useState, useTransition } from "react";
import {
  joinScheduledSession,
  type JoinScheduledSessionError,
} from "@/app/join/scheduled-actions";
import { Button } from "@/components/ui/button";

const ERROR_COPY: Record<JoinScheduledSessionError["error"], string> = {
  not_signed_in: "Sign in to join this session.",
  not_yet: "Join opens shortly before the scheduled start.",
  not_available: "This session is not available to join right now.",
};

export function JoinScheduledSessionButton({
  scheduledSessionId,
  joinWindowOpen,
}: {
  scheduledSessionId: string;
  joinWindowOpen: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <Button
        type="button"
        variant="accent"
        size="sm"
        className="min-h-10 rounded-full whitespace-nowrap"
        disabled={pending}
        data-testid={`join-scheduled-session-${scheduledSessionId}`}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await joinScheduledSession(scheduledSessionId);
            if (result?.error) {
              setMessage(ERROR_COPY[result.error]);
            }
          });
        }}
      >
        {pending ? "Joining…" : "Join"}
      </Button>
      {message ? (
        <p className="text-xs text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
