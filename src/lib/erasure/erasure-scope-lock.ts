/**
 * Postgres advisory lock keyed on erasure scope — serializes cancel-restore vs
 * re-request for the same scopeKind+scopeId (BLOCKER E).
 *
 * Lock is transaction-scoped (pg_advisory_xact_lock) and released on commit/rollback.
 */

import { createHash } from "node:crypto";
import type { ErasureScopeKind } from "@prisma/client";
import type { DbTransactionClient } from "@/lib/erasure/tombstone";

function erasureScopeAdvisoryLockKeys(
  scopeKind: ErasureScopeKind,
  scopeId: string
): { key1: number; key2: number } {
  const hash = createHash("sha256").update(`${scopeKind}:${scopeId}`).digest();
  return {
    key1: hash.readInt32BE(0),
    key2: hash.readInt32BE(4),
  };
}

/** Acquire a transaction-scoped advisory lock for the erasure scope. */
export async function acquireErasureScopeAdvisoryLock(
  tx: DbTransactionClient,
  scopeKind: ErasureScopeKind,
  scopeId: string
): Promise<void> {
  const { key1, key2 } = erasureScopeAdvisoryLockKeys(scopeKind, scopeId);
  // Prisma binds JS numbers as bigint — cast to int for pg_advisory_xact_lock(int, int).
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock($1::int, $2::int)",
    key1,
    key2
  );
}
