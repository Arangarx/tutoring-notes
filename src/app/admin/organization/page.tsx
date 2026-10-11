import Link from "next/link";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { formatOrgRoleList } from "@/lib/org-role-label";
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
      <SectionCard realm="admin" title="Your organizations" contentClassName="p-0" data-testid="org-staff-index">
        <ul className="divide-y divide-border" role="list">
          {organizations.map((org) => (
            <li key={org.id} className="px-4 py-3">
              <Link
                href={`/admin/organization/${org.id}`}
                className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                data-testid={`org-staff-link-${org.id}`}
              >
                {org.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {org.status}. Your roles: {formatOrgRoleList(org.roles)}.
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </PageShell>
  );
}
