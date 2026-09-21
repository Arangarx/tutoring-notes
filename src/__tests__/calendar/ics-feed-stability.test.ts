/**
 * @jest-environment node
 */
import ical from "node-ical";

import { buildIcsCalendarBody } from "@/lib/calendar/ics-feed";

function collectUidsAndDtstamps(icsBody: string): {
  uids: string[];
  dtstamps: string[];
} {
  const parsed = ical.parseICS(icsBody);
  const uids: string[] = [];
  const dtstamps: string[] = [];
  for (const entry of Object.values(parsed)) {
    if (entry && typeof entry === "object" && "type" in entry && entry.type === "VEVENT") {
      const ev = entry as ical.VEvent;
      if (ev.uid) uids.push(String(ev.uid));
      if (ev.stamp) {
        dtstamps.push(new Date(ev.stamp as Date).toISOString());
      }
    }
  }
  uids.sort();
  dtstamps.sort();
  return { uids, dtstamps };
}

describe("B5 — UID and DTSTAMP stability across renders", () => {
  const sessions = [
    {
      id: "11111111-2222-3333-4444-555555555555",
      date: new Date("2026-06-15T00:00:00.000Z"),
      startTime: "14:00",
      endTime: "15:00",
      subject: "Algebra",
      notes: "",
      location: "",
      updatedAt: new Date("2026-06-10T18:30:00.000Z"),
      student: { name: "Sam Lee", icsShowFullName: false },
    },
  ];

  it("double render with unchanged rows yields identical UID and DTSTAMP sets (parser oracle)", () => {
    const first = buildIcsCalendarBody(sessions, "America/Denver");
    const second = buildIcsCalendarBody(sessions, "America/Denver");
    expect(collectUidsAndDtstamps(first)).toEqual(collectUidsAndDtstamps(second));
    expect(collectUidsAndDtstamps(first).uids).toEqual([
      "11111111-2222-3333-4444-555555555555@usemynk.com",
    ]);
  });
});
