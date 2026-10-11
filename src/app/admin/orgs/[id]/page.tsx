import { notFound } from "next/navigation";

import { OrgActivationPanel } from "@/components/org/OrgActivationPanel";
import { PageShell } from "@/components/PageShell";
import { db } from "@/lib/db";
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";
import { requireOperator } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function OperatorOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const org = await db.organization.findUnique({
    where: { id },
    select: { id: true, name: true, status: true, dailyInviteCap: true, maxMembers: true },
  });
  if (!org) notFound();

  const members = await db.organizationMember.findMany({
    where: {
      organizationId: id,
      removedAt: null,
      adminUser: { approvalStatus: "WAITLISTED" },
    },
    select: {
      adminUser: {
        select: { id: true, email: true, displayName: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const error = query.error ? orgStaffErrorSentence(query.error) : null;

  return (
    <PageShell realm="admin" title={org.name} description="Operator controls for this organization.">
      <div className="flex flex-col gap-6">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <OrgActivationPanel
          organizationId={org.id}
          status={org.status}
          dailyInviteCap={org.dailyInviteCap}
          maxMembers={org.maxMembers}
          waitlisted={members.map((member) => member.adminUser)}
          returnTo={`/admin/orgs/${org.id}`}
        />
      </div>
    </PageShell>
  );
}
