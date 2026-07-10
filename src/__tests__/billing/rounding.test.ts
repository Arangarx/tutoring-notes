/**
 * @jest-environment node
 */

import { roundBillableMinutes } from "@/lib/billing/rounding";

describe("roundBillableMinutes", () => {
  const increments = [1, 5, 15, 30] as const;

  describe.each(increments)("increment %i", (incrementMin) => {
    it("rounds zero to 0 minutes", () => {
      expect(roundBillableMinutes(0, incrementMin, "nearest")).toBe(0);
      expect(roundBillableMinutes(0, incrementMin, "up")).toBe(0);
      expect(roundBillableMinutes(0, incrementMin, "down")).toBe(0);
    });

    it("treats sub-increment ms as 1 minute before bucket rounding", () => {
      expect(roundBillableMinutes(1, incrementMin, "nearest")).toBe(
        incrementMin <= 1 ? 1 : incrementMin
      );
      expect(roundBillableMinutes(30_000, incrementMin, "nearest")).toBe(
        incrementMin <= 1 ? 1 : incrementMin
      );
    });

    it("handles exact multiples", () => {
      const exactMs = 55 * 60_000;
      expect(roundBillableMinutes(exactMs, incrementMin, "nearest")).toBe(
        incrementMin <= 1 ? 55 : Math.round(55 / incrementMin) * incrementMin
      );
    });

    it("handles just over a bucket boundary (nearest)", () => {
      if (incrementMin <= 1) return;
      // 52 min → nearest 5 = 50 (2.5 min from 50, 3 min from 55 → 50)
      expect(roundBillableMinutes(52 * 60_000, incrementMin, "nearest")).toBe(
        Math.round(52 / incrementMin) * incrementMin
      );
    });

    it("handles just under a bucket boundary (up/down)", () => {
      if (incrementMin <= 1) return;
      const ms = 52 * 60_000;
      expect(roundBillableMinutes(ms, incrementMin, "up")).toBe(
        Math.ceil(52 / incrementMin) * incrementMin
      );
      expect(roundBillableMinutes(ms, incrementMin, "down")).toBe(
        Math.floor(52 / incrementMin) * incrementMin
      );
    });
  });

  it("nearest 5: Sarah 55-minute example", () => {
    expect(roundBillableMinutes(55 * 60_000, 5, "nearest")).toBe(55);
  });

  it("nearest 5: 57 minutes rounds to 55", () => {
    expect(roundBillableMinutes(57 * 60_000, 5, "nearest")).toBe(55);
  });

  it("nearest 5: 58 minutes rounds to 60", () => {
    expect(roundBillableMinutes(58 * 60_000, 5, "nearest")).toBe(60);
  });

  it("up 15: 46 minutes → 60", () => {
    expect(roundBillableMinutes(46 * 60_000, 15, "up")).toBe(60);
  });

  it("down 15: 44 minutes → 30", () => {
    expect(roundBillableMinutes(44 * 60_000, 15, "down")).toBe(30);
  });

  it("increment 1 passes through minute ceiling only", () => {
    expect(roundBillableMinutes(90_000, 1, "nearest")).toBe(2);
    expect(roundBillableMinutes(60_000, 1, "up")).toBe(1);
  });

  it("clamps negative raw ms to zero", () => {
    expect(roundBillableMinutes(-5000, 5, "nearest")).toBe(0);
  });
});
