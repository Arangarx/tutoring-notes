/**
 * Start Google OAuth with a same-origin POST.
 *
 * GET /api/auth/signin/google does not open Google when pages.signIn is set.
 * NextAuth treats the provider id as the error and redirects to
 * /login?error=google, which the login form shows as "Sign-in is temporarily
 * unavailable." A CSRF POST returns { url } for the Google account chooser.
 */

export async function startGoogleOAuth(callbackUrl: string): Promise<string> {
  const csrfRes = await fetch("/api/auth/csrf");
  if (!csrfRes.ok) {
    throw new Error("csrf_unavailable");
  }
  const csrf = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrf.csrfToken) {
    throw new Error("csrf_unavailable");
  }

  const res = await fetch("/api/auth/signin/google", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl,
      json: "true",
    }),
  });
  const data = (await res.json()) as { url?: string };
  if (!res.ok || typeof data.url !== "string" || data.url.length === 0) {
    throw new Error("google_signin_start_failed");
  }
  return data.url;
}

export function followBrowserRedirect(url: string): void {
  window.location.assign(url);
}
