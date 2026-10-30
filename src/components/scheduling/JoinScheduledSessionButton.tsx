"use client";

import { useActionState, useEffect, useState } from "react";
import {
  joinScheduledSessionFromForm,
  type JoinScheduledSessionError,
} from "@/app/join/scheduled-actions";
import { SessionEntryBlocked } from "@/components/scheduling/SessionEntryBlocked";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  isWithinJoinWindow,
  JOIN_WINDOW_OPENS_BEFORE_MS,
} from "@/lib/scheduling/join-window";
import {
  decisionReason,
  type EntryBlockReason,
  type FamilySessionEntryState,
} from "@/lib/scheduling/session-entry";

const SIGN_IN_TO_JOIN = "Sign in to join this session.";

function refusalCopy(
  error: JoinScheduledSessionError["error"],
  notYetCopy: string,
  unavailableCopy: string
): string {
  switch (error) {
    case "not_signed_in":
      return SIGN_IN_TO_JOIN;
    case "not_yet":
      return notYetCopy;
    case "not_available":
      return unavailableCopy;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

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

/**
 * Family "Join" for one appointment. Join is always an online entry, so it reads
 * `entry.online`. A blocked entry (consent, live sessions off) wins over the window
 * because it needs the family to act; otherwise outside the window the reason is `not_yet`.
 */
export function JoinScheduledSessionButton({
  scheduledSessionId,
  startAtIso,
  endAtIso,
  entry,
  learnerName,
  notYetCopy,
  unavailableCopy,
}: {
  scheduledSessionId: string;
  startAtIso: string;
  endAtIso: string;
  /** Family-branded entry only. A tutor `SessionEntryState` does not type-check. */
  entry: FamilySessionEntryState;
  learnerName: string;
  /** Family column of the one copy table, passed in so this client does not import the tutor lines. */
  notYetCopy: string;
  unavailableCopy: string;
}) {
  const joinWindowOpen = useJoinWindowOpen(startAtIso, endAtIso);
  const [state, formAction] = useActionState(joinScheduledSessionFromForm, null);

  const disabledReason: EntryBlockReason | null =
    decisionReason(entry.online) ?? (joinWindowOpen ? null : "not_yet");
  const reasonId = `join-scheduled-reason-${scheduledSessionId}`;

  if (disabledReason) {
    return (
      <div className="flex min-w-0 max-w-56 flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={JOIN_BUTTON_CLASS}
          disabled
          aria-describedby={reasonId}
          data-testid={`join-scheduled-session-${scheduledSessionId}`}
        >
          Join
        </Button>
        <SessionEntryBlocked
          size="line"
          id={reasonId}
          reason={disabledReason}
          audience="family"
          learnerName={learnerName}
          data-testid={reasonId}
        />
      </div>
    );
  }

  const refusal = state ? refusalCopy(state.error, notYetCopy, unavailableCopy) : null;

  return (
    <form action={formAction} className="flex min-w-0 max-w-56 flex-col items-start gap-1">
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
          className="text-xs text-muted-foreground"
          role="status"
          data-testid={`join-scheduled-refusal-${scheduledSessionId}`}
        >
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
