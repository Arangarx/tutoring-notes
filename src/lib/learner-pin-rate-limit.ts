/**
 * Learner PIN rate limiter — IAC-10 LOCKED (supersedes AH-4).
 *
 * Layered policy:
 *   Soft tiers (per username+IP, in-memory):
 *     1–3 failures:  no delay (fat-finger grace)
 *     4–6 failures:  30s cooldown
 *     7–9 failures:  5 min cooldown; nudge "ask a parent"
 *     10–12:         15 min cooldown
 *   Hard lock (per credential handle `familyId:username`, IP-INDEPENDENT, in-memory):
 *     13+ failures:  HARD LOCK — returns `account_locked`; requires parent-side unlock.
 *     Hard lock survives process restart IF using DB-backed storage (current: in-memory).
 *     NOTE: In-memory hard lock resets on server restart (acceptable for pilot; upgrade
 *     to DB-backed for production hardening when needed).
 *
 * Per-IP global limit (all handles): `learner_ip:<ip>` — max 30 req/min (unchanged).
 *
 * Reliability: hard lock is parent-recoverable, not support-ticket permanent (IAC-10).
 *
 * Usage in login handler:
 *   0. isCredentialHardLocked(credKey)     → if true, 423 immediately
 *   1. checkLearnerPinCooldown(u, ip)     → if in cooldown, 429
 *   2. Attempt bcrypt comparison
 *   3a. On failure: recordLearnerPinFailure(u, ip, credKey) → check result
 *   3b. On success: resetLearnerPinFailures(u, ip, credKey)
 *
 * Parent unlock: clearCredentialHardLock(credKey) — called from parent-side server action.
 *
 * Current lockout keying (VERIFIED here):
 *   Soft: `learner_pin:<normalizedUsername>:<ip>` (per username+IP pair)
 *   Hard: `<familyId>:<username>` (the full credential handle, IP-independent)
 *   IP:   `learner_ip:<ip>` (per-IP global, all handles)
 */

import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Soft lockout (per username+IP, in-memory)
// ---------------------------------------------------------------------------

interface PinFailureState {
  count: number;
  cooldownUntil: number; // ms timestamp; 0 = no active cooldown
}

const softFailureStore = new Map<string, PinFailureState>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, state] of softFailureStore) {
    if (state.cooldownUntil <= now && state.count <= 3) softFailureStore.delete(key);
  }
}

function softCooldownSecondsForCount(count: number): number {
  if (count <= 3) return 0;         // free attempts (fat-finger grace)
  if (count <= 6) return 30;        // 30s cooldown
  if (count <= 9) return 300;       // 5 min cooldown
  if (count <= 12) return 900;      // 15 min cooldown
  return 0;                          // 13+ → hard lock (handled separately)
}

export interface LearnerPinCooldownResult {
  inCooldown: boolean;
  retryAfterSeconds: number;
}

/**
 * Check if the username+IP combination is currently in a soft cooldown period.
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
  const existing = softFailureStore.get(key);

  if (existing && existing.cooldownUntil > now) {
    return {
      inCooldown: true,
      retryAfterSeconds: Math.ceil((existing.cooldownUntil - now) / 1000),
    };
  }

  return { inCooldown: false, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Hard lock (per credential handle, IP-independent, in-memory)
// ---------------------------------------------------------------------------

/** Keys are `familyId:username` credential handles */
const hardLockStore = new Set<string>();

/** Per-credential failure counters (global, across all IPs) — drives hard lock */
const credFailureStore = new Map<string, number>();

/** Hard lock threshold — number of IP-independent failures before hard lock. */
const HARD_LOCK_THRESHOLD = 13;

/**
 * Check whether a credential handle is hard-locked (parent unlock required).
 * Returns true if hard-locked; false otherwise.
 */
export async function isCredentialHardLocked(credKey: string): Promise<boolean> {
  return hardLockStore.has(credKey);
}

/**
 * Clear the hard lock for a credential (parent-side unlock).
 * Also resets the global failure counter.
 */
export function clearCredentialHardLock(credKey: string): void {
  hardLockStore.delete(credKey);
  credFailureStore.delete(credKey);
}

// ---------------------------------------------------------------------------
// Record failure (updates both soft + hard counters)
// ---------------------------------------------------------------------------

export interface LearnerPinRecordResult {
  newCooldownSeconds: number;
  failureCount: number;
  lockoutThresholdReached: boolean;
  hardLockTriggered: boolean;
}

/**
 * Record a failed login attempt. Call this AFTER the bcrypt comparison fails.
 * Updates both the soft (username+IP) and hard (credential-level) counters.
 *
 * credKey: `familyId:username` — the IP-independent hard-lock key.
 */
export function recordLearnerPinFailure(
  normalizedUsername: string,
  ip: string,
  credKey: string
): LearnerPinRecordResult {
  // Update soft counter (username+IP)
  const softKey = `learner_pin:${normalizedUsername}:${ip}`;
  const now = Date.now();
  const existingSoft = softFailureStore.get(softKey);
  const prevSoftCount = existingSoft?.count ?? 0;
  const newSoftCount = prevSoftCount + 1;
  const cooldownSeconds = softCooldownSecondsForCount(newSoftCount);
  const cooldownUntil = cooldownSeconds > 0 ? now + cooldownSeconds * 1000 : 0;
  softFailureStore.set(softKey, { count: newSoftCount, cooldownUntil });

  // Update hard counter (credential-level, IP-independent)
  const prevCredCount = credFailureStore.get(credKey) ?? 0;
  const newCredCount = prevCredCount + 1;
  credFailureStore.set(credKey, newCredCount);

  // Trigger hard lock at threshold
  const hardLockTriggered = newCredCount >= HARD_LOCK_THRESHOLD && !hardLockStore.has(credKey);
  if (hardLockTriggered) {
    hardLockStore.add(credKey);
  }

  const lockoutThresholdReached = newSoftCount === 10;

  return {
    newCooldownSeconds: cooldownSeconds,
    failureCount: newSoftCount,
    lockoutThresholdReached,
    hardLockTriggered,
  };
}

/** Reset both soft and hard failure counts for a credential on successful login. */
export function resetLearnerPinFailures(
  normalizedUsername: string,
  ip: string,
  credKey: string
): void {
  softFailureStore.delete(`learner_pin:${normalizedUsername}:${ip}`);
  credFailureStore.delete(credKey);
  // Do NOT clear hard lock on success — requires explicit parent unlock.
  // (If somehow a successful login occurs on a hard-locked account, the lock check
  //  is done BEFORE bcrypt, so this path is only reached for non-hard-locked accounts.)
}

/** Get current soft failure count for testing. */
export function getLearnerPinFailureCount(normalizedUsername: string, ip: string): number {
  return softFailureStore.get(`learner_pin:${normalizedUsername}:${ip}`)?.count ?? 0;
}

/** Get current hard (credential-level) failure count for testing. */
export function getCredentialFailureCount(credKey: string): number {
  return credFailureStore.get(credKey) ?? 0;
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
 * Kept for backward compatibility. credKey defaults to normalizedUsername.
 */
export function checkLearnerPinRateLimit(
  normalizedUsername: string,
  ip: string,
  success = false
): LearnerPinRateLimitResult {
  const credKey = normalizedUsername;
  if (success) {
    resetLearnerPinFailures(normalizedUsername, ip, credKey);
    return { allowed: true, retryAfterSeconds: 0, failureCount: 0, lockoutThresholdReached: false };
  }

  const cooldown = checkLearnerPinCooldown(normalizedUsername, ip);
  if (cooldown.inCooldown) {
    const count = getLearnerPinFailureCount(normalizedUsername, ip);
    return { allowed: false, retryAfterSeconds: cooldown.retryAfterSeconds, failureCount: count, lockoutThresholdReached: false };
  }

  const recorded = recordLearnerPinFailure(normalizedUsername, ip, credKey);
  const allowed = recorded.newCooldownSeconds === 0 && !recorded.hardLockTriggered;
  return {
    allowed,
    retryAfterSeconds: recorded.newCooldownSeconds,
    failureCount: recorded.failureCount,
    lockoutThresholdReached: recorded.lockoutThresholdReached,
  };
}
