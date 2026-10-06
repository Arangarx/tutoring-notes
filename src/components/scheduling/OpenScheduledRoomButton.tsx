"use client";

import { useTransition } from "react";
import { openScheduledWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { Button } from "@/components/ui/button";

export function OpenScheduledRoomButton({
  scheduledSessionId,
}: {
  scheduledSessionId: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="accent"
      size="sm"
      className="min-h-10 rounded-full whitespace-nowrap"
      disabled={pending}
      data-testid={`open-scheduled-room-${scheduledSessionId}`}
      onClick={() => {
        startTransition(async () => {
          await openScheduledWhiteboardSession(scheduledSessionId);
        });
      }}
    >
      {pending ? "Opening…" : "Open room"}
    </Button>
  );
}
