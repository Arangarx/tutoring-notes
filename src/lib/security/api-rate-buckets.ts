/**
 * Middleware rate-limit buckets for `/api/*` routes.
 *
 * Whiteboard session surfaces poll `active-ping`, `timer-anchor`, and
 * `join-timer` on independent intervals from tutor + each student tab.
 * A single public IP with tutor + two students exceeds a tight global
 * `/api` cap and surfaces 429s (including unrelated reads like replay
 * hydration). These routes stay on their own generous bucket.
 */

export type ApiRateBucket = {
  /** Prefix for `rateLimit(\`${prefix}:${ip}\`, …)` */
  prefix: string;
  max: number;
  windowMs: number;
};

const API_DEFAULT: ApiRateBucket = {
  prefix: "api",
  max: 30,
  windowMs: 60_000,
};

const WHITEBOARD_SESSION_POLL: ApiRateBucket = {
  prefix: "api-wb-poll",
  /** ~4 student tabs × ~17 join-timer/min + tutor heartbeats + margin */
  max: 240,
  windowMs: 60_000,
};

const WB_POLL_PATH_RE =
  /^\/api\/whiteboard\/[^/]+\/(active-ping|timer-anchor|join-timer)$/;

export function apiRateBucketForPath(pathname: string): ApiRateBucket {
  if (WB_POLL_PATH_RE.test(pathname)) return WHITEBOARD_SESSION_POLL;
  return API_DEFAULT;
}
