"use client";

import { useActionState, useEffect, useState } from "react";
import {
  joinScheduledSessionFromForm,
  type JoinScheduledSessionError,
} from "@/app/join/scheduled-actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  isWithinJoinWindow,
  JOIN_WINDOW_OPENS_BEFORE_MS,
} from "@/lib/scheduling/join-window";

const JOIN_REFUSAL_COPY: Record<JoinScheduledSessionError["error"], string> = {
  not_signed_in: "Sign in to join this session.",
  not_yet: "Join opens shortly before the scheduled start.",
  not_available: "This session is not available to join right now.",
};

const JOIN_BUTTON_CLASS = "min-h-10 rounded-full whitespace-nowrap";

/**
 * Re-check the join window while the dashboard stays open. A 30s tick covers
 * a long wait; a timeout at the exact open and close instants flips the
 * button without waiting for the next tick.
 */
function useJoinWindowOpen(startAtIso: string, endAtIso: string): boolean {
  const [open, setOpen] = useState(() =>
    isWithinJoinWindow(
      { startAt: new Date(startAtIso), endAt: new Date(endAtIso) },
      new Date()
    )
  );

  useEffect(() => {
    const startAt = new Date(startAtIso);
    const endAt = new Date(endAtIso);
    const tick = () => {
      setOpen(isWithinJoinWindow({ startAt, endAt }, new Date()));
    };
    tick();
    const interval = window.setInterval(tick, 30_000);
    const now = Date.now();
    const openAt = startAt.getTime() - JOIN_WINDOW_OPENS_BEFORE_MS;
    const closeAt = endAt.getTime();
    const openTimer =
      openAt > now ? window.setTimeout(tick, openAt - now) : undefined;
    const closeTimer =
      closeAt > now ? window.setTimeout(tick, closeAt - now) : undefined;
    return () => {
      window.clearInterval(interval);
      if (openTimer !== undefined) window.clearTimeout(openTimer);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
    };
  }, [startAtIso, endAtIso]);

  return open;
}

export function JoinScheduledSessionButton({
  scheduledSessionId,
  startAtIso,
  endAtIso,
}: {
  scheduledSessionId: string;
  startAtIso: string;
  endAtIso: string;
}) {
  const joinWindowOpen = useJoinWindowOpen(startAtIso, endAtIso);
  const [state, formAction] = useActionState(joinScheduledSessionFromForm, null);

  if (!joinWindowOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={JOIN_BUTTON_CLASS}
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
      <FormSubmitButton
        label="Join"
        pendingLabel="Joining…"
        variant="accent"
        size="sm"
        className={JOIN_BUTTON_CLASS}
        data-testid={`join-scheduled-session-${scheduledSessionId}`}
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
