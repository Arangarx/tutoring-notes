import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { canAccessStudentRow, getStudentScope } from "@/lib/student-scope";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { NoteCardActions } from "../NoteCardActions";
import { NotesSearchBar } from "@/components/notes/NotesSearchBar";
import { PageSizeSelect } from "@/components/notes/PageSizeSelect";
import { formatDateOnlyDisplay, formatDateOnlyInput } from "@/lib/date-only";
import { formatUtcTimeSnapped } from "@/lib/time/snap";
import { TutorStudentNoteExpandedBody } from "@/components/notes/TutorStudentNoteExpandedBody";
import { formatNoteTime, safeJsonArray } from "@/lib/notes/display-utils";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;

function formatTimeInput(d: Date | null): string {
  return formatUtcTimeSnapped(d);
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}

export default async function StudentNotesPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { q = "", page = "1", size = String(DEFAULT_PAGE_SIZE) } = await searchParams;

  const scope = await getStudentScope();
  if (scope.kind === "none") redirect("/login");

  const student = await db.student.findUnique({
    where: { id },
    select: { id: true, name: true, adminUserId: true },
  });

  if (!student) notFound();
  if (!canAccessStudentRow(scope, student)) notFound();
  await assertStudentNotErased(id);

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.min(50, Math.max(10, parseInt(size, 10) || DEFAULT_PAGE_SIZE));
  const skip = (pageNum - 1) * pageSize;

  const searchFilter = q.trim()
    ? {
        OR: [
          { topics: { contains: q.trim(), mode: "insensitive" as const } },
          { homework: { contains: q.trim(), mode: "insensitive" as const } },
          { assessment: { contains: q.trim(), mode: "insensitive" as const } },
          { nextSteps: { contains: q.trim(), mode: "insensitive" as const } },
        ],
      }
    : {};

  const [notes, totalCount] = await Promise.all([
    db.sessionNote.findMany({
      where: { studentId: id, ...searchFilter },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip,
      take: pageSize,
      select: {
        id: true,
        date: true,
        topics: true,
        homework: true,
        assessment: true,
        nextSteps: true,
        linksJson: true,
        template: true,
        status: true,
        sentAt: true,
        startTime: true,
        endTime: true,
        recordings: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            mimeType: true,
            durationSeconds: true,
            whiteboardSessionId: true,
          },
        },
        whiteboardSessions: {
          orderBy: { startedAt: "desc" },
          select: { id: true },
        },
      },
    }),
    db.sessionNote.count({ where: { studentId: id, ...searchFilter } }),
  ]);

  const totalPages = Math.ceil(totalCount / pageSize);

  function buildPageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("size", String(pageSize));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/admin/students/${id}/notes${qs ? `?${qs}` : ""}`;
  }

  function PaginationNav({ label }: { label: string }) {
    if (totalPages <= 1) return null;
    return (
      <nav
        aria-label={label}
        className="flex flex-wrap items-center gap-2"
      >
        {pageNum > 1 ? (
          <Button asChild variant="outline" size="sm" className="min-h-9">
            <Link href={buildPageUrl(pageNum - 1)}>← Previous</Link>
          </Button>
        ) : null}
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => Math.abs(p - pageNum) <= 2 || p === 1 || p === totalPages)
          .reduce<(number | "…")[]>((acc, p, idx, arr) => {
            if (idx > 0 && typeof arr[idx - 1] === "number" && (p as number) - (arr[idx - 1] as number) > 1) {
              acc.push("…");
            }
            acc.push(p);
            return acc;
          }, [])
          .map((p, idx) =>
            p === "…" ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                asChild
                variant={p === pageNum ? "secondary" : "outline"}
                size="sm"
                className="min-h-9 min-w-9"
              >
                <Link href={buildPageUrl(p as number)} aria-current={p === pageNum ? "page" : undefined}>
                  {p}
                </Link>
              </Button>
            )
          )}
        {pageNum < totalPages ? (
          <Button asChild variant="outline" size="sm" className="min-h-9">
            <Link href={buildPageUrl(pageNum + 1)}>Next →</Link>
          </Button>
        ) : null}
      </nav>
    );
  }

  return (
    <PageShell realm="admin"
      title={`${student.name} — Session notes`}
      eyebrow={
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <Link href="/admin/students" className="hover:text-foreground">
            Students
          </Link>
          {" / "}
          <Link href={`/admin/students/${id}`} className="hover:text-foreground">
            {student.name}
          </Link>
          {" / "}
          <span className="text-foreground">Notes</span>
        </nav>
      }
      actions={
        <Button asChild variant="outline" className="min-h-11">
          <Link href={`/admin/students/${id}`}>← Back to student</Link>
        </Button>
      }
    >
      <Suspense>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <NotesSearchBar placeholder="Search topics, homework, assessment, plan…" />
          <PageSizeSelect defaultSize={DEFAULT_PAGE_SIZE} />
        </div>
      </Suspense>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {q
            ? `${totalCount} note${totalCount !== 1 ? "s" : ""} matching "${q}"`
            : `${totalCount} note${totalCount !== 1 ? "s" : ""} total`}
          {totalPages > 1 ? ` — page ${pageNum} of ${totalPages}` : ""}
        </p>
        <PaginationNav label="Note pages (top)" />
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? "No notes match your search." : "No notes yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <Card key={n.id} className="border-border bg-card shadow-sm">
              <CardContent className="space-y-4 p-4 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">
                      {formatDateOnlyDisplay(n.date)}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {(n.startTime || n.endTime) && (
                        <span>
                          {formatNoteTime(n.startTime)}{" "}
                          {n.startTime && n.endTime && "–"} {formatNoteTime(n.endTime)}
                          {" · "}
                        </span>
                      )}
                      Status: {n.status}
                      {n.template ? ` · ${n.template}` : ""}
                    </div>
                  </div>
                  <NoteCardActions
                    noteId={n.id}
                    studentId={student.id}
                    status={n.status}
                    sentAt={n.sentAt ? n.sentAt.toISOString() : null}
                    defaultValues={{
                      date: formatDateOnlyInput(n.date),
                      template: n.template ?? "",
                      topics: n.topics,
                      homework: n.homework,
                      assessment: n.assessment,
                      plan: n.nextSteps,
                      links: safeJsonArray(n.linksJson).join("\n"),
                      startTime: formatTimeInput(n.startTime),
                      endTime: formatTimeInput(n.endTime),
                    }}
                  />
                </div>

                <div className="h-px bg-border" />

                <TutorStudentNoteExpandedBody
                  studentId={student.id}
                  topics={n.topics}
                  homework={n.homework}
                  assessment={n.assessment}
                  nextSteps={n.nextSteps}
                  linksJson={n.linksJson}
                  recordings={n.recordings}
                  whiteboardSessions={n.whiteboardSessions}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6">
        <PaginationNav label="Note pages (bottom)" />
      </div>
    </PageShell>
  );
}
