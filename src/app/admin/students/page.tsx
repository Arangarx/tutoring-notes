import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PageShell } from "@/components/PageShell";
import { StudentsRoster } from "@/components/admin/StudentsRoster";
import { deriveStudentErasureDisplayState } from "@/lib/erasure/student-erasure-display";
import { lookupActiveErasurePurgeDates } from "@/lib/erasure/lookup-active-erasure-purge-dates";
import { getStudentScope, studentsWhereForScope } from "@/lib/student-scope";
import { isOrgOwnedStudent, tutorAppointmentsWhere } from "@/lib/scheduling/tutor-appointments";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const rosterSelect = {
    id: true,
    name: true,
    parentEmail: true,
    adminUserId: true,
    organizationId: true,
    learnerProfileId: true,
    createdAt: true,
    erasedAt: true,
    organization: { select: { name: true } },
    learnerProfile: {
      select: {
        id: true,
        tombstonedAt: true,
        accountHolder: {
          select: { id: true, tombstonedAt: true },
        },
      },
    },
  } as const;

  const owned = await db.student.findMany({
    where: studentsWhereForScope(scope),
    orderBy: { createdAt: "desc" },
    select: rosterSelect,
  });

  // Org learners this instructor is booked to teach. Private rows stay on
  // studentsWhereForScope, which the booking picker also uses. A learner
  // profile already on the private list stays one row; records are not merged.
  const taught =
    scope.kind === "admin"
      ? await db.scheduledSession.findMany({
          where: tutorAppointmentsWhere(scope.adminId),
          distinct: ["studentId"],
          select: { student: { select: rosterSelect } },
        })
      : [];

  const privateProfileIds = new Set(
    owned.map((student) => student.learnerProfileId).filter((id): id is string => id != null)
  );
  const byId = new Map(owned.map((student) => [student.id, student]));
  for (const row of taught) {
    const student = row.student;
    if (byId.has(student.id)) continue;
    if (student.learnerProfileId != null && privateProfileIds.has(student.learnerProfileId)) {
      continue;
    }
    byId.set(student.id, student);
  }
  const students = [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

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
    <PageShell realm="admin"
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
            parentEmail: s.parentEmail,
            organizationName: isOrgOwnedStudent(s) ? (s.organization?.name ?? "") : null,
            learnerProfileId: s.learnerProfileId,
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
    </PageShell>
  );
}
