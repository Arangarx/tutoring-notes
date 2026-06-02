/**
 * Learner PIN rate limiter — tiered soft-lockout (AH-4 LOCKED).
 *
 * Policy (§4.4): NEVER hard-lock; use tiered cooldowns only.
 * A missed session due to lockout is a reliability failure equivalent to recorder crash.
 * Tiers are intentionally generous — kids mistype PINs frequently.
 *
 * Failure count (per username+IP) → cooldown tiers:
 *   1–5:   no cooldown (free attempts — 5 tries before any delay)
 *   6–10:  30s cooldown per attempt
 *   11–15: 60s cooldown per attempt
 *   16+:   120s cooldown per attempt; emit lockout_threshold_reached event
 *
 * Cooldown message copy (for the login UI):
 *   During cooldown: "Slow down — try again in [X] seconds."
 *   After cooldown:  show the normal form, no scary "locked out" message.
 *
 * Usage in login handler:
 *   1. checkLearnerPinCooldown(username, ip) → if in cooldown, return 429
 *   2. Attempt bcrypt comparison
 *   3a. On failure: recordLearnerPinFailure(username, ip) → maybe new cooldown
 *   3b. On success: resetLearnerPinFailures(username, ip)
 *
 * Splitting check and record prevents double-counting when the same login
 * attempt calls both.
 *
 * State: in-memory (same infrastructure as rateLimit() in src/lib/rate-limit.ts).
 * Per-IP overflow key: `learner_ip:<ip>` — max 30 req/min (all attempts, not just failures).
 */

import { rateLimit } from "@/lib/rate-limit";

interface PinFailureState {
  count: number;
  cooldownUntil: number; // timestamp when the current cooldown expires (0 = no active cooldown)
}

const failureStore = new Map<string, PinFailureState>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, state] of failureStore) {
    if (state.cooldownUntil <= now && state.count <= 5) failureStore.delete(key);
  }
}

function cooldownSecondsForCount(count: number): number {
  // Tier 1: first 5 attempts — no cooldown (kids mistype frequently)
  if (count <= 5) return 0;
  // Tier 2: attempts 6–10 — 30s cooldown
  if (count <= 10) return 30;
  // Tier 3: attempts 11–15 — 60s cooldown
  if (count <= 15) return 60;
  // Tier 4: 16+ — 120s cooldown; NEVER hard-lock (AH-4 LOCKED)
  return 120;
}

export interface LearnerPinCooldownResult {
  inCooldown: boolean;
  /** 0 when not in cooldown */
  retryAfterSeconds: number;
}

/**
 * Check if the username+IP combination is currently in a cooldown period.
 * Does NOT increment the failure count — call this before the bcrypt attempt.
 */
export function checkLearnerPinCooldown(
  normalizedUsername: string,
  ip: string
): LearnerPinCooldownResult {
  cleanup();

  // Per-IP overflow guard
  const ipBucket = rateLimit(`learner_ip:${ip}`, 30, 60_000);
  if (!ipBucket.allowed) {
    return {
      inCooldown: true,
      retryAfterSeconds: Math.ceil(ipBucket.retryAfterMs / 1000),
    };
  }

  const key = `learner_pin:${normalizedUsername}:${ip}`;
  const now = Date.now();
  const existing = failureStore.get(key);

  if (existing && existing.cooldownUntil > now) {
    return {
      inCooldown: true,
      retryAfterSeconds: Math.ceil((existing.cooldownUntil - now) / 1000),
    };
  }

  return { inCooldown: false, retryAfterSeconds: 0 };
}

export interface LearnerPinRecordResult {
  /** Whether the attempt is blocked by a new cooldown triggered by this failure */
  newCooldownSeconds: number;
  failureCount: number;
  lockoutThresholdReached: boolean;
}

/**
 * Record a failed login attempt. Call this AFTER the bcrypt comparison fails.
 * Returns the cooldown that was just applied (0 = no cooldown for this tier).
 */
export function recordLearnerPinFailure(
  normalizedUsername: string,
  ip: string
): LearnerPinRecordResult {
  const key = `learner_pin:${normalizedUsername}:${ip}`;
  const now = Date.now();
  const existing = failureStore.get(key);
  const prevCount = existing?.count ?? 0;
  const newCount = prevCount + 1;
  const cooldownSeconds = cooldownSecondsForCount(newCount);
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds * 1000 : 0;

  failureStore.set(key, { count: newCount, cooldownUntil });

  const lockoutThresholdReached = newCount === 16;
  return { newCooldownSeconds: cooldownSeconds, failureCount: newCount, lockoutThresholdReached };
}

/** Reset failure count for a username+IP on successful login. */
export function resetLearnerPinFailures(normalizedUsername: string, ip: string): void {
  failureStore.delete(`learner_pin:${normalizedUsername}:${ip}`);
}

/** Get current failure count for testing. */
export function getLearnerPinFailureCount(normalizedUsername: string, ip: string): number {
  return failureStore.get(`learner_pin:${normalizedUsername}:${ip}`)?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Legacy compat shim — kept so existing call sites don't need immediate update
// ---------------------------------------------------------------------------

export interface LearnerPinRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  failureCount: number;
  lockoutThresholdReached: boolean;
}

/**
 * @deprecated Use checkLearnerPinCooldown + recordLearnerPinFailure separately.
 * Kept for backward compatibility.
 */
export function checkLearnerPinRateLimit(
  normalizedUsername: string,
  ip: string,
  success = false
): LearnerPinRateLimitResult {
  if (success) {
    resetLearnerPinFailures(normalizedUsername, ip);
    return { allowed: true, retryAfterSeconds: 0, failureCount: 0, lockoutThresholdReached: false };
  }

  const cooldown = checkLearnerPinCooldown(normalizedUsername, ip);
  if (cooldown.inCooldown) {
    const count = getLearnerPinFailureCount(normalizedUsername, ip);
    return { allowed: false, retryAfterSeconds: cooldown.retryAfterSeconds, failureCount: count, lockoutThresholdReached: false };
  }

  const recorded = recordLearnerPinFailure(normalizedUsername, ip);
  const allowed = recorded.newCooldownSeconds === 0;
  return {
    allowed,
    retryAfterSeconds: recorded.newCooldownSeconds,
    failureCount: recorded.failureCount,
    lockoutThresholdReached: recorded.lockoutThresholdReached,
  };
}
