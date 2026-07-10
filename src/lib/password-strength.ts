/**
 * Shared password-strength validator for all password realms
 * (tutor/admin signup/setup, AccountHolder signup/reset).
 *
 * Policy: min 10 characters, zxcvbn score ≥ 2.
 * No forced composition rules — zxcvbn already penalises dictionary words.
 *
 * Excluded from child PIN validation (separate pin-strength.ts).
 */

import zxcvbn from "zxcvbn";

export const MIN_PASSWORD_LENGTH = 10;
export const MIN_PASSWORD_SCORE = 2; // zxcvbn scale 0–4

export interface PasswordStrengthResult {
  ok: boolean;
  score: number; // 0–4
  feedback: string;
}

/**
 * Validate password strength server-side.
 * Call before hashing. Never pass raw passwords to external services.
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      score: 0,
      feedback: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const result = zxcvbn(password);
  const score = result.score;

  if (score < MIN_PASSWORD_SCORE) {
    const suggestion =
      result.feedback.suggestions[0] ??
      result.feedback.warning ??
      "Try a longer phrase, mix of words, or add more characters.";
    return {
      ok: false,
      score,
      feedback: suggestion,
    };
  }

  return { ok: true, score, feedback: "" };
}
