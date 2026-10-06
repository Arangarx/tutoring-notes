/**
 * @jest-environment node
 *
 * Spec: the learner's Join opens 15 minutes before the scheduled start and
 * closes at the scheduled end.
 */

import { isWithinJoinWindow } from "@/lib/scheduling/join-window";

const startAt = new Date("2026-10-06T18:00:00.000Z");
const endAt = new Date("2026-10-06T19:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("isWithinJoinWindow", () => {
  it.each([
    ["2026-10-06T17:44:59.999Z", false],
    ["2026-10-06T17:45:00.000Z", true],
    ["2026-10-06T18:30:00.000Z", true],
    ["2026-10-06T18:59:59.999Z", true],
    ["2026-10-06T19:00:00.000Z", false],
  ])("at %s → %s", (iso, expected) => {
    expect(isWithinJoinWindow({ startAt, endAt }, at(iso))).toBe(expected);
  });

  it("is closed when the appointment has no UTC instants", () => {
    expect(isWithinJoinWindow({ startAt: null, endAt }, at("2026-10-06T18:30:00Z"))).toBe(false);
    expect(isWithinJoinWindow({ startAt, endAt: null }, at("2026-10-06T18:30:00Z"))).toBe(false);
  });
});
