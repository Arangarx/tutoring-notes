/**
 * Authenticated parent notes view for a specific learner.
 *
 * Route: GET /account/children/[id]/notes
 *
 * Auth: AccountHolder session → assertOwnsLearnerProfile
 *
 * Shows the same session notes as the /s/[token] share page for the tutor-
 * scoped Student linked to this LearnerProfile. For a learner with multiple
 * tutors (IAC-2), we find all linked Students and merge their notes, ordered
 * by date descending, since there is no single canonical token here.
 *
 * This is the "pull" model — notes appear in the parent's authenticated
 * dashboard, not just via email links. Removes dependency on the tutor
 * remembering to send emails.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccountHolderSession } from "@/lib/server-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { AccountPageShell } from "@/components/account/AccountPageShell";
import { AccountSectionCard } from "@/components/account/AccountSectionCard";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { parentShareNoteInclude } from "@/lib/share/parentShareNotePayload";
import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  void id;
  return {
    title: "Session notes",
    robots: { index: false, follow: false },
  };
}

export default async function LearnerNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: learnerId } = await params;

  const session = await requireAccountHolderSession(`/account/children/${learnerId}/notes`);

  const accountHolder = await db.accountHolder.findUnique({
    where: { id: session.accountHolderId },
    select: { email: true },
  });

  // assertOwnsLearnerProfile calls notFound() on mismatch / tombstone.
  await assertOwnsLearnerProfile(session.accountHolderId, learnerId);

  const learnerProfile = await db.learnerProfile.findUnique({
    where: { id: learnerId },
    select: { displayName: true },
  });
  if (!learnerProfile) notFound();

  // IAC-2: a LearnerProfile may be linked to multiple tutors' Students.
  // Gather all linked Student rows so we can aggregate notes across tutors.
  const students = await db.student.findMany({
    where: { learnerProfileId: learnerId },
    select: { id: true, adminUserId: true },
  });

  const studentIds = students.map((s) => s.id);

  const shareLinks = await db.shareLink.findMany({
    where: { studentId: { in: studentIds }, revokedAt: null },
    select: { studentId: true, token: true },
    orderBy: { createdAt: "desc" },
  });

  // Pick one share link per student (most recent non-revoked) for the
  // per-note "View share page" link. Map: studentId → token.
  const shareTokenByStudentId = new Map<string, string>();
  for (const sl of shareLinks) {
    if (!shareTokenByStudentId.has(sl.studentId)) {
      shareTokenByStudentId.set(sl.studentId, sl.token);
    }
  }

  const notes = await db.sessionNote.findMany({
    where: {
      studentId: { in: studentIds },
      status: { not: "DRAFT" },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      ...parentShareNoteInclude,
      // Include studentId so we can resolve the share token per note.
      student: { select: { id: true } },
    },
  });

  const whiteboardIdsByNote = await loadWhiteboardReplayIdsByNoteIds(
    notes.map((n) => n.id)
  );

  const learnerName = learnerProfile.displayName;

  return (
    <AccountPageShell
      title={`${learnerName} — Session notes`}
      userEmail={accountHolder?.email}
      eyebrow={
        <Link
          href={`/account/children/${learnerId}`}
          className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
        >
          {"\u2190"} Back to {learnerName}
        </Link>
      }
    >
      <AccountSectionCard
        title="Session notes"
        description={
          notes.length === 0
            ? students.length === 0
              ? "No tutor connected yet."
              : "No notes yet. Notes will appear here after each session."
            : `${notes.length} note${notes.length !== 1 ? "s" : ""} from your tutor`
        }
      >
        {notes.length === 0 ? (
          students.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {
                "This learner isn't connected to a tutor yet. Notes will appear here once a tutor is connected and sessions begin. "
              }
              {/* TODO: tutor-discovery/connection flow for parent-created learners */}
              {
                "Your tutor can send you a claim link to connect, or tutor-discovery will be available in a future update."
              }
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No session notes yet. They will appear here automatically after
              each tutoring session.
            </p>
          )
        ) : (
          <div className="grid gap-3">
            {notes.map((note) => {
              const shareToken = shareTokenByStudentId.get(note.student.id);
              return (
                <ParentShareNoteCard
                  key={note.id}
                  token={shareToken ?? ""}
                  dateLabel={formatDateOnlyDisplay(note.date)}
                  note={{
                    id: note.id,
                    date: note.date,
                    startTime: note.startTime,
                    endTime: note.endTime,
                    template: note.template,
                    topics: note.topics,
                    homework: note.homework,
                    assessment: note.assessment,
                    nextSteps: note.nextSteps,
                    linksJson: note.linksJson,
                    shareRecordingInEmail: note.shareRecordingInEmail,
                    recordings: note.recordings,
                    whiteboardSessions: mergeWhiteboardStubsForShareCard(
                      note,
                      whiteboardIdsByNote.get(note.id)
                    ),
                  }}
                  isNew={false}
                />
              );
            })}
          </div>
        )}
      </AccountSectionCard>
    </AccountPageShell>
  );
}
