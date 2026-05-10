import { headers } from "next/headers";
import { env } from "@/lib/env";

/** Public site URL for links in emails (reset, etc.). Set NEXTAUTH_URL in production. */
export function getPublicBaseUrl(): string {
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
