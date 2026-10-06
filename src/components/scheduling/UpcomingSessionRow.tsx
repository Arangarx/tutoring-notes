import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { cn } from "@/lib/utils";

export type UpcomingSessionRowProps = {
  subject: string;
  startAtIso: string;
  learnerLabel?: string;
  action: React.ReactNode;
  joinMessage?: string | null;
  className?: string;
  "data-testid"?: string;
};

/**
 * Single upcoming appointment row — shared by tutor student detail and family dashboards.
 */
export function UpcomingSessionRow({
  subject,
  startAtIso,
  learnerLabel,
  action,
  joinMessage,
  className,
  "data-testid": testId,
}: UpcomingSessionRowProps) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      data-testid={testId}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{subject.trim() || "Tutoring session"}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {learnerLabel ? (
            <>
              <span>{learnerLabel}</span>
              <span aria-hidden="true"> · </span>
            </>
          ) : null}
          <LocalDateTimeText dateTime={startAtIso} className="text-muted-foreground" />
        </p>
        {joinMessage ? (
          <p className="mt-1 text-xs text-muted-foreground" role="status">
            {joinMessage}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>
    </li>
  );
}
