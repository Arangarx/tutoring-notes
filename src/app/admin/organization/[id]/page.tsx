import { OrgStaffHome } from "@/components/org/OrgStaffHome";
import { PageShell } from "@/components/PageShell";
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

  return (
    <PageShell
      realm="admin"
      title={data.org.name}
      description="Members and invitations. Learners and the schedule are not on this page."
    >
      <OrgStaffHome
        data={data}
        canActivate={isOperatorEmail(data.actor.email)}
        error={error}
      />
    </PageShell>
  );
}
