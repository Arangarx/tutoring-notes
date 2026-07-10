"use client";

import Link from "next/link";
import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";

type Props = {
  studentId?: string;
  studentName?: string;
  durationLabel?: string;
  noteSaved?: boolean;
};

/** Persistent Mynk chrome top bar for the session review surface (hero + replay). */
export function ReviewWbTopBar({
  studentId,
  studentName,
  durationLabel,
  noteSaved,
}: Props) {
  return (
    <header
      className="mynk-wb-topbar wb-review-wb-topbar bg-card border-b border-border"
      role="toolbar"
      aria-label="Session review"
      data-testid="wb-review-wb-topbar"
    >
      <Link href="/" className="mynk-wb-wordmark" aria-label="Mynk">
        Mynk<span className="mynk-wb-wordmark__dot">·</span>
      </Link>
      <span className="mynk-wb-topbar__sep" aria-hidden />

      <div className="mynk-wb-topbar__zone">
        {studentId && studentName ? (
          <>
            <Link
              href={`/admin/students/${studentId}`}
              className="muted"
              style={{ fontSize: 12 }}
              data-testid="review-back-to-student"
            >
              ← Back to {studentName}
            </Link>
            <Link
              href={`/admin/students/${studentId}/notes`}
              className="muted"
              style={{ fontSize: 12, marginLeft: 10 }}
              data-testid="review-all-notes"
            >
              All notes
            </Link>
            <span className="mynk-wb-topbar__sep" aria-hidden />
          </>
        ) : null}
        <div
          className="mynk-wb-live-badge"
          data-testid="wb-review-session-badge"
          style={{
            background: "var(--success-soft, var(--info-soft))",
            color: "var(--success-text, var(--foreground))",
          }}
        >
          Session complete
        </div>
        {durationLabel ? (
          <span className="mynk-wb-timer" data-testid="wb-review-duration">
            <span
              className="wb-review-billable-label"
              data-testid="wb-review-billable-label"
            >
              Your billable time:
            </span>{" "}
            <span data-testid="wb-review-billable-value">{durationLabel}</span>
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minWidth: 0 }} />

      <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
        {noteSaved ? (
          <span
            data-testid="wb-review-notes-saved"
            style={{
              fontSize: 12,
              color: "var(--success-text, var(--text))",
              fontWeight: 500,
              marginRight: 4,
            }}
          >
            ✓ Notes saved
          </span>
        ) : null}
        {studentId ? (
          <Link
            href={`/admin/students/${studentId}`}
            className="btn primary"
            style={{ fontSize: 12, padding: "4px 12px" }}
            data-testid="wb-finish-review"
          >
            Finish review
          </Link>
        ) : null}
        <WbThemeToggle />
      </div>
    </header>
  );
}
