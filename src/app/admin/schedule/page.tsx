import { redirect } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { SchedulePageClient } from "@/components/admin/schedule/SchedulePageClient";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  return (
    <PageShell realm="admin"
      title="Schedule"
      description="Plan tutoring sessions in Mynk. Connect Apple or Google Calendar to mirror events outward — scheduling works fully in-app either way."
      actions={<CreateSessionDialog />}
    >
      <SchedulePageClient />
    </PageShell>
  );
}
