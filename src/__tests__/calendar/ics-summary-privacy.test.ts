/**
 * @jest-environment node
 */
import ical from "node-ical";

import { buildIcsCalendarBody } from "@/lib/calendar/ics-feed";

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

describe("B6 — per-student SUMMARY privacy", () => {
  const base = {
    date: new Date("2026-05-01T00:00:00.000Z"),
    startTime: "09:00",
    endTime: "10:00",
    subject: "Reading",
    notes: "",
    location: "",
    updatedAt: new Date("2026-04-20T00:00:00.000Z"),
  };

  it("default icsShowFullName false uses first name only", () => {
    const body = buildIcsCalendarBody(
      [
        {
          ...base,
          id: "s1",
          student: { name: "Maya Rodriguez", icsShowFullName: false },
        },
      ],
      "America/Denver"
    );
    expect(summariesFromIcs(body)).toEqual(["Tutoring — Maya"]);
  });

  it("flipping one student's flag changes only that student's parsed SUMMARY", () => {
    const sessionsDefault = [
      {
        ...base,
        id: "aaaaaaaa-1111-2222-3333-444444444441",
        student: { name: "Maya Rodriguez", icsShowFullName: false },
      },
      {
        ...base,
        id: "aaaaaaaa-1111-2222-3333-444444444442",
        startTime: "11:00",
        endTime: "12:00",
        student: { name: "Alex Kim", icsShowFullName: false },
      },
    ];
    const before = summariesFromIcs(
      buildIcsCalendarBody(sessionsDefault, "America/Denver")
    );

    const sessionsFlipped = [
      {
        ...sessionsDefault[0]!,
        student: { name: "Maya Rodriguez", icsShowFullName: true },
      },
      sessionsDefault[1]!,
    ];
    const afterBody = buildIcsCalendarBody(sessionsFlipped, "America/Denver");
    expect(afterBody.match(/BEGIN:VEVENT/g)?.length).toBe(2);
    const after = summariesFromIcs(afterBody);
    expect(before).toEqual(["Tutoring — Alex", "Tutoring — Maya"]);
    expect(after).toHaveLength(2);
    expect(after).toContain("Tutoring — Alex");
    expect(after).toContain("Tutoring — Maya Rodriguez");
    expect(after).not.toContain("Tutoring — Maya");
  });
});
