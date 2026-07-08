import { createSessionMsClock } from "@/lib/recording/session-clock";

/**
 * p3-clock — the single monotonic session clock's accrual math.
 *
 * These lock the freeze-on-disconnect behavior: when the clock is paused
 * (stable student disconnect), `readMs()` must FREEZE and later RESUME from
 * the frozen value, never counting the paused wall-time. Whiteboard strokes
 * drawn during the frozen window read this same value and collapse onto the
 * pause instant on replay (ratified 2026-07-02).
 *
 * `now` is injected so the math is deterministic without timers/jsdom.
 */
describe("createSessionMsClock", () => {
  function fakeClock() {
    let t = 0;
    return {
      advance: (ms: number) => {
        t += ms;
      },
      set: (ms: number) => {
        t = ms;
      },
      now: () => t,
    };
  }

  test("reads 0 before start and while never-started", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    expect(clock.readMs()).toBe(0);
    f.advance(5000);
    // Not started → wall-time advancing must not leak into the clock.
    expect(clock.readMs()).toBe(0);
  });

  test("advances while running", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.advance(1234);
    expect(clock.readMs()).toBe(1234);
    f.advance(766);
    expect(clock.readMs()).toBe(2000);
  });

  test("FREEZES while paused (disconnect gap) and does not count paused time", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.advance(3000);
    clock.pause();
    const frozen = clock.readMs();
    expect(frozen).toBe(3000);
    // Simulate a long disconnect gap — clock must stay frozen.
    f.advance(10_000);
    expect(clock.readMs()).toBe(3000);
    expect(clock.readMs()).toBe(frozen);
  });

  test("RESUMES from the frozen value on the next start (paused gap excluded)", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.advance(3000);
    clock.pause();
    f.advance(10_000); // paused gap — excluded
    clock.start();
    f.advance(2000);
    // 3000 recorded + 2000 after resume; the 10_000 paused gap is not counted.
    expect(clock.readMs()).toBe(5000);
  });

  test("accumulates across multiple pause/resume cycles", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.advance(1000);
    clock.pause();
    f.advance(5000);
    clock.start();
    f.advance(1000);
    clock.pause();
    f.advance(5000);
    clock.start();
    f.advance(500);
    expect(clock.readMs()).toBe(2500);
  });

  test("start() is idempotent while running — never re-anchors t=0", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.advance(2000);
    clock.start(); // must be a no-op, not a reset
    f.advance(1000);
    expect(clock.readMs()).toBe(3000);
  });

  test("pause() before any start() is a harmless no-op", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.pause();
    expect(clock.readMs()).toBe(0);
    clock.start();
    f.advance(1000);
    expect(clock.readMs()).toBe(1000);
  });

  test("floors sub-ms and never returns a negative value", () => {
    const f = fakeClock();
    const clock = createSessionMsClock(f.now);
    clock.start();
    f.set(0.9);
    expect(clock.readMs()).toBe(0);
    f.set(1234.99);
    expect(clock.readMs()).toBe(1234);
  });
});
