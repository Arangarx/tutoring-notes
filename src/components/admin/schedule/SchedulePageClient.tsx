"use client";

import { useMemo, useState, type ComponentProps } from "react";
import Link from "next/link";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { CalendarIntegrationsPanel } from "@/components/admin/schedule/CalendarIntegrationsPanel";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { SessionSyncBadge } from "@/components/admin/schedule/SessionSyncBadge";
import {
  datesWithSessions,
  mockCalendarConnections,
  mockScheduledSessions,
  parseSessionDate,
  sessionsOnDate,
  type MockScheduledSession,
} from "@/lib/schedule/mock-data";
import { CalendarDaysIcon, ListIcon, PlayIcon, Settings2Icon } from "lucide-react";

function ScheduleDayButton({
  modifiers,
  children,
  ...props
}: ComponentProps<typeof CalendarDayButton>) {
  return (
    <CalendarDayButton modifiers={modifiers} {...props}>
      <span className="inline-flex flex-col items-center gap-0.5 leading-none">
        <span>{children}</span>
        {modifiers.hasSession ? (
          <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
        ) : null}
      </span>
    </CalendarDayButton>
  );
}

function DayDetailSessionItem({ session }: { session: MockScheduledSession }) {
  return (
    <li className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <StudentAvatar name={session.studentName} size="md" />
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{session.studentName}</p>
              <SessionSyncBadge state={session.syncState} />
            </div>
            <p className="text-sm text-muted-foreground">{session.subject}</p>
            <p className="text-sm text-foreground">
              <span className="whitespace-nowrap">
                {session.startTime}&ndash;{session.endTime}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {session.durationLabel}
              {session.location ? ` · ${session.location}` : ""}
            </p>
            {session.notes ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{session.notes}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
          <CreateSessionDialog
            defaultDate={session.date}
            trigger={
              <Button type="button" variant="outline" size="sm" className="min-h-9">
                Edit
              </Button>
            }
          />
          <Button type="button" variant="accent" size="sm" className="min-h-9" asChild>
            <Link href="/admin/students">
              <PlayIcon aria-hidden />
              Start session
            </Link>
          </Button>
        </div>
      </div>
    </li>
  );
}

function SessionRow({ session }: { session: MockScheduledSession }) {
  const sessionDate = parseSessionDate(session.date);
  const dateLabel = sessionDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <li className="flex flex-col gap-3 rounded-[10px] border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <StudentAvatar name={session.studentName} size="md" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{session.studentName}</p>
            <SessionSyncBadge state={session.syncState} />
          </div>
          <p className="text-sm text-muted-foreground">
            {session.subject} · {dateLabel} ·{" "}
            <span className="whitespace-nowrap">
              {session.startTime}&ndash;{session.endTime}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {session.durationLabel}
            {session.location ? ` · ${session.location}` : ""}
          </p>
          {session.notes ? (
            <p className="text-xs text-muted-foreground">{session.notes}</p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <CreateSessionDialog
          defaultDate={session.date}
          trigger={
            <Button type="button" variant="outline" size="sm" className="min-h-9">
              Edit
            </Button>
          }
        />
        <Button type="button" variant="accent" size="sm" className="min-h-9" asChild>
          <Link href="/admin/students">
            <PlayIcon aria-hidden />
            Start session
          </Link>
        </Button>
      </div>
    </li>
  );
}

function DaySessionsPanel({
  selectedDate,
  sessions,
}: {
  selectedDate: Date | undefined;
  sessions: MockScheduledSession[];
}) {
  if (!selectedDate) {
    return (
      <p className="text-sm text-muted-foreground">Select a day to see scheduled sessions.</p>
    );
  }

  const daySessions = sessionsOnDate(sessions, selectedDate);
  const label = selectedDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  if (daySessions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">No sessions on this day.</p>
        <CreateSessionDialog defaultDate={selectedDate.toISOString().slice(0, 10)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <ul className="space-y-4" role="list">
        {daySessions.map((s) => (
          <DayDetailSessionItem key={s.id} session={s} />
        ))}
      </ul>
    </div>
  );
}

export function SchedulePageClient() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    parseSessionDate("2026-06-11")
  );

  const sessionDates = useMemo(() => datesWithSessions(mockScheduledSessions), []);

  const upcomingSessions = useMemo(() => {
    return [...mockScheduledSessions].sort((a, b) => a.date.localeCompare(b.date));
  }, []);

  const modifiers = useMemo(
    () => ({
      hasSession: sessionDates,
    }),
    [sessionDates]
  );

  const modifiersClassNames = {
    hasSession: "",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Visual preview only</span> — placeholder
          data, no calendar OAuth or persistence. React to layout and affordances.
        </p>
        <Button asChild variant="outline" size="sm" className="min-h-9 shrink-0">
          <Link href="/admin/settings/integrations">
            <Settings2Icon aria-hidden />
            Calendar settings
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="month" className="gap-6">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="month" className="gap-1.5">
            <CalendarDaysIcon className="size-4" aria-hidden />
            Month
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5">
            <ListIcon className="size-4" aria-hidden />
            Agenda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="month" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
            <AdminSectionCard
              title="Calendar"
              description="Native Mynk scheduling — external calendars are optional."
              actions={
                <CreateSessionDialog
                  defaultDate={selectedDate?.toISOString().slice(0, 10)}
                />
              }
              contentClassName="flex justify-center pt-2"
            >
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                defaultMonth={selectedDate}
                modifiers={modifiers}
                modifiersClassNames={modifiersClassNames}
                components={{ DayButton: ScheduleDayButton }}
                className="rounded-[10px] border border-border bg-card p-2"
              />
            </AdminSectionCard>

            <AdminSectionCard title="Day detail" contentClassName="pt-2 min-w-0">
              <DaySessionsPanel selectedDate={selectedDate} sessions={mockScheduledSessions} />
            </AdminSectionCard>
          </div>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
          <AdminSectionCard
            title="Upcoming sessions"
            description="Soft duration is planning metadata — start and end recording remain tutor-controlled."
            actions={<CreateSessionDialog />}
          >
            <ul className="space-y-3" role="list">
              {upcomingSessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          </AdminSectionCard>
        </TabsContent>
      </Tabs>

      <CalendarIntegrationsPanel
        connections={mockCalendarConnections}
        compact
        showSettingsLink
      />
    </div>
  );
}
