import { OrgBadge } from "@/components/org/OrgBadge";
import { SessionSyncBadge } from "@/components/admin/schedule/SessionSyncBadge";
import type { ScheduledSessionView } from "@/lib/schedule/types";

/**
 * Learner name with the organization badge (org rows) and the calendar sync badge.
 * The badge shrinks first, down to a 40px floor; the name truncates only after that.
 * The sync badge wraps onto the next line once the name and badge fill the row.
 */
export function ScheduleSessionTitle({ session }: { session: ScheduledSessionView }) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <p
          className="min-w-0 shrink truncate text-sm font-semibold text-foreground"
          data-testid="schedule-session-name"
        >
          {session.studentName}
        </p>
        {session.source.kind === "org" ? (
          <OrgBadge
            organizationName={session.source.organizationName}
            className="min-w-[40px] shrink-[1000]"
          />
        ) : null}
      </div>
      {session.showSyncBadge ? <SessionSyncBadge state={session.syncState} /> : null}
    </div>
  );
}
