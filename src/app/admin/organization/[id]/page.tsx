import { OrgLearnerPanel } from "@/components/org/OrgLearnerPanel";
import { OrgStaffHome } from "@/components/org/OrgStaffHome";
import { PageShell } from "@/components/PageShell";
import { listSchedulerLearners, loadOrgLearnerRecords } from "@/lib/org-learner";
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";
import { loadOrgStaffHome } from "@/lib/org-scope";
import { isOperatorEmail } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function StaffOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const data = await loadOrgStaffHome(id);
  const error = query.error ? orgStaffErrorSentence(query.error) : null;
  const canManage =
    data.actor.roles.includes("owner") || data.actor.roles.includes("admin");
  const isScheduler = data.actor.roles.includes("scheduler");
  const records = canManage ? await loadOrgLearnerRecords(id) : [];
  const schedulerCards =
    !canManage && isScheduler ? await listSchedulerLearners(id) : [];

  return (
    <PageShell
      realm="admin"
      title={data.org.name}
      description="Members, invitations, and learners."
    >
      <OrgStaffHome
        data={data}
        canActivate={isOperatorEmail(data.actor.email)}
        error={error}
      />
      {canManage || isScheduler ? (
        <OrgLearnerPanel
          organizationId={id}
          canManage={canManage}
          records={records}
          schedulerCards={schedulerCards}
        />
      ) : null}
    </PageShell>
  );
}
