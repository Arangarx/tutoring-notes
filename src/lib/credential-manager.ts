/**
 * Credential Management API helper — feature-detected, never breaks the flow.
 *
 * Calling `storePasswordCredential` after a successful password change or reset
 * signals the browser to offer "Save / Update password" (Chrome, Edge, Safari).
 * Without this explicit store call, forms that submit via fetch / server action
 * never trigger the browser's heuristic save prompt.
 *
 * References: https://developer.mozilla.org/en-US/docs/Web/API/PasswordCredential
 * Secure-context only (HTTPS) — always true on Vercel preview + production.
 */

type PCWindow = Window & {
  PasswordCredential: new (data: { id: string; password: string }) => Credential;
};

/**
 * Store a username + password pair into the browser's credential store.
 * Silently no-ops if PasswordCredential is unavailable or if the call fails.
 */
export async function storePasswordCredential(
  id: string,
  password: string
): Promise<void> {
  if (!id || !password) return;
  if (typeof window === "undefined") return;
  if (!("PasswordCredential" in window)) return;
  try {
    await navigator.credentials.store(
      new (window as PCWindow).PasswordCredential({ id, password })
    );
  } catch {
    // Non-fatal — browser may decline silently (e.g. user dismissed previously)
  }
}
