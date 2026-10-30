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
import { orgAppointmentListScope, orgLearnerFilterForViewer } from "@/lib/org-appointment-scope";
import { listSchedulerLearners, loadInstructorTaughtSessions, loadOrgLearnerRecords } from "@/lib/org-learner";
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";
import { assertOrgRole, loadOrgStaffHome } from "@/lib/org-scope";
import { isOperatorEmail } from "@/lib/operator";

export const dynamic = "force-dynamic";

export default async function StaffOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; learner?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const actor = await assertOrgRole(id, ["owner", "admin", "scheduler", "instructor"]);
  const canStaff = orgAppointmentListScope(actor.roles) === "staff";
  const data = canStaff ? await loadOrgStaffHome(id) : null;
  const orgNameRow = data
    ? null
    : await db.organization.findUnique({
        where: { id },
        select: { name: true, timezone: true },
      });
  if (!data && !orgNameRow) notFound();

  const canManage = data
    ? data.actor.roles.includes("owner") || data.actor.roles.includes("admin")
    : false;
  const isScheduler = data ? data.actor.roles.includes("scheduler") : false;
  const canBook = canStaff;
  const viewerIsInstructor = actor.roles.includes("instructor");
  const rawLearner = Array.isArray(query.learner) ? query.learner[0] : query.learner;
  const learnerFilter = orgLearnerFilterForViewer(actor.roles, rawLearner);
  const records = canManage ? await loadOrgLearnerRecords(id) : [];
  const schedulerCards = !canManage && isScheduler ? await listSchedulerLearners(id) : [];
  const [rows, choices] = await Promise.all([
    listScheduledSessionsForOrganization(id, rawLearner),
    canBook ? listOrganizationBookingChoices(id) : Promise.resolve(null),
  ]);
  const taught = viewerIsInstructor ? await loadInstructorTaughtSessions(id, learnerFilter) : [];
  const timeZone = choices?.timeZone ?? orgNameRow?.timezone;
  if (!timeZone) notFound();
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
        timeZone={timeZone}
        canBook={canBook}
        viewerId={actor.adminId}
        viewerIsInstructor={viewerIsInstructor}
        rows={rows}
        students={choices?.students ?? []}
        instructors={choices?.instructors ?? []}
        taught={taught}
      />
    </PageShell>
  );
}
