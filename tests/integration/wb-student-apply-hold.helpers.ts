/**
 * Shared Playwright helpers for the student apply-hold seam
 * (`window.__WBX_STUDENT_APPLY_HOLD__`, `src/lib/whiteboard/e2e-student-apply-hold.ts`).
 * Used by `wb-student-apply-race.spec.ts` and `wb-student-apply-overlap.spec.ts`.
 */

import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import {
  drawTestStrokeOnRole,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";

export type HoldPoint = "H1" | "H2";

export type HoldWindow = Window & {
  __WBX_STUDENT_APPLY_HOLD__?: {
    arm: (p: HoldPoint, options?: { pageSwitchOnly?: boolean }) => void;
    release: (p: HoldPoint) => void;
    parkedTotal: (p: HoldPoint) => number;
    parkedNow: (p: HoldPoint) => number;
  };
  __TN_WB_E2E__?: Record<
    string,
    {
      historyUndo: () => void;
      drawTestStroke: (id: string, x1: number, y1: number, x2: number, y2: number) => void;
    }
  >;
};

/** Settle after the forced apply: the idle document stream lands several applies. */
export const POST_APPLY_SETTLE_MS = 1_500;

/**
 * Counts student broadcasts logged with `reason=post-apply-flush`.
 * Shared by T8 (expects zero) and T8-control (expects at least one) so the
 * marker string cannot drift between the absence check and its positive control.
 */
export function attachPostApplyFlushCounter(page: Page): { count: () => number } {
  let count = 0;
  page.on("console", (msg) => {
    if (msg.text().includes("reason=post-apply-flush")) count += 1;
  });
  return { count: () => count };
}

export async function waitForHoldApi(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__ === "object",
    undefined,
    { timeout: 30_000 }
  );
}

export async function arm(page: Page, ...points: HoldPoint[]): Promise<void> {
  await page.evaluate((ps) => {
    for (const p of ps) (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.arm(p);
  }, points);
}

export async function release(page: Page, ...points: HoldPoint[]): Promise<void> {
  await page.evaluate((ps) => {
    for (const p of ps) (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.release(p);
  }, points);
}

export async function parkedTotal(page: Page, point: HoldPoint): Promise<number> {
  return page.evaluate(
    (p) => (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.parkedTotal(p),
    point
  );
}

/**
 * Arm `points`, then tutor stroke → tutor document → a student apply parks
 * at `parkAt` (possibly an idle-stream document that arrived first).
 */
export async function armAndParkStudentApply(
  tutorPage: Page,
  studentPage: Page,
  points: HoldPoint[],
  parkAt: HoldPoint,
  strokeId: string
): Promise<void> {
  const before = await parkedTotal(studentPage, parkAt);
  await arm(studentPage, ...points);
  await drawTestStrokeOnRole(tutorPage, "tutor", strokeId, 300, 300, 380, 340);
  await expect
    .poll(() => parkedTotal(studentPage, parkAt), {
      timeout: 15_000,
      message: `student apply parked at ${parkAt}`,
    })
    .toBeGreaterThan(before);
}

/** A fresh tutor document after the hold — the apply that used to revert. */
export async function forceNextStudentApply(
  tutorPage: Page,
  studentPage: Page,
  strokeId: string
): Promise<void> {
  await drawTestStrokeOnRole(tutorPage, "tutor", strokeId, 420, 120, 500, 160);
  await waitForElementOnPeer(studentPage, "student", strokeId, 15_000);
  await studentPage.waitForTimeout(POST_APPLY_SETTLE_MS);
}

export async function studentUndo(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as HoldWindow).__TN_WB_E2E__!.student!.historyUndo();
  });
}
