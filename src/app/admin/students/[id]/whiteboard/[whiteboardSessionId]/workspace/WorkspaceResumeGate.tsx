"use client";

/**
 * Resume-or-End gate for the whiteboard workspace.
 *
 * Wraps the live workspace UI. On mount it computes a decision via
 * `deriveResumeGateState`; if the session is stale, it renders a
 * full-card prompt with three actions and HIDES the workspace
 * children until the tutor consents to reconnect. This means the sync
 * client never opens its WebSocket while the gate is showing — a
 * stale student tab can't ghost-join.
 *
 * If the session is fresh (just-started, recent activity, or
 * tutor-solo mode), the gate is invisible and renders children
 * directly so first-load latency is unchanged.
 *
 * Actions:
 *   - Resume → sets consented=true, workspace mounts and reconnects.
 *   - End and review → server-side finalize (WS-C) then navigate to review
 *     overlay — no live workspace mount / waiting-room flash.
 *   - Cancel and delete → confirm-guarded destructive delete via
 *     deleteWhiteboardSessionAndDataAction; returns to student detail.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { finalizeWhiteboardSessionWithOutbox } from "@/lib/recording/finalize-whiteboard-session-client";
import { deleteWhiteboardSessionAndDataAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";import { Button } from "@/components/ui/button";
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
    /** Override the hard-navigation for End and review (avoids jsdom window.location issues). */
    onEndAndReview?: (url: string) => void;
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

  // When `autoConsent` prop changes to true (e.g. after router.push adds
  // ?intent=endreview and the RSC re-renders with autoConsent={true}),
  // update consented so the workspace mounts without requiring a full hard reload.
  useEffect(() => {
    if (autoConsent) {
      setConsented(true);
    }
  }, [autoConsent]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [deleting, startDeleteTransition] = useTransition();
  const [finalizing, startFinalizeTransition] = useTransition();
  if (consented) {
    return <>{children}</>;
  }

  // decision.kind is non-fresh here.
  const copy = describeResumeGate(
    decision as Exclude<typeof decision, { kind: "fresh" }>
  );

  const handleEndAndReview = () => {
    setFinalizeError(null);
    startFinalizeTransition(async () => {
      const result = await finalizeWhiteboardSessionWithOutbox(
        whiteboardSessionId,
        studentId
      );
      if (!result.ok) {
        setFinalizeError(result.error);
        return;
      }
      const url = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`;
      if (__testOverrides?.onEndAndReview) {
        __testOverrides.onEndAndReview(url);
      } else if (typeof window !== "undefined" && window.location.pathname.endsWith("/workspace")) {
        // Already on workspace (gate visible) — soft router.push is a no-op for same URL.
        window.location.assign(url);
      } else {
        router.push(url);
      }
    });
  };
  const handleDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteWhiteboardSessionAndDataAction(whiteboardSessionId);
      if (!result.ok) {
        setDeleteError(result.error ?? "Could not delete the session. Please try again.");
        return;
      }
      router.push(`/admin/students/${studentId}`);
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
          disabled={deleting}
          data-testid="wb-resume-gate-resume"
          autoFocus
        >
          Resume session
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={handleEndAndReview}
          disabled={deleting || finalizing || showDeleteConfirm}
          data-testid="wb-resume-gate-end-and-review"
        >
          {finalizing ? "Finalizing…" : "End and review"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleting || showDeleteConfirm}
          data-testid="wb-resume-gate-cancel-delete"
          style={{ color: "var(--sign-out)" }}
        >
          {deleting ? "Deleting…" : "Cancel and delete"}
        </Button>
      </div>

      {showDeleteConfirm && (
        <div
          role="alertdialog"
          aria-label="Confirm cancel and delete"
          className="rounded-md border p-3 text-sm"
          style={{
            marginTop: 12,
            background: "var(--error-soft)",
            border: "1px solid var(--error-border)",
            maxWidth: 380,
          }}
          data-testid="wb-resume-gate-cancel-delete-confirm"
        >
          <p className="m-0 mb-2 font-semibold" style={{ color: "var(--sign-out)" }}>
            Delete this session and its recording?
          </p>
          <p className="m-0 mb-3 text-xs text-muted-foreground">
            This removes the session row, any audio recording, and any draft notes.
            This can&apos;t be undone.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              style={{
                background: "var(--sign-out)",
                color: "white",
                borderColor: "var(--sign-out)",
              }}
              onClick={handleDelete}
              data-testid="wb-resume-gate-cancel-delete-confirm-yes"
            >
              Yes, delete
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowDeleteConfirm(false)}
              data-testid="wb-resume-gate-cancel-delete-confirm-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {finalizeError && (
        <p
          role="alert"
          style={{ color: "var(--color-error)", marginTop: 12, fontSize: 13 }}
          data-testid="wb-resume-gate-finalize-error"
        >
          {finalizeError}
        </p>
      )}

      {deleteError && (        <p
          role="alert"
          style={{ color: "var(--color-error)", marginTop: 12, fontSize: 13 }}
        >
          {deleteError}
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
