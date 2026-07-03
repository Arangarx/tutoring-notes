import Link from "next/link";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { SubmitButton } from "@/components/SubmitButton";
import { Button } from "@/components/ui/button";
import { endOpenWhiteboardFromStudentPage } from "./actions";

export type ActiveWbListItem = {
  id: string;
  startedAt: Date;
};

/**
 * Renders still-open (endedAt = null) whiteboard sessions for this
 * student so tutors can **Continue** the workspace or **End** a
 * straggler without hunting down an old tab.
 */
export function ActiveWhiteboardSessionsList({
  studentId,
  sessions,
}: {
  studentId: string;
  sessions: readonly ActiveWbListItem[];
}) {
  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <h4 className="m-0 text-sm font-semibold text-foreground">Open whiteboard sessions</h4>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        These whiteboard rooms are still open — they haven&apos;t been ended yet. Continue one to
        pick up where you left off, or end it to close the room and revoke its join link. Starting
        a new room adds another open session, so end any you&apos;re no longer using.
      </p>
      <ul className="m-0 list-none divide-y divide-border p-0">
        {sessions.map((s) => {
          const startedAtIso = s.startedAt.toISOString();
          return (
            <li
              key={s.id}
              className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                Started{" "}
                <LocalDateTimeText dateTime={startedAtIso} className="text-muted-foreground" />
                <span className="label-mono ml-2 text-[11px] opacity-70">({s.id.slice(0, 8)}…)</span>
              </span>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button asChild variant="accent" className="min-h-11 whitespace-nowrap">
                  <Link
                    href={`/admin/students/${studentId}/whiteboard/${s.id}/workspace`}
                  >
                    Continue
                  </Link>
                </Button>
                <form
                  action={endOpenWhiteboardFromStudentPage}
                  title={`Session ${s.id}`}
                  className="shrink-0"
                >
                  <input type="hidden" name="whiteboardSessionId" value={s.id} />
                  <SubmitButton
                    label="End"
                    pendingLabel="Ending…"
                    variant="outline"
                    className="min-h-11 whitespace-nowrap"
                    aria-label="End this open whiteboard room"
                  />
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
