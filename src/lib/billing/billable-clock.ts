/**
 * WS-J — mode-aware billable clock source selection (pure, no I/O).
 *
 * LIVE sessions with a remote student bill from `activeMs` (both-connected
 * heartbeats). IN_PERSON and solo LIVE (no `bothConnectedAt`) bill from
 * ACTIVE-phase wall elapsed (activatedAt → close), excluding pre-Start PENDING.
 */

import { computeActivePingUpdate } from "@/lib/whiteboard/active-time";

export type SessionModeForBilling = "LIVE" | "IN_PERSON";

export type BillableClockInput = {
  sessionMode: SessionModeForBilling;
  activeMs: number;
  lastActiveAtMs: number | null;
  endedAtMs: number;
  bothConnectedAtMs: number | null;
  activatedAtMs: number | null;
  startedAtMs: number;
};

/**
 * LIVE with remote participation → both-connected `activeMs` (finalized at close).
 * IN_PERSON or solo LIVE → ACTIVE-phase wall elapsed (pause-aware proxy: excludes
 * PENDING pre-start; remote-disconnect pauses do not apply to in-person/solo).
 */
export function usesBothConnectedClock(input: {
  sessionMode: SessionModeForBilling;
  bothConnectedAtMs: number | null;
}): boolean {
  return input.sessionMode === "LIVE" && input.bothConnectedAtMs !== null;
}

/** Credit any in-progress heartbeat segment through `endedAt` (same rules as active-ping). */
export function finalizeActiveMsAtClose(
  activeMs: number,
  lastActiveAtMs: number | null,
  endedAtMs: number
): number {
  return computeActivePingUpdate({
    nowMs: endedAtMs,
    active: false,
    prevActiveMs: activeMs,
    prevLastActiveAtMs: lastActiveAtMs,
    prevBothConnectedAtMs: null,
  }).activeMs;
}

/** Wall-clock ms from session activation (or row start) through close. */
export function computeActivePhaseElapsedMs(input: {
  activatedAtMs: number | null;
  startedAtMs: number;
  endedAtMs: number;
}): number {
  const anchorMs = input.activatedAtMs ?? input.startedAtMs;
  return Math.max(0, input.endedAtMs - anchorMs);
}

/** Pick the raw billable ms source for rounding at session close. */
export function computeRawBillableMs(input: BillableClockInput): number {
  if (
    usesBothConnectedClock({
      sessionMode: input.sessionMode,
      bothConnectedAtMs: input.bothConnectedAtMs,
    })
  ) {
    return finalizeActiveMsAtClose(
      input.activeMs,
      input.lastActiveAtMs,
      input.endedAtMs
    );
  }

  return computeActivePhaseElapsedMs({
    activatedAtMs: input.activatedAtMs,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
  });
}

/** Billing anchor for local start/end window (ms since epoch). */
export function resolveBillingAnchorMs(input: {
  sessionMode: SessionModeForBilling;
  bothConnectedAtMs: number | null;
  activatedAtMs: number | null;
  startedAtMs: number;
}): number {
  if (
    usesBothConnectedClock({
      sessionMode: input.sessionMode,
      bothConnectedAtMs: input.bothConnectedAtMs,
    })
  ) {
    return (
      input.bothConnectedAtMs ??
      input.activatedAtMs ??
      input.startedAtMs
    );
  }
  return input.activatedAtMs ?? input.startedAtMs;
}
