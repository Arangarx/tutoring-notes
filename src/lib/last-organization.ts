/** Cookie that remembers the last organization this account opened. */
export const LAST_ORGANIZATION_COOKIE = "tn-last-org";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path of one organization page, or null for the index and everything else. */
export function organizationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/admin\/organization\/([^/]+)$/);
  const id = match?.[1];
  return id && UUID.test(id) ? id : null;
}

export function lastOrganizationCookieValue(adminUserId: string, organizationId: string): string {
  return `${adminUserId}:${organizationId}`;
}

/** The organization id when the cookie belongs to this account. */
export function readLastOrganizationCookie(
  value: string | undefined,
  adminUserId: string
): string | null {
  if (!value) return null;
  const split = value.indexOf(":");
  if (split <= 0) return null;
  const owner = value.slice(0, split);
  const organizationId = value.slice(split + 1);
  if (owner !== adminUserId || !UUID.test(organizationId)) return null;
  return organizationId;
}
