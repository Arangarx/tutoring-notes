/**
 * WB-STUDENT-APPLY-RACE — student edits made while a tutor document apply
 * is in flight must survive and reach the tutor.
 *
 * The student apply path guards `onChange` while it applies a tutor document
 * (`applyingRemoteRef`) and while the follow viewport alignment runs
 * (`tutorViewportApplyRef`, one or more animation frames). Before the fix an
 * edit landing in either window was dropped from `pageDataRef` and never
 * broadcast, and the next apply reconciled the stale `pageDataRef` copy over
 * the live scene, reverting the edit.
 *
 * Deterministic windows come from the env-gated student hold seam
 * (`window.__WBX_STUDENT_APPLY_HOLD__`, `src/lib/whiteboard/e2e-student-apply-hold.ts`):
 *   H1 parks `runV3Apply` after the guard is set, before the image hydrate.
 *   H2 parks the guard release in the viewport-align `onApplied` callback.
 * H1 tests also arm H2: idle `pageViewState` viewport applies otherwise
 * release the guard mid-hold and make the window nondeterministic.
 *
 * Oracles are peer state through the E2E scene bridge: the edit is on the
 * student canvas AND on the tutor canvas after a forced follow-up apply.
 * T8 counts `reason=post-apply-flush` and expects zero during tutor-only
 * activity; T8-control is the same counter on a student edit during the
 * hold and expects at least one, so a renamed log line cannot pass T8
 * vacuously.
 *
 * Gate: npx playwright test --project=wb-regression tests/integration/wb-student-apply-race.spec.ts --workers=1 --reporter=line
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  addGraphExpressionViaUI,
  clickBoardPageTab,
  drawTestStrokeOnRole,
  insertGraphOnRole,
  openTutorAndStudent,
  readGraphElementState,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
  waitForGraphExpressions,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

type HoldPoint = "H1" | "H2";

type HoldWindow = Window & {
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
const POST_APPLY_SETTLE_MS = 1_500;

/**
 * Counts student broadcasts logged with `reason=post-apply-flush`.
 * Shared by T8 (expects zero) and T8-control (expects at least one) so the
 * marker string cannot drift between the absence check and its positive control.
 */
function attachPostApplyFlushCounter(page: Page): { count: () => number } {
  let count = 0;
  page.on("console", (msg) => {
    if (msg.text().includes("reason=post-apply-flush")) count += 1;
  });
  return { count: () => count };
}

async function waitForHoldApi(page: Page): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__ === "object",
    undefined,
    { timeout: 30_000 }
  );
}

async function arm(page: Page, ...points: HoldPoint[]): Promise<void> {
  await page.evaluate((ps) => {
    for (const p of ps) (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.arm(p);
  }, points);
}

async function release(page: Page, ...points: HoldPoint[]): Promise<void> {
  await page.evaluate((ps) => {
    for (const p of ps) (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.release(p);
  }, points);
}

async function parkedTotal(page: Page, point: HoldPoint): Promise<number> {
  return page.evaluate(
    (p) => (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!.parkedTotal(p),
    point
  );
}

/**
 * Arm `points`, then tutor stroke → tutor document → a student apply parks
 * at `parkAt` (possibly an idle-stream document that arrived first).
 */
async function armAndParkStudentApply(
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
async function forceNextStudentApply(
  tutorPage: Page,
  studentPage: Page,
  strokeId: string
): Promise<void> {
  await drawTestStrokeOnRole(tutorPage, "tutor", strokeId, 420, 120, 500, 160);
  await waitForElementOnPeer(studentPage, "student", strokeId, 15_000);
  await studentPage.waitForTimeout(POST_APPLY_SETTLE_MS);
}

async function studentUndo(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as HoldWindow).__TN_WB_E2E__!.student!.historyUndo();
  });
}

async function graphEditDuringHeldApply(
  browser: import("@playwright/test").Browser,
  studentBrowser: "chromium" | "webkit",
  hold: "H1" | "H2"
): Promise<void> {
  const session = await seedWbLiveSyncSession();
  const peers = await openTutorAndStudent(browser, session, { studentBrowser });
  try {
    const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
    await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
    await waitForHoldApi(peers.studentPage);

    const tag = `${hold.toLowerCase()}-${studentBrowser}-${Date.now()}`;
    await armAndParkStudentApply(
      peers.tutorPage,
      peers.studentPage,
      hold === "H1" ? ["H1", "H2"] : ["H2"],
      hold,
      `race-a-${tag}`
    );

    await addGraphExpressionViaUI(peers.studentPage, "x^2");
    if (hold === "H1") {
      // The parked apply blocks the apply chain, so the edit must be visible.
      await waitForGraphExpressions(peers.studentPage, "student", graphId, ["x^2"], 10_000);
    } else {
      // Later applies keep running during H2; let the graph persist land.
      await peers.studentPage.waitForTimeout(500);
    }

    await release(peers.studentPage, "H1", "H2");
    await forceNextStudentApply(peers.tutorPage, peers.studentPage, `race-b-${tag}`);

    const studentState = await readGraphElementState(peers.studentPage, "student", graphId);
    expect(
      studentState?.expressions ?? [],
      "student graph keeps x^2 after the next tutor apply"
    ).toContain("x^2");

    await waitForGraphExpressions(peers.tutorPage, "tutor", graphId, ["x^2"], 15_000);
    const tutorState = await readGraphElementState(peers.tutorPage, "tutor", graphId);
    expect(tutorState?.graphStateJson ?? "", "tutor graphStateJson carries x^2").toContain(
      "x^2"
    );
  } finally {
    await peers.close();
  }
}

/**
 * Tutor switches to a board that already has content; the student draws on
 * that board while the switching apply is parked. The edit must persist on
 * both peers and only ever appear on the new board.
 */
async function editOnNewBoardDuringHeldSwitch(
  browser: import("@playwright/test").Browser,
  studentBrowser: "chromium" | "webkit"
): Promise<void> {
  const session = await seedWbLiveSyncSession();
  const peers = await openTutorAndStudent(browser, session, { studentBrowser });
  const tutor = peers.tutorPage;
  const student = peers.studentPage;
  try {
    await waitForHoldApi(student);
    const tag = `t7-${studentBrowser}-${Date.now()}`;
    const board1Stroke = `tutor-b1-${tag}`;
    const board2Stroke = `tutor-b2-${tag}`;
    const studentStroke = `student-b2-${tag}`;

    await drawTestStrokeOnRole(tutor, "tutor", board1Stroke, 60, 60, 160, 120);
    await waitForElementOnPeer(student, "student", board1Stroke, 15_000);
    const strip = tutor.getByTestId("wb-tutor-page-strip");
    await strip.getByRole("button", { name: "Add board" }).click();
    await expect(strip.getByRole("tab", { name: "Board 2", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 10_000 }
    );
    await drawTestStrokeOnRole(tutor, "tutor", board2Stroke, 300, 300, 380, 340);
    await waitForElementOnPeer(student, "student", board2Stroke, 15_000);
    await clickBoardPageTab(tutor, "tutor", "Board 1");
    await waitForElementOnPeer(student, "student", board1Stroke, 15_000);
    await expect
      .poll(() => readSceneElementIds(student, "student"), { timeout: 15_000 })
      .not.toContain(board2Stroke);

    const before = await parkedTotal(student, "H1");
    await student.evaluate(() => {
      const hold = (window as HoldWindow).__WBX_STUDENT_APPLY_HOLD__!;
      hold.arm("H1", { pageSwitchOnly: true });
      hold.arm("H2");
    });
    await clickBoardPageTab(tutor, "tutor", "Board 2");
    await expect
      .poll(() => parkedTotal(student, "H1"), {
        timeout: 15_000,
        message: "switching apply parked at H1",
      })
      .toBeGreaterThan(before);
    // The switch shows board 2 before the slow hydrate.
    const duringHold = await readSceneElementIds(student, "student");
    expect(duringHold, "student shows board 2 while the switch is held").toContain(board2Stroke);
    expect(duringHold).not.toContain(board1Stroke);

    await drawTestStrokeOnRole(student, "student", studentStroke, 200, 60, 260, 120);
    await release(student, "H1", "H2");
    await forceNextStudentApply(tutor, student, `race-b-${tag}`);

    expect(
      await readSceneElementIds(student, "student"),
      "student board 2 keeps the student stroke after the next tutor apply"
    ).toContain(studentStroke);
    await waitForElementOnPeer(tutor, "tutor", studentStroke, 15_000);
    for (const role of ["student", "tutor"] as const) {
      const ids = await readSceneElementIds(role === "tutor" ? tutor : student, role);
      expect(ids, `${role} board 2 free of the board-1 stroke`).not.toContain(board1Stroke);
    }

    await clickBoardPageTab(tutor, "tutor", "Board 1");
    await waitForElementOnPeer(student, "student", board1Stroke, 15_000);
    await student.waitForTimeout(POST_APPLY_SETTLE_MS);
    expect(
      await readSceneElementIds(student, "student"),
      "student board 1 free of the board-2 student stroke"
    ).not.toContain(studentStroke);
    expect(
      await readSceneElementIds(tutor, "tutor"),
      "tutor board 1 free of the board-2 student stroke"
    ).not.toContain(studentStroke);
  } finally {
    await peers.close();
  }
}

test.describe("WB-STUDENT-APPLY-RACE — student edits during a held tutor apply", () => {
  test.setTimeout(240_000);

  for (const studentBrowser of ["chromium", "webkit"] as const) {
    test(
      `T1 (${studentBrowser} student) — graph expression added while the apply is parked before hydrate survives and reaches the tutor`,
      { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
      async ({ browser }) => {
        await graphEditDuringHeldApply(browser, studentBrowser, "H1");
      }
    );

    test(
      `T2 (${studentBrowser} student) — graph expression added inside the viewport-align window survives the next apply and reaches the tutor`,
      { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
      async ({ browser }) => {
        await graphEditDuringHeldApply(browser, studentBrowser, "H2");
      }
    );

    test(
      `T7 (${studentBrowser} student) — stroke drawn on the new board while the tutor's board switch is held persists on both peers, only on that board`,
      { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
      async ({ browser }) => {
        await editOnNewBoardDuringHeldSwitch(browser, studentBrowser);
      }
    );
  }

  test(
    "T3a — student stroke drawn inside the viewport-align window exists on both peers after the next apply",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForHoldApi(peers.studentPage);
        const tag = `t3a-${Date.now()}`;
        await armAndParkStudentApply(
          peers.tutorPage,
          peers.studentPage,
          ["H2"],
          "H2",
          `race-a-${tag}`
        );

        const strokeId = `student-${tag}`;
        await drawTestStrokeOnRole(peers.studentPage, "student", strokeId, 60, 60, 160, 120);
        expect(await readSceneElementIds(peers.studentPage, "student")).toContain(strokeId);

        await release(peers.studentPage, "H2");
        await forceNextStudentApply(peers.tutorPage, peers.studentPage, `race-b-${tag}`);

        expect(
          await readSceneElementIds(peers.studentPage, "student"),
          "student stroke still on the student canvas"
        ).toContain(strokeId);
        await waitForElementOnPeer(peers.tutorPage, "tutor", strokeId, 15_000);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "T3b — pencil stroke started while the apply is parked and finished after release exists on both peers",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForHoldApi(peers.studentPage);
        const tag = `t3b-${Date.now()}`;
        const student = peers.studentPage;
        await student.getByRole("button", { name: "Pencil (P)" }).click();
        const canvas = student
          .locator('[data-testid="student-whiteboard-canvas-mount"] canvas')
          .last();
        const box = await canvas.boundingBox();
        if (!box) throw new Error("student canvas has no bounding box");
        const idsBefore = new Set(await readSceneElementIds(student, "student"));

        await armAndParkStudentApply(
          peers.tutorPage,
          student,
          ["H1", "H2"],
          "H1",
          `race-a-${tag}`
        );

        const x0 = box.x + box.width * 0.2;
        const y0 = box.y + box.height * 0.4;
        await student.mouse.move(x0, y0);
        await student.mouse.down();
        await student.mouse.move(x0 + 60, y0 + 20, { steps: 6 });
        // Release mid-gesture: the parked apply resumes while the pen is down.
        await release(student, "H1", "H2");
        await student.waitForTimeout(200);
        await student.mouse.move(x0 + 140, y0 + 50, { steps: 6 });
        await student.mouse.up();

        await forceNextStudentApply(peers.tutorPage, student, `race-b-${tag}`);

        const newIds = (await readSceneElementIds(student, "student")).filter(
          (id) => !idsBefore.has(id) && !id.startsWith("race-")
        );
        expect(newIds, "student pencil stroke on the student canvas").toHaveLength(1);
        await waitForElementOnPeer(peers.tutorPage, "tutor", newIds[0]!, 15_000);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "T5a — student undo inside the viewport-align window is not resurrected by the next apply",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForHoldApi(peers.studentPage);
        const tag = `t5a-${Date.now()}`;
        const strokeId = `student-${tag}`;
        await drawTestStrokeOnRole(peers.studentPage, "student", strokeId, 60, 60, 160, 120);
        await waitForElementOnPeer(peers.tutorPage, "tutor", strokeId, 15_000);

        await armAndParkStudentApply(
          peers.tutorPage,
          peers.studentPage,
          ["H2"],
          "H2",
          `race-a-${tag}`
        );
        await studentUndo(peers.studentPage);
        expect(await readSceneElementIds(peers.studentPage, "student")).not.toContain(strokeId);

        await release(peers.studentPage, "H2");
        await forceNextStudentApply(peers.tutorPage, peers.studentPage, `race-b-${tag}`);

        expect(
          await readSceneElementIds(peers.studentPage, "student"),
          "undone stroke stays gone on the student"
        ).not.toContain(strokeId);
        await expect
          .poll(() => readSceneElementIds(peers.tutorPage, "tutor"), {
            timeout: 15_000,
            message: "undone stroke removed on the tutor",
          })
          .not.toContain(strokeId);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "T5b — tutor erase while the student apply is held is not resurrected on either peer",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForHoldApi(peers.studentPage);
        const tag = `t5b-${Date.now()}`;
        const tutorStroke = `tutor-${tag}`;
        await drawTestStrokeOnRole(peers.tutorPage, "tutor", tutorStroke, 60, 60, 160, 120);
        await waitForElementOnPeer(peers.studentPage, "student", tutorStroke, 15_000);

        const before = await parkedTotal(peers.studentPage, "H1");
        await arm(peers.studentPage, "H1", "H2");
        await peers.tutorPage.evaluate(() => {
          (window as HoldWindow).__TN_WB_E2E__!.tutor!.historyUndo();
        });
        await expect
          .poll(() => parkedTotal(peers.studentPage, "H1"), { timeout: 15_000 })
          .toBeGreaterThan(before);
        const studentStroke = `student-${tag}`;
        await drawTestStrokeOnRole(peers.studentPage, "student", studentStroke, 200, 60, 260, 120);

        await release(peers.studentPage, "H1", "H2");
        await forceNextStudentApply(peers.tutorPage, peers.studentPage, `race-b-${tag}`);

        expect(
          await readSceneElementIds(peers.studentPage, "student"),
          "tutor-erased stroke stays gone on the student"
        ).not.toContain(tutorStroke);
        expect(await readSceneElementIds(peers.tutorPage, "tutor")).not.toContain(tutorStroke);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "T8 — tutor-only activity (strokes, board add, board switch with prefetch) makes the student send zero post-apply flushes",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      // Echo guard: a post-apply flush must only ever carry a student edit,
      // never re-send the tutor document the apply itself wrote.
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      const tutor = peers.tutorPage;
      const student = peers.studentPage;
      try {
        const flushes = attachPostApplyFlushCounter(student);
        const tag = `t8-${Date.now()}`;
        const strip = tutor.getByTestId("wb-tutor-page-strip");
        for (let i = 0; i < 3; i++) {
          const id = `tutor-b1-${i}-${tag}`;
          await drawTestStrokeOnRole(tutor, "tutor", id, 60 + 80 * i, 60, 120 + 80 * i, 120);
          await waitForElementOnPeer(student, "student", id, 15_000);
        }
        await strip.getByRole("button", { name: "Add board" }).click();
        await expect(strip.getByRole("tab", { name: "Board 2", exact: true })).toHaveAttribute(
          "aria-selected",
          "true",
          { timeout: 10_000 }
        );
        const board2Stroke = `tutor-b2-${tag}`;
        await drawTestStrokeOnRole(tutor, "tutor", board2Stroke, 300, 300, 380, 340);
        await waitForElementOnPeer(student, "student", board2Stroke, 15_000);
        await clickBoardPageTab(tutor, "tutor", "Board 1");
        await waitForElementOnPeer(student, "student", `tutor-b1-0-${tag}`, 15_000);
        await clickBoardPageTab(tutor, "tutor", "Board 2");
        await waitForElementOnPeer(student, "student", board2Stroke, 15_000);
        await student.waitForTimeout(POST_APPLY_SETTLE_MS);

        expect(
          flushes.count(),
          "student post-apply flushes during tutor-only activity"
        ).toBe(0);
      } finally {
        await peers.close();
      }
    }
  );

  for (const studentBrowser of ["chromium", "webkit"] as const) {
    test(
      `T8-control (${studentBrowser} student) — a student stroke inside the viewport-align window logs at least one post-apply flush`,
      { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
      async ({ browser }) => {
        // Positive control for T8 (T3a pattern): the shared counter must see
        // reason=post-apply-flush when the student edits during the hold.
        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session, { studentBrowser });
        try {
          await waitForHoldApi(peers.studentPage);
          const flushes = attachPostApplyFlushCounter(peers.studentPage);
          const tag = `t8c-${studentBrowser}-${Date.now()}`;
          await armAndParkStudentApply(
            peers.tutorPage,
            peers.studentPage,
            ["H2"],
            "H2",
            `race-a-${tag}`
          );

          const strokeId = `student-${tag}`;
          await drawTestStrokeOnRole(peers.studentPage, "student", strokeId, 60, 60, 160, 120);
          expect(
            await readSceneElementIds(peers.studentPage, "student"),
            "student stroke landed while the apply was held"
          ).toContain(strokeId);
          expect(
            flushes.count(),
            "no post-apply flush before the held edit is released"
          ).toBe(0);

          await release(peers.studentPage, "H2");
          await expect
            .poll(() => flushes.count(), {
              timeout: 10_000,
              message: "student post-apply flush after an edit during the hold",
            })
            .toBeGreaterThanOrEqual(1);
        } finally {
          await peers.close();
        }
      }
    );
  }

  test(
    "T5c — tutor undo followed in the same tick by another stroke: the undone stroke is gone on both peers",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      // Guards the bridge's drawTestStroke: like a real Excalidraw edit it must
      // keep the undo's tombstone, or no later document carries the deletion
      // (the T5b flake root cause).
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const tag = `t5c-${Date.now()}`;
        const tutorStroke = `tutor-${tag}`;
        const nextStroke = `race-b-${tag}`;
        await drawTestStrokeOnRole(peers.tutorPage, "tutor", tutorStroke, 60, 60, 160, 120);
        await waitForElementOnPeer(peers.studentPage, "student", tutorStroke, 15_000);
        await peers.tutorPage.evaluate((id) => {
          const tutor = (window as HoldWindow).__TN_WB_E2E__!.tutor!;
          tutor.historyUndo();
          tutor.drawTestStroke(id, 420, 120, 500, 160);
        }, nextStroke);
        await waitForElementOnPeer(peers.studentPage, "student", nextStroke, 15_000);
        await peers.studentPage.waitForTimeout(POST_APPLY_SETTLE_MS);

        expect(await readSceneElementIds(peers.tutorPage, "tutor")).not.toContain(tutorStroke);
        expect(await readSceneElementIds(peers.studentPage, "student")).not.toContain(tutorStroke);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "T6 — tutor switches to a new blank board while the student apply is held: board 2 gets no board-1 elements",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForHoldApi(peers.studentPage);
        const tag = `t6-${Date.now()}`;
        const board1Stroke = `student-b1-${tag}`;
        await drawTestStrokeOnRole(peers.studentPage, "student", board1Stroke, 60, 60, 160, 120);
        await waitForElementOnPeer(peers.tutorPage, "tutor", board1Stroke, 15_000);

        const before = await parkedTotal(peers.studentPage, "H1");
        await arm(peers.studentPage, "H1", "H2");
        const strip = peers.tutorPage.getByTestId("wb-tutor-page-strip");
        await strip.getByRole("button", { name: "Add board" }).click();
        await expect(
          strip.getByRole("tab", { name: "Board 2", exact: true })
        ).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
        await expect
          .poll(() => parkedTotal(peers.studentPage, "H1"), { timeout: 15_000 })
          .toBeGreaterThan(before);

        // Lands on the still-visible board-1 scene during the switch.
        const duringSwitchStroke = `student-sw-${tag}`;
        await drawTestStrokeOnRole(
          peers.studentPage,
          "student",
          duringSwitchStroke,
          200,
          60,
          260,
          120
        );

        await release(peers.studentPage, "H1", "H2");
        await forceNextStudentApply(peers.tutorPage, peers.studentPage, `race-b-${tag}`);

        const board1Ids = [board1Stroke, duringSwitchStroke];
        const studentBoard2 = await readSceneElementIds(peers.studentPage, "student");
        const tutorBoard2 = await readSceneElementIds(peers.tutorPage, "tutor");
        for (const id of board1Ids) {
          expect(studentBoard2, `student board 2 free of ${id}`).not.toContain(id);
          expect(tutorBoard2, `tutor board 2 free of ${id}`).not.toContain(id);
        }

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        await waitForElementOnPeer(peers.studentPage, "student", board1Stroke, 15_000);
        expect(await readSceneElementIds(peers.tutorPage, "tutor")).toContain(board1Stroke);
      } finally {
        await peers.close();
      }
    }
  );
});
