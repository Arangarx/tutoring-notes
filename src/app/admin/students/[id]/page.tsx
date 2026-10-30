import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { UpcomingSessionsCard } from "@/components/scheduling/UpcomingSessionsCard";
import { OpenScheduledRoomButton } from "@/components/scheduling/OpenScheduledRoomButton";
import { SessionEntryBlocked } from "@/components/scheduling/SessionEntryBlocked";
import { listUpcomingForStudent } from "@/lib/scheduling/upcoming-sessions";
import {
  ENTRY_UNAVAILABLE,
  tutorControlState,
  type EntryBlockReason,
  type SessionEntryState,
} from "@/lib/scheduling/session-entry";
import { loadSessionEntryState } from "@/lib/scheduling/session-entry-loader";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/SectionCard";
import { StudentDetailShell } from "@/components/admin/StudentDetailShell";
import { StudentCriticalCard } from "@/components/admin/StudentCriticalCard";
import { StudentOverflowActions } from "@/components/admin/StudentOverflowActions";
import { deriveStudentErasureDisplayState } from "@/lib/erasure/student-erasure-display";
import { lookupActiveErasurePurgeDates } from "@/lib/erasure/lookup-active-erasure-purge-dates";
import { studentDetailView } from "@/lib/student-detail-view";
import { StudentSessionDisclosures } from "@/components/admin/StudentSessionDisclosures";
import {
  ActiveWhiteboardSessionsList,
  ResumeWhiteboardSessionLink,
} from "./whiteboard/ActiveWhiteboardSessionsList";
import { EndedUnsavedSessionsList } from "./whiteboard/EndedUnsavedSessionsList";
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [endedUnsavedSessions, endedUnsavedTotalCount] = await Promise.all([
    db.whiteboardSession.findMany({
      where: {
        studentId: id,
        endedAt: { gte: thirtyDaysAgo },
        noteId: null,
      },
      orderBy: { endedAt: "desc" },
      take: 20,
      select: { id: true, startedAt: true, endedAt: true },
    }),
    db.whiteboardSession.count({
      where: {
        studentId: id,
        endedAt: { not: null },
        noteId: null,
      },
    }),
  ]);
  const endedUnsavedRows = endedUnsavedSessions.flatMap((session) =>
    session.endedAt != null ? [{ ...session, endedAt: session.endedAt }] : []
  );

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
  const nextAppointment = upcomingScheduledSessions[0] ?? null;
  const openRoomControl =
    view.mainButton === "open_room" && nextAppointment ? nextAppointment : null;

  const openRoomBlockedReason: EntryBlockReason | null = openRoomControl
    ? tutorControlState(openRoomControl.entry).disabledReason
    : null;

  // Start session (no appointment): the same entry rule the appointment rows use.
  let startEntry: SessionEntryState = ENTRY_UNAVAILABLE;
  if (view.mainButton === "start_session" && scopedAdminUserId) {
    startEntry = await loadSessionEntryState({
      studentId: id,
      adminUserId: scopedAdminUserId,
      student: {
        adminUserId: student.adminUserId,
        organizationId: student.organizationId,
        learnerProfileId,
        learnerProfile: lp ? { isSelfLearner: lp.isSelfLearner } : null,
      },
    });
  }

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
        />
      ) : null}

      <SectionCard realm="admin" title="Session" data-testid="student-session-card">
        {view.mainButton === "resume" && resumeSessionId ? (
          <div data-testid="student-main-control">
            <ResumeWhiteboardSessionLink studentId={student.id} sessionId={resumeSessionId} />
          </div>
        ) : null}
        {openRoomControl ? (
          <div data-testid="student-main-control">
            {openRoomBlockedReason ? (
              // Blocked by consent / claim / erasure: say why in full, once.
              <SessionEntryBlocked
                size="card"
                reason={openRoomBlockedReason}
                control="openRoom"
                audience="tutor"
                learnerName={student.name}
                studentId={student.id}
              />
            ) : (
              <OpenScheduledRoomButton
                scheduledSessionId={openRoomControl.id}
                entry={openRoomControl.entry}
                learnerName={student.name}
              />
            )}
          </div>
        ) : null}
        {view.mainButton === "start_session" ? (
          <div data-testid="student-main-control">
            <StartWhiteboardSession
              studentId={student.id}
              entry={startEntry}
              learnerName={student.name}
              label="Start session"
            />
          </div>
        ) : null}
      </SectionCard>

      <StudentSessionDisclosures
        sections={[
          ...(openSessions > 0
            ? [
                {
                  value: "open-sessions",
                  testId: "student-open-sessions-disclosure",
                  title: `Open sessions (${openSessions})`,
                  content: (
                    <ActiveWhiteboardSessionsList
                      studentId={student.id}
                      sessions={student.whiteboardSessions}
                      variant="bare"
                    />
                  ),
                },
              ]
            : []),
          ...(endedUnsavedRows.length > 0
            ? [
                {
                  value: "ended-needs-review",
                  testId: "student-ended-needs-review-disclosure",
                  title: "Ended — needs review",
                  content: (
                    <EndedUnsavedSessionsList
                      studentId={student.id}
                      sessions={endedUnsavedRows}
                      totalCount={endedUnsavedTotalCount}
                      variant="bare"
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <UpcomingSessionsCard
        mode="tutor"
        sessions={upcomingScheduledSessions}
        promotedId={openRoomControl?.id ?? null}
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
