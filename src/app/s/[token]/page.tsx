import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import {
  ParentShareShell,
  ShareBrowseAllLink,
  ShareDividerLabel,
} from "@/components/share/ParentShareShell";
import { parentShareNoteInclude } from "@/lib/share/parentShareNotePayload";
import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { assertCanAccessShareLink } from "@/lib/share-access-scope";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Session notes",
    robots: { index: false, follow: false },
  };
}

const SEEN_NOTES_SHOWN = 5;

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Auth gate: assertCanAccessShareLink handles revocation check + wall enforcement.
  // On wall=off (grace): passes through anonymously. On wall=on: requires session.
  const access = await assertCanAccessShareLink(token, `/s/${token}`);
  await assertStudentNotErased(access.studentId, { salToken: token });

  const link = await db.shareLink.findUnique({
    where: { token },
    include: {
      student: { select: { id: true, name: true, adminUserId: true } },
    },
  });

  if (!link || link.revokedAt) notFound();

  const student = link.student;
  const notes = await db.sessionNote.findMany({
    where: { studentId: student.id, status: { not: "DRAFT" } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: parentShareNoteInclude,
  });
  const whiteboardIdsByNote = await loadWhiteboardReplayIdsByNoteIds(
    notes.map((n) => n.id)
  );
  const totalNotes = notes.length;

  // Which notes has this visitor already seen?
  const viewedRows = await db.noteView.findMany({
    where: { shareToken: token },
    select: { noteId: true },
  });
  const seenNoteIds = new Set(viewedRows.map((v) => v.noteId));

  // Bootstrap fix: on first visit (no view history for this token), immediately
  // seed all existing notes as "seen" so future visits only highlight genuinely
  // new notes. Without this, notes created before the seen-tracking feature was
  // deployed (or before this share link was ever opened) would all appear as "NEW"
  // on the second visit, which is misleading.
  if (seenNoteIds.size === 0 && notes.length > 0) {
    await db.noteView.createMany({
      data: notes.map((n) => ({
        shareToken: token,
        noteId: n.id,
      })),
      skipDuplicates: true,
    });
    notes.forEach((n) => seenNoteIds.add(n.id));
  }

  const isReturningVisitor = seenNoteIds.size > 0;

  // Resolve the tutor who owns this student — scoped by adminUserId, not findFirst()
  // (findFirst with no where clause would show an arbitrary admin's name to every parent).
  const tutor = student.adminUserId
    ? await db.adminUser.findUnique({
        where: { id: student.adminUserId },
        select: { displayName: true, email: true },
      })
    : null;
  const tutorName = tutor?.displayName?.trim() || tutor?.email?.split("@")[0] || null;

  // Split notes into unseen and seen for layout purposes.
  // On first visit, treat everything as "seen" (no NEW labels — nothing to compare against).
  const unseenNotes = isReturningVisitor
    ? notes.filter((n) => !seenNoteIds.has(n.id))
    : [];
  const seenNotes = isReturningVisitor
    ? notes.filter((n) => seenNoteIds.has(n.id))
    : notes;

  // Seen notes: show first SEEN_NOTES_SHOWN expanded, rest inside <details>.
  const seenTop = seenNotes.slice(0, SEEN_NOTES_SHOWN);
  const seenOlder = seenNotes.slice(SEEN_NOTES_SHOWN);

  function NoteCard({
    note,
    isNew,
  }: {
    note: (typeof notes)[number];
    isNew: boolean;
  }) {
    return (
      <ParentShareNoteCard
        token={token}
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
        isNew={isNew}
      />
    );
  }

  const subtitle = (
    <>
      {tutorName ? `Notes shared by ${tutorName}` : "Session notes"}
      {totalNotes > 0 && (
        <>
          {" "}
          · {totalNotes} note{totalNotes !== 1 ? "s" : ""}
        </>
      )}
    </>
  );

  return (
    <ParentShareShell
      studentName={student.name}
      subtitle={subtitle}
      headerAction={
        totalNotes > SEEN_NOTES_SHOWN ? (
          <ShareBrowseAllLink
            href={`/s/${token}/all`}
            label="Browse all notes →"
          />
        ) : undefined
      }
    >
      {totalNotes === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <>
          {unseenNotes.length > 0 ? (
            <>
              <ShareDividerLabel>New since your last visit</ShareDividerLabel>
              {unseenNotes.map((n) => (
                <NoteCard key={n.id} note={n} isNew={true} />
              ))}
              {seenNotes.length > 0 ? (
                <ShareDividerLabel variant="muted">Previously seen</ShareDividerLabel>
              ) : null}
            </>
          ) : null}

          {seenTop.map((n) => (
            <NoteCard key={n.id} note={n} isNew={false} />
          ))}

          {seenOlder.length > 0 ? (
            <details className="mt-1 group">
              <summary className="cursor-pointer py-2.5 text-[13px] text-muted-foreground select-none list-none [&::-webkit-details-marker]:hidden">
                {seenOlder.length} older note{seenOlder.length !== 1 ? "s" : ""} — tap to
                expand
              </summary>
              <div className="flex flex-col gap-3 pt-2">
                {seenOlder.map((n) => (
                  <NoteCard key={n.id} note={n} isNew={false} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}

      {totalNotes > SEEN_NOTES_SHOWN ? (
        <div className="mt-4 text-center">
          <Button variant="outline" className="h-auto px-4 py-2.5" asChild>
            <Link href={`/s/${token}/all`}>Browse all {totalNotes} notes →</Link>
          </Button>
        </div>
      ) : null}
    </ParentShareShell>
  );
}
