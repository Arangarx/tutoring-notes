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
 * resumes all parked arrivals in order. `arm(point, { pageSwitchOnly: true })`
 * parks only arrivals that report a tutor page switch; the idle document
 * stream runs through until the switching apply arrives.
 */

export type StudentApplyHoldPoint = "H1" | "H2";

export type StudentApplyHoldArmOptions = { pageSwitchOnly?: boolean };

export type StudentApplyHoldArrival = { pageSwitch?: boolean };

type HoldState = {
  armed: boolean;
  pageSwitchOnly: boolean;
  parkedTotal: number;
  waiting: Array<() => void>;
};

export type StudentApplyHoldApi = {
  arm: (point: StudentApplyHoldPoint, options?: StudentApplyHoldArmOptions) => void;
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
      H1: { armed: false, pageSwitchOnly: false, parkedTotal: 0, waiting: [] },
      H2: { armed: false, pageSwitchOnly: false, parkedTotal: 0, waiting: [] },
    };
    window.__WBX_STUDENT_APPLY_HOLD__ = {
      arm: (point, options) => {
        const h = getHolds()[point];
        h.armed = true;
        h.pageSwitchOnly = options?.pageSwitchOnly === true;
      },
      release: (point) => {
        const h = getHolds()[point];
        h.armed = false;
        h.pageSwitchOnly = false;
        const queued = h.waiting.splice(0);
        for (const resume of queued) resume();
      },
      parkedTotal: (point) => getHolds()[point].parkedTotal,
      parkedNow: (point) => getHolds()[point].waiting.length,
    };
  }
  return holds;
}

function parks(point: StudentApplyHoldPoint, arrival?: StudentApplyHoldArrival): boolean {
  if (!holdEnabled()) return false;
  const h = getHolds()[point];
  return h.armed && (!h.pageSwitchOnly || arrival?.pageSwitch === true);
}

/** Installs `window.__WBX_STUDENT_APPLY_HOLD__` (harness only). */
export function installStudentApplyHold(): void {
  if (!holdEnabled()) return;
  getHolds();
}

/** Run `fn` now, or when `point` is released if it is armed. */
export function runAfterStudentApplyHold(
  point: StudentApplyHoldPoint,
  fn: () => void,
  arrival?: StudentApplyHoldArrival
): void {
  if (!parks(point, arrival)) {
    fn();
    return;
  }
  const h = getHolds()[point];
  h.parkedTotal += 1;
  h.waiting.push(fn);
}

/**
 * `null` when `point` would not park this arrival, so callers add no await
 * (and no microtask) outside the harness. Otherwise resolves on release.
 */
export function studentApplyHoldPromise(
  point: StudentApplyHoldPoint,
  arrival?: StudentApplyHoldArrival
): Promise<void> | null {
  if (!parks(point, arrival)) return null;
  return new Promise((resolve) => runAfterStudentApplyHold(point, resolve, arrival));
}
