/**
 * @jest-environment node
 */
import { resolveSyncPresentation } from "@/lib/schedule/scheduled-session-mapper";
import { GOOGLE_CALENDAR_DISCONNECTED } from "@/lib/schedule/google-calendar-ui-state";

describe("resolveSyncPresentation", () => {
  it("shows synced when googleEventId is set", () => {
    expect(
      resolveSyncPresentation({ connected: true, reconnectRequired: false }, "evt-1")
    ).toEqual({ showSyncBadge: true, syncState: "synced" });
  });

  it("shows pending when connected without googleEventId", () => {
    expect(
      resolveSyncPresentation({ connected: true, reconnectRequired: false }, null)
    ).toEqual({ showSyncBadge: true, syncState: "pending" });
  });

  it("shows needs-reconnect over synced when reconnect flag is set", () => {
    expect(
      resolveSyncPresentation({ connected: true, reconnectRequired: true }, "evt-1")
    ).toEqual({ showSyncBadge: true, syncState: "needs-reconnect" });
  });

  it("hides badge when Google is not connected", () => {
    expect(resolveSyncPresentation(GOOGLE_CALENDAR_DISCONNECTED, null)).toEqual({
      showSyncBadge: false,
      syncState: "not-connected",
    });
  });
});
