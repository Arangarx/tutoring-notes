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
import { StudentActions } from "./StudentActions";
import NoteEntrySection from "./NoteEntrySection";
import { ActiveWhiteboardSessionsList } from "./whiteboard/ActiveWhiteboardSessionsList";
import { StartWhiteboardSession } from "./whiteboard/StartWhiteboardSession";
import { StudentRecordingDefaultToggle } from "./StudentRecordingDefaultToggle";
import { env } from "@/lib/env";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { getRequestBaseUrl } from "@/lib/public-url";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { StudentAvatar } from "@/components/admin/StudentAvatar";
import { Button } from "@/components/ui/button";
import { ClaimInviteSection } from "./ClaimInviteSection";
import { ConnectedParentSection, type ConnectedParent } from "./ConnectedParentSection";

export const dynamic = "force-dynamic";

/**
 * Whisper + LLM can exceed default ~10s serverless limits.
 *
 * Budget for a worst-case ~60-minute single audio upload on this page:
 *   blob download   ~10 s
 *   ffmpeg split    ~40 s   (3–4 parts for a 60-min recording)
 *   Whisper calls   ~3–4 min (each ~22 MB chunk runs ~50–70 s sequentially)
 *   AI structuring  ~15 s
 *   ─────────────────────
 *   total           ~5 min
 *
 * 300 s (Vercel Pro maximum, also the cap on Hobby) gives us the full budget.
 * Anything beyond ~60 min would need to be split into a queue/worker pattern.
 *
 * This timeout applies to all server actions invoked from this page,
 * including transcribeAndGenerateAction. Vercel clamps to plan limits, so
 * a value larger than 300 is safe to set but will be capped.
 */
export const maxDuration = 300;

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  // IAC-13: scope-scoped adminUserId for filtering claim invites to this tutor's minted ones.
  const scopedAdminUserId: string | null = scope.kind === "admin" ? scope.adminId : null;

  const student = await db.student.findUnique({
    where: { id },
    include: {
      shareLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
      _count: { select: { notes: true } },
      notes: { orderBy: { date: "desc" }, take: 1, select: { date: true } },
      // Still-running whiteboard rooms (endedAt = null) — surfaced under
      // the "Start" button so tutors can continue or end stragglers
      // without multiple forgotten live sessions piling up in the DB.
      whiteboardSessions: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 20,
        select: { id: true, startedAt: true },
      },
      // IAC-13 (a): connected AccountHolder identity for the tutor-facing "Parent account" section.
      // Two-hop join: Student → LearnerProfile → AccountHolder.
      learnerProfile: {
        select: {
          id: true,
          displayName: true,
          accountHolder: {
            select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
          },
        },
      },
      // IAC-13 (a): "connected since" timestamp from the most recent completed claim invite
      // minted by THIS tutor (adminUserId filter prevents leaking another tutor's invite history).
      // For env scope (no adminUserId), no adminUserId filter is applied — env accounts can't
      // mint claim invites via the API anyway, so this returns nothing in practice.
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

  const activeShare = student.shareLinks[0] ?? null;
  // Tutor-displayed share URL follows the deployment serving the request so
  // smoke-testing on a Vercel preview surfaces the preview host (not the
  // hardcoded production NEXTAUTH_URL). Email send still uses the production
  // URL via `baseUrl()` in the action so parents always get the stable host.
  const shareDisplayBaseUrl = activeShare ? await getRequestBaseUrl() : null;

  const noteCount = student._count.notes;
  const lastNote = student.notes[0];
  const openSessions = student.whiteboardSessions.length;

  return (
    <AdminPageShell
      eyebrow={
        <Link
          href="/admin/students"
          className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
        >
          ← Students
        </Link>
      }
      title={student.name}
      description={
        <span className="label-mono text-sm">
          {noteCount} note{noteCount !== 1 ? "s" : ""}
          {lastNote ? <> · last {formatDateOnlyDisplay(lastNote.date)}</> : null}
          {openSessions > 0 ? (
            <>
              {" "}
              · {openSessions} open session{openSessions !== 1 ? "s" : ""}
            </>
          ) : null}
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StudentActions studentId={student.id} currentName={student.name} />
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/outbox">Outbox</Link>
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
        <StudentAvatar name={student.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Start a whiteboard session to record and generate notes for this student.
          </p>
        </div>
      </div>

      <AdminSectionCard
        title="Share link (for parents/students)"
        description="This link does not require login. You can revoke or regenerate it anytime."
      >
        {activeShare ? (
          <>
            {(() => {
              const url = `${shareDisplayBaseUrl ?? "http://localhost:3000"}/s/${activeShare.token}`;
              return (
                <>
                  <ShareLinkRow url={url} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <form action={regenerateShareLink.bind(null, student.id)}>
                      <SubmitButton label="Regenerate" pendingLabel="Regenerating…" className="btn" />
                    </form>
                    <form action={revokeShareLink.bind(null, student.id)}>
                      <SubmitButton label="Revoke" pendingLabel="Revoking…" className="btn" />
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
              <SubmitButton label="Create share link" className="primary" />
            </form>
          </div>
        )}
      </AdminSectionCard>

      <NoteEntrySection
        studentId={student.id}
        aiEnabled={!!env.OPENAI_API_KEY}
        blobEnabled={!!env.BLOB_READ_WRITE_TOKEN}
      />

      <AdminSectionCard
        title="Whiteboard session"
        description="Live whiteboard with audio recording for tutoring sessions. Generates session notes from what you wrote and said."
        actions={<StartWhiteboardSession studentId={student.id} />}
      >
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
      </AdminSectionCard>

      <AdminSectionCard
        title="Send update email"
        description="Sends the share link to the parent. The parent email address is saved for this student for next time."
      >
        <SendUpdateForm studentId={student.id} defaultToEmail={student.parentEmail} />
      </AdminSectionCard>

      {claimInvitesEnabled ? (
        <AdminSectionCard
          title="Parent account"
          description={
            student.learnerProfileId
              ? "A parent account is connected to this student."
              : "Invite a parent to create a Mynk account and connect this student. They'll be able to manage their child's login and session access."
          }
        >
          {student.learnerProfile?.accountHolder ? (
            // IAC-13 (a)+(b): Show connected parent identity + disconnect control.
            <ConnectedParentSection
              studentId={student.id}
              studentName={student.name}
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
            // Unclaimed: show invite flow.
            <ClaimInviteSection
              studentId={student.id}
              studentName={student.name}
              alreadyClaimed={!!student.learnerProfileId}
            />
          )}
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard
        title="Session notes"
        description={
          noteCount === 0 ? (
            "No notes yet."
          ) : (
            <>
              {noteCount} note{noteCount !== 1 ? "s" : ""}
              {lastNote ? <> · last {formatDateOnlyDisplay(lastNote.date)}</> : null}
            </>
          )
        }
        actions={
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/admin/students/${id}/notes`}>View all notes →</Link>
          </Button>
        }
      >
        <span className="sr-only">Open the notes list to view or edit saved session notes.</span>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
