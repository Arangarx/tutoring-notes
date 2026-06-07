/**
 * Unit tests for rate-card staleness helpers.
 */

import {
  daysSinceRateCardVerified,
  isRateCardStale,
  RATE_CARD_STALE_DAYS,
  RATE_CARD_VERIFIED_AT,
  VERCEL_BLOB_EGRESS_USD_PER_GB,
} from "@/lib/observability/rate-card";

describe("rate-card staleness", () => {
  test("isRateCardStale is false on verification date", () => {
    expect(isRateCardStale(RATE_CARD_VERIFIED_AT.getTime())).toBe(false);
  });

  test("isRateCardStale is false just under stale threshold", () => {
    const almostStale =
      RATE_CARD_VERIFIED_AT.getTime() +
      RATE_CARD_STALE_DAYS * 24 * 60 * 60 * 1000 -
      1;
    expect(isRateCardStale(almostStale)).toBe(false);
  });

  test("isRateCardStale is true after stale threshold", () => {
    const stale =
      RATE_CARD_VERIFIED_AT.getTime() +
      RATE_CARD_STALE_DAYS * 24 * 60 * 60 * 1000 +
      1;
    expect(isRateCardStale(stale)).toBe(true);
  });

  test("daysSinceRateCardVerified returns 0 on verification date", () => {
    expect(daysSinceRateCardVerified(RATE_CARD_VERIFIED_AT.getTime())).toBe(0);
  });

  test("verified rates match design doc snapshot", () => {
    expect(VERCEL_BLOB_EGRESS_USD_PER_GB).toBe(0.05);
  });
});
