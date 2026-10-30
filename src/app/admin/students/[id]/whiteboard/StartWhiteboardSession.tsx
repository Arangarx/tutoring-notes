"use client";

import { useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { SessionEntryBlocked } from "@/components/scheduling/SessionEntryBlocked";
import { Button } from "@/components/ui/button";
import {
  entryRefusalMessage,
  tutorControlState,
  type SessionEntryState,
} from "@/lib/scheduling/session-entry";
import { createWhiteboardSession } from "./actions";

export type StartWhiteboardSessionProps = {
  studentId: string;
  /** The one entry rule's answer for this student and tutor (`loadSessionEntryState`). */
  entry: SessionEntryState;
  /** For `{name}` in the reason copy. */
  learnerName: string;
  claimInvitesEnabled?: boolean;
  /** Top-of-page UnclaimedParentClaimBanner is shown — callout references it. */
  hasTopClaimBanner?: boolean;
  /** Visible label when the session can start. */
  label?: string;
};

/**
 * "Start whiteboard session" button.
 *
 * The per-session tutor attestation modal (consent checkbox) has been removed.
 * Recording consent is covered durably by the parent's ConsentRecord + the
 * session-scoped consent snapshot frozen at creation time via
 * `createSessionConsentSnapshot`. The session-start flow is now:
 *   create (PENDING) → workspace mounts with waiting overlay →
 *   tutor presses Start in the workspace → ACTIVE.
 *
 * When neither mode can be entered the button is replaced by the reason card
 * (`SessionEntryBlocked`). When only online is blocked the button stays and the
 * reason shows under it (the waiting room then offers in person).
 *
 * Legal guardrail: only the per-session in-app attestation gate is removed.
 * The canonical policy text (privacy/terms pages, consent records) is unchanged.
 */
export function StartWhiteboardSession(props: StartWhiteboardSessionProps) {
  const { studentId } = props;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // SSR HTML is clickable before hydration; that click never runs handleStart.
  const actionsEnabled = useHydrated();

  const { disabledReason, onlineOnlyReason } = tutorControlState(props.entry);
  if (disabledReason) {
    return (
      <SessionEntryBlocked
        size="card"
        reason={disabledReason}
        audience="tutor"
        learnerName={props.learnerName}
        studentId={studentId}
        claimInvitesEnabled={props.claimInvitesEnabled ?? false}
        hasTopClaimBanner={props.hasTopClaimBanner ?? false}
      />
    );
  }

  const handleStart = async () => {
    setError(null);
    setPending(true);
    try {
      // createWhiteboardSession calls redirect() on success, which throws a
      // NEXT_REDIRECT inside the handler. It RETURNS only a refusal (`{ ok: false,
      // reason }`): returned as data because Next redacts a thrown server-action error
      // in a production build, so the reason would never reach the tutor.
      const refusal = await createWhiteboardSession(studentId);
      setError(entryRefusalMessage(refusal.reason, props.learnerName));
      // eslint-disable-next-line no-console
      console.warn("[createWhiteboardSession] refused", { reason: refusal.reason });
    } catch (err) {
      // NEXT_REDIRECT is the success path — let it propagate so the
      // framework can navigate.
      if (
        err &&
        typeof err === "object" &&
        "digest" in err &&
        typeof (err as { digest?: string }).digest === "string" &&
        (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw err;
      }

      // In production, Next.js replaces server-action error messages with a
      // generic string and parks the real failure behind a `digest`. Surface
      // the digest so the tutor can give us a needle to grep Vercel logs by.
      const digest =
        err && typeof err === "object" && "digest" in err
          ? String((err as { digest?: unknown }).digest ?? "")
          : "";
      const rawMsg =
        err instanceof Error ? err.message : "Could not start the session.";
      const isRedacted = rawMsg.includes("omitted in production builds");
      const friendlyMsg = isRedacted
        ? "Could not start the session — the server hit an unexpected error."
        : rawMsg;
      setError(
        digest
          ? `${friendlyMsg}\n\nError ID: ${digest}\n(copy this and send it back so we can find the failure in the server logs).`
          : friendlyMsg
      );
      // eslint-disable-next-line no-console
      console.error("[createWhiteboardSession] failed", {
        digest,
        message: rawMsg,
        err,
      });
    } finally {
      setPending(false);
    }
  };

  const reasonId = "start-whiteboard-session-reason";
  return (
    <>
      <Button
        type="button"
        variant="accent"
        className="min-h-11 whitespace-nowrap"
        onClick={handleStart}
        disabled={!actionsEnabled || pending}
        aria-describedby={onlineOnlyReason ? reasonId : undefined}
        data-testid="start-whiteboard-session-btn"
      >
        {pending ? "Starting\u2026" : (props.label ?? "Start whiteboard session")}
      </Button>
      {onlineOnlyReason ? (
        <SessionEntryBlocked
          size="line"
          id={reasonId}
          reason={onlineOnlyReason}
          audience="tutor"
          learnerName={props.learnerName}
          inPersonStillOpen
          className="mt-2"
          data-testid={reasonId}
        />
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-2 text-sm whitespace-pre-wrap text-destructive break-words"
        >
          {error}
        </p>
      ) : null}
    </>
  );
}
