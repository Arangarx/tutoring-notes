import { OrgBadge } from "@/components/org/OrgBadge";
import { SessionSyncBadge } from "@/components/admin/schedule/SessionSyncBadge";
import type { ScheduledSessionView } from "@/lib/schedule/types";

/** Learner name with the organization badge (org rows) and the calendar sync badge. */
export function ScheduleSessionTitle({ session }: { session: ScheduledSessionView }) {
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-2">
      <p
        className="min-w-0 max-w-full shrink-0 truncate text-sm font-semibold text-foreground"
        data-testid="schedule-session-name"
      >
        {session.studentName}
      </p>
      {session.source.kind === "org" ? (
        <OrgBadge organizationName={session.source.organizationName} />
      ) : null}
      {session.showSyncBadge ? <SessionSyncBadge state={session.syncState} /> : null}
    </div>
  );
}
