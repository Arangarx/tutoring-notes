import { assertAdminOrNotFound } from "@/lib/impersonation";
import { listErasureJobsForAdmin } from "@/lib/erasure/list-erasure-jobs";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ErasureAdminClient } from "./ErasureAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminErasurePage() {
  await assertAdminOrNotFound();

  const jobs = await listErasureJobsForAdmin();

  return (
    <AdminPageShell
      title="Data erasure"
      description="Operator-only learner and family right-to-erasure. Tombstone is immediate; content purge runs after a 7-day grace window."
    >
      <ErasureAdminClient initialJobs={jobs} />
    </AdminPageShell>
  );
}
