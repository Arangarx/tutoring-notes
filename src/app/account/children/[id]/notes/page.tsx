/**
 * Authenticated parent notes view for a specific learner.
 *
 * Route: GET /account/children/[id]/notes
 *
 * Auth: AccountHolder session → assertOwnsLearnerProfile
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccountPageShell } from "@/components/account/AccountPageShell";
import { SectionCard } from "@/components/SectionCard";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { parentShareNoteInclude } from "@/lib/share/parentShareNotePayload";
import { requireAccountHolderSession } from "@/lib/server-session";

import { AccountChildNav } from "../AccountChildNav";

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

  await assertOwnsLearnerProfile(session.accountHolderId, learnerId);

  const learnerProfile = await db.learnerProfile.findUnique({
    where: { id: learnerId },
    select: { displayName: true },
  });
  if (!learnerProfile) notFound();

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
      description="Notes from tutoring sessions, updated automatically."
      userEmail={accountHolder?.email}
      eyebrow={
        <Link
          href="/account/dashboard"
          className="inline-flex min-h-11 items-center text-brand underline-offset-2 hover:underline"
        >
          {"\u2190"} Dashboard
        </Link>
      }
    >
      <AccountChildNav learnerId={learnerId} />

      <SectionCard realm="account"
        title="Session notes"
        className="rounded-[10px] border-border shadow-sm"
        actions={
          notes.length > 0 ? (
            <Badge className="bg-accent-soft text-accent-text font-mono text-[10px] uppercase">
              {notes.length} total
            </Badge>
          ) : null
        }
        description={
          notes.length === 0
            ? students.length === 0
              ? "No tutor connected yet."
              : "No notes yet. Notes will appear here after each session."
            : `${notes.length} note${notes.length !== 1 ? "s" : ""} from your tutor`
        }
      >
        {notes.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            {students.length === 0 ? (
              <p>
                {
                  "This learner isn't connected to a tutor yet. Notes will appear here once a tutor is connected and sessions begin. Your tutor can send you a claim link to connect."
                }
              </p>
            ) : (
              <p>
                No session notes yet. They will appear here automatically after each
                tutoring session.
              </p>
            )}
          </div>
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
      </SectionCard>
    </AccountPageShell>
  );
}
