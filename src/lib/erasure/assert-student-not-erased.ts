/**
 * E6 — tutor content-route guards + endWhiteboardSession erasure short-circuit.
 *
 * Part A (route guards): deny when Student.erasedAt is set OR an active
 * ErasureJob covers the student (grace / in-flight purge) — ER-3 BLOCKER H.
 * Part B (end-session): short-circuit when content access is suspended.
 */

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import {
  hasActiveErasureJobForStudent,
  isStudentContentAccessSuspended,
  isStudentErased,
} from "@/lib/erasure/active-erasure-scope";

export {
  ErasureAccessSuspendedError,
  hasActiveErasureJobForStudent,
  isStudentContentAccessSuspended,
  isStudentErased,
  isWhiteboardSessionBlockedByErasure,
} from "@/lib/erasure/active-erasure-scope";

/** Page / server-action guard — calls `notFound()` when access suspended (M-4 + ER-3). */
export async function assertStudentNotErased(studentId: string): Promise<void> {
  if (await isStudentContentAccessSuspended(studentId)) {
    notFound();
  }
}

/** API-route guard — returns a 404 JSON response when suspended, else null. */
export async function assertStudentNotErasedApi(
  studentId: string
): Promise<Response | null> {
  if (await isStudentContentAccessSuspended(studentId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}

/**
 * endWhiteboardSession short-circuit (H-2): skip segment registration and
 * content blob persist when tutor content access is suspended for erasure.
 */
export async function shouldShortCircuitEndSessionForErasure(
  studentId: string
): Promise<boolean> {
  return isStudentContentAccessSuspended(studentId);
}
