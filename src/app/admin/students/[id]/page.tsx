import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  regenerateShareLink,
  revokeShareLink,
} from "./actions";
import SendUpdateForm from "./SendUpdateForm";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { ShareLinkRow } from "./ShareLinkRow";
import { SubmitButton } from "@/components/SubmitButton";
import NoteEntrySection from "./NoteEntrySection";
import { ActiveWhiteboardSessionsList } from "./whiteboard/ActiveWhiteboardSessionsList";
import { StartWhiteboardSession } from "./whiteboard/StartWhiteboardSession";
import { StudentRecordingDefaultToggle } from "./StudentRecordingDefaultToggle";
import { env } from "@/lib/env";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { getRequestBaseUrl } from "@/lib/public-url";
import { Button } from "@/components/ui/button";
import { ClaimInviteSection } from "./ClaimInviteSection";
import { ConnectedParentSection, type ConnectedParent } from "./ConnectedParentSection";
import {
  StudentDetailShell,
  defaultIcons,
} from "@/components/admin/StudentDetailShell";
import { StudentOverflowActions } from "@/components/admin/StudentOverflowActions";

export const dynamic = "force-dynamic";

export const maxDuration = 300;

function SectionHeading({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        {kicker ? (
          <p className="label-mono m-0 text-[11px] text-accent-text">{kicker}</p>
        ) : null}
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

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
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
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
          displayName: true,
          accountHolder: {
            select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
          },
        },
      },
      claimInvites: {
        where: {
          ...(scopedAdminUserId !== null ? { adminUserId: scopedAdminUserId } : {}),
          claimedAt: { not: null },
        },
        orderBy: { claimedAt: "desc" },
        take: 1,
        select: { claimedAt: true },
      },
    },
  });

  const claimInvitesEnabled =
    process.env.NEXT_PUBLIC_CLAIM_INVITES_ENABLED === "true";

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();

  const learnerProfileId = student.learnerProfileId;
  const isSelfLearner = student.learnerProfile?.isSelfLearner ?? false;
  const consentRecordExists =
    learnerProfileId && scopedAdminUserId
      ? !!(await db.consentRecord.findFirst({
          where: { learnerProfileId, adminUserId: scopedAdminUserId },
          orderBy: { version: "desc" },
          select: { id: true },
        }))
      : false;

  const activeShare = student.shareLinks[0] ?? null;
  const shareDisplayBaseUrl = activeShare ? await getRequestBaseUrl() : null;

  const noteCount = student._count.notes;
  const lastNote = student.notes[0];
  const openSessions = student.whiteboardSessions.length;

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

  const stickyCta = (
    <div className="w-full md:w-auto [&_button]:h-12 [&_button]:w-full [&_button]:text-[15px] md:[&_button]:h-11 md:[&_button]:w-auto">
      <StartWhiteboardSession
        studentId={student.id}
        consentRecordExists={consentRecordExists}
        isSelfLearner={isSelfLearner}
        studentClaimed={!!student.learnerProfileId}
      />
    </div>
  );

  const sessionSection = (
    <>
      <SectionHeading
        kicker="Live session"
        title="Whiteboard session"
        description="Live whiteboard with audio recording. Generates session notes from what you wrote and said."
      />
      <ActiveWhiteboardSessionsList
        studentId={student.id}
        sessions={student.whiteboardSessions}
      />
      <div className="mt-4 border-t border-border pt-4">
        <StudentRecordingDefaultToggle
          studentId={student.id}
          initialEnabled={student.recordingDefaultEnabled}
        />
      </div>
    </>
  );

  const shareSection = (
    <>
      <SectionHeading
        title="Share link (for parents/students)"
        description="This link does not require login. You can revoke or regenerate it anytime."
      />
      {activeShare ? (
        <>
          {(() => {
            const url = `${shareDisplayBaseUrl ?? "http://localhost:3000"}/s/${activeShare.token}`;
            return (
              <>
                <ShareLinkRow url={url} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={regenerateShareLink.bind(null, student.id)}>
                    <SubmitButton label="Regenerate" pendingLabel="Regenerating…" variant="outline" />
                  </form>
                  <form action={revokeShareLink.bind(null, student.id)}>
                    <SubmitButton label="Revoke" pendingLabel="Revoking…" variant="outline" />
                  </form>
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">No active share link yet.</p>
          <form action={regenerateShareLink.bind(null, student.id)}>
            <SubmitButton label="Create share link" variant="default" />
          </form>
        </div>
      )}
    </>
  );

  const notesSection = (
    <>
      <NoteEntrySection
        studentId={student.id}
        aiEnabled={!!env.OPENAI_API_KEY}
        blobEnabled={!!env.BLOB_READ_WRITE_TOKEN}
      />
      <div className="mt-6 border-t border-border pt-6">
      <SectionHeading
        kicker="Parent communication"
        title="Send update email"
        description="Sends the share link to the parent. The parent email address is saved for this student for next time."
      />
        <SendUpdateForm studentId={student.id} defaultToEmail={student.parentEmail} />
      </div>
      <div className="mt-6 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">
              {noteCount} session note{noteCount !== 1 ? "s" : ""}
            </strong>
            {lastNote ? <> · last {formatDateOnlyDisplay(lastNote.date)}</> : null}
          </p>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/admin/students/${id}/notes`}>View all notes →</Link>
          </Button>
        </div>
      </div>
    </>
  );

  const parentSection = claimInvitesEnabled ? (
    <>
      <SectionHeading
        title="Parent account"
        description={
          student.learnerProfileId
            ? "A parent account is connected to this student."
            : "Invite a parent to create a Mynk account and connect this student."
        }
      />
      {student.learnerProfile?.accountHolder ? (
        <ConnectedParentSection
          studentId={student.id}
          learnerName={student.learnerProfile.displayName}
          connectedParent={
            {
              email: student.learnerProfile.accountHolder.email,
              displayName: student.learnerProfile.accountHolder.displayName,
              emailVerifiedAt: student.learnerProfile.accountHolder.emailVerifiedAt,
              claimedAt: student.claimInvites[0]?.claimedAt ?? null,
            } satisfies ConnectedParent
          }
        />
      ) : (
        <ClaimInviteSection
          studentId={student.id}
          studentName={student.name}
          alreadyClaimed={!!student.learnerProfileId}
        />
      )}
    </>
  ) : (
    <p className="text-sm text-muted-foreground">Parent account linking is not enabled.</p>
  );

  const sections = [
    {
      id: "session",
      label: "Whiteboard",
      mobileLabel: "Session",
      icon: defaultIcons.session,
      content: sessionSection,
    },
    {
      id: "share",
      label: "Share link",
      mobileLabel: "Share",
      icon: defaultIcons.share,
      content: shareSection,
    },
    {
      id: "notes",
      label: "Notes & email",
      mobileLabel: "Notes",
      icon: defaultIcons.notes,
      content: notesSection,
    },
    {
      id: "parent",
      label: "Parent account",
      mobileLabel: "More",
      icon: defaultIcons.more,
      content: parentSection,
    },
  ];

  return (
    <StudentDetailShell
      studentId={student.id}
      studentName={student.name}
      meta={meta}
      headerActions={
        <>
          <StudentOverflowActions studentId={student.id} studentName={student.name} />
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/outbox">Outbox</Link>
          </Button>
        </>
      }
      overflowActions={
        <StudentOverflowActions studentId={student.id} studentName={student.name} />
      }
      stickyCta={stickyCta}
      sections={sections}
    />
  );
}
