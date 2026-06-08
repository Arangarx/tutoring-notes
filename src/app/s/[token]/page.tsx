import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { parentShareNoteInclude } from "@/lib/share/parentShareNotePayload";
import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";

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

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "var(--surface-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 4 }}>{student.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {tutorName ? `Notes shared by ${tutorName}` : "Session notes"}
              {totalNotes > 0 && (
                <> · {totalNotes} note{totalNotes !== 1 ? "s" : ""}</>
              )}
            </p>
          </div>
          {totalNotes > SEEN_NOTES_SHOWN && (
            <Link
              className="btn"
              href={`/s/${token}/all`}
              style={{ flexShrink: 0 }}
            >
              Browse all notes →
            </Link>
          )}
        </div>

        <div className="divider" />

        {totalNotes === 0 ? (
          <p className="muted">No notes yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {/* ── Unseen notes (returning visitors only) ── */}
            {unseenNotes.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: "4px 0",
                  }}
                >
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary)", opacity: 0.5 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-primary)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    New since your last visit
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary)", opacity: 0.5 }} />
                </div>

                {unseenNotes.map((n) => (
                  <NoteCard key={n.id} note={n} isNew={true} />
                ))}

                {seenNotes.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      margin: "4px 0",
                    }}
                  >
                    <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                    <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      Previously seen
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
                  </div>
                )}
              </>
            )}

            {/* ── Seen / first-visit notes ── */}
            {seenTop.map((n) => (
              <NoteCard key={n.id} note={n} isNew={false} />
            ))}

            {/* ── Older seen notes collapsed ── */}
            {seenOlder.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--color-muted)",
                    padding: "8px 0",
                    userSelect: "none",
                  }}
                >
                  {seenOlder.length} older note{seenOlder.length !== 1 ? "s" : ""} — click to expand
                </summary>
                <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
                  {seenOlder.map((n) => (
                    <NoteCard key={n.id} note={n} isNew={false} />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {totalNotes > SEEN_NOTES_SHOWN && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <Link className="btn" href={`/s/${token}/all`}>
              Browse all {totalNotes} notes →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
