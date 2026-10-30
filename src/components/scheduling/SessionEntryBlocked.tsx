import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ENTRY_IN_PERSON_STILL_OPEN,
  entryBlockCopy,
  type EntryAudience,
  type EntryBlockReason,
} from "@/lib/scheduling/session-entry";
import { cn } from "@/lib/utils";

type SessionEntryBlockedBase = {
  reason: EntryBlockReason;
  audience: EntryAudience;
  /** The learner's name, for `{name}` in the copy. */
  learnerName: string;
  "data-testid"?: string;
};

type LineProps = SessionEntryBlockedBase & {
  size: "line";
  /** Id for `aria-describedby` on the control the line explains. */
  id?: string;
  /** The room can still be opened in person: say so after the online-off reason. */
  inPersonStillOpen?: boolean;
  className?: string;
};

type CardProps = SessionEntryBlockedBase & {
  size: "card";
  studentId: string;
  claimInvitesEnabled?: boolean;
  /** Top-of-page claim banner is shown — the callout points at it. */
  hasTopClaimBanner?: boolean;
};

export type SessionEntryBlockedProps = LineProps | CardProps;

const CARD_TITLE = "Start whiteboard session unavailable";

/**
 * The one component that says why Start / Open room / Join is unavailable.
 * `line`: one visible sentence directly under a control (linked from the control
 * with `aria-describedby`, so it is not tooltip-only).
 * `card`: the full callout on the student page. Every sentence is keyed by the
 * same `EntryBlockReason` as the line; the card only adds the "what to do next" guidance.
 */
export function SessionEntryBlocked(props: SessionEntryBlockedProps) {
  if (props.size === "line") {
    const base = entryBlockCopy(props.reason, props.audience, props.learnerName);
    return (
      <p
        id={props.id}
        className={cn("text-xs leading-snug text-muted-foreground", props.className)}
        data-testid={props["data-testid"]}
        data-entry-reason={props.reason}
      >
        {props.inPersonStillOpen ? `${base} ${ENTRY_IN_PERSON_STILL_OPEN}` : base}
      </p>
    );
  }
  return <SessionEntryBlockedCard {...props} />;
}

function SessionEntryBlockedCard({
  reason,
  audience,
  learnerName,
  studentId,
  claimInvitesEnabled = false,
  hasTopClaimBanner = false,
  "data-testid": testId,
}: CardProps) {
  if (reason === "erasure_pending") {
    return (
      <div
        className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed text-muted-foreground"
        data-testid={testId ?? "start-wb-erasure-callout"}
        data-entry-reason={reason}
        role="status"
      >
        <p className="m-0 text-foreground">{entryBlockCopy(reason, audience, learnerName)}</p>
      </div>
    );
  }

  const accountLink = (
    <Link
      href={`/admin/students/${studentId}/account`}
      className="font-medium text-accent-text underline underline-offset-2"
    >
      Account &amp; sharing
    </Link>
  );

  let body: React.ReactNode;
  switch (reason) {
    case "unclaimed":
      body = (
        <>
          <p>
            Before you can start a session, the student&apos;s parent must claim this account
            and set privacy preferences.
          </p>
          <p className="mt-2">
            {hasTopClaimBanner ? (
              <>
                Use the <strong className="font-semibold text-foreground">claim link</strong>{" "}
                banner above to create and copy an invite, or open {accountLink} for details.
              </>
            ) : claimInvitesEnabled ? (
              <>Open {accountLink} to create a claim invite or check connection status.</>
            ) : (
              <>
                Parent account linking is not enabled on this site yet. Open {accountLink} for
                more information.
              </>
            )}
          </p>
        </>
      );
      break;
    case "consent_missing_self":
      body = (
        <>
          <p>
            This learner&apos;s privacy preferences are not complete. You cannot start a
            session until they finish them.
          </p>
          <p className="mt-2">
            They finish privacy preferences under Manage → Privacy in their Mynk account.
          </p>
        </>
      );
      break;
    case "consent_missing_parent":
      body = (
        <>
          <p>
            A parent account is connected, but privacy preferences are not complete. You cannot
            start a session until the parent finishes them.
          </p>
          <p className="mt-2">
            Ask the parent to sign in to their Mynk account and complete privacy preferences for
            this learner. They can find this under their child&apos;s profile in Account.
          </p>
        </>
      );
      break;
    default:
      // Every other reason: the one line from the copy table, never blank.
      body = <p>{entryBlockCopy(reason, audience, learnerName)}</p>;
  }

  return (
    <Alert
      data-testid={testId ?? "start-wb-consent-callout"}
      data-entry-reason={reason}
      className="min-w-0 break-words border-warning/40 border-l-[3px] border-l-warning bg-secondary text-secondary-foreground"
      role="alert"
    >
      <AlertTitle>{CARD_TITLE}</AlertTitle>
      <AlertDescription className="text-muted-foreground">{body}</AlertDescription>
    </Alert>
  );
}
