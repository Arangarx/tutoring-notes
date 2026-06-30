import { test, expect, type Browser } from "@playwright/test";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  readSceneElementIds,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";

/**
 * Phantom-stroke regression gate — wb-wave5-phantom-fix.
 *
 * Root cause: a single click with the line/arrow tool + right-click finalize
 * commits a degenerate element (1 point, zero bbox) to the Excalidraw scene.
 * Before the fix, this element passed through `toCanonical` and entered the
 * sync wire → it appeared on the student's canvas and could not be undone.
 *
 * After the fix: `toCanonical` drops the element via `isDegenerateLinearElement`.
 * This spec asserts the semantic oracle: a degenerate line/arrow injected on
 * the tutor side MUST NOT appear in the student's scene.
 *
 * Tags: @wb-strokes @wb-sync
 * Project: wb-regression (requires local relay + wb-e2e scene bridge)
 * Gate: run via `npm run test:wb-sync` (full relay), or targeted:
 *   npm run test:wb-playwright -- tests/integration/wb-phantom-stroke-regression.spec.ts
 */

async function openTutorAndStudent(
  browser: Browser,
  session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
) {
  const tutorContext = await browser.newContext({
    storageState: "tests/integration/.auth/tutor.json",
    viewport: { width: 1280, height: 900 },
    permissions: ["microphone"],
  });

  const studentContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
  });

  const tutorPage = await tutorContext.newPage();
  const studentPage = await studentContext.newPage();

  await tutorPage.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(tutorPage.getByTestId("mynk-wb-chrome")).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(tutorPage, "tutor");

  await studentPage.goto(`/join/${session.joinToken}`, { waitUntil: "domcontentloaded" });
  await waitForWbE2eBridge(studentPage, "student");
  await waitForTutorStudentConnected(tutorPage);

  return { tutorPage, studentPage, tutorContext, studentContext };
}

test.describe("wb phantom-stroke regression @wb-strokes @wb-sync", () => {
  test("degenerate line injected on tutor side does NOT propagate to student scene", async ({
    browser,
  }) => {
    const session = await seedWbLiveSyncSession();
    const { tutorPage, studentPage, tutorContext, studentContext } =
      await openTutorAndStudent(browser, session);

    try {
      // Baseline: student scene is empty
      const beforeIds = await readSceneElementIds(studentPage, "student");
      expect(beforeIds).toHaveLength(0);

      // Inject a degenerate line on the tutor side via the test bridge.
      // This simulates "line tool single-click + right-click finalize".
      await tutorPage.evaluate(() => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<
              string,
              { injectDegenerateElement?: (id: string, type?: "line" | "arrow") => void }
            >;
          }
        ).__TN_WB_E2E__?.tutor;
        if (!bridge?.injectDegenerateElement) {
          throw new Error("E2E bridge missing injectDegenerateElement — bridge out of date?");
        }
        bridge.injectDegenerateElement("phantom-line-test", "line");
      });

      // Also inject a degenerate arrow to cover both types
      await tutorPage.evaluate(() => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<
              string,
              { injectDegenerateElement?: (id: string, type?: "line" | "arrow") => void }
            >;
          }
        ).__TN_WB_E2E__?.tutor;
        bridge?.injectDegenerateElement?.("phantom-arrow-test", "arrow");
      });

      // Give sync time to propagate (if the adapter fails to drop the element,
      // it would arrive within this window)
      await studentPage.waitForTimeout(2_000);

      // Oracle: student scene element count must still be zero.
      // The degenerate elements were dropped by toCanonical before syncing.
      const afterIds = await readSceneElementIds(studentPage, "student");
      expect(afterIds).toHaveLength(0);
      expect(afterIds).not.toContain("phantom-line-test");
      expect(afterIds).not.toContain("phantom-arrow-test");
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });

  test("legitimate line stroke propagates normally (over-drop guard)", async ({
    browser,
  }) => {
    // Ensure the degenerate filter does NOT suppress real strokes.
    const session = await seedWbLiveSyncSession();
    const { tutorPage, studentPage, tutorContext, studentContext } =
      await openTutorAndStudent(browser, session);

    try {
      // Draw a real line with distinct endpoints (100px diagonal)
      await tutorPage.evaluate(() => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<
              string,
              { drawTestStroke?: (id: string, x1: number, y1: number, x2: number, y2: number) => void }
            >;
          }
        ).__TN_WB_E2E__?.tutor;
        if (!bridge?.drawTestStroke) {
          throw new Error("E2E bridge missing drawTestStroke");
        }
        bridge.drawTestStroke("real-line-guard", 0, 0, 100, 100);
      });

      // The real stroke must appear on the student side
      await expect
        .poll(async () => readSceneElementIds(studentPage, "student"), {
          timeout: 15_000,
          intervals: [500, 1000, 2000],
        })
        .toContain("real-line-guard");
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });
});
