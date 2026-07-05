/**
 * @jest-environment node
 */

import { formatBilledDurationLabel } from "@/lib/billing/display";

describe("formatBilledDurationLabel", () => {
  it("shows minutes-only billed label with local window", () => {
    expect(
      formatBilledDurationLabel({
        billedDurationMin: 55,
        billedStartLocal: "10:00 AM",
        billedEndLocal: "10:55 AM",
      })
    ).toBe("55 min · 10:00 AM–10:55 AM");
  });

  it("omits seconds from minutes label", () => {
    const label = formatBilledDurationLabel({
      billedDurationMin: 5,
      billedStartLocal: "9:00 AM",
      billedEndLocal: "9:05 AM",
    });
    expect(label).not.toMatch(/:\d{2}:\d{2}/);
    expect(label).toContain("5 min");
  });

  it("falls back when billedDurationMin is null", () => {
    expect(
      formatBilledDurationLabel({
        billedDurationMin: null,
        fallbackLabel: "1:00",
      })
    ).toBe("1:00");
  });

  it("returns undefined when no billed and no fallback", () => {
    expect(
      formatBilledDurationLabel({
        billedDurationMin: null,
      })
    ).toBeUndefined();
  });
});
