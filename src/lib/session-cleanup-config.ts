/**
 * Tunables for the board purge and the `/api/cron/session-cleanup` route (consent wave C4b, plan § 3.3).
 * One file so the token lifetime and the second-pass delay cannot disagree, and so the K3 guard can check
 * the budgets against the route's `maxDuration`. Derivations: docs/PLATFORM-ASSUMPTIONS.md § 1.9.
 *
 * No server-only imports: the whiteboard recorder imports the persist interval from here.
 */

/**
 * `validUntil` on every whiteboard upload token (`api/upload/blob`). A token minted before End can still
 * PUT until it expires, so this bounds how long after End a board blob can land. Sized for the 25 MiB asset
 * cap at ~0.35 Mbit/s sustained upload, start to last part.
 */
export const BLOB_UPLOAD_TOKEN_LIFETIME_MS = 10 * 60_000;

/** How often the whiteboard recorder POSTs a batch to the checkpoint route. */
export const WHITEBOARD_SERVER_PERSIST_INTERVAL_MS = 1_000;

/** Slack on top of the token lifetime and the flush window (clock skew, a PUT that started just in time). */
export const BOARD_PURGE_SECOND_PASS_MARGIN_MS = 2 * 60_000;

/** Pass 2 is due this long after pass 1: the latest an in-flight write can still land after End. */
export const BOARD_PURGE_SECOND_PASS_DELAY_MS =
  BLOB_UPLOAD_TOKEN_LIFETIME_MS + WHITEBOARD_SERVER_PERSIST_INTERVAL_MS + BOARD_PURGE_SECOND_PASS_MARGIN_MS;

/** Max purge candidates per cron run. */
export const BOARD_PURGE_SWEEP_BATCH_LIMIT = 25;

/** An intent older than this and still unpurged is logged `board_purge_stuck` on every run. */
export const BOARD_PURGE_STUCK_AFTER_MS = 24 * 60 * 60_000;

/** Cap on the reaper's share of a session-cleanup run (the reaper job lands in C4c). */
export const SESSION_REAPER_TIME_BUDGET_MS = 60_000;

/** The purge's guaranteed minimum window inside a run. Not a timer: the purge runs to the route deadline. */
export const BOARD_PURGE_SWEEP_MIN_WINDOW_MS = 170_000;

/** Kept free under `maxDuration` so a candidate in flight when the deadline passes can finish. */
export const SESSION_CLEANUP_MARGIN_MS = 60_000;
