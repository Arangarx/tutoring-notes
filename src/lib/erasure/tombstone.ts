/**
 * Erasure tombstone WRITE primitives (E2).
 *
 * Sets tombstonedAt + redacts identity fields inside a caller-supplied transaction.
 * ErasureJob row creation, Student PII scrub, and blob purge are deferred to E3/E4.
 *
 * B-7 ordering (tombstoneAccountHolder): revoke sessions → sweep PasswordResetToken
 * and throttle rows by CURRENT PII keys → THEN redact AccountHolder email.
 *
 * Log prefix: ers (opaque ids only — never email, displayName, or other PII).
 */

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { revokeAllAccountHolderSessions } from "@/lib/account-holder-session";
import { revokeAllLearnerDeviceSessions } from "@/lib/learner-session";

export type DbTransactionClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const TOMBSTONE_AH_DISPLAY_NAME = "Deleted account";
const TOMBSTONE_LP_DISPLAY_NAME = "Deleted learner";

function normalizeAccountHolderEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tombstone an AccountHolder: revoke sessions, sweep PII-keyed auth rows, redact fields.
 * Idempotent — safe to call again after a partial E4 crash-resume.
 */
export async function tombstoneAccountHolder(
  tx: DbTransactionClient,
  accountHolderId: string
): Promise<void> {
  const ah = await tx.accountHolder.findUnique({
    where: { id: accountHolderId },
    select: {
      id: true,
      email: true,
      familyId: true,
      tombstonedAt: true,
    },
  });

  if (!ah) {
    console.error(
      `[ers] action=tombstone_account_holder scopeId=${accountHolderId} result=not_found`
    );
    return;
  }

  const sessionsRevoked = await revokeAllAccountHolderSessions(accountHolderId, tx);

  let resetTokensDeleted = 0;
  let authThrottleDeleted = 0;
  let learnerThrottleDeleted = 0;

  if (ah.tombstonedAt === null) {
    const normalizedEmail = normalizeAccountHolderEmail(ah.email);
    const originalFamilyId = ah.familyId;

    // B-7: sweep by ORIGINAL email before redaction (PasswordResetToken has no AH FK).
    const resetResult = await tx.passwordResetToken.deleteMany({
      where: { email: normalizedEmail },
    });
    resetTokensDeleted = resetResult.count;

    if (ah.email !== normalizedEmail) {
      const extraReset = await tx.passwordResetToken.deleteMany({
        where: { email: ah.email },
      });
      resetTokensDeleted += extraReset.count;
    }

    const authResult = await tx.authThrottle.deleteMany({
      where: { scopeKey: `ah-login:${normalizedEmail}` },
    });
    authThrottleDeleted = authResult.count;

    if (originalFamilyId) {
      const credentials = await tx.learnerCredential.findMany({
        where: { accountHolderId },
        select: { username: true },
      });

      const throttleKeys = credentials.flatMap((cred) => {
        const credKey = `${originalFamilyId}:${cred.username}`;
        return [`soft:${credKey}`, `hard:${credKey}`];
      });

      if (throttleKeys.length > 0) {
        const learnerResult = await tx.learnerLoginThrottle.deleteMany({
          where: { scopeKey: { in: throttleKeys } },
        });
        learnerThrottleDeleted = learnerResult.count;
      }
    }

    const tombstoneEmail = `deleted+${randomUUID()}@erased.invalid`;
    await tx.accountHolder.update({
      where: { id: accountHolderId },
      data: {
        email: tombstoneEmail,
        passwordHash: null,
        displayName: TOMBSTONE_AH_DISPLAY_NAME,
        familyId: null,
        tombstonedAt: new Date(),
      },
    });
  }

  console.log(
    `[ers] action=tombstone_account_holder scopeId=${accountHolderId} sessions_revoked=${sessionsRevoked} reset_tokens_deleted=${resetTokensDeleted} auth_throttle_deleted=${authThrottleDeleted} learner_throttle_deleted=${learnerThrottleDeleted}`
  );
}

/**
 * Tombstone a LearnerProfile: revoke device sessions, delete credential, redact displayName.
 * Idempotent — safe to call again after a partial E4 crash-resume.
 */
export async function tombstoneLearnerProfile(
  tx: DbTransactionClient,
  learnerProfileId: string
): Promise<void> {
  const profile = await tx.learnerProfile.findUnique({
    where: { id: learnerProfileId },
    select: { id: true, tombstonedAt: true },
  });

  if (!profile) {
    console.error(
      `[ers] action=tombstone_learner_profile scopeId=${learnerProfileId} result=not_found`
    );
    return;
  }

  const sessionsRevoked = await revokeAllLearnerDeviceSessions(learnerProfileId, tx);

  const credentialsDeleted = await tx.learnerCredential.deleteMany({
    where: { learnerProfileId },
  });

  if (profile.tombstonedAt === null) {
    await tx.learnerProfile.update({
      where: { id: learnerProfileId },
      data: {
        displayName: TOMBSTONE_LP_DISPLAY_NAME,
        tombstonedAt: new Date(),
      },
    });
  }

  console.log(
    `[ers] action=tombstone_learner_profile scopeId=${learnerProfileId} sessions_revoked=${sessionsRevoked} credentials_deleted=${credentialsDeleted.count}`
  );
}
