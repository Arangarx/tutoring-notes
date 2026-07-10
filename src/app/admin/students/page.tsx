import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { StudentsRoster } from "@/components/admin/StudentsRoster";
import { deriveStudentErasureDisplayState } from "@/lib/erasure/student-erasure-display";
import { lookupActiveErasurePurgeDates } from "@/lib/erasure/lookup-active-erasure-purge-dates";
import { getStudentScope, studentsWhereForScope } from "@/lib/student-scope";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const students = await db.student.findMany({
    where: studentsWhereForScope(scope),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      erasedAt: true,
      learnerProfile: {
        select: {
          id: true,
          tombstonedAt: true,
          accountHolder: {
            select: { id: true, tombstonedAt: true },
          },
        },
      },
    },
  });

  const learnerProfileIds = students
    .map((s) => s.learnerProfile?.id)
    .filter((id): id is string => !!id);
  const accountHolderIds = students
    .map((s) => s.learnerProfile?.accountHolder?.id)
    .filter((id): id is string => !!id);

  const purgeDates = await lookupActiveErasurePurgeDates(
    learnerProfileIds,
    accountHolderIds
  );

  return (
    <AdminPageShell
      title="Students"
      eyebrow={
        <p className="label-mono m-0 text-accent-text">Your roster</p>
      }
      description="Add students, open profiles, and start whiteboard sessions."
    >
      <StudentsRoster
        students={students.map((s) => {
          const lp = s.learnerProfile;
          const lpId = lp?.id ?? null;
          const ahId = lp?.accountHolder?.id ?? null;
          const activeJobPurgeEligibleAt =
            (lpId && purgeDates.byLearnerProfileId.get(lpId)) ??
            (ahId && purgeDates.byAccountHolderId.get(ahId)) ??
            null;

          return {
            id: s.id,
            name: s.name,
            createdAt: s.createdAt.toISOString(),
            erasureState: deriveStudentErasureDisplayState({
              erasedAt: s.erasedAt,
              lpTombstonedAt: lp?.tombstonedAt ?? null,
              ahTombstonedAt: lp?.accountHolder?.tombstonedAt ?? null,
              activeJobPurgeEligibleAt,
            }),
          };
        })}
      />
    </AdminPageShell>
  );
}
