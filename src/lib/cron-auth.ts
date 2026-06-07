import "server-only";

/**
 * Verify an incoming Vercel Cron request.
 *
 * When CRON_SECRET is set in the project env, Vercel sends
 * `Authorization: Bearer <CRON_SECRET>` on every cron invocation.
 * Reject all requests when the secret is unset or the header does not match.
 */
export function verifyCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}
