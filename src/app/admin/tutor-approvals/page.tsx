import { requireOperator } from "@/lib/operator";
import { listWaitlistedTutors } from "@/lib/tutor-approval-scope";
import { PageShell } from "@/components/PageShell";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ApproveTutorButton } from "./ApproveTutorButton";

export const dynamic = "force-dynamic";

export default async function TutorApprovalsPage() {
  await requireOperator();
  const waitlisted = await listWaitlistedTutors();

  return (
    <PageShell realm="admin"
      title="Tutor approvals"
      description="Review and approve new tutor signups. WAITLISTED tutors cannot incur external cost until approved."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Dashboard</Link>
        </Button>
      }
    >
      <SectionCard realm="admin" title="Pending approval" contentClassName="p-0">
        {waitlisted.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No tutors awaiting approval.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {waitlisted.map((tutor) => (
              <li
                key={tutor.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">{tutor.email}</p>
                  {tutor.displayName ? (
                    <p className="text-sm text-muted-foreground">{tutor.displayName}</p>
                  ) : null}
                  <time
                    dateTime={tutor.createdAt.toISOString()}
                    className="text-xs font-mono text-muted-foreground"
                  >
                    Signed up {tutor.createdAt.toLocaleDateString()}
                  </time>
                </div>
                <ApproveTutorButton adminUserId={tutor.id} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageShell>
  );
}
