import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { CalendarIntegrationsPanel } from "@/components/admin/schedule/CalendarIntegrationsPanel";
import { env } from "@/lib/env";
import {
  regenerateCalendarFeedToken,
} from "@/app/admin/settings/integrations/actions";
import {
  findActiveCalendarFeedTokenForAdmin,
  mintCalendarFeedToken,
} from "@/lib/calendar-feed-token";
import {
  buildCalendarPanelConnections,
  getGoogleCalendarConnectionForTutor,
} from "@/lib/calendar-oauth";
import { getRequestBaseUrl } from "@/lib/public-url";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

type IntegrationsSettingsPageProps = {
  searchParams: Promise<{ from?: string; connected?: string; error?: string }>;
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: IntegrationsSettingsPageProps) {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const adminUserId = scope.kind === "admin" ? scope.adminId : null;
  const googleConnection = await getGoogleCalendarConnectionForTutor(adminUserId);
  const connections = buildCalendarPanelConnections(
    googleConnection ? { email: googleConnection.email } : null
  );
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  let icsFeedHttpsUrl: string | null = null;
  let icsFeedWebcalUrl: string | null = null;
  if (adminUserId) {
    let feedRow = await findActiveCalendarFeedTokenForAdmin(adminUserId);
    if (!feedRow) {
      feedRow = await mintCalendarFeedToken(adminUserId);
    }
    const baseUrl = await getRequestBaseUrl();
    icsFeedHttpsUrl = `${baseUrl}/api/calendar/ics/${feedRow.token}`;
    icsFeedWebcalUrl = icsFeedHttpsUrl.replace(/^https:/i, "webcal:");
  }

  const { from, connected, error } = await searchParams;
  const fromSchedule = from === "schedule";
  const backHref = fromSchedule ? "/admin/schedule" : "/admin/settings";
  const backLabel = fromSchedule ? "← Schedule" : "← Settings";

  return (
    <PageShell realm="admin"
      title="Calendar integrations"
      description="Sync scheduled sessions to Google Calendar or subscribe to the ICS feed for Apple Calendar and other apps."
      eyebrow={
        <Link
          href={backHref}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {backLabel}
        </Link>
      }
    >
      <CalendarIntegrationsPanel
        connections={connections}
        googleOAuthAvailable={googleOAuthAvailable}
        connectError={error}
        connectSuccess={connected}
        googleReconnectRequired={googleConnection?.reconnectRequired ?? false}
        icsFeedHttpsUrl={icsFeedHttpsUrl}
        icsFeedWebcalUrl={icsFeedWebcalUrl}
        regenerateCalendarFeedAction={regenerateCalendarFeedToken}
        compact={false}
        showSettingsLink={false}
      />
    </PageShell>
  );
}
