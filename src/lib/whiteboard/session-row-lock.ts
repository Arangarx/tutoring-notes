import type { Prisma } from "@prisma/client";

/**
 * Lock one WhiteboardSession row for the rest of the transaction (`SELECT … FOR UPDATE`).
 *
 * The one lock End, the shared stale stamp (and later Start and the reaper) take as the FIRST
 * statement of their transaction, so all of them order against each other identically and the
 * session phase read after it cannot change before the transaction commits (consent plan § 3.2).
 * Re-entrant inside one transaction. Returns false when the row does not exist.
 */
export async function lockWhiteboardSessionRowTx(
  tx: Prisma.TransactionClient,
  whiteboardSessionId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "WhiteboardSession" WHERE id = ${whiteboardSessionId} FOR UPDATE`;
  return rows.length > 0;
}
