"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  joinScheduledSessionFromForm,
  type JoinScheduledSessionError,
} from "@/app/join/scheduled-actions";
import { Button } from "@/components/ui/button";

const JOIN_REFUSAL_COPY: Record<JoinScheduledSessionError["error"], string> = {
  not_signed_in: "Sign in to join this session.",
  not_yet: "Join opens shortly before the scheduled start.",
  not_available: "This session is not available to join right now.",
};

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
  const [state, formAction] = useActionState(joinScheduledSessionFromForm, null);

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

  const refusal = state ? JOIN_REFUSAL_COPY[state.error] : null;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="scheduledSessionId" value={scheduledSessionId} />
      <JoinSubmit
        scheduledSessionId={scheduledSessionId}
        joinWindowOpen={joinWindowOpen}
      />
      {refusal ? (
        <p
          className="max-w-56 text-right text-xs text-muted-foreground"
          role="status"
          data-testid={`join-scheduled-refusal-${scheduledSessionId}`}
        >
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
