import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingScheduledSessionRow } from "@/lib/scheduling/upcoming-sessions";
import { JoinScheduledSessionButton } from "./JoinScheduledSessionButton";
import { OpenScheduledRoomButton } from "./OpenScheduledRoomButton";
import { UpcomingSessionRow } from "./UpcomingSessionRow";

type UpcomingSessionsCardProps = {
  title?: string;
  description?: string;
  sessions: UpcomingScheduledSessionRow[];
  mode: "tutor" | "family";
  realm?: "admin" | "account" | "student";
  emptyMessage?: string;
  /**
   * An appointment whose control is already the page's main control. Its row is
   * listed without an action, so one appointment never shows two Open room controls.
   */
  promotedId?: string | null;
};

export function UpcomingSessionsCard({
  title = "Upcoming sessions",
  description = "Scheduled tutoring appointments.",
  sessions,
  mode,
  realm = mode === "tutor" ? "admin" : "account",
  emptyMessage = "No upcoming sessions scheduled.",
  promotedId = null,
}: UpcomingSessionsCardProps) {
  return (
    <Card
      className="rounded-[10px] border-border shadow-sm"
      data-realm={realm}
      data-testid="upcoming-sessions-card"
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="upcoming-sessions-empty">
            {emptyMessage}
          </p>
        ) : (
          <ul
            role="list"
            className="overflow-hidden rounded-[10px] border border-border bg-background"
            data-testid="upcoming-sessions-list"
          >
            {sessions.map((session) => (
              <UpcomingSessionRow
                key={session.id}
                data-testid={`upcoming-session-row-${session.id}`}
                subject={session.subject}
                startAtIso={session.startAt.toISOString()}
                learnerLabel={
                  mode === "family" ? session.learnerDisplayName ?? undefined : undefined
                }
                action={
                  session.id === promotedId ? null : mode === "tutor" ? (
                    <OpenScheduledRoomButton
                      scheduledSessionId={session.id}
                      entry={session.entry}
                      learnerName={session.learnerDisplayName ?? ""}
                    />
                  ) : (
                    <JoinScheduledSessionButton
                      scheduledSessionId={session.id}
                      startAtIso={session.startAt.toISOString()}
                      endAtIso={session.endAt.toISOString()}
                      entry={session.entry}
                      learnerName={session.learnerDisplayName ?? ""}
                    />
                  )
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
