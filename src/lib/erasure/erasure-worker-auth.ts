import "server-only";

import { verifyCronSecret } from "@/lib/cron-auth";

/**
 * Verify an incoming erasure worker request.
 *
 * Accepts `Authorization: Bearer <ERASURE_WORKER_SECRET>` when set, or falls
 * back to the standard Vercel Cron `CRON_SECRET` bearer pattern.
 */
export function verifyErasureWorkerAuth(req: Request): boolean {
  const erasureSecret = process.env.ERASURE_WORKER_SECRET;
  const auth = req.headers.get("authorization");

  if (erasureSecret && auth === `Bearer ${erasureSecret}`) {
    return true;
  }

  return verifyCronSecret(req);
}
