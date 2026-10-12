import type { Prisma } from "@prisma/client";

/**
 * The stale end stamp: set endedAt, participant leftAt, revoke join tokens.
 * Leaves eventsBlobUrl. A second call does not move endedAt.
 * `notesForbidden` is the org "End it now, and no notes" flag, written in
 * the same update as endedAt. Callers that omit it leave the column false.
 */
export async function stampStaleWhiteboardSessionEnd(
  tx: Prisma.TransactionClient,
  whiteboardSessionId: string,
  now: Date,
  notesForbidden = false
): Promise<{ endedAt: Date; durationSeconds: number } | null> {
  const existing = await tx.whiteboardSession.findUnique({
    where: { id: whiteboardSessionId },
    select: { startedAt: true, endedAt: true, durationSeconds: true },
  });
  if (!existing) return null;
  if (existing.endedAt) {
    return {
      endedAt: existing.endedAt,
      durationSeconds: existing.durationSeconds ?? 0,
    };
  }
  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - existing.startedAt.getTime()) / 1000)
  );
  const updated = await tx.whiteboardSession.updateMany({
    where: { id: whiteboardSessionId, endedAt: null },
    data: {
      endedAt: now,
      durationSeconds,
      ...(notesForbidden ? { notesForbidden: true } : {}),
    },
  });
  if (updated.count === 0) {
    const raced = await tx.whiteboardSession.findUnique({
      where: { id: whiteboardSessionId },
      select: { endedAt: true, durationSeconds: true },
    });
    if (!raced?.endedAt) return null;
    return {
      endedAt: raced.endedAt,
      durationSeconds: raced.durationSeconds ?? 0,
    };
  }
  await tx.sessionParticipant.updateMany({
    where: { whiteboardSessionId, leftAt: null },
    data: { leftAt: now },
  });
  await tx.whiteboardJoinToken.updateMany({
    where: { whiteboardSessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  return { endedAt: now, durationSeconds };
}
