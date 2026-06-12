import { redirect } from "next/navigation";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { SchedulePageClient } from "@/components/admin/schedule/SchedulePageClient";
import { CreateSessionDialog } from "@/components/admin/schedule/CreateSessionDialog";
import { getStudentScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  return (
    <AdminPageShell
      title="Schedule"
      description="Plan tutoring sessions in Mynk. Connect Apple or Google Calendar to mirror events outward — scheduling works fully in-app either way."
      actions={<CreateSessionDialog />}
    >
      <SchedulePageClient />
    </AdminPageShell>
  );
}
