"use client";

/**
 * Banner shown after AI fills the student note form (audio transcribe pipeline
 * or whiteboard-session generation). Mirrors the student-page copy so tutors
 * get one consistent preview/edit cue before clicking Save note.
 */

export type AiGeneratedNoteReviewGateProps = {
  warning?: string | null;
  warningKind?: "skipped-only" | "ai-fallback" | null;
  onDismiss: () => void;
  /** e.g. "Start over" (audio assistant) or "Cancel" (WB preview) */
  dismissButtonLabel?: string;
};

export default function AiGeneratedNoteReviewGate({
  warning,
  warningKind,
  onDismiss,
  dismissButtonLabel = "Start over",
}: AiGeneratedNoteReviewGateProps) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: warning
          ? "var(--color-warning-bg)"
          : "var(--color-success-bg)",
        borderRadius: 6,
        border: warning
          ? "1px solid var(--color-warning-border)"
          : "1px solid var(--color-success-border)",
      }}
      data-testid="ai-generated-note-review-gate"
    >
      <span
        style={{
          color: warning
            ? "var(--color-warning)"
            : "var(--color-success)",
          fontWeight: 600,
          display: "block",
          marginBottom: warning ? 6 : 10,
        }}
        role="status"
      >
        {!warning
          ? "Form filled — review and save."
          : warningKind === "ai-fallback"
          ? "Form needs your edits — please review."
          : "Form filled — heads up below."}
      </span>
      {warning && (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 13,
            color: "var(--color-warning)",
            lineHeight: 1.4,
          }}
          data-testid="ai-warning"
        >
          {warning}
        </p>
      )}
      <button
        type="button"
        className="btn"
        style={{ fontSize: 13 }}
        onClick={onDismiss}
        data-testid="ai-generated-note-review-dismiss"
      >
        {dismissButtonLabel}
      </button>
    </div>
  );
}
