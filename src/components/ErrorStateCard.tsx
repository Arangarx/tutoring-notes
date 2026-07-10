"use client";

import Link from "next/link";

export type ErrorStateCardProps = {
  title: string;
  message: string;
  linkHref: string;
  linkLabel: string;
  /**
   * Global app pages wrap the card in `.container` (maxWidth 560).
   * Admin pages render the card alone.
   */
  withContainer?: boolean;
  /**
   * When set, renders a primary "Try again" button that calls this
   * and places the home/back link as a secondary `.btn` in a `.row`.
   * When unset, only the link is shown as `.btn.primary` (not-found pages).
   */
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * Shared error / not-found card used by app + admin `error.tsx` and
 * `not-found.tsx`. Preserves the legacy `.card` / `.btn` markup byte-for-byte;
 * Wave C will migrate those classes later.
 */
export function ErrorStateCard({
  title,
  message,
  linkHref,
  linkLabel,
  withContainer = false,
  onRetry,
  retryLabel = "Try again",
}: ErrorStateCardProps) {
  const card = (
    <div className="card" style={{ textAlign: "center" }}>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p className="muted">{message}</p>
      {onRetry ? (
        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          <button className="btn primary" onClick={onRetry}>
            {retryLabel}
          </button>
          <Link className="btn" href={linkHref}>
            {linkLabel}
          </Link>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <Link className="btn primary" href={linkHref}>
            {linkLabel}
          </Link>
        </div>
      )}
    </div>
  );

  if (withContainer) {
    return (
      <div className="container" style={{ maxWidth: 560 }}>
        {card}
      </div>
    );
  }

  return card;
}
