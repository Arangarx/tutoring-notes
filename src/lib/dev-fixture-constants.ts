/**
 * Fixture credential constants — safe to import in both server and client code.
 *
 * Extracted from dev-fixtures.ts so client components (DevToolsClient.tsx)
 * can display known credentials without importing server-only modules.
 *
 * FIXTURE_CHILD_PIN: exactly 6 numeric digits, passes validateLearnerPin().
 *   847263 is verified in identity-p2b.test.ts (P2B-PINWEAK-8).
 */

export const FIXTURE_TUTOR_PASSWORD = "DevFixture!Tutor#1";
export const FIXTURE_PARENT_PASSWORD = "DevFixture!Parent#1";

/** 6-digit numeric PIN — matches the real learner PIN constraint (/^\d{6}$/). */
export const FIXTURE_CHILD_PIN = "847263";
