/**
 * Versioned rate-card — single source of truth for `dollars = usage × rate`.
 * Manually updated on provider price changes; no live scraper.
 *
 * Rate-card version: 2026-06-06
 * Sources: docs/handoff/cost-observability-design-2026-06-06.md §1.2
 * Next verification due: 2026-09-06 (90 days) — see isRateCardStale().
 */

export const RATE_CARD_VERSION = "2026-06-06";
export const RATE_CARD_VERIFIED_AT = new Date("2026-06-06T00:00:00Z");
export const RATE_CARD_STALE_DAYS = 90;

// OpenAI
export const WHISPER_1_USD_PER_AUDIO_MINUTE = 0.006;
export const GPT_4O_MINI_TRANSCRIBE_USD_PER_AUDIO_MINUTE = 0.003;
export const GPT_4O_MINI_INPUT_USD_PER_MTOK = 0.15;
export const GPT_4O_MINI_OUTPUT_USD_PER_MTOK = 0.6;

// Vercel (Pro plan, us-east-1 default region)
export const VERCEL_BLOB_STORAGE_USD_PER_GB_MONTH = 0.023;
export const VERCEL_BLOB_EGRESS_USD_PER_GB = 0.05;
export const VERCEL_FAST_DT_OVERAGE_USD_PER_GB = 0.15;
export const VERCEL_PROVISIONED_MEMORY_USD_PER_GB_HR = 0.0212;

// Neon (Launch plan)
export const NEON_COMPUTE_USD_PER_CU_HR = 0.106;
export const NEON_STORAGE_USD_PER_GB_MONTH = 0.35;
export const NEON_EGRESS_USD_PER_GB = 0.1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** True when the rate-card verification date is older than RATE_CARD_STALE_DAYS. */
export function isRateCardStale(nowMs: number = Date.now()): boolean {
  const msSince = nowMs - RATE_CARD_VERIFIED_AT.getTime();
  return msSince > RATE_CARD_STALE_DAYS * MS_PER_DAY;
}

/** Whole days since RATE_CARD_VERIFIED_AT (for dashboard copy). */
export function daysSinceRateCardVerified(nowMs: number = Date.now()): number {
  const msSince = nowMs - RATE_CARD_VERIFIED_AT.getTime();
  return Math.max(0, Math.floor(msSince / MS_PER_DAY));
}
