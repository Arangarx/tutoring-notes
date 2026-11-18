/**
 * The one park / release mechanism behind every test seam.
 *
 * A seam site parks a resume callback here and a test releases it. The two
 * seams that exist differ only in what they ask of this core:
 *
 * - `src/lib/test-seams.ts` (server, `holdPoint`): one lot per (point, session),
 *   each parked caller carries a cap so a hold inside a DB transaction cannot
 *   outlive it.
 * - `src/lib/whiteboard/e2e-student-apply-hold.ts` (browser, H1/H2): one lot
 *   per hold point, no cap (the test always releases).
 *
 * Neither seam's ENABLE GATE lives here. This module is pure and reads no
 * environment, so it can be bundled into the browser. Each seam checks its own
 * gate before it ever reaches a lot, and each decides when an arrival parks
 * (the server counts the first N, the browser parks while armed).
 */

export type ParkOptions = {
  /** Resume on its own after this many ms. Omit to park until released. */
  capMs?: number;
  /** Runs when the cap fires, immediately before the resume. */
  onCap?: () => void;
};

export type ParkingLot = {
  /** Park `resume`; it runs on {@link releaseAll} or when its cap fires. */
  park: (resume: () => void, options?: ParkOptions) => void;
  /** Resume everything parked, in park order. Returns how many were resumed. */
  releaseAll: () => number;
  /** Callers parked right now. */
  parkedNow: () => number;
  /** Callers parked since the lot was created (monotonic). */
  parkedTotal: () => number;
};

type Parked = {
  resume: () => void;
  timer: ReturnType<typeof setTimeout> | null;
};

export function createParkingLot(): ParkingLot {
  let parked: Parked[] = [];
  let total = 0;

  return {
    park(resume, options) {
      total += 1;
      const entry: Parked = { resume, timer: null };
      if (options?.capMs !== undefined) {
        entry.timer = setTimeout(() => {
          parked = parked.filter((p) => p !== entry);
          options.onCap?.();
          resume();
        }, options.capMs);
      }
      parked.push(entry);
    },
    releaseAll() {
      // Take the queue first so a resume that parks again lands in a fresh one.
      const queued = parked;
      parked = [];
      for (const p of queued) {
        if (p.timer !== null) clearTimeout(p.timer);
      }
      for (const p of queued) p.resume();
      return queued.length;
    },
    parkedNow: () => parked.length,
    parkedTotal: () => total,
  };
}
