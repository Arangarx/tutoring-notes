import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ENTRY_BLOCK_COPY } from "@/lib/scheduling/session-entry";
import type {
  FamilyUpcomingScheduledSessionRow,
  UpcomingScheduledSessionRow,
} from "@/lib/scheduling/upcoming-sessions";
import { JoinScheduledSessionButton } from "./JoinScheduledSessionButton";
import { OpenScheduledRoomButton } from "./OpenScheduledRoomButton";
import { UpcomingSessionRow } from "./UpcomingSessionRow";

type CardChrome = {
  title?: string;
  description?: string;
  realm?: "admin" | "account" | "student";
  emptyMessage?: string;
  /**
   * An appointment whose control is already the page's main control. Its row is
   * listed without an action, so one appointment never shows two Open room controls.
   */
  promotedId?: string | null;
};

type UpcomingSessionsCardProps = CardChrome &
  (
    | { mode: "tutor"; sessions: UpcomingScheduledSessionRow[] }
    | { mode: "family"; sessions: FamilyUpcomingScheduledSessionRow[] }
  );

export function UpcomingSessionsCard(props: UpcomingSessionsCardProps) {
  const title = props.title ?? "Upcoming sessions";
  const description = props.description ?? "Scheduled tutoring appointments.";
  const realm = props.realm ?? (props.mode === "tutor" ? "admin" : "account");
  const emptyMessage = props.emptyMessage ?? "No upcoming sessions scheduled.";
  const promotedId = props.promotedId ?? null;

  const rows =
    props.mode === "family"
      ? props.sessions.map((session) => ({
          id: session.id,
          subject: session.subject,
          startAtIso: session.startAt.toISOString(),
          learnerLabel: session.learnerDisplayName ?? undefined,
          action:
            session.id === promotedId ? null : (
              <JoinScheduledSessionButton
                scheduledSessionId={session.id}
                startAtIso={session.startAt.toISOString()}
                endAtIso={session.endAt.toISOString()}
                entry={session.entry}
                learnerName={session.learnerDisplayName ?? ""}
                notYetCopy={ENTRY_BLOCK_COPY.not_yet.family}
                unavailableCopy={ENTRY_BLOCK_COPY.unknown.family}
              />
            ),
        }))
      : props.sessions.map((session) => ({
          id: session.id,
          subject: session.subject,
          startAtIso: session.startAt.toISOString(),
          learnerLabel: undefined,
          action:
            session.id === promotedId ? null : (
              <OpenScheduledRoomButton
                scheduledSessionId={session.id}
                entry={session.entry}
                learnerName={session.learnerDisplayName ?? ""}
              />
            ),
        }));

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
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="upcoming-sessions-empty">
            {emptyMessage}
          </p>
        ) : (
          <ul
            role="list"
            className="overflow-hidden rounded-[10px] border border-border bg-background"
            data-testid="upcoming-sessions-list"
          >
            {rows.map((session) => (
              <UpcomingSessionRow
                key={session.id}
                data-testid={`upcoming-session-row-${session.id}`}
                subject={session.subject}
                startAtIso={session.startAtIso}
                learnerLabel={session.learnerLabel}
                action={session.action}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
