/**
 * The shared park / release core behind `test-seams.ts` (server) and
 * `e2e-student-apply-hold.ts` (browser). Pure logic, so jest is the right layer
 * here; the two seams' own behavior is covered by `test-seams.test.ts` and the
 * Playwright specs that arm them.
 */

import { createParkingLot } from "@/lib/seam-parking-lot";

describe("createParkingLot", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("resumes parked callers in park order and reports how many", () => {
    const lot = createParkingLot();
    const order: string[] = [];
    lot.park(() => order.push("a"));
    lot.park(() => order.push("b"));
    lot.park(() => order.push("c"));
    expect(lot.parkedNow()).toBe(3);
    expect(order).toEqual([]);

    expect(lot.releaseAll()).toBe(3);
    expect(order).toEqual(["a", "b", "c"]);
    expect(lot.parkedNow()).toBe(0);
  });

  it("parkedTotal is monotonic across releases; parkedNow is not", () => {
    const lot = createParkingLot();
    lot.park(() => {});
    lot.park(() => {});
    lot.releaseAll();
    lot.park(() => {});
    expect(lot.parkedTotal()).toBe(3);
    expect(lot.parkedNow()).toBe(1);
  });

  it("releaseAll on an empty lot resumes nothing", () => {
    expect(createParkingLot().releaseAll()).toBe(0);
  });

  it("a caller parked without a cap never resumes by itself", () => {
    const lot = createParkingLot();
    const resume = jest.fn();
    lot.park(resume);
    jest.advanceTimersByTime(10 * 60_000);
    expect(resume).not.toHaveBeenCalled();
    expect(lot.parkedNow()).toBe(1);
  });

  it("a cap resumes only its own caller, runs onCap first, and leaves the others parked", () => {
    const lot = createParkingLot();
    const calls: string[] = [];
    lot.park(() => calls.push("capped:resume"), {
      capMs: 3_000,
      onCap: () => calls.push("capped:onCap"),
    });
    lot.park(() => calls.push("uncapped:resume"));

    jest.advanceTimersByTime(2_999);
    expect(calls).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(calls).toEqual(["capped:onCap", "capped:resume"]);
    expect(lot.parkedNow()).toBe(1);
    expect(lot.parkedTotal()).toBe(2);
  });

  it("a test release cancels the cap: onCap never fires and the resume runs once", () => {
    const lot = createParkingLot();
    const resume = jest.fn();
    const onCap = jest.fn();
    lot.park(resume, { capMs: 1_000, onCap });

    expect(lot.releaseAll()).toBe(1);
    jest.advanceTimersByTime(60_000);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(onCap).not.toHaveBeenCalled();
  });

  it("a resume that parks again lands in a fresh queue, not in the batch being released", () => {
    const lot = createParkingLot();
    const second = jest.fn();
    lot.park(() => lot.park(second));

    expect(lot.releaseAll()).toBe(1);
    expect(second).not.toHaveBeenCalled();
    expect(lot.parkedNow()).toBe(1);
    expect(lot.releaseAll()).toBe(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
