/**
 * @jest-environment node
 */
import {
  DEFAULT_CALENDAR_OAUTH_RETURN_TO,
  calendarConnectHref,
  safeCalendarOAuthReturnTo,
} from "@/lib/calendar/calendar-oauth-return";

describe("safeCalendarOAuthReturnTo", () => {
  it("allows schedule and integrations", () => {
    expect(safeCalendarOAuthReturnTo("/admin/schedule")).toBe("/admin/schedule");
    expect(safeCalendarOAuthReturnTo("/admin/settings/integrations")).toBe(
      DEFAULT_CALENDAR_OAUTH_RETURN_TO
    );
  });

  it("rejects open redirects", () => {
    expect(safeCalendarOAuthReturnTo("https://evil.com")).toBe(
      DEFAULT_CALENDAR_OAUTH_RETURN_TO
    );
    expect(safeCalendarOAuthReturnTo("//evil.com")).toBe(
      DEFAULT_CALENDAR_OAUTH_RETURN_TO
    );
    expect(safeCalendarOAuthReturnTo("/login")).toBe(DEFAULT_CALENDAR_OAUTH_RETURN_TO);
  });

  it("builds a connect href with encoded returnTo", () => {
    expect(calendarConnectHref("/admin/schedule")).toBe(
      "/api/auth/calendar/connect?returnTo=%2Fadmin%2Fschedule"
    );
  });
});
