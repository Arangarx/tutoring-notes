import { test, expect, type Browser } from "@playwright/test";
import path from "node:path";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  drawTestStrokeOnRole,
  ensureStudentFollowsTutor,
  expectedAlignedStudentScroll,
  growStrokeOnRole,
  placeMarkerAtViewportCenter,
  readEncryptionKeyFromHash,
  readSceneElementIds,
  readStrokeWidth,
  readViewportSnapshot,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
  waitForWbE2eBridge,
  waitForTutorStudentConnected,
  markerCenterOffsetFromViewportCenter,
} from "./whiteboard-live-sync.helpers";

/**
 * Real-browser whiteboard live-sync regression harness (Phase A).
 *
 * Two real Excalidraw instances over the production relay (`WHITEBOARD_SYNC_URL`).
 * Assertions read `getSceneElements()` via `window.__TN_WB_E2E__` — the same API
 * instances the app uses (`NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1`), not jsdom mocks.
 */
test.describe("whiteboard live-sync regression (Phase A)", () => {
  test.beforeEach(() => {
    const env = readLocalEnv();
    test.skip(
      !env.WHITEBOARD_SYNC_URL?.trim(),
      "Set WHITEBOARD_SYNC_URL in .env — real relay required (no mocked Excalidraw)."
    );
  });

  async function openTutorAndStudent(
    browser: Browser,
    session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
  ) {
    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 640 },
    });

    const tutorPage = await tutorContext.newPage();
    await tutorPage.goto(
      `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(tutorPage, "tutor");

    const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/w/${session.joinToken}#k=${encryptionKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(studentPage, "student");

    await ensureStudentFollowsTutor(studentPage);
    await waitForTutorStudentConnected(tutorPage);

    return {
      tutorContext,
      studentContext,
      tutorPage,
      studentPage,
      async close() {
        await tutorContext.close();
        await studentContext.close();
      },
    };
  }

  test("invariant 1 — tutor stroke renders on student live (no page switch)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const studentStroke = `pw-student-prime-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.studentPage,
        "student",
        studentStroke,
        60,
        60,
        140,
        140
      );
      await waitForElementOnPeer(peers.tutorPage, "tutor", studentStroke);

      const tutorStroke = `pw-tutor-live-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.tutorPage,
        "tutor",
        tutorStroke,
        320,
        120,
        480,
        240
      );

      const deadline = Date.now() + 12_000;
      let liveIds: string[] = [];
      while (Date.now() < deadline) {
        liveIds = await readSceneElementIds(peers.studentPage, "student");
        if (liveIds.includes(tutorStroke)) break;
        await peers.studentPage.waitForTimeout(200);
      }
      expect(liveIds).toContain(tutorStroke);
      expect(liveIds).toContain(studentStroke);
    } finally {
      await peers.close();
    }
  });

  // Invariant 1b — STANDING live-render guard for stroke continuations.
  //
  // A real freehand stroke is ONE element id whose extent/version grows across
  // many onChange ticks (v1 → vN). This guard asserts the student's REAL scene
  // tracks the tutor's growing stroke to its final extent without a page switch.
  //
  // NOTE (Phase A round 2): this did NOT exhibit red-before on pre-fix 23cb473
  // — the rewrite's in-loop per-page `updateScene(merged)` (gated only on
  // `activePageIdRef === pageId`) already repaints the active page for both new
  // ids and version bumps, masking the gated post-loop repaint the diagnosis
  // flagged. The headline "student never sees tutor strokes until a page switch"
  // therefore could not be reproduced on 23cb473 (see orchestrator report).
  // This is kept as a forward regression net: if a future change breaks the
  // active-page live repaint, this goes red. Invariant 4 is the proven-teeth
  // red/green for this round.
  test("invariant 1b — tutor stroke continuation grows live on student", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const strokeId = `pw-grow-${Date.now()}`;
      await growStrokeOnRole(peers.tutorPage, "tutor", strokeId, 20, 1);
      await waitForElementOnPeer(peers.studentPage, "student", strokeId, 30_000);

      for (let v = 2; v <= 8; v++) {
        await growStrokeOnRole(peers.tutorPage, "tutor", strokeId, 20 + v * 40, v);
        await peers.tutorPage.waitForTimeout(120);
      }
      const finalWidth = 20 + 8 * 40;

      let studentWidth = -1;
      const deadline = Date.now() + 12_000;
      while (Date.now() < deadline) {
        studentWidth = await readStrokeWidth(peers.studentPage, "student", strokeId);
        if (studentWidth >= finalWidth - 1) break;
        await peers.studentPage.waitForTimeout(300);
      }
      expect(studentWidth).toBeGreaterThanOrEqual(finalWidth - 1);
    } finally {
      await peers.close();
    }
  });

  test("invariant 2 — student stroke renders on tutor live", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const strokeId = `pw-student-live-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.studentPage,
        "student",
        strokeId,
        100,
        100,
        260,
        220
      );
      await waitForElementOnPeer(peers.tutorPage, "tutor", strokeId);
    } finally {
      await peers.close();
    }
  });

  test("invariant 3 — page isolation (strokes do not bleed across tabs)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const page1Stroke = `pw-p1-only-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.tutorPage,
        "tutor",
        page1Stroke,
        50,
        50,
        150,
        150
      );
      await waitForElementOnPeer(peers.studentPage, "student", page1Stroke);

      await peers.tutorPage.getByRole("button", { name: "+ Add page" }).click();
      const page2Stroke = `pw-p2-only-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.tutorPage,
        "tutor",
        page2Stroke,
        200,
        200,
        320,
        320
      );
      await waitForElementOnPeer(peers.studentPage, "student", page2Stroke);

      const studentOnP2 = await readSceneElementIds(peers.studentPage, "student");
      expect(studentOnP2).toContain(page2Stroke);
      expect(studentOnP2).not.toContain(page1Stroke);

      await peers.tutorPage
        .getByRole("button", { name: "Page 1", exact: true })
        .click();
      await peers.studentPage
        .getByRole("button", { name: "Page 1", exact: true })
        .click();
      await waitForElementOnPeer(peers.studentPage, "student", page1Stroke, 30_000);
      const studentOnP1 = await readSceneElementIds(peers.studentPage, "student");
      expect(studentOnP1).toContain(page1Stroke);
      expect(studentOnP1).not.toContain(page2Stroke);
    } finally {
      await peers.close();
    }
  });

  test("invariant 4 — viewport center-align when student canvas is shorter", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const tutorVp = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentVp = await readViewportSnapshot(peers.studentPage, "student");
      expect(tutorVp.height).toBeGreaterThan(studentVp.height + 40);

      const markerId = `pw-center-${Date.now()}`;
      await placeMarkerAtViewportCenter(peers.tutorPage, "tutor", markerId);
      await waitForElementOnPeer(peers.studentPage, "student", markerId);

      await peers.studentPage.getByRole("button", { name: /match tutor/i }).click();
      await peers.tutorPage.waitForTimeout(500);

      const tutorAfter = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentAfter = await readViewportSnapshot(peers.studentPage, "student");
      const expected = expectedAlignedStudentScroll(tutorAfter, studentAfter);

      expect(Math.abs(studentAfter.scrollX - expected.scrollX)).toBeLessThan(8);
      expect(Math.abs(studentAfter.scrollY - expected.scrollY)).toBeLessThan(8);

      const offset = await markerCenterOffsetFromViewportCenter(
        peers.studentPage,
        "student",
        markerId
      );
      expect(offset).toBeLessThan(80);
    } finally {
      await peers.close();
    }
  });

  test("invariant 5 — multi-page PDF creates board pages without bleed", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for PDF upload in this harness."
    );

    const pdfPath = path.join(__dirname, "../fixtures/e2e-two-pages.pdf");
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage.getByTestId("wb-insert-asset-btn").click();
      await expect(peers.tutorPage.getByTestId("wb-insert-dialog")).toBeVisible();
      await peers.tutorPage.getByTestId("wb-insert-pick-file").click();
      await peers.tutorPage.getByTestId("wb-insert-file-input").setInputFiles(pdfPath);
      await expect(peers.tutorPage.getByTestId("wb-pdf-pick-continue")).toBeVisible({
        timeout: 30_000,
      });
      await peers.tutorPage.getByTestId("wb-pdf-pick-continue").click();
      await expect(peers.tutorPage.getByTestId("wb-insert-progress")).toBeVisible({
        timeout: 15_000,
      });
      await expect(peers.tutorPage.getByTestId("wb-insert-progress")).toBeHidden({
        timeout: 120_000,
      });

      await expect(peers.studentPage.getByRole("button", { name: /page 1/i })).toBeVisible({
        timeout: 60_000,
      });
      await expect(
        peers.studentPage.getByRole("button", { name: /page 2/i })
      ).toBeVisible({ timeout: 60_000 });

      const p1Stroke = `pw-pdf-p1-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.tutorPage,
        "tutor",
        p1Stroke,
        40,
        40,
        120,
        120
      );
      await waitForElementOnPeer(peers.studentPage, "student", p1Stroke);

      await peers.tutorPage.getByRole("button", { name: /page 2/i }).click();
      await peers.studentPage.getByRole("button", { name: /page 2/i }).click();
      const studentP2 = await readSceneElementIds(peers.studentPage, "student");
      expect(studentP2).not.toContain(p1Stroke);
    } finally {
      await peers.close();
    }
  });
});
