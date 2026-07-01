/**
 * E6 — tutor content-route guards + endWhiteboardSession erasure short-circuit.
 *
 * Part A (route guards): gate on durable `Student.erasedAt` only (M-4).
 * Part B (end-session): also short-circuit when an active ErasureJob covers
 * the student (H-2 residual micro-window).
 */

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import type { ErasureJobStatus } from "@prisma/client";
import { db, withDbRetry } from "@/lib/db";

const ACTIVE_ERASURE_STATUSES: ErasureJobStatus[] = [
  "requested",
  "blobs_purging",
  "db_scrubbing",
];

export async function isStudentErased(studentId: string): Promise<boolean> {
  const row = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { erasedAt: true },
      }),
    { label: "isStudentErased" }
  );
  return row?.erasedAt != null;
}

/** Page / server-action guard — calls `notFound()` when erased (M-4). */
export async function assertStudentNotErased(studentId: string): Promise<void> {
  if (await isStudentErased(studentId)) {
    notFound();
  }
}

/** API-route guard — returns a 404 JSON response when erased, else null. */
export async function assertStudentNotErasedApi(
  studentId: string
): Promise<Response | null> {
  if (await isStudentErased(studentId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}

/**
 * endWhiteboardSession short-circuit (H-2): skip segment registration and
 * content blob persist when the student is erased or an active ErasureJob
 * covers their learner profile / account holder.
 */
export async function shouldShortCircuitEndSessionForErasure(
  studentId: string
): Promise<boolean> {
  const student = await withDbRetry(
    () =>
      db.student.findUnique({
        where: { id: studentId },
        select: { erasedAt: true, learnerProfileId: true },
      }),
    { label: "shouldShortCircuitEndSessionForErasure.student" }
  );
  if (!student) return false;
  if (student.erasedAt != null) return true;

  const learnerProfileId = student.learnerProfileId;
  if (!learnerProfileId) return false;

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
    { label: "shouldShortCircuitEndSessionForErasure.lpJob" }
  );
  if (lpJob) return true;

  const lp = await withDbRetry(
    () =>
      db.learnerProfile.findUnique({
        where: { id: learnerProfileId },
        select: { accountHolderId: true },
      }),
    { label: "shouldShortCircuitEndSessionForErasure.lp" }
  );
  if (!lp?.accountHolderId) return false;

  const ahJob = await withDbRetry(
    () =>
      db.erasureJob.findFirst({
        where: {
          scopeKind: "account_holder",
          scopeId: lp.accountHolderId,
          status: { in: ACTIVE_ERASURE_STATUSES },
        },
        select: { id: true },
      }),
    { label: "shouldShortCircuitEndSessionForErasure.ahJob" }
  );
  return ahJob != null;
}
