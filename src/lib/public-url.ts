import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Public site URL for links in emails (reset, verify, etc.).
 *
 * Production:  always NEXTAUTH_URL (canonical domain; host-injection-safe).
 * Preview:     VERCEL_URL (deployment-scoped) so smoke-testing email links
 *              point at the preview deployment, not prod. We use VERCEL_URL
 *              (not the request Host header) to avoid host-injection attacks.
 * Local dev:   NEXTAUTH_URL if set, else localhost:3000.
 *
 * Security note: we use VERCEL_URL (deployment-scoped) for preview environments
 * rather than the request Host header, which would be vulnerable to host-injection attacks.
 * Email links on production always use NEXTAUTH_URL (canonical prod URL).
 */
export function getPublicBaseUrl(): string {
  // On Vercel preview deployments, use the deployment-scoped URL for email links
  // so smoke-testing works (NEXTAUTH_URL points at prod on preview builds).
  if (process.env.VERCEL_ENV === "preview") {
    const vercelUrl = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
    if (vercelUrl) {
      return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    }
  }
  const fromEnv = env.NEXTAUTH_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercel) return vercel.startsWith("http") ? vercel : `https://${vercel}`;
  return "http://localhost:3000";
}

/**
 * Base URL of the current request — derived from `host` / `x-forwarded-*`
 * headers. Use this for URLs **displayed to the user on the same deployment**
 * so smoke-testing on a Vercel preview surfaces preview URLs instead of the
 * hardcoded production `NEXTAUTH_URL`.
 *
 * For URLs sent OUTSIDE the deployment (parent emails, password reset, OAuth
 * callbacks) keep using `getPublicBaseUrl()` so external links always point at
 * the production host.
 *
 * Falls back to `getPublicBaseUrl()` when called outside a request context
 * (server actions invoked from a non-page boundary, tests, etc.).
 */
export async function getRequestBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? "https";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() throws outside of a request context.
  }
  return getPublicBaseUrl();
}

// ---------------------------------------------------------------------------
// Host-injection guard for auth email links (RC-A fix)
// ---------------------------------------------------------------------------

/**
 * Hosts that are safe to reflect into verify-email and other auth links.
 *
 * Every entry must be an exact string or a RegExp. A forged Host header that
 * does NOT match any entry falls back to getPublicBaseUrl() — the attacker's
 * hostname is NEVER reflected into the email link. Tests in
 * src/__tests__/public-url-allowlist.test.ts enforce this contract.
 *
 * Allowlist covers:
 *   localhost / 127.0.0.1 (any port) — local dev
 *   tutoring-notes.vercel.app — the project's legacy default Vercel domain
 *   tutoring-notes-*-arangarx-5209s-projects.vercel.app — per-deployment
 *     and branch-alias preview URLs scoped to this project + Vercel team.
 *     The team slug in the pattern means an attacker would need to own the
 *     arangarx-5209s-projects Vercel team to craft a matching hostname.
 *   usemynk.com, www.usemynk.com — production canonical hosts
 *
 * Platform assumption: see docs/PLATFORM-ASSUMPTIONS.md §5.8.
 */
const ALLOWLISTED_HOST_PATTERNS: ReadonlyArray<RegExp | string> = [
  /^localhost(:\d{1,5})?$/,
  /^127\.0\.0\.1(:\d{1,5})?$/,
  "tutoring-notes.vercel.app",
  // Vercel preview: per-deployment (tutoring-notes-<hash>-arangarx-5209s-projects.vercel.app)
  // and branch-alias (tutoring-notes-git-<branch>-<hash>-arangarx-5209s-projects.vercel.app)
  /^tutoring-notes-[a-z0-9-]+-arangarx-5209s-projects\.vercel\.app$/,
  "usemynk.com",
  "www.usemynk.com",
];

/**
 * Returns true only if `host` matches a known safe pattern.
 * Conservative: any host not explicitly allowlisted returns false.
 * Exported for tests; not intended as a general-purpose helper.
 */
export function isHostAllowlisted(host: string): boolean {
  for (const pattern of ALLOWLISTED_HOST_PATTERNS) {
    if (typeof pattern === "string") {
      if (host === pattern) return true;
    } else {
      if (pattern.test(host)) return true;
    }
  }
  return false;
}

/**
 * Safe request-host base URL for auth email links (verify-email, etc.).
 *
 * Prefers the actual request host (x-forwarded-host / host) so the verify
 * link lands on the SAME domain the user is browsing — fixing the Vercel
 * preview cookie-domain split (RC-A). But the host MUST pass the allowlist
 * before being reflected; an unrecognised host falls back to
 * getPublicBaseUrl() (env-derived, injection-safe).
 *
 * Use this instead of getPublicBaseUrl() for verify-email and resend-
 * verification links. Do NOT use for password-reset or "already have an
 * account" emails — those don't require host alignment and getPublicBaseUrl()
 * is the correct choice.
 *
 * @param req The incoming NextRequest from the route handler.
 */
export function getRequestBaseUrlSafe(req: NextRequest): string {
  const rawHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (rawHost) {
    const host = rawHost.trim().replace(/\.$/, "");
    if (isHostAllowlisted(host)) {
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      const safeProto = proto === "http" ? "http" : "https";
      return `${safeProto}://${host}`;
    }
    // Host present but not allowlisted — log for observability without leaking the host
    console.warn(
      `[ahx] getRequestBaseUrlSafe: host not allowlisted, falling back to getPublicBaseUrl()`
    );
  }
  return getPublicBaseUrl();
}
