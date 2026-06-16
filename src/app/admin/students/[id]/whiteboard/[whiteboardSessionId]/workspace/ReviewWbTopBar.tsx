"use client";

import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";

type Props = {
  studentName?: string;
  durationLabel?: string;
  noteSaved?: boolean;
};

/** Persistent Mynk chrome top bar for the session review surface (hero + replay). */
export function ReviewWbTopBar({
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
      <span className="mynk-wb-wordmark" aria-label="Mynk">
        Mynk<span className="mynk-wb-wordmark__dot">·</span>
      </span>
      <span className="mynk-wb-topbar__sep" aria-hidden />

      <div className="mynk-wb-topbar__zone">
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
        {studentName ? (
          <span className="muted" style={{ fontSize: 12, paddingLeft: 4 }}>
            {studentName}
          </span>
        ) : null}
        {durationLabel ? (
          <span className="mynk-wb-timer" data-testid="wb-review-duration">
            {durationLabel}
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
        <WbThemeToggle />
      </div>
    </header>
  );
}
