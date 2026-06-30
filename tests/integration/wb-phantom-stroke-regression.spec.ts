import fs from "node:fs";
import path from "node:path";
import { test, expect, type Browser } from "@playwright/test";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  readSceneElementIds,
  waitForTutorStudentConnected,
  readEncryptionKeyFromHash,
  loginLearnerInContext,
  waitForElementOnPeer,
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

  // Use the shared learner auth state (same pattern as openTutorAndStudent in helpers).
  const learnerAuthFile = path.join(
    process.cwd(),
    "tests",
    "integration",
    ".auth",
    "learner.json"
  );
  const learnerStorageState = fs.existsSync(learnerAuthFile)
    ? learnerAuthFile
    : undefined;

  const studentContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    ...(learnerStorageState ? { storageState: learnerStorageState } : {}),
  });

  if (!learnerStorageState) {
    await loginLearnerInContext(
      studentContext,
      session.learnerHandle,
      session.learnerPin
    );
  }

  const tutorPage = await tutorContext.newPage();
  await tutorPage.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(
    tutorPage.getByTestId("tutor-whiteboard-canvas-mount")
  ).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(tutorPage, "tutor");

  // Read the encryption key from the tutor's URL fragment and navigate the
  // student to the authenticated /join/[sessionId]#k=<key> path.
  const encryptionKey = await readEncryptionKeyFromHash(tutorPage);

  const studentPage = await studentContext.newPage();
  await studentPage.goto(
    `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
    { waitUntil: "domcontentloaded" }
  );
  await waitForWbE2eBridge(studentPage, "student");
  await waitForTutorStudentConnected(tutorPage);

  return { tutorPage, studentPage, tutorContext, studentContext };
}

test.describe("wb phantom-stroke regression @wb-strokes @wb-sync", () => {
  // Each test navigates both parties and waits for the bridge (up to 90 s each)
  // plus a sentinel sync round-trip. 120 s gives comfortable headroom.
  test.setTimeout(120_000);

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

      // Also inject a degenerate arrow to cover both types.
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

      // Sentinel: inject a legitimate line after the degenerate elements.
      // Waiting for the sentinel to appear on student proves the sync round-trip
      // completed — meaning any degenerate element that slipped through would
      // also be visible. If it's not there, the adapter dropped it correctly.
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
        bridge.drawTestStroke("phantom-sentinel", 0, 0, 50, 50);
      });

      // Wait for the sentinel to arrive on student — proves sync completed.
      await waitForElementOnPeer(studentPage, "student", "phantom-sentinel", 30_000);

      // Oracle: degenerate elements must NOT be in the student scene.
      const afterIds = await readSceneElementIds(studentPage, "student");
      expect(afterIds).not.toContain("phantom-line-test");
      expect(afterIds).not.toContain("phantom-arrow-test");
      // Sentinel is there (sanity-check the oracle itself is live)
      expect(afterIds).toContain("phantom-sentinel");
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
