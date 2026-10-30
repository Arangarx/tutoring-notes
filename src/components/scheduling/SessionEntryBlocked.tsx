import Link from "next/link";
import { Fragment } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ENTRY_CARD_TITLE,
  ENTRY_IN_PERSON_STILL_OPEN,
  ENTRY_UNCLAIMED_NEXT_STEP,
  entryBlockCopy,
  entryCardParagraphs,
  familySafeReason,
  type EntryAudience,
  type EntryBlockReason,
  type EntryControl,
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
  /** Which control the card stands in for; the heading names it. Default `start`. */
  control?: EntryControl;
  claimInvitesEnabled?: boolean;
  /** Top-of-page claim banner is shown — the callout points at it. */
  hasTopClaimBanner?: boolean;
};

export type SessionEntryBlockedProps = LineProps | CardProps;

/**
 * The reason code written to the page. A family only ever sees family-safe codes
 * (the server collapses the rest before they ship); this repeats the rule at the
 * last step so no render path can print an org-internal code for a family.
 */
function renderedReason(reason: EntryBlockReason, audience: EntryAudience): EntryBlockReason {
  return audience === "family" ? familySafeReason(reason) : reason;
}

/** Text with `**bold**` and `{accountLink}` markers (the table's next-step lines). */
function renderMarked(template: string, accountLink: React.ReactNode): React.ReactNode {
  return template.split(/(\*\*[^*]+\*\*|\{accountLink\})/).map((part, index) => {
    if (part === "{accountLink}") return <Fragment key={index}>{accountLink}</Fragment>;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

/**
 * The one component that says why Start / Open room / Join is unavailable.
 * `line`: one visible sentence directly under a control (linked from the control
 * with `aria-describedby`, so it is not tooltip-only).
 * `card`: the full callout on the student page. Every sentence comes from the same
 * copy table as the line (`ENTRY_BLOCK_COPY`); the card adds only the link to Account & sharing.
 */
export function SessionEntryBlocked(props: SessionEntryBlockedProps) {
  if (props.size === "line") {
    const base = entryBlockCopy(props.reason, props.audience, props.learnerName);
    return (
      <p
        id={props.id}
        className={cn("text-xs leading-snug text-muted-foreground", props.className)}
        data-testid={props["data-testid"]}
        data-entry-reason={renderedReason(props.reason, props.audience)}
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
  control = "start",
  claimInvitesEnabled = false,
  hasTopClaimBanner = false,
  "data-testid": testId,
}: CardProps) {
  const shownReason = renderedReason(reason, audience);
  if (reason === "erasure_pending") {
    return (
      <div
        className="rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed text-muted-foreground"
        data-testid={testId ?? "start-wb-erasure-callout"}
        data-entry-reason={shownReason}
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

  const paragraphs = entryCardParagraphs(reason, learnerName);
  let nextStep: string | null = null;
  if (reason === "unclaimed") {
    nextStep = hasTopClaimBanner
      ? ENTRY_UNCLAIMED_NEXT_STEP.withBanner
      : claimInvitesEnabled
        ? ENTRY_UNCLAIMED_NEXT_STEP.claimInvites
        : ENTRY_UNCLAIMED_NEXT_STEP.noInvites;
  }

  const body = (
    <>
      {paragraphs.map((text, index) => (
        <p key={index} className={index > 0 ? "mt-2" : undefined}>
          {text}
        </p>
      ))}
      {nextStep ? <p className="mt-2">{renderMarked(nextStep, accountLink)}</p> : null}
    </>
  );

  return (
    <Alert
      data-testid={testId ?? "start-wb-consent-callout"}
      data-entry-reason={shownReason}
      className="min-w-0 break-words border-warning/40 border-l-[3px] border-l-warning bg-secondary text-secondary-foreground"
      role="alert"
    >
      <AlertTitle>{ENTRY_CARD_TITLE[control]}</AlertTitle>
      <AlertDescription className="text-muted-foreground">{body}</AlertDescription>
    </Alert>
  );
}
