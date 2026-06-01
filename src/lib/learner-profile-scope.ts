/**
 * Server-side ownership guard for LearnerProfile rows.
 *
 * Authorization rule (locked — session-identity-access-design-2026-05-31.md §5.3 + Axis 4):
 *   A LearnerProfile is owned exclusively by the AccountHolder whose id
 *   matches LearnerProfile.accountHolderId. No other principal may access it
 *   via this guard.
 *
 * Callers authenticate the AccountHolder (via their session cookie) and
 * extract accountHolderId BEFORE calling this function. AccountHolder session
 * infrastructure ships in Identity Phase 2; this guard is pre-wired so Phase-2
 * data routes can call it on day one.
 *
 * Log prefix: lpr= (AGENTS.md § Conventions).
 */

import { notFound } from "next/navigation";
import { db, withDbRetry } from "@/lib/db";
import type { LearnerProfile } from "@prisma/client";

/**
 * Assert that `accountHolderId` owns the LearnerProfile identified by
 * `learnerProfileId`. Calls `notFound()` (→ 404, deny-by-default,
 * anti-enumeration) on any of:
 *   - profile does not exist
 *   - profile.accountHolderId !== accountHolderId  (non-owner / cross-tenant)
 *   - profile.tombstonedAt is non-null              (COPPA-deleted / redacted)
 *
 * Returns the full profile row so callers skip a second DB round-trip.
 *
 * This is the highest-blast-radius ownership assertion for the AccountHolder
 * principal. Do not relax the tombstone check — a redacted profile must not
 * expose even its existence to the requesting AccountHolder.
 */
export async function assertOwnsLearnerProfile(
  accountHolderId: string,
  learnerProfileId: string
): Promise<LearnerProfile> {
  const profile = await withDbRetry(
    () =>
      db.learnerProfile.findUnique({
        where: { id: learnerProfileId },
      }),
    { label: "assertOwnsLearnerProfile" }
  );

  if (
    !profile ||
    profile.accountHolderId !== accountHolderId ||
    profile.tombstonedAt !== null
  ) {
    console.error(
      `[lpr] lpr=${learnerProfileId} action=assert_owns_denied accountHolderId=${accountHolderId}`
    );
    notFound();
  }

  return profile;
}
