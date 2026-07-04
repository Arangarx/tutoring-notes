"use client";

/**
 * Resume-or-End gate for the whiteboard workspace.
 *
 * Wraps the live workspace UI. On mount it computes a decision via
 * `deriveResumeGateState`; if the session is stale, it renders a
 * full-card prompt with Resume / End buttons and HIDES the workspace
 * children until the tutor consents to reconnect. This means the sync
 * client never opens its WebSocket while the gate is showing — a
 * stale student tab can't ghost-join.
 *
 * If the session is fresh (just-started, recent activity, or
 * tutor-solo mode), the gate is invisible and renders children
 * directly so first-load latency is unchanged.
 *
 * "End" calls `endStaleWhiteboardSession` (no events.json blob URL
 * required) and redirects to the student detail page. We use a
 * router push — the workspace's own server component re-renders the
 * student page next, so the now-ended session shows up in the
 * "Ended — needs review" group on student detail.
 */

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { endStaleWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { Button } from "@/components/ui/button";
import {
  deriveResumeGateState,
  describeResumeGate,
} from "@/lib/whiteboard/resume-gate";
import { markSkipIndexedDbResumeAfterGate } from "@/lib/whiteboard/resume-prompt-flags";

export type WorkspaceResumeGateProps = {
  whiteboardSessionId: string;
  studentId: string;
  /** ISO startedAt of the session row. */
  startedAtIso: string;
  /** ISO of the most recent positive heartbeat (or null = never active). */
  initialLastActiveAtIso: string | null;
  /** Whether live-sync is configured (== whether to gate at all). */
  syncEnabled: boolean;
  /** The actual workspace UI to render once consent is granted. */
  children: React.ReactNode;
  /**
   * When true, bypass the stale-session prompt and render children immediately.
   * Used by the "End and review" roster action so the workspace mounts and the
   * auto-end effect can fire without the tutor having to click "Resume session".
   */
  autoConsent?: boolean;
  /**
   * Inject a Date.now() override + auto-consent skip for tests.
   * Production callers should leave both undefined.
   */
  __testOverrides?: {
    nowMs?: number;
  };
};

export function WorkspaceResumeGate({
  whiteboardSessionId,
  studentId,
  startedAtIso,
  initialLastActiveAtIso,
  syncEnabled,
  children,
  autoConsent,
  __testOverrides,
}: WorkspaceResumeGateProps) {
  const router = useRouter();

  const decision = useMemo(
    () =>
      deriveResumeGateState({
        startedAtMs: new Date(startedAtIso).getTime(),
        lastActiveAtMs: initialLastActiveAtIso
          ? new Date(initialLastActiveAtIso).getTime()
          : null,
        nowMs: __testOverrides?.nowMs ?? Date.now(),
        syncEnabled,
      }),
    [startedAtIso, initialLastActiveAtIso, syncEnabled, __testOverrides?.nowMs]
  );

  // Once the tutor clicks Resume (or autoConsent is set), we never
  // re-evaluate — we don't want a second `useMemo` tick to drag them
  // back into the gate mid-session.
  const [consented, setConsented] = useState(
    decision.kind === "fresh" || Boolean(autoConsent)
  );
  const [endError, setEndError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (consented) {
    return <>{children}</>;
  }

  // decision.kind is non-fresh here.
  const copy = describeResumeGate(
    decision as Exclude<typeof decision, { kind: "fresh" }>
  );

  const handleEnd = () => {
    setEndError(null);
    startTransition(async () => {
      try {
        await endStaleWhiteboardSession(whiteboardSessionId);
        router.push(`/admin/students/${studentId}`);
      } catch (err) {
        setEndError(
          err instanceof Error
            ? err.message
            : "Could not end the session. Please try again."
        );
      }
    });
  };

  return (
    <div
      className="card"
      role="dialog"
      aria-labelledby="wb-resume-gate-title"
      aria-describedby="wb-resume-gate-body"
      data-testid="wb-resume-gate"
      style={{ maxWidth: 560, margin: "40px auto" }}
    >
      <h2 id="wb-resume-gate-title" style={{ marginTop: 0 }}>
        {copy.headline}
      </h2>
      <p id="wb-resume-gate-body" className="muted" style={{ marginBottom: 16 }}>
        {copy.body}
      </p>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button
          type="button"
          variant="accent"
          onClick={() => {
            markSkipIndexedDbResumeAfterGate(whiteboardSessionId);
            setConsented(true);
          }}
          disabled={pending}
          data-testid="wb-resume-gate-resume"
          autoFocus
        >
          Resume session
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleEnd}
          disabled={pending}
          data-testid="wb-resume-gate-end"
        >
          {pending ? "Ending…" : "End session"}
        </Button>
      </div>

      {endError && (
        <p
          role="alert"
          style={{ color: "var(--color-error)", marginTop: 12, fontSize: 13 }}
        >
          {endError}
        </p>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
        Until you choose, this tab is NOT connected to the live whiteboard
        relay. Stale student tabs cannot rejoin while this prompt is showing.
        After you resume, we will not show a second “browser draft” dialog for
        the same check — you can still use local draft restore from the
        whiteboard if needed.
      </p>
    </div>
  );
}
