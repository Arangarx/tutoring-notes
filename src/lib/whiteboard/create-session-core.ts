/**
 * The one path that mints a `WhiteboardSession` row.
 *
 * Callers authorize the principal first (tutor: `assertOwnsStudent`; learner
 * dashboard: the scheduled appointment belongs to them). This core then runs
 * the rules every session needs, in order:
 *
 *   1. erasure block
 *   2. tutor approval (B1 cost gate — no cost before approval)
 *   3. CC-1 consent record (before the Blob write, so no orphan Blob)
 *   4. empty events.json to Blob (the row's `eventsBlobUrl` is non-null)
 *   5. one transaction: row + consent snapshot + SessionParticipant
 *
 * If step 4 succeeds and step 5 fails we leave one orphaned empty
 * events.json — non-fatal, kept for simplicity (a delete would still race).
 *
 * `scheduledSessionId` makes the call get-or-create: one whiteboard session
 * per appointment (unique column). A double click, or a tutor and a learner
 * arriving together, return the same session; the losing call's empty Blob
 * is the same accepted orphan. Creation never starts billing or recording —
 * the row starts PENDING.
 *
 * SERVER-ONLY.
 */

import { put } from "@vercel/blob";
import { Prisma } from "@prisma/client";
import {
  harnessRequestOrigin,
  harnessServerPut,
  isBlobHarnessActive,
} from "@/lib/blob-harness";
import { db, withDbRetry } from "@/lib/db";
import { assertTutorApproved } from "@/lib/tutor-approval-scope";
import {
  assertConsentRecordExists,
  createSessionConsentSnapshot,
  ConsentError,
} from "@/lib/consent-scope";
import {
  ErasureAccessSuspendedError,
  isWhiteboardSessionBlockedByErasure,
} from "@/lib/erasure/active-erasure-scope";
import { logProductEvent } from "@/lib/observability/product-events";
import { mintServerLiveKey } from "@/lib/whiteboard/live-key";

export const PHASE1_SCHEMA_VERSION = 1;

function emptyEventsJson(startedAtIso: string): string {
  return JSON.stringify({
    schemaVersion: PHASE1_SCHEMA_VERSION,
    startedAt: startedAtIso,
    durationMs: 0,
    events: [],
  });
}

export type CreateWhiteboardSessionCoreInput = {
  adminUserId: string;
  studentId: string;
  rid: string;
  scheduledSessionId?: string;
};

export type CreateWhiteboardSessionCoreResult = {
  id: string;
  studentId: string;
  created: boolean;
};

async function findForSchedule(
  scheduledSessionId: string
): Promise<{ id: string; studentId: string } | null> {
  return withDbRetry(
    () =>
      db.whiteboardSession.findUnique({
        where: { scheduledSessionId },
        select: { id: true, studentId: true },
      }),
    { label: "createWhiteboardSessionCore.findForSchedule" }
  );
}

function isScheduledUniqueCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target : [String(target ?? "")];
  return fields.some((f) => String(f).includes("scheduledSessionId"));
}

export async function createWhiteboardSessionCore({
  adminUserId,
  studentId,
  rid,
  scheduledSessionId,
}: CreateWhiteboardSessionCoreInput): Promise<CreateWhiteboardSessionCoreResult> {
  const schedSuffix = scheduledSessionId ? ` scheduledSessionId=${scheduledSessionId}` : "";

  if (scheduledSessionId) {
    const existing = await findForSchedule(scheduledSessionId);
    if (existing) {
      console.info(
        `[slc] wbsid=${existing.id} action=session_reused${schedSuffix}`
      );
      return { ...existing, created: false };
    }
  }

  const erasureBlock = await isWhiteboardSessionBlockedByErasure(studentId);
  if (erasureBlock.blocked) {
    const jobSuffix = erasureBlock.activeJobId
      ? ` ers=${erasureBlock.activeJobId}`
      : "";
    console.warn(
      `[ers] action=session_create_denied studentId=${studentId} rid=${rid}${jobSuffix}`
    );
    throw new ErasureAccessSuspendedError();
  }

  await assertTutorApproved(adminUserId);

  const studentForConsent = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { learnerProfileId: true },
      }),
    { label: "createWhiteboardSession.studentForConsent" }
  );
  const learnerProfileId = studentForConsent?.learnerProfileId ?? null;

  try {
    await assertConsentRecordExists(learnerProfileId, adminUserId, {
      studentId,
    });
  } catch (err) {
    if (err instanceof ConsentError && err.permission === "consentRecord") {
      console.warn(
        `[createWhiteboardSession] rid=${rid} studentId=${studentId} REJECTED: no_consent_record${schedSuffix}`
      );
    }
    throw err;
  }

  const startedAtIso = new Date().toISOString();
  let eventsBlobUrl: string;
  try {
    // Unguessable pathname scoped under tutor + student so a cleanup sweep
    // can list-and-delete by prefix.
    const eventsPath = `whiteboard-sessions/${adminUserId}/${studentId}/${Date.now()}-events.json`;
    const result = isBlobHarnessActive()
      ? await harnessServerPut(
          eventsPath,
          emptyEventsJson(startedAtIso),
          { contentType: "application/json", addRandomSuffix: true },
          harnessRequestOrigin()
        )
      : await put(eventsPath, emptyEventsJson(startedAtIso), {
          // Private store; replay reads through /api/whiteboard/[id]/events.
          // Pinned by __tests__/regressions/upload-access-private.test.ts.
          access: "private",
          contentType: "application/json",
          addRandomSuffix: true,
        });
    eventsBlobUrl = result.url;
  } catch (err) {
    console.error(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} Blob put failed:`,
      err
    );
    throw new Error(
      "Could not create the whiteboard session storage. Please try again in a moment."
    );
  }

  const liveKeyEnc = mintServerLiveKey(`rid=${rid}`)?.liveKeyEnc ?? null;

  let session: { id: string; studentId: string };
  try {
    session = await withDbRetry(
      () =>
        db.$transaction(async (tx) => {
          const row = await tx.whiteboardSession.create({
            data: {
              adminUserId,
              studentId,
              consentAcknowledged: true,
              eventsBlobUrl,
              eventsSchemaVersion: PHASE1_SCHEMA_VERSION,
              liveKeyEnc,
              scheduledSessionId: scheduledSessionId ?? null,
            },
            select: { id: true, studentId: true },
          });
          // No-op for unclaimed / no-record sessions; never throws.
          await createSessionConsentSnapshot(tx, row.id, learnerProfileId, adminUserId);
          if (learnerProfileId) {
            await tx.sessionParticipant.createMany({
              data: [{ whiteboardSessionId: row.id, learnerProfileId }],
              skipDuplicates: true,
            });
          }
          return row;
        }),
      { label: "createWhiteboardSession" }
    );
  } catch (err) {
    if (scheduledSessionId && isScheduledUniqueCollision(err)) {
      const winner = await findForSchedule(scheduledSessionId);
      if (winner) {
        console.info(
          `[slc] wbsid=${winner.id} action=session_reused reason=unique_collision${schedSuffix}`
        );
        return { ...winner, created: false };
      }
    }
    console.error(
      `[createWhiteboardSession] rid=${rid} studentId=${studentId} db.transaction failed:`,
      err
    );
    throw new Error("Could not create the whiteboard session. Please try again.");
  }

  console.info(
    `[slc] wbsid=${session.id} action=session_created phase=pending claimed=${learnerProfileId ? "yes" : "no"}${schedSuffix}`
  );
  console.log(
    `[createWhiteboardSession] rid=${rid} wbsid=${session.id} studentId=${studentId} adminUserId=${adminUserId} created`
  );

  await logProductEvent({
    kind: "SESSION_CREATED",
    adminUserId,
    studentId,
    whiteboardSessionId: session.id,
    metadata: {
      claimed: Boolean(learnerProfileId),
      ...(scheduledSessionId ? { scheduled: true } : {}),
    },
  });

  return { ...session, created: true };
}
