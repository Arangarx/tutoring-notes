import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SchedulePageClient } from "@/components/admin/schedule/SchedulePageClient";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import {
  listScheduleStudentOptions,
  listScheduledSessionsForTutor,
} from "@/app/admin/schedule/actions";
import {
  buildCalendarPanelConnections,
  getGoogleCalendarConnectionForTutor,
} from "@/lib/calendar-oauth";
import { env } from "@/lib/env";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const adminUserId = scope.kind === "admin" ? scope.adminId : null;
  const googleConnection = await getGoogleCalendarConnectionForTutor(adminUserId);
  const calendarConnections = buildCalendarPanelConnections(
    googleConnection ? { email: googleConnection.email } : null
  );
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const googleConnected = !!googleConnection;
  const googleCalendarState = {
    connected: googleConnected,
    reconnectRequired: googleConnection?.reconnectRequired ?? false,
  };

  const [sessions, studentOptions] = await Promise.all([
    adminUserId ? listScheduledSessionsForTutor(googleCalendarState) : Promise.resolve([]),
    listScheduleStudentOptions(),
  ]);

  return (
    <PageShell realm="admin"
      title="Schedule"
      description="Plan tutoring sessions in Mynk. Connect Google Calendar to sync events, or subscribe to the ICS feed for Apple Calendar and other apps."
      actions={
        <CreateSessionDialog
          studentOptions={studentOptions}
          googleConnected={googleConnected}
        />
      }
    >
      <SchedulePageClient
        sessions={sessions}
        studentOptions={studentOptions}
        calendarConnections={calendarConnections}
        googleOAuthAvailable={googleOAuthAvailable}
        googleConnected={googleConnected}
        googleReconnectRequired={googleCalendarState.reconnectRequired}
      />
    </PageShell>
  );
}
