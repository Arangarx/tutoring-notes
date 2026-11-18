import { Temporal } from "@js-temporal/polyfill";
import Link from "next/link";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OrganizationAppointmentRow } from "@/app/admin/schedule/actions";
import type { ScheduleStudentOption } from "@/lib/schedule/types";
import type { InstructorTaughtSession } from "@/lib/org-learner";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `YYYY-MM-DD h:mm–h:mm` from the schedule loader, shown as `Wed, Oct 28 · h:mm–h:mm`. */
function appointmentWhenLabel(whenLabel: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/.exec(whenLabel.trim());
  if (!match) return whenLabel;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(utc);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(utc);
  return `${weekday}, ${monthName} ${day} · ${match[4]}`;
}

export function organizationWeekLabel(timeZone: string, now = new Date()): string {
  const zoned = Temporal.Instant.fromEpochMilliseconds(now.getTime()).toZonedDateTimeISO(timeZone);
  const monday = zoned.toPlainDate().subtract({ days: zoned.dayOfWeek - 1 });
  return `Week of ${MONTHS[monday.month - 1]} ${monday.day}, ${monday.year} (${timeZone})`;
}

function appointmentIsPast(
  dateYmd: string,
  endHhmm: string,
  timeZone: string,
  now: Date
): boolean {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  const clock = /^(\d{2}):(\d{2})$/.exec(endHhmm);
  if (!date || !clock) return false;
  const end = Temporal.ZonedDateTime.from({
    timeZone,
    year: Number(date[1]),
    month: Number(date[2]),
    day: Number(date[3]),
    hour: Number(clock[1]),
    minute: Number(clock[2]),
    second: 0,
  });
  return (
    Temporal.Instant.compare(end.toInstant(), Temporal.Instant.fromEpochMilliseconds(now.getTime())) < 0
  );
}

export function OrgSchedulePanel({
  timeZone,
  canBook,
  viewerId,
  viewerIsInstructor,
  rows,
  students,
  instructors,
  taught,
}: {
  timeZone: string;
  canBook: boolean;
  viewerId: string;
  viewerIsInstructor: boolean;
  rows: OrganizationAppointmentRow[];
  students: ScheduleStudentOption[];
  instructors: Array<{ id: string; name: string }>;
  taught: Array<{ studentId: string; fullName: string; sessions: InstructorTaughtSession[] }>;
}) {
  const now = new Date();
  const upcoming = rows.filter(
    (row) => !appointmentIsPast(row.view.date, row.view.endTimeInput, timeZone, now)
  );
  const past = rows.filter((row) =>
    appointmentIsPast(row.view.date, row.view.endTimeInput, timeZone, now)
  );
  const renderRow = (row: (typeof rows)[number]) => (
    <li key={row.id}>
      <Card>
        <CardContent
          className="flex flex-wrap items-center justify-between gap-3 p-4"
          data-testid={`org-appointment-${row.id}`}
        >
          <div className="space-y-1 text-sm text-foreground">
            <p>{appointmentWhenLabel(row.whenLabel)}</p>
            {row.availability === "unavailable" ? <p>Unavailable</p> : null}
            <p>Instructor: {row.instructorName}</p>
            <p>Learner: {row.learnerName}</p>
            <p className="text-muted-foreground">{row.subject}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canBook ? (
              <CreateSessionDialog
                studentOptions={students}
                instructorOptions={instructors}
                googleConnected={false}
                timeZone={timeZone}
                session={row.view}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10"
                    data-testid={`org-appointment-edit-${row.id}`}
                  >
                    Change
                  </Button>
                }
              />
            ) : null}
            {viewerIsInstructor && row.instructorAdminUserId === viewerId ? (
              <OpenScheduledRoomButton
                scheduledSessionId={row.id}
                entry={row.entry}
                learnerName={row.learnerName}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </li>
  );

  return (
    <section aria-label="Appointments" className="mt-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg text-foreground">Appointments</h2>
          <p data-testid="org-schedule-week" className="text-sm text-muted-foreground">
            {organizationWeekLabel(timeZone)}
          </p>
        </div>
        {canBook ? (
          <CreateSessionDialog
            studentOptions={students}
            instructorOptions={instructors}
            googleConnected={false}
            timeZone={timeZone}
          />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {upcoming.map(renderRow)}
          {past.map(renderRow)}
        </ul>
      )}
      {viewerIsInstructor && taught.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg text-foreground">Sessions you taught</h2>
          <ul className="flex flex-col gap-2">
            {taught.map((block) =>
              block.sessions.map((session) => (
                <li key={session.sessionId}>
                  <Link
                    href={`/admin/students/${block.studentId}/whiteboard/${session.sessionId}/workspace`}
                    className="text-sm text-foreground underline"
                    data-testid={`org-taught-session-${session.sessionId}`}
                  >
                    {block.fullName}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
