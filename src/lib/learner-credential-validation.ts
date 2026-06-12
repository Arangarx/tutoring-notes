/**
 * Shared username + PIN validation for child learner credential setup.
 *
 * Used by claim setup and parent-create credential routes (and their forms).
 */

import { validateLearnerPin, type PinValidationResult } from "@/lib/pin-strength";

export const LEARNER_USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const LEARNER_USERNAME_INVALID_MESSAGE =
  "Username must be 3–20 characters, using only letters, numbers, and underscores.";

export interface UsernameValidationResult {
  ok: boolean;
  error?: string;
  normalized?: string;
}

export function normalizeLearnerUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateLearnerUsername(raw: string): UsernameValidationResult {
  const normalized = normalizeLearnerUsername(raw);
  if (!LEARNER_USERNAME_PATTERN.test(normalized)) {
    return { ok: false, error: LEARNER_USERNAME_INVALID_MESSAGE };
  }
  return { ok: true, normalized };
}

export { validateLearnerPin, type PinValidationResult };
