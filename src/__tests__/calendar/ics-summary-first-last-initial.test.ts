/**
 * @jest-environment node
 *
 * Calendar SUMMARY always uses first name + last initial (icsShowFullName ignored).
 */
import ical from "node-ical";

import { buildIcsCalendarBody, buildIcsEventSummary } from "@/lib/calendar/ics-feed";
import { buildScheduledSessionGoogleEventResource } from "@/lib/calendar/google-calendar-event-payload";

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
      const ev = entry as { summary?: unknown };
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
    const summaries = summariesFromIcs(body);
    expect(summaries).toEqual(["Tutoring — Maya R."]);
    // Privacy oracle: full last name must never appear in any SUMMARY, even when icsShowFullName is true.
    for (const summary of summaries) {
      expect(summary).not.toMatch(/Rodriguez/);
      expect(summary).not.toContain("Rodriguez");
    }
  });

  it("single-name students use the one name", () => {
    expect(buildIcsEventSummary({ name: "Cher" })).toBe("Tutoring — Cher");
  });

  it("replaces a child login handle that contains @ with Learner", () => {
    const handle = "alex@smith";
    expect(buildIcsEventSummary({ name: handle })).toBe("Tutoring — Learner");
    const body = buildIcsCalendarBody(
      [
        {
          ...base,
          id: "s-handle",
          student: { name: handle, icsShowFullName: true },
        },
      ],
      "America/Denver"
    );
    const summaries = summariesFromIcs(body);
    expect(summaries).toEqual(["Tutoring — Learner"]);
    for (const summary of summaries) {
      expect(summary).not.toContain("@");
      expect(summary).not.toContain("alex");
    }

    const google = buildScheduledSessionGoogleEventResource(
      {
        id: "g-handle",
        date: base.date,
        startTime: base.startTime,
        endTime: base.endTime,
        subject: base.subject,
        notes: "",
        location: "",
        student: { name: handle, icsShowFullName: true },
      },
      "America/Denver"
    );
    expect(google.summary).toBe("Tutoring — Learner");
    expect(google.summary).not.toContain("@");
  });

  it("does not put an unclaimed self-learner's email in the title", () => {
    const email = "ada.learner@example.com";
    expect(buildIcsEventSummary({ name: email })).toBe("Tutoring — Learner");
    const body = buildIcsCalendarBody(
      [
        {
          ...base,
          id: "s-email",
          student: { name: email, icsShowFullName: true },
        },
      ],
      "America/Denver"
    );
    const summaries = summariesFromIcs(body);
    expect(summaries).toEqual(["Tutoring — Learner"]);
    for (const summary of summaries) {
      expect(summary).not.toContain("@");
      expect(summary.toLowerCase()).not.toContain("ada.learner");
    }

    const google = buildScheduledSessionGoogleEventResource(
      {
        id: "g-email",
        date: base.date,
        startTime: base.startTime,
        endTime: base.endTime,
        subject: base.subject,
        notes: "",
        location: "",
        student: { name: email, icsShowFullName: true },
      },
      "America/Denver"
    );
    expect(google.summary).toBe("Tutoring — Learner");
    expect(google.summary).not.toContain("@");

    const named = buildScheduledSessionGoogleEventResource(
      {
        id: "g-named",
        date: base.date,
        startTime: base.startTime,
        endTime: base.endTime,
        subject: base.subject,
        notes: "",
        location: "",
        student: { name: "Maya Rodriguez", icsShowFullName: true },
      },
      "America/Denver"
    );
    expect(named.summary).toBe("Tutoring — Maya R.");
    expect(named.summary).not.toContain("Rodriguez");
  });
});
