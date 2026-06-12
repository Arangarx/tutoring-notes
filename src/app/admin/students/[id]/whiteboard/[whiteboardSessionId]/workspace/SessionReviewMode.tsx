"use client";

/**
 * A3 in-shell post-end-session review surface (Phase A — functional).
 *
 * Rendered by WhiteboardSessionShell when mode transitions "live" → "review"
 * after handleEndSession completes. Replaces the legacy router.replace
 * navigation to the standalone review page.
 *
 * Composition:
 *   - TutorNotesSection  (notes primary, in-shell save variant — no nav-away)
 *   - Read-only board preview  (WorkspacePreviousSessionPreview)
 *   - Lazy "Review video while editing" drill-down (WhiteboardReplay, on-click only)
 *
 * Data: calls loadSessionReviewPayload() server action on mount.
 * The session just ended so endedAt is set; the action will find the row.
 *
 * Phase B TODOs (deferred — do NOT build here):
 *   - Full notes-primary visual layout per whiteboard-session-shell-mock-2026-06-08.html
 *   - End-confirmation modal (replace native window.confirm on End button)
 *   - Mobile board/video overlay (slide-in from right)
 *   - "Return to board" escape hatch (design Q6 unresolved)
 *   - Top-bar "Session complete · [Student] · 14m · [Close]" chrome
 *
 * Logging: [nsi] wbsid=<id> action=review_mode_* per mount transition.
 */

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import TutorNotesSection from "@/components/whiteboard/TutorNotesSection";
import { WorkspacePreviousSessionPreview } from "./WorkspacePreviousSessionPreview";
import {
  loadSessionReviewPayload,
  type SessionReviewPayload,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";

// Lazy-load WhiteboardReplay — only mounted when the tutor clicks
// "Review video while editing". Avoids prefetching audio/video on review entry.
const WhiteboardReplay = dynamic(
  () =>
    import("@/components/whiteboard/WhiteboardReplay").then((m) => ({
      default: m.default,
    })),
  { ssr: false }
);

type Props = {
  whiteboardSessionId: string;
  studentId: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; payload: SessionReviewPayload }
  | { kind: "error"; message: string };

export function SessionReviewMode({ whiteboardSessionId, studentId }: Props) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [replayOpen, setReplayOpen] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_mode_mount`
    );
    void (async () => {
      try {
        const payload = await loadSessionReviewPayload(whiteboardSessionId);
        if (!cancelled) {
          console.log(
            `[nsi] wbsid=${whiteboardSessionId} action=review_mode_loaded hasAudio=${payload.hasAudio} noteFound=${payload.initialNote.found}`
          );
          setLoadState({ kind: "ready", payload });
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Could not load review data.";
          console.warn(
            `[nsi] wbsid=${whiteboardSessionId} action=review_mode_load_error err=${message}`
          );
          setLoadState({ kind: "error", message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [whiteboardSessionId]);

  const handleNoteSaved = useCallback(() => {
    setNoteSaved(true);
  }, []);

  // ---- Loading state -------------------------------------------------------

  if (loadState.kind === "loading") {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "var(--muted)",
          fontSize: 14,
        }}
        data-testid="wb-review-loading"
      >
        Loading review…
      </div>
    );
  }

  // ---- Error state ---------------------------------------------------------

  if (loadState.kind === "error") {
    return (
      <div
        className="card"
        style={{
          padding: "16px",
          background: "var(--error-soft)",
          border: "1px solid var(--error-border)",
          fontSize: 13,
          color: "var(--sign-out)",
        }}
        data-testid="wb-review-error"
      >
        <strong>Could not load review data.</strong> {loadState.message}
        <div style={{ marginTop: 8 }}>
          <a
            href={`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`}
            className="btn"
          >
            Open full review page
          </a>
        </div>
      </div>
    );
  }

  // ---- Ready state ---------------------------------------------------------

  const { payload } = loadState;
  const reviewHref = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`;

  return (
    <div
      style={{ display: "grid", gap: 16 }}
      data-testid="wb-session-review-mode"
    >
      {/* Top bar — "Session complete" heading + duration */}
      <div
        className="card"
        style={{
          padding: "12px 16px",
          background: "var(--success-soft, var(--info-soft))",
          border: "1px solid var(--success-border, var(--info-border))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Session complete — {payload.studentName}
          </div>
          {payload.durationSeconds != null && (
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {formatDuration(payload.durationSeconds)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {noteSaved && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: "var(--success-text, var(--text))",
                fontWeight: 500,
              }}
            >
              ✓ Notes saved
            </span>
          )}
          <a href={reviewHref} className="btn" style={{ fontSize: 12 }}>
            Open full replay
          </a>
        </div>
      </div>

      {/* Two-column layout: notes primary, board secondary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
          gap: 16,
          alignItems: "start",
        }}
        className="wb-review-layout"
      >
        {/* Left: Notes */}
        <div style={{ display: "grid", gap: 12 }}>
          <TutorNotesSection
            whiteboardSessionId={whiteboardSessionId}
            studentId={studentId}
            initialNote={payload.initialNote}
            hasAudio={payload.hasAudio}
            onSaved={handleNoteSaved}
          />
        </div>

        {/* Right: Board preview + lazy replay */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Read-only board final-frame preview */}
          <WorkspacePreviousSessionPreview
            whiteboardSessionId={whiteboardSessionId}
            studentId={studentId}
            studentName={payload.studentName}
            startedAtIso={payload.startedAtIso}
            endedAtIso={payload.endedAtIso ?? new Date().toISOString()}
            durationSeconds={payload.durationSeconds}
            eventsProxyUrl={payload.eventsProxyUrl}
            snapshotProxyUrl={payload.snapshotProxyUrl}
            reviewHref={reviewHref}
          />

          {/* Lazy replay drill-down */}
          {payload.hasAudio && (
            <div style={{ display: "grid", gap: 8 }}>
              {!replayOpen ? (
                <button
                  type="button"
                  className="btn"
                  style={{ justifySelf: "start" }}
                  onClick={() => setReplayOpen(true)}
                  data-testid="wb-review-open-replay"
                >
                  ▶ Review video while editing
                </button>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      Session recording
                    </span>
                    <button
                      type="button"
                      className="btn"
                      style={{ fontSize: 12, padding: "2px 8px" }}
                      onClick={() => setReplayOpen(false)}
                      data-testid="wb-review-close-replay"
                    >
                      ✕ Close player
                    </button>
                  </div>
                  <WhiteboardReplay
                    eventsBlobUrl={payload.eventsProxyUrl}
                    audioSegments={payload.audioSegments}
                    snapshotBlobUrl={payload.snapshotProxyUrl}
                    title={`Recording — ${payload.studentName}`}
                    whiteboardSessionId={whiteboardSessionId}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Responsive override: single column on narrow viewports */}
      <style>{`
        @media (max-width: 768px) {
          .wb-review-layout {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
