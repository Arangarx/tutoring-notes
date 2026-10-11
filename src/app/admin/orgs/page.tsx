import Link from "next/link";

import { createOrganizationByOwnerEmailAction } from "@/app/admin/orgs/actions";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";
import { requireOperator } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function OperatorOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireOperator();
  const params = await searchParams;
  const error = params.error ? orgStaffErrorSentence(params.error) : null;
  const organizations = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, status: true },
  });

  return (
    <PageShell
      realm="admin"
      title="Organizations"
      description="Create an organization for a teacher who already has a verified account."
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="org-create-error">
            {error}
          </p>
        ) : null}
        <SectionCard realm="admin" title="New organization" data-testid="org-create-form">
          <form action={createOrganizationByOwnerEmailAction} className="flex max-w-md flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input id="org-name" name="name" type="text" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-owner-email">Owner email</Label>
              <Input
                id="org-owner-email"
                name="ownerEmail"
                type="email"
                required
                autoComplete="off"
                data-testid="org-owner-email"
              />
            </div>
            <Button type="submit">Create organization</Button>
          </form>
        </SectionCard>
        <SectionCard realm="admin" title="Existing organizations" contentClassName="p-0">
          {organizations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No organizations yet.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {organizations.map((org) => (
                <li key={org.id} className="px-4 py-3">
                  <Link
                    href={`/admin/orgs/${org.id}`}
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {org.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">{org.status}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </PageShell>
  );
}
