import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { assertCanAccessShareLink } from "@/lib/share-access-scope";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { NotesSearchBar } from "@/components/notes/NotesSearchBar";
import { PageSizeSelect } from "@/components/notes/PageSizeSelect";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import { PageShell } from "@/components/PageShell";
import {
  parentShareRecordingsArgs,
  parentShareWhiteboardSessionsArgs,
} from "@/lib/share/parentShareNotePayload";
import {
  loadWhiteboardReplayIdsByNoteIds,
  mergeWhiteboardStubsForShareCard,
} from "@/lib/share/loadWhiteboardReplayIdsForNotes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "All session notes",
    robots: { index: false, follow: false },
  };
}

const DEFAULT_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ q?: string; page?: string; size?: string }>;
}

export default async function ShareAllPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { q = "", page = "1", size = String(DEFAULT_PAGE_SIZE) } = await searchParams;

  const access = await assertCanAccessShareLink(token, `/s/${token}/all`);
  await assertStudentNotErased(access.studentId, { salToken: token });

  const link = await db.shareLink.findUnique({
    where: { token },
    include: { student: { select: { id: true, name: true } } },
  });
  if (!link || link.revokedAt) notFound();

  const { student } = link;

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
      where: { studentId: student.id, status: { not: "DRAFT" }, ...searchFilter },
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
        startTime: true,
        endTime: true,
        shareRecordingInEmail: true,
        recordings: parentShareRecordingsArgs,
        whiteboardSessions: parentShareWhiteboardSessionsArgs,
      },
    }),
    db.sessionNote.count({ where: { studentId: student.id, status: { not: "DRAFT" }, ...searchFilter } }),
  ]);

  const whiteboardIdsByNote = await loadWhiteboardReplayIdsByNoteIds(
    notes.map((n) => n.id)
  );

  const totalPages = Math.ceil(totalCount / pageSize);

  function buildPageUrl(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("size", String(pageSize));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return `/s/${token}/all${qs ? `?${qs}` : ""}`;
  }

  function PaginationNav() {
    if (totalPages <= 1) return null;
    return (
      <nav
        aria-label="Note pages"
        className="flex flex-wrap items-center gap-2"
      >
        {pageNum > 1 ? (
          <Button variant="outline" size="sm" asChild>
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
              <span key={`e${idx}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === pageNum ? "secondary" : "outline"}
                size="sm"
                className={cn(p === pageNum && "pointer-events-none opacity-60")}
                asChild={p !== pageNum}
                aria-current={p === pageNum ? "page" : undefined}
              >
                {p === pageNum ? (
                  <span>{p}</span>
                ) : (
                  <Link href={buildPageUrl(p as number)}>{p}</Link>
                )}
              </Button>
            )
          )}
        {pageNum < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={buildPageUrl(pageNum + 1)}>Next →</Link>
          </Button>
        ) : null}
      </nav>
    );
  }

  return (
    <PageShell
      realm="share"
      studentName={`${student.name} — All session notes`}
      subtitle={
        <Link
          href={`/s/${token}`}
          className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          ← Back to {student.name}&apos;s notes
        </Link>
      }
    >
      <Suspense>
        <div className="flex flex-wrap items-center gap-2">
          <NotesSearchBar placeholder="Search topics, homework, assessment, plan…" />
          <PageSizeSelect defaultSize={DEFAULT_PAGE_SIZE} />
        </div>
      </Suspense>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13px] text-muted-foreground">
          {q
            ? `${totalCount} note${totalCount !== 1 ? "s" : ""} matching "${q}"`
            : `${totalCount} note${totalCount !== 1 ? "s" : ""} total`}
          {totalPages > 1 ? ` — page ${pageNum} of ${totalPages}` : ""}
        </p>
        <PaginationNav />
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q ? "No notes match your search." : "No notes yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <ParentShareNoteCard
              key={n.id}
              token={token}
              dateLabel={formatDateOnlyDisplay(n.date)}
              note={{
                id: n.id,
                date: n.date,
                startTime: n.startTime,
                endTime: n.endTime,
                template: n.template,
                topics: n.topics,
                homework: n.homework,
                assessment: n.assessment,
                nextSteps: n.nextSteps,
                linksJson: n.linksJson,
                shareRecordingInEmail: n.shareRecordingInEmail,
                recordings: n.recordings,
                whiteboardSessions: mergeWhiteboardStubsForShareCard(
                  n,
                  whiteboardIdsByNote.get(n.id)
                ),
              }}
              isNew={false}
            />
          ))}
        </div>
      )}

      <div className="mt-2">
        <PaginationNav />
      </div>
    </PageShell>
  );
}
