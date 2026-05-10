import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { formatDateOnlyDisplay } from "@/lib/date-only";
import { NotesSearchBar } from "@/components/notes/NotesSearchBar";
import { PageSizeSelect } from "@/components/notes/PageSizeSelect";
import { ParentShareNoteCard } from "@/components/notes/ParentShareNoteCard";
import {
  parentShareRecordingsArgs,
  parentShareWhiteboardSessionsArgs,
} from "@/lib/share/parentShareNotePayload";

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
      where: { studentId: student.id, ...searchFilter },
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
    db.sessionNote.count({ where: { studentId: student.id, ...searchFilter } }),
  ]);

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
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
      >
        {pageNum > 1 && (
          <Link className="btn" href={buildPageUrl(pageNum - 1)}>← Previous</Link>
        )}
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
              <span key={`e${idx}`} style={{ alignSelf: "center", padding: "0 4px" }}>…</span>
            ) : (
              <Link
                key={p}
                className="btn"
                href={buildPageUrl(p as number)}
                aria-current={p === pageNum ? "page" : undefined}
                style={p === pageNum ? { opacity: 0.6, pointerEvents: "none" } : {}}
              >
                {p}
              </Link>
            )
          )}
        {pageNum < totalPages && (
          <Link className="btn" href={buildPageUrl(pageNum + 1)}>Next →</Link>
        )}
      </nav>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <div className="card" style={{ background: "rgba(255,255,255,0.04)" }}>
        {/* Breadcrumb */}
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          <Link href={`/s/${token}`}>← Back to {student.name}&apos;s notes</Link>
        </div>

        <h1 style={{ marginTop: 0, marginBottom: 4 }}>{student.name} — All session notes</h1>

        {/* Toolbar */}
        <Suspense>
          <div className="row" style={{ flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
            <NotesSearchBar placeholder="Search topics, homework, assessment, plan…" />
            <PageSizeSelect defaultSize={DEFAULT_PAGE_SIZE} />
          </div>
        </Suspense>

        {/* Count + top pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {q
              ? `${totalCount} note${totalCount !== 1 ? "s" : ""} matching "${q}"`
              : `${totalCount} note${totalCount !== 1 ? "s" : ""} total`}
            {totalPages > 1 && ` — page ${pageNum} of ${totalPages}`}
          </p>
          <PaginationNav />
        </div>

        {notes.length === 0 ? (
          <p className="muted">{q ? "No notes match your search." : "No notes yet."}</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
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
                  whiteboardSessions: n.whiteboardSessions,
                }}
                isNew={false}
              />
            ))}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <PaginationNav />
        </div>
      </div>
    </div>
  );
}
