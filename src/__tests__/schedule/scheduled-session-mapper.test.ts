/**
 * @jest-environment node
 */
import { resolveSyncPresentation, toScheduledSessionView } from "@/lib/schedule/scheduled-session-mapper";
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

describe("toScheduledSessionView source", () => {
  function row(student: {
    name: string;
    adminUserId: string | null;
    organizationId: string | null;
    organization: { id: string; name: string } | null;
  }) {
    return {
      id: "sess-source",
      adminUserId: "admin-1",
      studentId: "stu-1",
      date: new Date("2026-12-15T00:00:00.000Z"),
      startTime: "16:00",
      endTime: "17:00",
      startAt: new Date("2026-12-15T23:00:00.000Z"),
      endAt: new Date("2026-12-16T00:00:00.000Z"),
      plannedDurationMinutes: 60,
      subject: "Algebra",
      notes: "",
      location: "",
      googleEventId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      student,
    } as unknown as Parameters<typeof toScheduledSessionView>[0];
  }

  it("marks an org-owned student's row as an org source with the organization name", () => {
    const view = toScheduledSessionView(
      row({
        name: "Mary Ann Lee",
        adminUserId: null,
        organizationId: "org-1",
        organization: { id: "org-1", name: "Acme Learning" },
      }),
      GOOGLE_CALENDAR_DISCONNECTED,
      "America/Denver"
    );
    expect(view.source).toEqual({
      kind: "org",
      organizationId: "org-1",
      organizationName: "Acme Learning",
    });
  });

  it("marks a private student's row as personal", () => {
    const view = toScheduledSessionView(
      row({ name: "Pat", adminUserId: "admin-1", organizationId: null, organization: null }),
      GOOGLE_CALENDAR_DISCONNECTED,
      "America/Denver"
    );
    expect(view.source).toEqual({ kind: "personal" });
  });
});