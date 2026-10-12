import { notFound } from "next/navigation";
import { OrgLearnerPanel } from "@/components/org/OrgLearnerPanel";
import { OrgSchedulePanel } from "@/components/org/OrgSchedulePanel";
import { OrgStaffHome } from "@/components/org/OrgStaffHome";
import { PageShell } from "@/components/PageShell";
import {
  listOrganizationBookingChoices,
  listScheduledSessionsForOrganization,
} from "@/app/admin/schedule/actions";
import { db } from "@/lib/db";
import { listSchedulerLearners, loadInstructorTaughtSessions, loadOrgLearnerRecords } from "@/lib/org-learner";
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";
import { assertOrgRole, loadOrgStaffHome } from "@/lib/org-scope";
import { isOperatorEmail } from "@/lib/operator";

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["owner", "admin", "scheduler"] as const;

export default async function StaffOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await assertOrgRole(id, ["owner", "admin", "scheduler", "instructor"]);
  const canStaff = actor.roles.some((role) =>
    STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])
  );
  const data = canStaff ? await loadOrgStaffHome(id) : null;
  const orgNameRow = data
    ? null
    : await db.organization.findUnique({ where: { id }, select: { name: true } });
  if (!data && !orgNameRow) notFound();

  const canManage = data
    ? data.actor.roles.includes("owner") || data.actor.roles.includes("admin")
    : false;
  const isScheduler = data ? data.actor.roles.includes("scheduler") : false;
  const canBook = actor.roles.some((role) => role === "owner" || role === "admin" || role === "scheduler");
  const viewerIsInstructor = actor.roles.includes("instructor");
  const records = canManage ? await loadOrgLearnerRecords(id) : [];
  const schedulerCards = !canManage && isScheduler ? await listSchedulerLearners(id) : [];
  const [rows, choices] = await Promise.all([
    listScheduledSessionsForOrganization(id),
    listOrganizationBookingChoices(id),
  ]);
  const taught = viewerIsInstructor
    ? (
        await Promise.all(
          choices.students.map(async (student) => {
            const block = await loadInstructorTaughtSessions(id, student.id);
            return { studentId: student.id, fullName: block.fullName, sessions: block.sessions };
          })
        )
      ).filter((block) => block.sessions.length > 0)
    : [];
  const error = query.error ? orgStaffErrorSentence(query.error) : null;

  return (
    <PageShell
      realm="admin"
      title={data?.org.name ?? orgNameRow?.name ?? "Organization"}
      description={
        canStaff ? "Members, invitations, and learners." : "Your appointments and sessions."
      }
    >
      {data ? (
        <OrgStaffHome
          data={data}
          canActivate={isOperatorEmail(data.actor.email)}
          error={error}
        />
      ) : null}
      {data && (canManage || isScheduler) ? (
        <OrgLearnerPanel
          organizationId={id}
          canManage={canManage}
          records={records}
          schedulerCards={schedulerCards}
        />
      ) : null}
      <OrgSchedulePanel
        timeZone={choices.timeZone}
        canBook={canBook}
        viewerId={actor.adminId}
        viewerIsInstructor={viewerIsInstructor}
        rows={rows}
        students={choices.students}
        instructors={choices.instructors}
        taught={taught}
      />
    </PageShell>
  );
}
