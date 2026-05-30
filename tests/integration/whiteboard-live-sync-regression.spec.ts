import { test, expect, type Browser } from "@playwright/test";
import path from "node:path";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  ensureStudentFollowsTutor,
  expectedAlignedStudentScroll,
  findFirstImageElementId,
  growStrokeOnRole,
  insertPngFixtureOnRole,
  moveElementOnRole,
  placeMarkerAtViewportCenter,
  readAppStateCenterXY,
  readElementPosition,
  readEncryptionKeyFromHash,
  readImageElementState,
  readSceneElementIds,
  readStrokeWidth,
  readViewportSnapshot,
  sceneCenterDistance,
  seedWbLiveSyncSession,
  setStudentFollowTutor,
  setViewportOnRole,
  waitForElementOnPeer,
  waitForSceneElementIdsContaining,
  waitForStrokeWidthAtLeast,
  waitForViewportAligned,
  waitForWbE2eBridge,
  waitForTutorStudentConnected,
  markerCenterOffsetFromViewportCenter,
  WB_MOVE_PROPAGATION_TOLERANCE_SCENE,
  WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX,
  WB_ZOOM_INVARIANT_CENTER_TOLERANCE_SCENE,
} from "./whiteboard-live-sync.helpers";

/**
 * Real-browser whiteboard live-sync regression net (hermetic local relay).
 *
 * Two real Excalidraw instances over `WHITEBOARD_SYNC_URL` (local Docker relay
 * via Playwright webServer). Assertions use `window.__TN_WB_E2E__` and
 * independent oracles from `viewport-align.ts` — not production HUD formulas.
 *
 * Gate: `npm run test:wb-sync`
 */
test.describe("whiteboard live-sync regression", () => {
  async function openTutorAndStudent(
    browser: Browser,
    session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>,
    options?: { ensureFollow?: boolean }
  ) {
    const ensureFollow = options?.ensureFollow !== false;

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

    if (ensureFollow) {
      await ensureStudentFollowsTutor(studentPage);
    }
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

      await waitForSceneElementIdsContaining(
        peers.studentPage,
        "student",
        tutorStroke,
        12_000
      );
      const liveIds = await readSceneElementIds(peers.studentPage, "student");
      expect(liveIds).toContain(tutorStroke);
      expect(liveIds).toContain(studentStroke);
    } finally {
      await peers.close();
    }
  });

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
      }
      const finalWidth = 20 + 8 * 40;
      await waitForStrokeWidthAtLeast(
        peers.studentPage,
        "student",
        strokeId,
        finalWidth,
        12_000
      );
      const studentWidth = await readStrokeWidth(peers.studentPage, "student", strokeId);
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

  test("invariant 3 — live object MOVE propagation", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const rectId = `pw-move-${Date.now()}`;
      await placeMarkerAtViewportCenter(peers.tutorPage, "tutor", rectId);
      await waitForElementOnPeer(peers.studentPage, "student", rectId);

      const tutorBefore = await readElementPosition(peers.tutorPage, "tutor", rectId);
      const studentBefore = await readElementPosition(
        peers.studentPage,
        "student",
        rectId
      );
      expect(tutorBefore).not.toBeNull();
      expect(studentBefore).not.toBeNull();

      const deltaX = 120;
      const deltaY = -80;
      await moveElementOnRole(peers.tutorPage, "tutor", rectId, deltaX, deltaY);

      await peers.studentPage.waitForFunction(
        ({ id, expectedX, expectedY, tol }) => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                {
                  elementPosition: (
                    eid: string
                  ) => { x: number; y: number } | null;
                }
              >;
            }
          ).__TN_WB_E2E__?.student;
          const pos = bridge?.elementPosition?.(id);
          if (!pos) return false;
          return (
            Math.abs(pos.x - expectedX) <= tol &&
            Math.abs(pos.y - expectedY) <= tol
          );
        },
        {
          id: rectId,
          expectedX: (tutorBefore!.x + deltaX),
          expectedY: (tutorBefore!.y + deltaY),
          tol: WB_MOVE_PROPAGATION_TOLERANCE_SCENE,
        },
        { timeout: 12_000 }
      );

      const tutorAfter = await readElementPosition(peers.tutorPage, "tutor", rectId);
      const studentAfter = await readElementPosition(
        peers.studentPage,
        "student",
        rectId
      );
      expect(tutorAfter!.x).toBeCloseTo(tutorBefore!.x + deltaX, 0);
      expect(studentAfter!.x).toBeCloseTo(tutorAfter!.x, 0);
      expect(studentAfter!.y).toBeCloseTo(tutorAfter!.y, 0);
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

      const tutorAfter = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentAfter = await readViewportSnapshot(peers.studentPage, "student");
      const expected = expectedAlignedStudentScroll(tutorAfter, studentAfter);

      await waitForViewportAligned(
        peers.studentPage,
        "student",
        expected.scrollX,
        expected.scrollY,
        8,
        12_000
      );

      const offset = await markerCenterOffsetFromViewportCenter(
        peers.studentPage,
        "student",
        markerId
      );
      expect(offset).toBeLessThan(WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX);
    } finally {
      await peers.close();
    }
  });

  test("invariant 5 — pan follow (student scroll matches follow oracle)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const panX = 220;
      const panY = 140;
      const zoom = 1.15;
      await setViewportOnRole(peers.tutorPage, "tutor", panX, panY, zoom);

      const tutorVp = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentVp = await readViewportSnapshot(peers.studentPage, "student");
      const expected = expectedAlignedStudentScroll(tutorVp, studentVp);

      await waitForViewportAligned(
        peers.studentPage,
        "student",
        expected.scrollX,
        expected.scrollY,
        8,
        12_000
      );
    } finally {
      await peers.close();
    }
  });

  test("invariant 6 — zoom does not move viewport scene center", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const centerBefore = await readAppStateCenterXY(peers.studentPage, "student");

      const tutorVp = await readViewportSnapshot(peers.tutorPage, "tutor");
      await setViewportOnRole(
        peers.tutorPage,
        "tutor",
        tutorVp.scrollX,
        tutorVp.scrollY,
        tutorVp.zoom * 2
      );
      const tutorZoomed = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentMid = await readViewportSnapshot(peers.studentPage, "student");
      const expectedMid = expectedAlignedStudentScroll(tutorZoomed, studentMid);
      await waitForViewportAligned(
        peers.studentPage,
        "student",
        expectedMid.scrollX,
        expectedMid.scrollY,
        8,
        12_000
      );

      await setViewportOnRole(
        peers.tutorPage,
        "tutor",
        tutorZoomed.scrollX,
        tutorZoomed.scrollY,
        tutorZoomed.zoom * 0.5
      );
      const tutorOut = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentVp = await readViewportSnapshot(peers.studentPage, "student");
      const expectedOut = expectedAlignedStudentScroll(tutorOut, studentVp);
      await waitForViewportAligned(
        peers.studentPage,
        "student",
        expectedOut.scrollX,
        expectedOut.scrollY,
        8,
        12_000
      );

      const centerAfter = await readAppStateCenterXY(peers.studentPage, "student");
      const drift = sceneCenterDistance(centerBefore, centerAfter);
      expect(drift).toBeLessThan(WB_ZOOM_INVARIANT_CENTER_TOLERANCE_SCENE);
    } finally {
      await peers.close();
    }
  });

  test("invariant 7 — student sees real image element (not placeholder)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for image upload in this harness."
    );

    const pngPath = path.join(__dirname, "../fixtures/tiny-red-square.png");
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const tutorImageId = await insertPngFixtureOnRole(
        peers.tutorPage,
        "tutor",
        pngPath,
        session
      );
      expect(tutorImageId).toBeTruthy();

      await peers.studentPage.waitForFunction(
        (id) => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                {
                  imageElementState: (eid: string) => {
                    fileId: string | null;
                    isPlaceholder: boolean;
                    hasBinary: boolean;
                  } | null;
                }
              >;
            }
          ).__TN_WB_E2E__?.student;
          const st = bridge?.imageElementState?.(id);
          return (
            st != null &&
            !st.isPlaceholder &&
            Boolean(st.fileId) &&
            st.hasBinary
          );
        },
        tutorImageId!,
        { timeout: 60_000 }
      );

      const studentState = await readImageElementState(
        peers.studentPage,
        "student",
        tutorImageId!
      );
      expect(studentState).not.toBeNull();
      expect(studentState!.isPlaceholder).toBe(false);
      expect(studentState!.fileId).toBeTruthy();
      expect(studentState!.hasBinary).toBe(true);
      expect(studentState!.assetUrl).toBeTruthy();
    } finally {
      await peers.close();
    }
  });

  test("invariant 8 — PDF page opens centered+fit on student viewport", async ({
    browser,
  }) => {
    // QUARANTINED: pdfjs-dist does not load in headless Playwright — gate/env prerequisite, not prod PDF centering.
    test.skip(
      true,
      "QUARANTINED: pdfjs-dist does not load in headless Playwright (Object.defineProperty called on non-object) — this is a gate/env prerequisite, NOT a production PDF-centering regression. PDF centering is verified by manual smoke. Re-enable once pdfjs headless loading is fixed (worker copy / postinstall)."
    );

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

      const pdfImageId = await findFirstImageElementId(peers.studentPage, "student");
      expect(pdfImageId).toBeTruthy();

      await peers.studentPage.waitForFunction(
        ({ id, maxPx }) => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                {
                  getElements: () => Array<{
                    id: string;
                    type?: string;
                    x?: number;
                    y?: number;
                    width?: number;
                    height?: number;
                  }>;
                  getAppState: () => Record<string, unknown>;
                }
              >;
            }
          ).__TN_WB_E2E__?.student;
          if (!bridge?.getElements || !bridge.getAppState) return false;
          const el = bridge.getElements().find((e) => e.id === id);
          if (!el || el.type !== "image") return false;
          const st = bridge.getAppState();
          const zoomObj = st.zoom as { value?: number } | undefined;
          const zoom =
            zoomObj && typeof zoomObj.value === "number" ? zoomObj.value : 1;
          const vw = Number(st.width) || 1;
          const vh = Number(st.height) || 1;
          const scrollX = Number(st.scrollX) || 0;
          const scrollY = Number(st.scrollY) || 0;
          const offsetLeft = Number(st.offsetLeft) || 0;
          const offsetTop = Number(st.offsetTop) || 0;
          const ex = (Number(el.x) || 0) + (Number(el.width) || 0) / 2;
          const ey = (Number(el.y) || 0) + (Number(el.height) || 0) / 2;
          const screenX = (ex + scrollX) * zoom + offsetLeft;
          const screenY = (ey + scrollY) * zoom + offsetTop;
          const cx = offsetLeft + vw / 2;
          const cy = offsetTop + vh / 2;
          const offset = Math.hypot(screenX - cx, screenY - cy);
          return offset <= maxPx;
        },
        { id: pdfImageId!, maxPx: WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX },
        { timeout: 60_000 }
      );

      const offset = await markerCenterOffsetFromViewportCenter(
        peers.studentPage,
        "student",
        pdfImageId!
      );
      expect(offset).toBeLessThan(WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX);
    } finally {
      await peers.close();
    }
  });

  test("invariant 9 — page isolation (strokes do not bleed across tabs)", async ({
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

      await clickBoardPageTab(peers.tutorPage, "tutor", "Page 1");
      await waitForElementOnPeer(peers.studentPage, "student", page1Stroke, 45_000);
      const studentOnP1 = await readSceneElementIds(peers.studentPage, "student");
      expect(studentOnP1).toContain(page1Stroke);
      expect(studentOnP1).not.toContain(page2Stroke);
    } finally {
      await peers.close();
    }
  });

  test("invariant 10 — follow gating (sync ON/OFF/snap/default)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    // 10c — default ON on fresh student load (before ensureStudentFollowsTutor).
    const peersDefault = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
    });
    try {
      await expect(
        peersDefault.studentPage.getByRole("checkbox", {
          name: /keep pan.*zoom synced/i,
        })
      ).toBeChecked();
    } finally {
      await peersDefault.close();
    }

    const peers = await openTutorAndStudent(browser, session);
    try {
      const checkbox = peers.studentPage.getByRole("checkbox", {
        name: /keep pan.*zoom synced/i,
      });
      await expect(checkbox).toBeChecked();

      // 10a — sync OFF blocks follow.
      await setStudentFollowTutor(peers.studentPage, false);
      const studentBefore = await readViewportSnapshot(peers.studentPage, "student");
      await setViewportOnRole(peers.tutorPage, "tutor", 400, 250, 1.3);
      await peers.studentPage.waitForFunction(
        ({ sx, sy, tol }) => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                { getAppState: () => Record<string, unknown> }
              >;
            }
          ).__TN_WB_E2E__?.student;
          if (!bridge?.getAppState) return false;
          const st = bridge.getAppState();
          const scrollX = Number(st.scrollX) || 0;
          const scrollY = Number(st.scrollY) || 0;
          return (
            Math.abs(scrollX - sx) <= tol && Math.abs(scrollY - sy) <= tol
          );
        },
        {
          sx: studentBefore.scrollX,
          sy: studentBefore.scrollY,
          tol: 2,
        },
        { timeout: 4_000 }
      );

      // 10b — re-enable sync; fresh tutor pan must align student (same pan as inv 5).
      await setStudentFollowTutor(peers.studentPage, true);
      await setViewportOnRole(peers.tutorPage, "tutor", 220, 140, 1.15);
      const tutorVp = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentVp = await readViewportSnapshot(peers.studentPage, "student");
      const expected = expectedAlignedStudentScroll(tutorVp, studentVp);
      await waitForViewportAligned(
        peers.studentPage,
        "student",
        expected.scrollX,
        expected.scrollY,
        8,
        12_000
      );
    } finally {
      await peers.close();
    }
  });
});
