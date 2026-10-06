"use client";

import { openScheduledWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { FormSubmitButton } from "@/components/ui/form-submit-button";

export function OpenScheduledRoomButton({
  scheduledSessionId,
}: {
  scheduledSessionId: string;
}) {
  const openRoom = openScheduledWhiteboardSession.bind(null, scheduledSessionId);
  return (
    <form action={openRoom}>
      <FormSubmitButton
        label="Open room"
        pendingLabel="Opening…"
        variant="accent"
        size="sm"
        className="min-h-10 rounded-full whitespace-nowrap"
        data-testid={`open-scheduled-room-${scheduledSessionId}`}
      />
    </form>
  );
}
