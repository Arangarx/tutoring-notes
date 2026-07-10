/**
 * Shared predicates for erasure access suspension (ER-3 / BLOCKERs G, H).
 *
 * Centralizes active-ErasureJob + tombstone lookups so session guards,
 * content-route guards, and end-session short-circuit share one definition.
 *
 * Log prefix: ers (opaque ids only).
 */

import type { ErasureJobStatus } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";

export const ACTIVE_ERASURE_STATUSES: ErasureJobStatus[] = [
  "requested",
  "blobs_purging",
  "db_scrubbing",
];

type StudentErasureContext = {
  erasedAt: Date | null;
  learnerProfileId: string | null;
  lpTombstonedAt: Date | null;
  accountHolderId: string | null;
  ahTombstonedAt: Date | null;
};

async function loadStudentErasureContext(
  studentId: string
): Promise<StudentErasureContext | null> {
  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: {
          erasedAt: true,
          learnerProfileId: true,
          learnerProfile: {
            select: {
              tombstonedAt: true,
              accountHolderId: true,
              accountHolder: { select: { tombstonedAt: true } },
            },
          },
        },
      }),
    { label: "loadStudentErasureContext" }
  );
  if (!student) return null;
  return {
    erasedAt: student.erasedAt,
    learnerProfileId: student.learnerProfileId,
    lpTombstonedAt: student.learnerProfile?.tombstonedAt ?? null,
    accountHolderId: student.learnerProfile?.accountHolderId ?? null,
    ahTombstonedAt: student.learnerProfile?.accountHolder?.tombstonedAt ?? null,
  };
}

async function findActiveErasureJobId(
  learnerProfileId: string | null,
  accountHolderId: string | null
): Promise<string | null> {
  if (learnerProfileId) {
    const lpJob = await withDbRetry(
      () =>
        db.erasureJob.findFirst({
          where: {
            scopeKind: "learner_profile",
            scopeId: learnerProfileId,
            status: { in: ACTIVE_ERASURE_STATUSES },
          },
          select: { id: true },
        }),
      { label: "findActiveErasureJobId.lp" }
    );
    if (lpJob) return lpJob.id;
  }

  if (accountHolderId) {
    const ahJob = await withDbRetry(
      () =>
        db.erasureJob.findFirst({
          where: {
            scopeKind: "account_holder",
            scopeId: accountHolderId,
            status: { in: ACTIVE_ERASURE_STATUSES },
          },
          select: { id: true },
        }),
      { label: "findActiveErasureJobId.ah" }
    );
    if (ahJob) return ahJob.id;
  }

  return null;
}

/** True when Student.erasedAt is set (post-purge durable tombstone). */
export async function isStudentErased(studentId: string): Promise<boolean> {
  const ctx = await loadStudentErasureContext(studentId);
  return ctx?.erasedAt != null;
}

/**
 * True when an active ErasureJob covers the student's learner profile or
 * account holder (grace / in-flight purge).
 */
export async function hasActiveErasureJobForStudent(
  studentId: string
): Promise<boolean> {
  const ctx = await loadStudentErasureContext(studentId);
  if (!ctx) return false;
  const jobId = await findActiveErasureJobId(
    ctx.learnerProfileId,
    ctx.accountHolderId
  );
  return jobId != null;
}

/**
 * Content-route suspension: fully erased OR active erasure job.
 * Used by assertStudentNotErased / assertStudentNotErasedApi (BLOCKER H).
 */
export async function isStudentContentAccessSuspended(
  studentId: string
): Promise<boolean> {
  const details = await getStudentContentAccessSuspensionDetails(studentId);
  return details.suspended;
}

export type ContentAccessSuspensionDetails = {
  suspended: boolean;
  jobId: string | null;
};

/**
 * Suspension details for content-route guards — includes active job id for
 * `[ers]` denial logs.
 */
export async function getStudentContentAccessSuspensionDetails(
  studentId: string
): Promise<ContentAccessSuspensionDetails> {
  const ctx = await loadStudentErasureContext(studentId);
  if (!ctx) return { suspended: false, jobId: null };
  if (ctx.erasedAt != null) return { suspended: true, jobId: null };
  const jobId = await findActiveErasureJobId(
    ctx.learnerProfileId,
    ctx.accountHolderId
  );
  return { suspended: jobId != null, jobId };
}

/**
 * Whiteboard session create/start block (BLOCKER G): LP/AH tombstonedAt OR
 * active ErasureJob on the student's scope.
 */
export async function isWhiteboardSessionBlockedByErasure(
  studentId: string
): Promise<{ blocked: boolean; activeJobId: string | null }> {
  const ctx = await loadStudentErasureContext(studentId);
  if (!ctx) return { blocked: false, activeJobId: null };

  if (ctx.erasedAt != null) {
    return { blocked: true, activeJobId: null };
  }

  if (ctx.lpTombstonedAt != null || ctx.ahTombstonedAt != null) {
    const activeJobId = await findActiveErasureJobId(
      ctx.learnerProfileId,
      ctx.accountHolderId
    );
    return { blocked: true, activeJobId };
  }

  const activeJobId = await findActiveErasureJobId(
    ctx.learnerProfileId,
    ctx.accountHolderId
  );
  if (activeJobId) {
    return { blocked: true, activeJobId };
  }

  return { blocked: false, activeJobId: null };
}

export class ErasureAccessSuspendedError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "Learner access is suspended while an erasure request is in progress."
    );
    this.name = "ErasureAccessSuspendedError";
  }
}
