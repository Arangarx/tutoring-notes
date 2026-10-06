/**
 * @jest-environment node
 *
 * Calendar SUMMARY always uses first name + last initial (icsShowFullName ignored).
 */
import ical from "node-ical";

import { buildIcsCalendarBody, buildIcsEventSummary } from "@/lib/calendar/ics-feed";

function summariesFromIcs(icsBody: string): string[] {
  const parsed = ical.parseICS(icsBody);
  const out: string[] = [];
  for (const entry of Object.values(parsed)) {
    if (
      entry &&
      typeof entry === "object" &&
      "type" in entry &&
      entry.type === "VEVENT"
    ) {
      const ev = entry as ical.VEvent;
      const raw = ev.summary as unknown;
      if (raw == null) continue;
      const text =
        typeof raw === "string"
          ? raw
          : typeof raw === "object" &&
              raw !== null &&
              "val" in raw &&
              typeof (raw as { val: unknown }).val === "string"
            ? (raw as { val: string }).val
            : String(raw);
      out.push(text);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

describe("ICS SUMMARY — first name + last initial", () => {
  const base = {
    date: new Date("2026-05-01T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    subject: "Reading",
    notes: "",
    location: "",
    updatedAt: new Date("2026-04-20T00:00:00.000Z"),
  };

  it("uses first + last initial in SUMMARY", () => {
    expect(buildIcsEventSummary({ name: "Maya Rodriguez" })).toBe(
      "Tutoring — Maya R."
    );
    const body = buildIcsCalendarBody(
      [
        {
          ...base,
          id: "s1",
          student: { name: "Maya Rodriguez", icsShowFullName: true },
        },
      ],
      "America/Denver"
    );
    expect(summariesFromIcs(body)).toEqual(["Tutoring — Maya R."]);
  });

  it("single-name students use the one name", () => {
    expect(buildIcsEventSummary({ name: "Cher" })).toBe("Tutoring — Cher");
  });
});
