/**
 * WS-J — compute frozen billing fields at session close (pure).
 */

import {
  computeRawBillableMs,
  resolveBillingAnchorMs,
  type SessionModeForBilling,
} from "./billable-clock";
import {
  normalizeRoundingIncrement,
  normalizeRoundingMode,
  resolveTutorTimezone,
} from "./defaults";
import { computeBilledLocalWindow } from "./local-window";
import { roundBillableMinutes, type RoundingMode } from "./rounding";

export type BillingFreezeInput = {
  sessionMode: SessionModeForBilling;
  activeMs: number;
  lastActiveAtMs: number | null;
  endedAtMs: number;
  bothConnectedAtMs: number | null;
  activatedAtMs: number | null;
  startedAtMs: number;
  roundingIncrementMin: number | null;
  roundingMode: string | null;
  tutorTimezone: string | null;
  adminTutorTimezone: string | null;
  existingBilledDurationMin: number | null;
};

export type BillingFreezeResult = {
  billedDurationMin: number;
  billedStartLocal: string;
  billedEndLocal: string;
  sessionDateLocal: string;
  tutorTimezone: string;
  roundingIncrementMin: number;
  roundingMode: RoundingMode;
};

/**
 * Returns null when billing was already frozen (idempotent skip).
 */
export function computeBillingFreezeFields(
  input: BillingFreezeInput
): BillingFreezeResult | null {
  if (input.existingBilledDurationMin != null) {
    return null;
  }

  const incrementMin = normalizeRoundingIncrement(input.roundingIncrementMin);
  const mode = normalizeRoundingMode(input.roundingMode);
  const timeZone = resolveTutorTimezone(
    input.tutorTimezone,
    input.adminTutorTimezone
  );

  const rawMs = computeRawBillableMs({
    sessionMode: input.sessionMode,
    activeMs: input.activeMs,
    lastActiveAtMs: input.lastActiveAtMs,
    endedAtMs: input.endedAtMs,
    bothConnectedAtMs: input.bothConnectedAtMs,
    activatedAtMs: input.activatedAtMs,
    startedAtMs: input.startedAtMs,
  });

  const billedDurationMin = roundBillableMinutes(rawMs, incrementMin, mode);
  const anchorMs = resolveBillingAnchorMs({
    sessionMode: input.sessionMode,
    bothConnectedAtMs: input.bothConnectedAtMs,
    activatedAtMs: input.activatedAtMs,
    startedAtMs: input.startedAtMs,
  });
  const window = computeBilledLocalWindow(anchorMs, billedDurationMin, timeZone);

  return {
    billedDurationMin,
    ...window,
    tutorTimezone: timeZone,
    roundingIncrementMin: incrementMin,
    roundingMode: mode,
  };
}
