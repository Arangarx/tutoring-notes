import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";

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
      student: {
        include: {
          notes: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            include: {
              recordings: {
                orderBy: { orderIndex: "asc" },
                select: {
                  id: true,
                  mimeType: true,
                  durationSeconds: true,
                  orderIndex: true,
                  whiteboardSessionId: true,
                },
              },
              whiteboardSessions: {
                orderBy: { startedAt: "desc" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (!link || link.revokedAt) notFound();

  const student = link.student;
  const totalNotes = student.notes.length;

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
  if (seenNoteIds.size === 0 && student.notes.length > 0) {
    await db.noteView.createMany({
      data: student.notes.map((n) => ({
        shareToken: token,
        noteId: n.id,
      })),
      skipDuplicates: true,
    });
    student.notes.forEach((n) => seenNoteIds.add(n.id));
  }

  const isReturningVisitor = seenNoteIds.size > 0;

  const tutor = await db.adminUser.findFirst({ select: { displayName: true, email: true } });
  const tutorName = tutor?.displayName?.trim() || tutor?.email?.split("@")[0] || null;

  // Split notes into unseen and seen for layout purposes.
  // On first visit, treat everything as "seen" (no NEW labels — nothing to compare against).
  const unseenNotes = isReturningVisitor
    ? student.notes.filter((n) => !seenNoteIds.has(n.id))
    : [];
  const seenNotes = isReturningVisitor
    ? student.notes.filter((n) => seenNoteIds.has(n.id))
    : student.notes;

  // Seen notes: show first SEEN_NOTES_SHOWN expanded, rest inside <details>.
  const seenTop = seenNotes.slice(0, SEEN_NOTES_SHOWN);
  const seenOlder = seenNotes.slice(SEEN_NOTES_SHOWN);

  function NoteCard({
    note,
    isNew,
  }: {
    note: (typeof student.notes)[number];
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
          whiteboardSessions: note.whiteboardSessions,
        }}
        isNew={isNew}
      />
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
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
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary, #2563eb)", opacity: 0.5 }} />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--color-primary, #2563eb)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    New since your last visit
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--color-primary, #2563eb)", opacity: 0.5 }} />
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
                    <div style={{ flex: 1, height: 1, background: "var(--color-border, #374151)" }} />
                    <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      Previously seen
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--color-border, #374151)" }} />
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
                    color: "var(--color-muted, #6b7280)",
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
