import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export type EndedUnsavedWbListItem = {
  id: string;
  startedAt: Date;
  endedAt: Date;
};

/**
 * Renders ended-but-unsaved whiteboard sessions (endedAt set, noteId null)
 * so tutors can open review and choose Save or Delete.
 */
export function EndedUnsavedSessionsList({
  studentId,
  sessions,
  totalCount,
}: {
  studentId: string;
  sessions: readonly EndedUnsavedWbListItem[];
  /** Total ended-but-unsaved count (may exceed `sessions.length`). */
  totalCount: number;
}) {
  if (sessions.length === 0) {
    return null;
  }

  const olderHidden = totalCount - sessions.length;

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="m-0 text-sm font-semibold text-foreground">Ended — needs review</h4>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        These sessions were ended but not saved or deleted. Open one to review and choose
        Save or Delete.
      </p>
      <ul className="m-0 list-none divide-y divide-border p-0">
        {sessions.map((s) => {
          const endedRelative = formatDistanceToNow(s.endedAt, { addSuffix: true });
          return (
            <li
              key={s.id}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/admin/students/${studentId}/whiteboard/${s.id}/workspace`}
                className="min-w-0 flex-1 text-sm text-muted-foreground hover:text-foreground"
              >
                Ended {endedRelative} · Review to save or delete
                <span className="label-mono ml-2 text-[11px] opacity-70">({s.id.slice(0, 8)}…)</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 mb-0 text-[11px] text-muted-foreground">
        Showing sessions ended in the last 30 days
        {olderHidden > 0 ? ` · +${olderHidden} older not shown` : null}
      </p>
    </div>
  );
}
