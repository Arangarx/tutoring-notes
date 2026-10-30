import { notFound } from "next/navigation";

import { LinkRow, LinkRowList } from "@/components/LinkRow";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { formatOrganizationListMeta } from "@/lib/org-role-label";
import { listStaffHomeOrganizations } from "@/lib/org-scope";

export const dynamic = "force-dynamic";

export default async function StaffOrganizationsPage() {
  const organizations = await listStaffHomeOrganizations();
  if (organizations.length === 0) notFound();

  return (
    <PageShell
      realm="admin"
      title="Organization"
      description="Members, invitations, and activation for organizations you run."
    >
      <SectionCard realm="admin" title="Your organizations" data-testid="org-staff-index">
        <LinkRowList>
          {organizations.map((org) => (
            <li key={org.id}>
              <LinkRow
                href={`/admin/organization/${org.id}`}
                title={org.name}
                meta={formatOrganizationListMeta(org.status, org.roles)}
                testId={`org-staff-link-${org.id}`}
              />
            </li>
          ))}
        </LinkRowList>
      </SectionCard>
    </PageShell>
  );
}
