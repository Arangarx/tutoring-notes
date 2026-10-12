import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { UpcomingSessionsCard } from "@/components/scheduling/UpcomingSessionsCard";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";
import { listUpcomingForStudent } from "@/lib/scheduling/upcoming-sessions";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { ClaimInviteSection } from "./ClaimInviteSection";
import { StudentDetailShell } from "@/components/admin/StudentDetailShell";
import { StudentCriticalCard } from "@/components/admin/StudentCriticalCard";
import { StudentOverflowActions } from "@/components/admin/StudentOverflowActions";
import { deriveStudentErasureDisplayState } from "@/lib/erasure/student-erasure-display";
import { lookupActiveErasurePurgeDates } from "@/lib/erasure/lookup-active-erasure-purge-dates";
import { studentDetailView } from "@/lib/student-detail-view";
import { ResumeWhiteboardSessionLink } from "./whiteboard/ActiveWhiteboardSessionsList";
import { StartWhiteboardSession } from "./whiteboard/StartWhiteboardSession";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const scopedAdminUserId: string | null = scope.kind === "admin" ? scope.adminId : null;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      _count: { select: { notes: true } },
      notes: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      whiteboardSessions: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { id: true, startedAt: true },
      },
      learnerProfile: {
        select: {
          id: true,
          isSelfLearner: true,
          tombstonedAt: true,
          accountHolder: {
            select: { id: true, tombstonedAt: true },
          },
        },
      },
      claimInvites: {
        where: scopedAdminUserId !== null ? { adminUserId: scopedAdminUserId } : {},
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { inviteTargetKind: true },
      },
    },
  });

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();

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

  const learnerProfileId = student.learnerProfileId;
  const consentRecordExists =
    learnerProfileId && scopedAdminUserId
      ? !!(await db.consentRecord.findFirst({
          where: { learnerProfileId, adminUserId: scopedAdminUserId },
          orderBy: { version: "desc" },
          select: { id: true },
        }))
      : false;

  const upcomingScheduledSessions =
    scopedAdminUserId !== null
      ? await listUpcomingForStudent(scopedAdminUserId, id)
      : [];

  const latestInvite = student.claimInvites[0] ?? null;
  const view = studentDetailView({
    studentName: student.name,
    learnerProfileId,
    hasInvite: latestInvite !== null,
    latestInviteTargetKind: latestInvite?.inviteTargetKind ?? null,
    consentRecordExists,
    pendingErasure: erasureState.kind === "pending_grace",
    purgeEligibleAt:
      erasureState.kind === "pending_grace" ? erasureState.purgeEligibleAt : null,
    hasOpenWhiteboardSession: student.whiteboardSessions.length > 0,
    hasUpcomingAppointment: upcomingScheduledSessions.length > 0,
  });

  const noteCount = student._count.notes;
  const lastNote = student.notes[0];
  const openSessions = student.whiteboardSessions.length;
  const resumeSessionId = student.whiteboardSessions[0]?.id ?? null;
  const nextAppointmentId = upcomingScheduledSessions[0]?.id ?? null;

  const meta = (
    <>
      {noteCount} note{noteCount !== 1 ? "s" : ""}
      {lastNote ? <> · last {formatDateOnlyDisplay(lastNote.date)}</> : null}
      {openSessions > 0 ? (
        <>
          {" "}
          · {openSessions} open session{openSessions !== 1 ? "s" : ""}
        </>
      ) : null}
    </>
  );

  return (
    <StudentDetailShell
      studentName={student.name}
      meta={meta}
      overflow={
        <StudentOverflowActions studentId={student.id} studentName={student.name} />
      }
    >
      {view.criticalCard ? (
        <StudentCriticalCard
          text={view.criticalCard.text}
          purgeEligibleAt={
            view.criticalCard.kind === "deletion" ? view.criticalCard.purgeEligibleAt : null
          }
        >
          {view.criticalCard.kind === "setup" ? (
            <ClaimInviteSection
              studentId={student.id}
              studentName={student.name}
              alreadyClaimed={false}
              needsInviteEmail={!student.parentEmail}
              prominent
            />
          ) : null}
        </StudentCriticalCard>
      ) : null}

      <SectionCard realm="admin" title="Session" data-testid="student-session-card">
        {view.mainButton === "resume" && resumeSessionId ? (
          <div data-testid="student-main-control">
            <ResumeWhiteboardSessionLink studentId={student.id} sessionId={resumeSessionId} />
          </div>
        ) : null}
        {view.mainButton === "open_room" && nextAppointmentId ? (
          <div data-testid="student-main-control">
            <OpenScheduledRoomButton scheduledSessionId={nextAppointmentId} />
          </div>
        ) : null}
        {view.mainButton === "start_session" ? (
          <div data-testid="student-main-control">
            <StartWhiteboardSession
              studentId={student.id}
              consentRecordExists={consentRecordExists}
              isSelfLearner={student.learnerProfile?.isSelfLearner ?? false}
              studentClaimed={!!student.learnerProfileId}
              label="Start session"
            />
          </div>
        ) : null}
      </SectionCard>

      <UpcomingSessionsCard
        mode="tutor"
        sessions={upcomingScheduledSessions}
        description="Open the live room when it is time for the appointment."
      />

      <div className="flex flex-col gap-3">
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link href={`/admin/students/${id}/notes`} data-testid="student-notes-link">
            Notes
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link href={`/admin/students/${id}/account`} data-testid="student-account-link">
            Account & sharing
          </Link>
        </Button>
      </div>
    </StudentDetailShell>
  );
}
