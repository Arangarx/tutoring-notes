"use server";

/**
 * E5a — thin server-action wrapper for admin-only erasure requests.
 * UI (E5b) collects confirmPhrase; this action enforces it server-side.
 */

import { assertIsAdmin, ImpersonationForbiddenError } from "@/lib/impersonation";
import { cancelErasureJob } from "@/lib/erasure/process-erasure-job";
import {
  ErasureRequestError,
  requestErasureByAdmin,
  type ErasureScopeInput,
} from "@/lib/erasure/request-erasure-by-admin";

export type RequestErasureByAdminResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export async function requestErasureByAdminAction(
  scope: ErasureScopeInput,
  confirmPhrase: string
): Promise<RequestErasureByAdminResult> {
  let adminId: string;
  try {
    ({ adminId } = await assertIsAdmin());
  } catch (err) {
    const msg =
      err instanceof ImpersonationForbiddenError
        ? err.message
        : "Unauthorized — ADMIN role required.";
    return { ok: false, error: msg };
  }

  try {
    const { jobId } = await requestErasureByAdmin(adminId, scope, confirmPhrase);
    return { ok: true, jobId };
  } catch (err) {
    if (err instanceof ErasureRequestError) {
      return { ok: false, error: err.message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ers] action=request_by_admin_error error=${msg}`);
    return { ok: false, error: msg };
  }
}

export type CancelErasureByAdminResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

export async function cancelErasureByAdminAction(
  jobId: string
): Promise<CancelErasureByAdminResult> {
  try {
    await assertIsAdmin();
  } catch (err) {
    const msg =
      err instanceof ImpersonationForbiddenError
        ? err.message
        : "Unauthorized — ADMIN role required.";
    return { ok: false, error: msg };
  }

  try {
    const { status } = await cancelErasureJob(jobId);
    return { ok: true, status };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Cannot cancel")) {
      return { ok: false, error: msg };
    }
    if (msg.includes("not found")) {
      return { ok: false, error: msg };
    }
    console.error(`[ers] action=cancel_by_admin_error ers=${jobId} error=${msg}`);
    return { ok: false, error: msg };
  }
}
