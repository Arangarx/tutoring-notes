/**
 * Client-side helpers for credential login flows that need direct fetch
 * (so HTTP 429 + Retry-After are visible — NextAuth signIn() does not expose them).
 */

export function parseRetryAfterSeconds(res: Response, fallback = 60): number {
  const ra = parseInt(res.headers.get("Retry-After") ?? String(fallback), 10);
  return Number.isNaN(ra) || ra < 1 ? fallback : ra;
}

export type CredentialsSignInResult =
  | { ok: true; url: string }
  | { ok: false; error: "credentials" }
  | { ok: false; error: "rate_limited"; retryAfterSec: number }
  | { ok: false; error: "network" };

/**
 * Operator/tutor login via NextAuth credentials provider — direct POST so middleware
 * 429s are distinguishable from genuine network failures.
 */
export async function credentialsSignIn(
  email: string,
  password: string,
  callbackUrl: string
): Promise<CredentialsSignInResult> {
  try {
    const csrfRes = await fetch("/api/auth/csrf");
    if (!csrfRes.ok) return { ok: false, error: "network" };

    const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
    if (!csrfToken) return { ok: false, error: "network" };

    const body = new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl,
      json: "true",
    });

    const res = await fetch("/api/auth/callback/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (res.status === 429) {
      return {
        ok: false,
        error: "rate_limited",
        retryAfterSec: parseRetryAfterSeconds(res),
      };
    }

    const data = (await res.json()) as { error?: string; url?: string | null };
    if (data.error || !res.ok) {
      return { ok: false, error: "credentials" };
    }

    return { ok: true, url: data.url ?? callbackUrl };
  } catch {
    return { ok: false, error: "network" };
  }
}
