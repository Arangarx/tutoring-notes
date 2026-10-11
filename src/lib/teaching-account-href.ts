/**
 * Teaching-account doors only. Organization staff use the tutor login and
 * signup pages, never the parent or child doors.
 * Email and return path are both optional. An empty value is omitted.
 */
function teachingAccountHref(
  path: "/login" | "/signup",
  returnPath?: string | null,
  email?: string | null
): string {
  const params = new URLSearchParams();
  const safeReturn = returnPath?.trim() ?? "";
  const safeEmail = email?.trim() ?? "";
  if (safeReturn) params.set("callbackUrl", safeReturn);
  if (safeEmail) params.set("email", safeEmail);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function teachingSignInHref(
  returnPath?: string | null,
  email?: string | null
): string {
  return teachingAccountHref("/login", returnPath, email);
}

export function teachingSignUpHref(
  returnPath?: string | null,
  email?: string | null
): string {
  return teachingAccountHref("/signup", returnPath, email);
}
