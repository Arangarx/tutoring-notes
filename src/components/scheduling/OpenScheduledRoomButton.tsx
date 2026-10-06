"use client";

import { useFormStatus } from "react-dom";
import { openScheduledWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { Button } from "@/components/ui/button";

function OpenRoomSubmit({
  scheduledSessionId,
}: {
  scheduledSessionId: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="sm"
      className="min-h-10 rounded-full whitespace-nowrap"
      disabled={pending}
      data-testid={`open-scheduled-room-${scheduledSessionId}`}
    >
      {pending ? "Opening…" : "Open room"}
    </Button>
  );
}

export function OpenScheduledRoomButton({
  scheduledSessionId,
}: {
  scheduledSessionId: string;
}) {
  const openRoom = openScheduledWhiteboardSession.bind(null, scheduledSessionId);
  return (
    <form action={openRoom}>
      <OpenRoomSubmit scheduledSessionId={scheduledSessionId} />
    </form>
  );
}
