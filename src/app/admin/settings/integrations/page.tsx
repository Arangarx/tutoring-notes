import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { CalendarIntegrationsPanel } from "@/components/admin/schedule/CalendarIntegrationsPanel";
import { mockCalendarConnections } from "@/lib/schedule/mock-data";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

type IntegrationsSettingsPageProps = {
  searchParams: Promise<{ from?: string }>;
};

export default async function IntegrationsSettingsPage({
  searchParams,
}: IntegrationsSettingsPageProps) {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const { from } = await searchParams;
  const fromSchedule = from === "schedule";
  const backHref = fromSchedule ? "/admin/schedule" : "/admin/settings";
  const backLabel = fromSchedule ? "← Schedule" : "← Settings";

  return (
    <AdminPageShell
      title="Calendar integrations"
      description="Connect external calendars so sessions you schedule in Mynk also appear on Apple Calendar or Google Calendar. This page is visual-only tonight — no OAuth wiring."
      eyebrow={
        <Link
          href={backHref}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {backLabel}
        </Link>
      }
    >
      <div className="rounded-[10px] border border-warning/30 bg-warning/10 px-4 py-3">
        <p className="text-sm text-warning">
          Visual preview — Connect and Disconnect buttons do not call OAuth or persist state.
        </p>
      </div>

      <CalendarIntegrationsPanel connections={mockCalendarConnections} compact={false} showSettingsLink={false} />
    </AdminPageShell>
  );
}
