/**
 * Child PIN strength validator.
 *
 * Policy: 6 numeric digits; blocks obvious patterns (sequential, repeated,
 * and a hand-curated blocklist). No adult composition rules — kids enter
 * these frequently on tablets/phones.
 *
 * Online rate-limiting (learner-pin-rate-limit.ts) is the primary brute-force
 * defence; this validator adds a client-visible / server-enforced first line.
 */

const EXACT_BLOCKLIST = new Set([
  "123456",
  "654321",
  "111111",
  "222222",
  "333333",
  "444444",
  "555555",
  "666666",
  "777777",
  "888888",
  "999999",
  "000000",
  "112233",
  "121212",
  "123123",
  "101010",
  "010101",
]);

/** True if the pin contains an ascending or descending sequential run of ≥ 4 digits. */
function hasSequentialRun(pin: string): boolean {
  for (let i = 0; i <= pin.length - 4; i++) {
    const digits = pin.slice(i, i + 4).split("").map(Number);
    const allAscending = digits.every((d, j) => j === 0 || d === digits[j - 1]! + 1);
    const allDescending = digits.every((d, j) => j === 0 || d === digits[j - 1]! - 1);
    if (allAscending || allDescending) return true;
  }
  return false;
}

/** True if the pin contains a run of the same digit repeated ≥ 4 times. */
function hasRepeatedDigitRun(pin: string): boolean {
  for (let i = 0; i <= pin.length - 4; i++) {
    const ch = pin[i];
    if (pin[i + 1] === ch && pin[i + 2] === ch && pin[i + 3] === ch) return true;
  }
  return false;
}

export interface PinValidationResult {
  ok: boolean;
  error?: string;
}

export function validateLearnerPin(pin: string): PinValidationResult {
  if (!/^\d{6}$/.test(pin)) {
    return { ok: false, error: "PIN must be exactly 6 digits." };
  }
  if (EXACT_BLOCKLIST.has(pin)) {
    return { ok: false, error: "That PIN is too easy to guess. Choose a different one." };
  }
  if (hasSequentialRun(pin)) {
    return { ok: false, error: "That PIN is too easy to guess. Avoid sequences like 1234." };
  }
  if (hasRepeatedDigitRun(pin)) {
    return { ok: false, error: "That PIN is too easy to guess. Avoid repeated digits." };
  }
  return { ok: true };
}
