/**
 * Playwright-only hold points on the student tutor-document apply path.
 * Inert unless `NEXT_PUBLIC_WB_E2E_SCENE_HOOK === "1"`: every call falls
 * straight through, so production behavior is unchanged.
 *
 * - `H1` parks `runV3Apply` after the apply guard is set, before the image
 *   hydrate (stands in for a slow image/PDF fetch).
 * - `H2` parks the guard release in the viewport-align `onApplied` callback
 *   (holds the animation-frame window open).
 *
 * While a point is armed, every arrival parks (including later applies). `release` disarms it and
 * resumes all parked arrivals in order.
 */

export type StudentApplyHoldPoint = "H1" | "H2";

type HoldState = {
  armed: boolean;
  parkedTotal: number;
  waiting: Array<() => void>;
};

export type StudentApplyHoldApi = {
  arm: (point: StudentApplyHoldPoint) => void;
  release: (point: StudentApplyHoldPoint) => void;
  /** Arrivals parked at `point` since the page loaded (monotonic). */
  parkedTotal: (point: StudentApplyHoldPoint) => number;
  /** Arrivals currently parked at `point`. */
  parkedNow: (point: StudentApplyHoldPoint) => number;
};

declare global {
  interface Window {
    __WBX_STUDENT_APPLY_HOLD__?: StudentApplyHoldApi;
  }
}

function holdEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK === "1" &&
    typeof window !== "undefined"
  );
}

let holds: Record<StudentApplyHoldPoint, HoldState> | null = null;

function getHolds(): Record<StudentApplyHoldPoint, HoldState> {
  if (!holds) {
    holds = {
      H1: { armed: false, parkedTotal: 0, waiting: [] },
      H2: { armed: false, parkedTotal: 0, waiting: [] },
    };
    window.__WBX_STUDENT_APPLY_HOLD__ = {
      arm: (point) => {
        getHolds()[point].armed = true;
      },
      release: (point) => {
        const h = getHolds()[point];
        h.armed = false;
        const queued = h.waiting.splice(0);
        for (const resume of queued) resume();
      },
      parkedTotal: (point) => getHolds()[point].parkedTotal,
      parkedNow: (point) => getHolds()[point].waiting.length,
    };
  }
  return holds;
}

/** Installs `window.__WBX_STUDENT_APPLY_HOLD__` (harness only). */
export function installStudentApplyHold(): void {
  if (!holdEnabled()) return;
  getHolds();
}

/** Run `fn` now, or when `point` is released if it is armed. */
export function runAfterStudentApplyHold(
  point: StudentApplyHoldPoint,
  fn: () => void
): void {
  if (!holdEnabled()) {
    fn();
    return;
  }
  const h = getHolds()[point];
  if (!h.armed) {
    fn();
    return;
  }
  h.parkedTotal += 1;
  h.waiting.push(fn);
}

/**
 * `null` when `point` is not armed, so callers add no await (and no
 * microtask) outside the harness. Otherwise resolves on release.
 */
export function studentApplyHoldPromise(
  point: StudentApplyHoldPoint
): Promise<void> | null {
  if (!holdEnabled() || !getHolds()[point].armed) return null;
  return new Promise((resolve) => runAfterStudentApplyHold(point, resolve));
}
