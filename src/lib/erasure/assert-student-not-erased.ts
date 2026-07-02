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
  getStudentContentAccessSuspensionDetails,
  hasActiveErasureJobForStudent,
  isStudentContentAccessSuspended,
  isStudentErased,
} from "@/lib/erasure/active-erasure-scope";

export {
  ErasureAccessSuspendedError,
  getStudentContentAccessSuspensionDetails,
  hasActiveErasureJobForStudent,
  isStudentContentAccessSuspended,
  isStudentErased,
  isWhiteboardSessionBlockedByErasure,
} from "@/lib/erasure/active-erasure-scope";

export type ErasureGuardLogContext = {
  /** Share-link token — first 8 chars emitted as sal= on denial. */
  salToken?: string;
};

type GuardVerdict = "allow" | "deny" | "error";

function logContentAccessDenial(
  studentId: string,
  jobId: string | null,
  logContext?: ErasureGuardLogContext
): void {
  const jobSuffix = jobId ? ` ers=${jobId}` : "";
  console.error(
    `[ers] action=content_access_denied studentId=${studentId}${jobSuffix}`
  );
  if (logContext?.salToken) {
    const shortToken = logContext.salToken.slice(0, 8);
    console.error(
      `[sal] sal=${shortToken} action=erasure_suspended studentId=${studentId}`
    );
  }
}

async function evaluateContentAccessGuard(
  studentId: string,
  logContext?: ErasureGuardLogContext
): Promise<GuardVerdict> {
  try {
    const details = await getStudentContentAccessSuspensionDetails(studentId);
    if (!details.suspended) return "allow";
    logContentAccessDenial(studentId, details.jobId, logContext);
    return "deny";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ers] action=content_access_check_error studentId=${studentId} error=${msg.slice(0, 200)}`
    );
    return "error";
  }
}

/** Page / server-action guard — calls `notFound()` when access suspended (M-4 + ER-3). */
export async function assertStudentNotErased(
  studentId: string,
  logContext?: ErasureGuardLogContext
): Promise<void> {
  const verdict = await evaluateContentAccessGuard(studentId, logContext);
  if (verdict === "deny" || verdict === "error") {
    notFound();
  }
}

/** API-route guard — returns a 404 JSON response when suspended, else null. */
export async function assertStudentNotErasedApi(
  studentId: string,
  logContext?: ErasureGuardLogContext
): Promise<Response | null> {
  const verdict = await evaluateContentAccessGuard(studentId, logContext);
  if (verdict === "deny") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (verdict === "error") {
    return NextResponse.json(
      { error: "Service temporarily unavailable." },
      { status: 503 }
    );
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
