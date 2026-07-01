/**
 * E5a — admin-only erasure request (immediate tombstone + 7-day grace job).
 *
 * Creates ErasureJob in `requested`, tombstones identity synchronously, revokes
 * sessions via E2 helpers. Blob/DB purge is deferred to processErasureJob (E4).
 *
 * Log prefix: ers (opaque ids only).
 */

import type { ErasureScopeKind } from "@prisma/client";
import { db } from "@/lib/db";
import {
  tombstoneAccountHolder,
  tombstoneLearnerProfile,
  type DbTransactionClient,
} from "@/lib/erasure/tombstone";

const GRACE_DAYS = 7;

const ACTIVE_JOB_STATUSES = ["requested", "blobs_purging", "db_scrubbing"] as const;

export type ErasureScopeInput =
  | { kind: "learner_profile"; learnerProfileId: string }
  | { kind: "account_holder"; accountHolderId: string };

export class ErasureRequestError extends Error {
  readonly code: "not_found" | "confirmation_mismatch" | "invalid_scope";

  constructor(
    message: string,
    code: "not_found" | "confirmation_mismatch" | "invalid_scope"
  ) {
    super(message);
    this.name = "ErasureRequestError";
    this.code = code;
  }
}

function isP2002(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

function scopeKindAndId(scope: ErasureScopeInput): {
  scopeKind: ErasureScopeKind;
  scopeId: string;
} {
  if (scope.kind === "learner_profile") {
    return { scopeKind: "learner_profile", scopeId: scope.learnerProfileId };
  }
  return { scopeKind: "account_holder", scopeId: scope.accountHolderId };
}

async function findActiveErasureJob(scopeKind: ErasureScopeKind, scopeId: string) {
  return db.erasureJob.findFirst({
    where: {
      scopeKind,
      scopeId,
      status: { in: [...ACTIVE_JOB_STATUSES] },
    },
    orderBy: { requestedAt: "asc" },
  });
}

async function validateConfirmation(
  scope: ErasureScopeInput,
  confirmPhrase: string
): Promise<void> {
  if (confirmPhrase === "DELETE") {
    return;
  }

  if (scope.kind === "learner_profile") {
    const profile = await db.learnerProfile.findUnique({
      where: { id: scope.learnerProfileId },
      select: { displayName: true },
    });
    if (!profile) {
      throw new ErasureRequestError("Learner profile not found", "not_found");
    }
    if (confirmPhrase !== profile.displayName) {
      throw new ErasureRequestError(
        "Confirmation phrase does not match learner display name",
        "confirmation_mismatch"
      );
    }
    return;
  }

  const ah = await db.accountHolder.findUnique({
    where: { id: scope.accountHolderId },
    select: { displayName: true },
  });
  if (!ah) {
    throw new ErasureRequestError("Account holder not found", "not_found");
  }
  if (confirmPhrase !== ah.displayName) {
    throw new ErasureRequestError(
      "Confirmation phrase does not match family display name",
      "confirmation_mismatch"
    );
  }
}

async function sweepLearnerThrottleKeysForUsernames(
  tx: DbTransactionClient,
  familyId: string,
  usernames: string[]
): Promise<void> {
  const throttleKeys = usernames.flatMap((username) => {
    const credKey = `${familyId}:${username}`;
    return [`soft:${credKey}`, `hard:${credKey}`];
  });

  if (throttleKeys.length > 0) {
    await tx.learnerLoginThrottle.deleteMany({
      where: { scopeKey: { in: throttleKeys } },
    });
  }
}

async function tombstoneScopeInTransaction(
  tx: DbTransactionClient,
  scope: ErasureScopeInput
): Promise<void> {
  if (scope.kind === "account_holder") {
    await tombstoneAccountHolder(tx, scope.accountHolderId);

    const childProfiles = await tx.learnerProfile.findMany({
      where: {
        accountHolderId: scope.accountHolderId,
        isTestFixture: false,
      },
      select: { id: true },
    });

    for (const child of childProfiles) {
      await tombstoneLearnerProfile(tx, child.id);
    }
    return;
  }

  const profile = await tx.learnerProfile.findUnique({
    where: { id: scope.learnerProfileId },
    select: {
      id: true,
      accountHolder: { select: { familyId: true } },
    },
  });

  if (!profile) {
    throw new ErasureRequestError("Learner profile not found", "not_found");
  }

  const credentials = await tx.learnerCredential.findMany({
    where: { learnerProfileId: scope.learnerProfileId },
    select: { username: true },
  });

  const familyId = profile.accountHolder?.familyId;
  if (familyId && credentials.length > 0) {
    await sweepLearnerThrottleKeysForUsernames(
      tx,
      familyId,
      credentials.map((c) => c.username)
    );
  }

  await tombstoneLearnerProfile(tx, scope.learnerProfileId);
}

/**
 * Admin-initiated erasure request. Immediate tombstone; purge after grace window.
 */
export async function requestErasureByAdmin(
  adminUserId: string,
  scope: ErasureScopeInput,
  confirmPhrase: string
): Promise<{ jobId: string }> {
  await validateConfirmation(scope, confirmPhrase);

  const { scopeKind, scopeId } = scopeKindAndId(scope);

  const existing = await findActiveErasureJob(scopeKind, scopeId);
  if (existing) {
    return { jobId: existing.id };
  }

  const now = new Date();
  const purgeEligibleAt = new Date(
    now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000
  );
  const requestedByPrincipal = `admin:${adminUserId}`;

  try {
    const jobId = await db.$transaction(async (tx) => {
      const job = await tx.erasureJob.create({
        data: {
          scopeKind,
          scopeId,
          status: "requested",
          requestedByPrincipal,
          purgeEligibleAt,
        },
      });

      await tombstoneScopeInTransaction(tx, scope);

      return job.id;
    });

    console.log(
      `[ers] ers=${jobId} action=requested scope=${scopeKind} scopeId=${scopeId} principal=admin:${adminUserId}`
    );

    return { jobId };
  } catch (err) {
    if (isP2002(err)) {
      const raced = await findActiveErasureJob(scopeKind, scopeId);
      if (raced) {
        return { jobId: raced.id };
      }
    }
    throw err;
  }
}
