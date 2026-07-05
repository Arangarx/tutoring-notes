/**
 * @jest-environment node
 */

import {
  computeActivePhaseElapsedMs,
  computeRawBillableMs,
  finalizeActiveMsAtClose,
  usesBothConnectedClock,
} from "@/lib/billing/billable-clock";

describe("billable-clock", () => {
  const startedAtMs = Date.parse("2026-06-01T10:00:00.000Z");
  const activatedAtMs = Date.parse("2026-06-01T10:05:00.000Z");
  const bothConnectedAtMs = Date.parse("2026-06-01T10:10:00.000Z");
  const endedAtMs = Date.parse("2026-06-01T11:00:00.000Z");

  it("uses both-connected clock for LIVE with remote student", () => {
    expect(
      usesBothConnectedClock({
        sessionMode: "LIVE",
        bothConnectedAtMs,
      })
    ).toBe(true);
    expect(
      usesBothConnectedClock({
        sessionMode: "IN_PERSON",
        bothConnectedAtMs,
      })
    ).toBe(false);
    expect(
      usesBothConnectedClock({
        sessionMode: "LIVE",
        bothConnectedAtMs: null,
      })
    ).toBe(false);
  });

  it("finalizeActiveMsAtClose credits in-progress segment", () => {
    const lastActiveAtMs = endedAtMs - 20_000;
    expect(finalizeActiveMsAtClose(300_000, lastActiveAtMs, endedAtMs)).toBe(
      320_000
    );
  });

  it("computeActivePhaseElapsedMs uses activatedAt when present", () => {
    expect(
      computeActivePhaseElapsedMs({
        activatedAtMs,
        startedAtMs,
        endedAtMs,
      })
    ).toBe(endedAtMs - activatedAtMs);
  });

  it("LIVE remote bills from activeMs (not wall clock)", () => {
    const raw = computeRawBillableMs({
      sessionMode: "LIVE",
      activeMs: 45 * 60_000,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs,
      activatedAtMs,
      startedAtMs,
    });
    expect(raw).toBe(45 * 60_000);
  });

  it("IN_PERSON bills ACTIVE-phase wall elapsed", () => {
    const raw = computeRawBillableMs({
      sessionMode: "IN_PERSON",
      activeMs: 0,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs: null,
      activatedAtMs,
      startedAtMs,
    });
    expect(raw).toBe(endedAtMs - activatedAtMs);
  });

  it("solo LIVE bills ACTIVE-phase wall elapsed when no bothConnectedAt", () => {
    const raw = computeRawBillableMs({
      sessionMode: "LIVE",
      activeMs: 0,
      lastActiveAtMs: null,
      endedAtMs,
      bothConnectedAtMs: null,
      activatedAtMs,
      startedAtMs,
    });
    expect(raw).toBe(endedAtMs - activatedAtMs);
  });
});
