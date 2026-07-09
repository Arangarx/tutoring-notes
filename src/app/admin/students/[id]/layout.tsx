import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { lookupActiveErasurePurgeDates } from "@/lib/erasure/lookup-active-erasure-purge-dates";
import { deriveStudentErasureDisplayState, isStudentAccessSuspended } from "@/lib/erasure/student-erasure-display";
import { StudentErasurePendingBanner } from "@/components/admin/StudentErasureStatus";
import { Button } from "@/components/ui/button";

/**
 * Layout for /admin/students/[id]/* routes.
 *
 * Security: when the student's access is suspended (pending erasure grace
 * period or post-purge), render a minimal shell — banner + roster link only.
 * No notes form, no share section, no session affordances.
 *
 * This is the single choke-point so every child page (student detail,
 * notes list) is automatically gated without per-page duplication.
 *
 * Log prefix: [ers]
 */
export default async function StudentDetailLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const student = await db.student.findUnique({
    where: { id },
    select: {
      adminUserId: true,
      erasedAt: true,
      name: true,
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

  if (!student || !canAccessStudentRow(scope, student)) {
    // Let the page.tsx notFound() handler fire — don't short-circuit here.
    return <>{children}</>;
  }

  const lp = student.learnerProfile;
  const lpId = lp?.id ?? null;
  const ahId = lp?.accountHolder?.id ?? null;
  const purgeDates = await lookupActiveErasurePurgeDates(
    lpId ? [lpId] : [],
    ahId ? [ahId] : []
  );
  const activeJobPurgeEligibleAt =
    (lpId && purgeDates.byLearnerProfileId.get(lpId)) ??
    (ahId && purgeDates.byAccountHolderId.get(ahId)) ??
    null;

  const erasureState = deriveStudentErasureDisplayState({
    erasedAt: student.erasedAt,
    lpTombstonedAt: lp?.tombstonedAt ?? null,
    ahTombstonedAt: lp?.accountHolder?.tombstonedAt ?? null,
    activeJobPurgeEligibleAt,
  });

  if (!isStudentAccessSuspended(erasureState)) {
    return <>{children}</>;
  }

  console.error(
    `[ers] action=layout_access_suspended studentId=${id} erasureKind=${erasureState.kind}`
  );

  return (
    <div
      className="space-y-4"
      data-testid="student-erasure-suspended-shell"
    >
      <StudentErasurePendingBanner state={erasureState} />
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          All content and affordances are unavailable while this student&apos;s
          account is suspended.
        </p>
        <Button asChild variant="outline" className="w-fit min-h-11">
          <Link href="/admin/students">← Back to roster</Link>
        </Button>
      </div>
    </div>
  );
}
