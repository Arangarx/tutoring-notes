"use client";

import { openScheduledWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/ui/form-submit-button";

const OPEN_ROOM_CLASS = "min-h-10 rounded-full whitespace-nowrap";

export function OpenScheduledRoomButton({
  scheduledSessionId,
  liveEntryAllowed,
}: {
  scheduledSessionId: string;
  liveEntryAllowed: boolean;
}) {
  if (!liveEntryAllowed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={OPEN_ROOM_CLASS}
        disabled
        data-testid={`open-scheduled-room-${scheduledSessionId}`}
      >
        Open room
      </Button>
    );
  }

  const openRoom = openScheduledWhiteboardSession.bind(null, scheduledSessionId);
  return (
    <form action={openRoom}>
      <FormSubmitButton
        label="Open room"
        pendingLabel="Opening…"
        variant="accent"
        size="sm"
        className={OPEN_ROOM_CLASS}
        data-testid={`open-scheduled-room-${scheduledSessionId}`}
      />
    </form>
  );
}
