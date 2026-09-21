/**
 * Safe post-OAuth landing paths for Google Calendar Connect.
 * Open-redirect guard: only same-app admin pages we actually Connect from.
 */
export const DEFAULT_CALENDAR_OAUTH_RETURN_TO = "/admin/settings/integrations";

const ALLOWED_CALENDAR_OAUTH_RETURN_TO = new Set([
  DEFAULT_CALENDAR_OAUTH_RETURN_TO,
  "/admin/schedule",
]);

export function safeCalendarOAuthReturnTo(
  raw: string | null | undefined
): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return DEFAULT_CALENDAR_OAUTH_RETURN_TO;
  }
  const path = trimmed.split("?")[0]?.split("#")[0] ?? "";
  if (ALLOWED_CALENDAR_OAUTH_RETURN_TO.has(path)) {
    return path;
  }
  return DEFAULT_CALENDAR_OAUTH_RETURN_TO;
}

export function calendarConnectHref(returnTo: string): string {
  const safe = safeCalendarOAuthReturnTo(returnTo);
  return `/api/auth/calendar/connect?returnTo=${encodeURIComponent(safe)}`;
}
