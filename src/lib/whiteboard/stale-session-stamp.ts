import type { Prisma } from "@prisma/client";
import { freezeConsentSnapshotAtEndTx } from "@/lib/consent-scope";
import { holdPoint } from "@/lib/test-seams";
import { lockWhiteboardSessionRowTx } from "@/lib/whiteboard/session-row-lock";

/**
 * The stale end stamp: set endedAt, participant leftAt, revoke join tokens.
 * Leaves eventsBlobUrl. A second call does not move endedAt.
 * `notesForbidden` is the org "End it now, and no notes" flag, written in
 * the same update as endedAt. Callers that omit it leave the column false.
 *
 * Takes the session row lock first and reads the phase under it. A session still PENDING when
 * this call ends it gets its consent snapshot frozen from the live record (consent plan R1),
 * only after the conditional update changed the row.
 *
 * Clock (SF-F): `endedAt`, `durationSeconds` and participant `leftAt` use the passed `endedAt`
 * (a reaper may pass a back-dated instant); the snapshot `frozenAt` and token `revokedAt` use
 * real server time taken once the row lock is held, so `frozenAt` is never earlier than the
 * consent version it froze.
 */
export async function stampStaleWhiteboardSessionEnd(
  tx: Prisma.TransactionClient,
  whiteboardSessionId: string,
  endedAt: Date,
  notesForbidden = false
): Promise<{ endedAt: Date; durationSeconds: number } | null> {
  await lockWhiteboardSessionRowTx(tx, whiteboardSessionId);
  const serverNow = new Date();
  const existing = await tx.whiteboardSession.findUnique({
    where: { id: whiteboardSessionId },
    select: { startedAt: true, endedAt: true, durationSeconds: true, sessionPhase: true },
  });
  if (!existing) return null;
  if (existing.endedAt) {
    return {
      endedAt: existing.endedAt,
      durationSeconds: existing.durationSeconds ?? 0,
    };
  }
  await holdPoint("end:tx:before_update", whiteboardSessionId);
  const durationSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - existing.startedAt.getTime()) / 1000)
  );
  const updated = await tx.whiteboardSession.updateMany({
    where: { id: whiteboardSessionId, endedAt: null },
    data: {
      endedAt,
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
  if (existing.sessionPhase === "PENDING") {
    await freezeConsentSnapshotAtEndTx(tx, whiteboardSessionId, serverNow, "stale");
  }
  await tx.sessionParticipant.updateMany({
    where: { whiteboardSessionId, leftAt: null },
    data: { leftAt: endedAt },
  });
  await tx.whiteboardJoinToken.updateMany({
    where: { whiteboardSessionId, revokedAt: null },
    data: { revokedAt: serverNow },
  });
  return { endedAt, durationSeconds };
}
