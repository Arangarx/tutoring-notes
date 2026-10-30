import Link from "next/link";
import { PlayIcon } from "lucide-react";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";
import { Button } from "@/components/ui/button";
import { ENTRY_UNAVAILABLE } from "@/lib/scheduling/session-entry";
import { cn } from "@/lib/utils";
import type { ScheduledSessionView, ScheduleStudentOption } from "@/lib/schedule/types";

/**
 * Row actions on the tutor Schedule.
 * Personal rows: Edit (the dialog also holds Delete) and a link to start from the student page.
 * Org rows are read-only here (staff change them on the organization page) and open the room directly.
 */
export function ScheduleSessionActions({
  session,
  studentOptions,
  googleConnected,
  onSaved,
  className,
}: {
  session: ScheduledSessionView;
  studentOptions: ScheduleStudentOption[];
  googleConnected: boolean;
  onSaved: () => void;
  className?: string;
}) {
  const isOrg = session.source.kind === "org";
  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}>
      {isOrg ? (
        <OpenScheduledRoomButton
          scheduledSessionId={session.id}
          // The list loader always sets `entry` on org rows; a missing one shows the
          // generic reason rather than a blank disabled button.
          entry={session.entry ?? ENTRY_UNAVAILABLE}
          learnerName={session.studentName}
        />
      ) : (
        <>
          <CreateSessionDialog
            studentOptions={studentOptions}
            googleConnected={googleConnected}
            session={session}
            defaultDate={session.date}
            onSaved={onSaved}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-9"
                data-testid="schedule-edit-session"
              >
                Edit
              </Button>
            }
          />
          <Button type="button" variant="accent" size="sm" className="min-h-9" asChild>
            <Link href={`/admin/students/${session.studentId}`} data-testid="schedule-start-session">
              <PlayIcon aria-hidden />
              Start session
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
