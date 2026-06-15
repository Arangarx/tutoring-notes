"use client";

/**
 * A3 in-shell post-end-session review surface — two-state model (Rev 2/3).
 *
 * States: hero (notes-primary default) ↔ replay (full-viewport in-frame player).
 * Lifted notes state (BLOCKER-1); replay persist-once mount (BLOCKER-2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import TutorNotesSection, {
  parseNoteContent,
  type StructuredNoteFields,
} from "@/components/whiteboard/TutorNotesSection";
import { ReviewHeroLayout } from "./ReviewHeroLayout";
import { ReviewBoardThumbnail } from "./ReviewBoardThumbnail";
import type { ReviewSurfaceState } from "./review-surface-state";
import {
  loadSessionReviewPayload,
  type SessionReviewPayload,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";
import "./whiteboard-chrome.css";

const WhiteboardReplayInFrame = dynamic(
  () =>
    import("@/components/whiteboard/replay/WhiteboardReplayInFrame").then(
      (m) => ({ default: m.WhiteboardReplayInFrame })
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="wb-replay-loading-overlay"
        data-testid="wb-replay-loading"
      >
        Loading replay…
      </div>
    ),
  }
);

const ReplayNotesDrawerPanel = dynamic(
  () =>
    import("@/components/whiteboard/replay/ReplayNotesDrawer").then((m) => ({
      default: m.ReplayNotesDrawerPanel,
    })),
  { ssr: false }
);

const ReplayNotesDrawerToggle = dynamic(
  () =>
    import("@/components/whiteboard/replay/ReplayNotesDrawer").then((m) => ({
      default: m.ReplayNotesDrawerToggle,
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
  const [reviewSurface, setReviewSurface] =
    useState<ReviewSurfaceState>("hero");
  const [hasEnteredReplay, setHasEnteredReplay] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerToggleRef = useRef<HTMLButtonElement | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const [dirtyConfirmOpen, setDirtyConfirmOpen] = useState(false);

  const initialParsedFieldsRef = useRef<StructuredNoteFields | null>(null);
  const [notesFields, setNotesFields] = useState<StructuredNoteFields>({
    topics: "",
    assessment: "",
    nextSteps: "",
    links: "",
  });

  const isDirty = useMemo(() => {
    const initial = initialParsedFieldsRef.current;
    if (!initial) return false;
    return JSON.stringify(notesFields) !== JSON.stringify(initial);
  }, [notesFields]);

  useEffect(() => {
    let cancelled = false;
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_surface_hero_mount`
    );
    void (async () => {
      try {
        const payload = await loadSessionReviewPayload(whiteboardSessionId);
        if (!cancelled) {
          const parsed = parseNoteContent(
            payload.initialNote.found ? payload.initialNote.content : null
          );
          initialParsedFieldsRef.current = parsed;
          setNotesFields(parsed);
          console.log(
            `[nsi] wbsid=${whiteboardSessionId} action=review_mode_loaded hasAudio=${payload.hasAudio} eventCount=${payload.eventCount} noteFound=${payload.initialNote.found}`
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

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (reviewSurface !== "replay") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [reviewSurface]);

  const handleNoteSaved = useCallback(() => {
    setNoteSaved(true);
    if (initialParsedFieldsRef.current) {
      initialParsedFieldsRef.current = { ...notesFields };
    }
  }, [notesFields]);

  const enterReplay = useCallback(() => {
    setHasEnteredReplay(true);
    setReviewSurface("replay");
    setDrawerOpen(false);
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_surface_replay_enter`
    );
  }, [whiteboardSessionId]);

  const requestEnterReplay = useCallback(() => {
    if (isDirty) {
      setDirtyConfirmOpen(true);
      return;
    }
    enterReplay();
  }, [enterReplay, isDirty]);

  const returnToHero = useCallback(() => {
    setReviewSurface("hero");
    setDrawerOpen(false);
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_surface_hero_return from=replay`
    );
  }, [whiteboardSessionId]);

  const handleDrawerOpenChange = useCallback(
    (open: boolean) => {
      setDrawerOpen(open);
      console.log(
        `[nsi] wbsid=${whiteboardSessionId} action=review_notes_drawer_${open ? "open" : "close"} open=${open}`
      );
    },
    [whiteboardSessionId]
  );

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

  const { payload } = loadState;
  const reviewHref = `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`;
  const canReplay = payload.hasAudio || payload.eventCount > 0;

  const topBar = (
    <div
      className="card wb-review-topbar"
      style={{
        padding: "12px 16px",
        background: "var(--success-soft, var(--info-soft))",
        border: "1px solid var(--success-border, var(--info-border))",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 16,
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
  );

  return (
    <div data-testid="wb-session-review-mode" className="wb-session-review-root">
      {reviewSurface === "hero" && (
        <ReviewHeroLayout
          topBar={topBar}
          notesColumn={
            <TutorNotesSection
              whiteboardSessionId={whiteboardSessionId}
              studentId={studentId}
              initialNote={payload.initialNote}
              hasAudio={payload.hasAudio}
              fields={notesFields}
              onFieldsChange={setNotesFields}
              pollSyncAllowed={!isDirty}
              onSaved={handleNoteSaved}
            />
          }
          boardColumn={
            <div style={{ display: "grid", gap: 12 }}>
              <ReviewBoardThumbnail
                eventsProxyUrl={payload.eventsProxyUrl}
                whiteboardSessionId={whiteboardSessionId}
              />
              {canReplay ? (
                <button
                  type="button"
                  className="btn primary"
                  data-testid="wb-review-enter-replay"
                  onClick={requestEnterReplay}
                >
                  ▶ Replay session
                </button>
              ) : (
                <div
                  className="muted"
                  data-testid="wb-review-no-recording"
                  style={{ fontSize: 13, padding: "8px 0" }}
                >
                  No recording available.
                </div>
              )}
            </div>
          }
        />
      )}

      {dirtyConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="wb-review-dirty-confirm"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--background) 40%, transparent)",
          }}
        >
          <div className="card" style={{ padding: 20, maxWidth: 400, margin: 16 }}>
            <p style={{ margin: "0 0 16px", fontSize: 14 }}>
              You have unsaved note changes. Continue to replay?
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                data-testid="wb-review-dirty-stay"
                onClick={() => setDirtyConfirmOpen(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className="btn primary"
                data-testid="wb-review-dirty-continue"
                onClick={() => {
                  setDirtyConfirmOpen(false);
                  enterReplay();
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLOCKER-2: persist-once replay wrapper — never unmount after first enter */}
      {hasEnteredReplay && (
        <div
          className="wb-replay-persist-wrapper"
          data-testid="wb-replay-persist-wrapper"
          aria-hidden={reviewSurface !== "replay"}
          style={{
            display: reviewSurface === "replay" ? "block" : "none",
          }}
        >
          <WhiteboardReplayInFrame
            eventsBlobUrl={payload.eventsProxyUrl}
            audioSegments={payload.audioSegments}
            whiteboardSessionId={whiteboardSessionId}
            studentName={payload.studentName}
            durationSeconds={payload.durationSeconds}
            reviewHref={reviewHref}
            onBackToNotes={returnToHero}
            notesDrawerToggle={
              <ReplayNotesDrawerToggle
                open={drawerOpen}
                onOpenChange={handleDrawerOpenChange}
                toggleRef={drawerToggleRef}
              />
            }
            drawerSlot={
              <ReplayNotesDrawerPanel
                open={drawerOpen}
                onOpenChange={handleDrawerOpenChange}
                whiteboardSessionId={whiteboardSessionId}
                studentId={studentId}
                initialNote={payload.initialNote}
                hasAudio={payload.hasAudio}
                fields={notesFields}
                onFieldsChange={setNotesFields}
                isDirty={isDirty}
                onSaved={handleNoteSaved}
                toggleRef={drawerToggleRef}
              />
            }
          />
        </div>
      )}
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
