"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createWhiteboardSession } from "./actions";

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
 * Legal guardrail: only the per-session in-app attestation gate is removed.
 * The canonical policy text (privacy/terms pages, consent records) is unchanged.
 */
export function StartWhiteboardSession({
  studentId,
}: {
  studentId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setError(null);
    setPending(true);
    try {
      await createWhiteboardSession(studentId);
      // createWhiteboardSession calls redirect() on success, which throws a
      // NEXT_REDIRECT inside the handler. We never reach this line on success.
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

  return (
    <>
      <Button
        type="button"
        variant="accent"
        className="min-h-11 whitespace-nowrap"
        onClick={handleStart}
        disabled={pending}
        data-testid="start-whiteboard-session-btn"
      >
        {pending ? "Starting\u2026" : "Start whiteboard session"}
      </Button>
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
