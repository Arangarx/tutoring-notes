import { OrgBadge } from "@/components/org/OrgBadge";
import { SessionSyncBadge } from "@/components/admin/schedule/SessionSyncBadge";
import type { ScheduledSessionView } from "@/lib/schedule/types";

/**
 * Learner name with the organization badge (org rows) and the calendar sync badge.
 * Below 375px the badge sits on its own line at content width and wraps when
 * the organization name is longer than the row. That stacked layout passes a
 * moderate radius (`rounded-xl`) so a two-line label is not clipped by the pill.
 * At 375px and up the badge stays on the name line and keeps the Badge pill.
 * The name truncates, with a title tooltip, only on that shared line. The sync
 * badge wraps once the line is full.
 */
export function ScheduleSessionTitle({ session }: { session: ScheduledSessionView }) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <div className="flex w-full min-w-0 max-w-full flex-col gap-1 min-[375px]:w-auto min-[375px]:flex-row min-[375px]:items-center min-[375px]:gap-2">
        <p
          className="max-w-full min-w-0 whitespace-normal text-sm font-semibold text-foreground min-[375px]:truncate"
          data-testid="schedule-session-name"
          title={session.studentName}
        >
          {session.studentName}
        </p>
        {session.source.kind === "org" ? (
          <OrgBadge
            organizationName={session.source.organizationName}
            className="max-w-full self-start max-[374px]:rounded-xl min-[375px]:self-center"
          />
        ) : null}
      </div>
      {session.showSyncBadge ? <SessionSyncBadge state={session.syncState} /> : null}
    </div>
  );
}
