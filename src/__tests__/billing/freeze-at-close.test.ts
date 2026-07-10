/**
 * @jest-environment node
 */

import { computeBillingFreezeFields } from "@/lib/billing/freeze-at-close";
import { resolveTutorTimezone } from "@/lib/billing/defaults";

const TZ = "America/Denver";
const MS_PER_MIN = 60_000;

function formatLocalTimeHM(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatSessionDateLocal(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Independent oracle: ceil-to-minute then nearest-5 rounding. */
function oracleRoundNearest5(rawMs: number): number {
  const rawMinutes = Math.ceil(Math.max(0, rawMs) / MS_PER_MIN);
  return Math.round(rawMinutes / 5) * 5;
}

describe("computeBillingFreezeFields", () => {
  const startedAtMs = Date.parse("2026-06-15T16:00:00.000Z");
  const activatedAtMs = Date.parse("2026-06-15T16:05:00.000Z");
  const bothConnectedAtMs = Date.parse("2026-06-15T17:00:00.000Z");

  it("returns null when billing was already frozen (idempotent skip)", () => {
    expect(
      computeBillingFreezeFields({
        sessionMode: "LIVE",
        activeMs: 10 * MS_PER_MIN,
        lastActiveAtMs: null,
        endedAtMs: bothConnectedAtMs + 20 * MS_PER_MIN,
        bothConnectedAtMs,
        activatedAtMs,
        startedAtMs,
        roundingIncrementMin: 5,
        roundingMode: "nearest",
        tutorTimezone: TZ,
        adminTutorTimezone: null,
        existingBilledDurationMin: 60,
      })
    ).toBeNull();
  });

  it("LIVE remote bills from activeMs and freezes local window at both-connected anchor", () => {
    const activeMs = 52 * MS_PER_MIN + 30_000; // 52.5 min → ceil 53 → nearest 5 = 55
    const endedAtMs = bothConnectedAtMs + 55 * MS_PER_MIN;
    const expectedMinutes = oracleRoundNearest5(activeMs);

    const result = computeBillingFreezeFields({
      sessionMode: "LIVE",
      activeMs,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs,
      activatedAtMs,
      startedAtMs,
      roundingIncrementMin: 5,
      roundingMode: "nearest",
      tutorTimezone: null,
      adminTutorTimezone: TZ,
      existingBilledDurationMin: null,
    });

    expect(result).not.toBeNull();
    expect(result!.billedDurationMin).toBe(expectedMinutes);
    expect(result!.tutorTimezone).toBe(TZ);
    expect(result!.roundingIncrementMin).toBe(5);
    expect(result!.roundingMode).toBe("nearest");

    const anchor = new Date(bothConnectedAtMs);
    const billedEnd = new Date(bothConnectedAtMs + expectedMinutes * MS_PER_MIN);
    expect(result!.billedStartLocal).toBe(formatLocalTimeHM(anchor, TZ));
    expect(result!.billedEndLocal).toBe(formatLocalTimeHM(billedEnd, TZ));
    expect(result!.sessionDateLocal).toBe(formatSessionDateLocal(anchor, TZ));
  });

  it("IN_PERSON / solo uses ACTIVE-phase wall elapsed when activeMs is ~0", () => {
    const endedAtMs = activatedAtMs + 37 * MS_PER_MIN + 20_000; // 37m20s → ceil 38 → nearest 5 = 40
    const expectedMinutes = oracleRoundNearest5(endedAtMs - activatedAtMs);

    const result = computeBillingFreezeFields({
      sessionMode: "IN_PERSON",
      activeMs: 0,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs: null,
      activatedAtMs,
      startedAtMs,
      roundingIncrementMin: 5,
      roundingMode: "nearest",
      tutorTimezone: TZ,
      adminTutorTimezone: null,
      existingBilledDurationMin: null,
    });

    expect(result).not.toBeNull();
    expect(result!.billedDurationMin).toBe(expectedMinutes);

    const anchor = new Date(activatedAtMs);
    const billedEnd = new Date(activatedAtMs + expectedMinutes * MS_PER_MIN);
    expect(result!.billedStartLocal).toBe(formatLocalTimeHM(anchor, TZ));
    expect(result!.billedEndLocal).toBe(formatLocalTimeHM(billedEnd, TZ));
    expect(result!.sessionDateLocal).toBe(formatSessionDateLocal(anchor, TZ));
  });

  it("falls back to default timezone when session/admin tz is invalid IANA", () => {
    const activeMs = 30 * MS_PER_MIN;
    const endedAtMs = bothConnectedAtMs + 30 * MS_PER_MIN;

    const result = computeBillingFreezeFields({
      sessionMode: "LIVE",
      activeMs,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs,
      activatedAtMs,
      startedAtMs,
      roundingIncrementMin: 5,
      roundingMode: "nearest",
      tutorTimezone: "Not/A_Real_Zone",
      adminTutorTimezone: "Also/Invalid",
      existingBilledDurationMin: null,
    });

    expect(result).not.toBeNull();
    expect(result!.tutorTimezone).toBe("America/Denver");
    expect(resolveTutorTimezone("Not/A_Real_Zone", "Also/Invalid")).toBe(
      "America/Denver"
    );
  });
});
