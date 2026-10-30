"use client";

import { openScheduledWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { SessionEntryBlocked } from "@/components/scheduling/SessionEntryBlocked";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import {
  ENTRY_CONTROL_LABEL,
  tutorControlState,
  type SessionEntryState,
} from "@/lib/scheduling/session-entry";

const OPEN_ROOM_CLASS = "min-h-10 rounded-full whitespace-nowrap";

/**
 * Tutor / instructor "Open room" for one appointment.
 * Disabled only when neither mode can be entered; the reason is the line under it.
 * With online sessions off the room still opens (in person) and the line says so.
 * The server re-checks the same rule (`openScheduledWhiteboardSession` -> bridge).
 */
export function OpenScheduledRoomButton({
  scheduledSessionId,
  entry,
  learnerName,
}: {
  scheduledSessionId: string;
  entry: SessionEntryState;
  learnerName: string;
}) {
  const { disabledReason, onlineOnlyReason } = tutorControlState(entry);
  const reason = disabledReason ?? onlineOnlyReason;
  const reasonId = `open-scheduled-room-reason-${scheduledSessionId}`;
  const line = reason ? (
    <SessionEntryBlocked
      size="line"
      id={reasonId}
      reason={reason}
      audience="tutor"
      learnerName={learnerName}
      inPersonStillOpen={disabledReason == null}
      data-testid={reasonId}
    />
  ) : null;

  if (disabledReason) {
    return (
      <div className="flex min-w-0 max-w-64 flex-col items-start gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={OPEN_ROOM_CLASS}
          disabled
          aria-describedby={reasonId}
          data-testid={`open-scheduled-room-${scheduledSessionId}`}
        >
          {ENTRY_CONTROL_LABEL.openRoom}
        </Button>
        {line}
      </div>
    );
  }

  const openRoom = openScheduledWhiteboardSession.bind(null, scheduledSessionId);
  return (
    <form action={openRoom} className="flex min-w-0 max-w-64 flex-col items-start gap-1">
      <FormSubmitButton
        label={ENTRY_CONTROL_LABEL.openRoom}
        pendingLabel="Opening…"
        variant="accent"
        size="sm"
        className={OPEN_ROOM_CLASS}
        aria-describedby={line ? reasonId : undefined}
        data-testid={`open-scheduled-room-${scheduledSessionId}`}
      />
      {line}
    </form>
  );
}
