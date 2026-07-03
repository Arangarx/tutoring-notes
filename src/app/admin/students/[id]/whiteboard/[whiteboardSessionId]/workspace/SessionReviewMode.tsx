"use client";

/**
 * A3 in-shell post-end-session review — unified notes surface (prominent ↔ docked).
 *
 * One TutorNotesSection instance reflows between hero and replay prominence.
 * Replay mounts once (persist-once) without unmounting notes or lossy transitions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import TutorNotesSection, {
  parseNoteContent,
  type StructuredNoteFields,
} from "@/components/whiteboard/TutorNotesSection";
import { WhiteboardReplayInFrame } from "@/components/whiteboard/replay/WhiteboardReplayInFrame";
import { ReviewBoardThumbnail } from "./ReviewBoardThumbnail";
import { ReviewConfirmSlot } from "./ReviewConfirmSlot";
import { ReviewWbTopBar } from "./ReviewWbTopBar";
import type { ReviewSurfaceState } from "./review-surface-state";
import {
  loadSessionReviewPayload,
  type SessionReviewPayload,
} from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { formatReplayDurationMs } from "@/lib/whiteboard/replay-helpers";
import "./whiteboard-chrome.css";

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
  const [hasMountedReplay, setHasMountedReplay] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const initialParsedFieldsRef = useRef<StructuredNoteFields | null>(null);
  const [notesFields, setNotesFields] = useState<StructuredNoteFields>({
    topics: "",
    assessment: "",
    nextSteps: "",
    links: "",
  });

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

  const handleNoteSaved = useCallback(() => {
    setNoteSaved(true);
    if (initialParsedFieldsRef.current) {
      initialParsedFieldsRef.current = { ...notesFields };
    }
  }, [notesFields]);

  const enterReplay = useCallback(() => {
    setHasMountedReplay(true);
    setReviewSurface("replay");
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_surface_replay_enter`
    );
  }, [whiteboardSessionId]);

  const returnToHero = useCallback(() => {
    setReviewSurface("hero");
    console.log(
      `[nsi] wbsid=${whiteboardSessionId} action=review_surface_hero_return from=replay`
    );
  }, [whiteboardSessionId]);

  const isReplay = reviewSurface === "replay";
  const payload = loadState.kind === "ready" ? loadState.payload : null;
  const canReplay =
    payload != null && (payload.hasAudio || payload.eventCount > 0);

  const notesSurface = payload ? (
    <TutorNotesSection
      whiteboardSessionId={whiteboardSessionId}
      studentId={studentId}
      initialNote={payload.initialNote}
      hasAudio={payload.hasAudio}
      fields={notesFields}
      onFieldsChange={setNotesFields}
      onSaved={handleNoteSaved}
      variant={isReplay ? "docked" : "default"}
    />
  ) : (
    <div className="muted" style={{ fontSize: 13, padding: 8 }}>
      Loading session notes…
    </div>
  );

  if (loadState.kind === "error") {
    return (
      <div
        className="wb-session-review-root wb-session-review-root--error"
        data-testid="wb-review-error"
      >
        <div
          className="card"
          style={{
            padding: "16px",
            background: "var(--error-soft)",
            border: "1px solid var(--error-border)",
            fontSize: 13,
            color: "var(--sign-out)",
            maxWidth: 480,
            margin: "auto",
          }}
        >
          <strong>Could not load review data.</strong> {loadState.message}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="wb-session-review-mode"
      className={`wb-session-review-root${isReplay ? " wb-session-review-root--replay-active" : ""}${loadState.kind === "loading" ? " wb-session-review-root--loading" : ""}`}
      data-review-surface={reviewSurface}
    >
      <ReviewWbTopBar
        studentId={studentId}
        studentName={payload?.studentName}
        durationLabel={(() => {
          if (!payload) return undefined;
          // Sum stored per-segment audio durations for the recording length.
          // Falls back to omitting the label when all durations are unknown
          // (null/0) — better than showing the wall-clock session duration
          // which includes idle time and disagrees with the replay scrubber.
          const storedAudioMs = (payload.audioSegments ?? []).reduce<number>(
            (sum, s) => sum + Math.round((s.durationSeconds ?? 0) * 1000),
            0
          );
          return storedAudioMs > 0 ? formatReplayDurationMs(storedAudioMs) : undefined;
        })()}
        noteSaved={noteSaved}
      />

      <div className="wb-review-unified-body" data-testid="wb-review-unified-body">
        <aside
          className={`wb-review-notes-surface${isReplay ? " wb-review-notes-surface--docked" : " wb-review-notes-surface--prominent"}`}
          data-testid={
            isReplay ? "wb-review-notes-docked" : "wb-review-notes-prominent"
          }
        >
          {!isReplay && <ReviewConfirmSlot />}
          {notesSurface}
        </aside>

        <main className="wb-review-main-frame" data-testid="wb-review-main-frame">
          <div
            className={`wb-review-hero-board${isReplay ? " wb-review-hero-board--receded" : ""}`}
            data-testid="wb-review-hero-layout"
            aria-hidden={isReplay}
          >
            <div className="wb-review-board-column">
              <div
                className="wb-review-board-thumbnail-wrap"
                data-testid="wb-review-board-thumbnail-wrap"
              >
                {payload ? (
                  <ReviewBoardThumbnail
                    eventsProxyUrl={payload.eventsProxyUrl}
                    whiteboardSessionId={whiteboardSessionId}
                  />
                ) : (
                  <div
                    data-testid="wb-review-board-thumbnail-loading"
                    className="wb-review-board-thumbnail-placeholder"
                  />
                )}
              </div>
              {canReplay ? (
                <button
                  type="button"
                  className="btn primary wb-review-board-cta"
                  data-testid="wb-review-enter-replay"
                  onClick={enterReplay}
                >
                  ▶ Replay session
                </button>
              ) : payload ? (
                <div
                  className="muted wb-review-board-cta"
                  data-testid="wb-review-no-recording"
                  style={{ fontSize: 13, padding: "8px 0" }}
                >
                  No recording available.
                </div>
              ) : null}
            </div>
          </div>

          {hasMountedReplay && payload && (
            <div
              className={`wb-review-replay-pane${isReplay ? " wb-review-replay-pane--visible" : ""}`}
              data-testid="wb-replay-persist-wrapper"
              aria-hidden={!isReplay}
            >
              <WhiteboardReplayInFrame
                embedded
                isReviewActive={isReplay}
                eventsBlobUrl={payload.eventsProxyUrl}
                audioSegments={payload.audioSegments}
                whiteboardSessionId={whiteboardSessionId}
                studentName={payload.studentName}
                durationSeconds={payload.durationSeconds}
                onHideReplay={returnToHero}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
