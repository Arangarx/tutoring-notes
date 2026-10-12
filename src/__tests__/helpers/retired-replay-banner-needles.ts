/**
 * Exact retired replay-banner literals. The source tripwire skips this file
 * because it has to name them. Production and other tests must not.
 */

export const RETIRED_REPLAY_BANNER_NEEDLES = [
  "Multi-part recording",
  "timing may drift",
  "wb-replay-multi-segment-notice",
  "mynk-wb-replay-multi-segment-chip",
] as const;

export const RETIRED_REPLAY_BANNER_HOOKS = {
  testId: RETIRED_REPLAY_BANNER_NEEDLES[2],
  className: RETIRED_REPLAY_BANNER_NEEDLES[3],
} as const;
