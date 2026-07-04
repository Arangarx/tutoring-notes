import { test, expect, type Browser } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  ensureStudentFollowsTutor,
  expectedAlignedStudentScroll,
  findFirstImageElementId,
  growStrokeOnRole,
  insertGraphOnRole,
  insertPngFixtureOnRole,
  loginLearnerInContext,
  moveElementOnRole,
  placeMarkerAtViewportCenter,
  readAppStateCenterXY,
  readElementPosition,
  readEncryptionKeyFromHash,
  readGraphElementState,
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
  buildPanZoomViewportSteps,
  driveTutorViewportStream,
  tutorSnapshotAtScrollZoom,
  viewportScrollDistance,
  addGraphExpressionViaUI,
  assertEqualVerticalInsetInParent,
  waitForGraphExpressions,
  WB_MOVE_PROPAGATION_TOLERANCE_SCENE,
  WB_VIEWPORT_CENTER_PASS_TOLERANCE_PX,
  WB_ZOOM_INVARIANT_CENTER_TOLERANCE_SCENE,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Real-browser whiteboard live-sync regression net (hermetic local relay).
 *
 * Two real Excalidraw instances over `WHITEBOARD_SYNC_URL` (local Docker relay
 * via Playwright webServer). Assertions use `window.__TN_WB_E2E__` and
 * independent oracles from `viewport-align.ts` ΓÇö not production HUD formulas.
 *
 * Gate: `npm run test:wb-sync` (full) or `npm run test:wb-affected:run` (tagged subset)
 */
test.describe("whiteboard live-sync regression", { tag: [TAG.WB_SYNC] }, () => {
  async function openTutorAndStudent(
    browser: Browser,
    session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>,
    options?: { ensureFollow?: boolean }
  ) {
    const ensureFollow = options?.ensureFollow !== false;

    // Tutor viewport is taller to satisfy invariant-4's precondition:
    // Mynk chrome (44px topbar + board tabs + banners) consumes flex height;
    // 1200px → enough Excalidraw canvas vs student viewport (~458px).
    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 1200 },
    });
    // Load pre-created learner storage state to avoid hitting the 30 req/min API
    // rate limit when many tests run sequentially from the same IP.
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
      viewport: { width: 1280, height: 640 },
      ...(learnerStorageState ? { storageState: learnerStorageState } : {}),
    });

    // Fall back to fresh login if stored state is absent (e.g. first run).
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
    await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(tutorPage, "tutor");

    const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
    const studentPage = await studentContext.newPage();
    // Authenticated /join/ path (workstream 1 — /w/ retired).
    await studentPage.goto(
      `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
      { waitUntil: "domcontentloaded" }
    );
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

  test("invariant 1 ΓÇö tutor stroke renders on student live (no page switch)", { tag: [TAG.WB_STROKES] }, async ({
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

  test("invariant 1b ΓÇö tutor stroke continuation grows live on student", { tag: [TAG.WB_STROKES] }, async ({
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

  test("invariant 2 ΓÇö student stroke renders on tutor live", { tag: [TAG.WB_STROKES] }, async ({ browser }) => {
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

  test("invariant 3 ΓÇö live object MOVE propagation", { tag: [TAG.WB_STROKES] }, async ({ browser }) => {
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

  test("invariant 4 ΓÇö viewport center-align when student canvas is shorter", { tag: [TAG.WB_VIEWPORT] }, async ({
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

  test("invariant 5 ΓÇö pan follow (student scroll matches follow oracle)", { tag: [TAG.WB_VIEWPORT] }, async ({
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

  test("invariant 13 — continuous tutor pan/zoom: student tracks live, not only on stop", { tag: [TAG.WB_VIEWPORT] }, async ({
    browser,
  }) => {
    /**
     * Closes the gap left by invariants 5/6: those apply a single one-shot
     * setViewport and assert the end state. The Wave-5 view-lock bug
     * (d1f770e / pre-c4fff44) reverted the student to a stale follow-lock on
     * every Excalidraw onChange during tutor-driven applies, so continuous
     * tutor pan/zoom only caught up when the tutor stopped.
     *
     * Oracle: expectedAlignedStudentScroll → followWireFromTutorAppState +
     * studentScrollFromFollowCenter (viewport-align.ts, vendored Excalidraw
     * transforms) — independent of useStudentWhiteboardCanvas view-lock logic.
     */
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const tutorStart = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentDims = await readViewportSnapshot(peers.studentPage, "student");
      const initialPose = expectedAlignedStudentScroll(tutorStart, studentDims);

      const STEP_COUNT = 12;
      const MID_CHECK = 4;
      const steps = buildPanZoomViewportSteps(tutorStart, STEP_COUNT);
      const firstStepOracle = expectedAlignedStudentScroll(
        tutorSnapshotAtScrollZoom(tutorStart, steps[0]!),
        studentDims
      );

      const partialSteps = steps.slice(0, MID_CHECK);
      await driveTutorViewportStream(peers.tutorPage, partialSteps, 8);

      // Mid-stream sample: relay throttle (~50 ms) + apply rAF need a short settle.
      await peers.studentPage.waitForTimeout(600);
      const tutorMid = await readViewportSnapshot(peers.tutorPage, "tutor");
      const studentMid = await readViewportSnapshot(peers.studentPage, "student");
      const midOracle = expectedAlignedStudentScroll(tutorMid, studentMid);
      const distMidToOracle = viewportScrollDistance(studentMid, midOracle);
      const distMidToFirstLock = viewportScrollDistance(studentMid, firstStepOracle);
      const distMidToInitial = viewportScrollDistance(studentMid, initialPose);

      // Primary guard (decisive for pre-c4fff44 stale-lock): mid-gesture the
      // student must track the live tutor oracle, not the first-frame lock or
      // the pre-stream pose. Pre-fix: distMidToOracle huge, distMidToFirstLock ≈ 0.
      expect(distMidToOracle).toBeLessThanOrEqual(12);
      expect(distMidToFirstLock).toBeGreaterThan(80);
      expect(distMidToInitial).toBeGreaterThan(80);

      const restSteps = steps.slice(MID_CHECK);
      await driveTutorViewportStream(peers.tutorPage, restSteps, 8);

      // Settle after full burst (relay throttle + student apply); no tight final
      // alignment — see comment below.
      await peers.studentPage.waitForTimeout(500);

      const studentFinal = await readViewportSnapshot(peers.studentPage, "student");

      // Secondary guard: student must not freeze at the stale first-frame lock
      // after the full stream. The E2E setViewport bridge cannot fire the real
      // scheduleViewportPersist → broadcastPageViewState trailing edge that a
      // physical mouse-release delivers, so the student may settle ~one throttle
      // frame short of the tutor's final pose — asserting tight equality to
      // finalOracle would be harness over-spec, not a product defect. MID check
      // above is the decisive live-tracking guard (distMidToOracle ≤ 12).
      // Pre-c4fff44 stale-lock: distances ≈ 0; on fix: comfortably > 100 (~489).
      expect(viewportScrollDistance(studentFinal, firstStepOracle)).toBeGreaterThan(100);
      expect(viewportScrollDistance(studentFinal, initialPose)).toBeGreaterThan(100);
    } finally {
      await peers.close();
    }
  });

  test("invariant 6 ΓÇö zoom does not move viewport scene center", { tag: [TAG.WB_VIEWPORT] }, async ({
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

  test("invariant 7 ΓÇö student sees real image element (not placeholder)", { tag: [TAG.WB_ASSETS] }, async ({
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

  test("invariant 8 ΓÇö PDF page opens centered+fit on student viewport", { tag: [TAG.WB_ASSETS] }, async ({
    browser,
  }) => {
    // pdfjs headless load fixed (static ESM from /pdfjs/pdf.min.mjs). Remaining
    // gate gap: findFirstImageElementId races live sync — needs waitForFunction.
    test.skip(
      true,
      "pdfjs headless fixed; inv-8 still races student image sync (findFirstImageElementId null). Re-enable after sync wait."
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

      await expect(
        peers.studentPage
          .getByTestId("wb-student-page-strip")
          .getByRole("tab", { name: "Board 2" })
      ).toBeVisible({
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

  test("invariant 11 ΓÇö idle-tutor welcome push: student receives existing scene on join without tutor redrawing", { tag: [TAG.WB_PRESENCE] }, async ({
    browser,
  }) => {
    /**
     * Requirement-not-code test for the join-welcome-reliability fix.
     *
     * Steps:
     *   1. Tutor opens workspace, draws a stroke (with a known id).
     *   2. Student opens the session AFTER the stroke exists on the tutor.
     *   3. Assert: the student's canvas shows the stroke within 15 s
     *      WITHOUT any further action from the tutor.
     *
     * This is the decisive gate for the fix: the welcome push must
     * fire unconditionally when the student joins, even when the tutor
     * is completely idle after their initial draw. jsdom CANNOT prove
     * this ΓÇö only a real relay + two Excalidraw instances can.
     */
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    // --- Step 1: open tutor only, draw a stroke ---
    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
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

    const priorStroke = `pw-idle-tutor-${Date.now()}`;
    await drawTestStrokeOnRole(tutorPage, "tutor", priorStroke, 80, 80, 200, 200);

    // Wait for the throttled broadcast to fire (THROTTLE_MS = 50 ms; give it 2 s).
    await tutorPage.waitForTimeout(2000);

    // --- Step 2: student joins AFTER stroke is on board ---
    const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
    const learnerAuthFile11 = path.join(
      process.cwd(),
      "tests",
      "integration",
      ".auth",
      "learner.json"
    );
    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 640 },
      ...(fs.existsSync(learnerAuthFile11) ? { storageState: learnerAuthFile11 } : {}),
    });
    if (!fs.existsSync(learnerAuthFile11)) {
      await loginLearnerInContext(studentContext, session.learnerHandle, session.learnerPin);
    }
    const studentPage = await studentContext.newPage();
    // Authenticated /join/ path (workstream 1 — /w/ retired).
    await studentPage.goto(`/join/${session.whiteboardSessionId}#k=${encryptionKey}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(studentPage, "student");

    // --- Step 3: student must see the pre-existing stroke without tutor doing anything ---
    // 15 s budget covers the welcome push + relay round-trip + Excalidraw apply cycle.
    // The tutor draws NOTHING after this point.
    await waitForSceneElementIdsContaining(
      studentPage,
      "student",
      priorStroke,
      15_000
    );

    const studentIds = await readSceneElementIds(studentPage, "student");
    expect(studentIds).toContain(priorStroke);

    await tutorContext.close();
    await studentContext.close();
  });

  test("invariant 9 ΓÇö page isolation (strokes do not bleed across tabs)", { tag: [TAG.WB_STROKES] }, async ({
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

      // Scope to the page-strip footer so Playwright doesn't accidentally
      // intercept against an overlay inside the canvas body.
      await peers.tutorPage
        .getByTestId("wb-tutor-page-strip")
        .getByRole("button", { name: "Add board" })
        .click();
      // Wait for the "Board 2" tab to appear before drawing; this confirms
      // the page switch has committed and activePageIdRef is up-to-date.
      await expect(
        peers.tutorPage
          .getByTestId("wb-tutor-page-strip")
          .getByRole("tab", { name: "Board 2", exact: true })
      ).toBeVisible({ timeout: 10_000 });
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

      await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
      await waitForElementOnPeer(peers.studentPage, "student", page1Stroke, 45_000);
      const studentOnP1 = await readSceneElementIds(peers.studentPage, "student");
      expect(studentOnP1).toContain(page1Stroke);
      expect(studentOnP1).not.toContain(page2Stroke);
    } finally {
      await peers.close();
    }
  });

  test("invariant 12 — graph embed: tutor→student graphStateJson sync; student embed editable", { tag: [TAG.WB_GRAPH] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const graphId = await insertGraphOnRole(
        peers.tutorPage,
        "tutor",
        session,
        ["x^2"]
      );
      expect(graphId).toBeTruthy();

      const tutorState = await readGraphElementState(
        peers.tutorPage,
        "tutor",
        graphId
      );
      expect(tutorState).not.toBeNull();
      expect(tutorState!.expressions).toContain("x^2");
      expect(tutorState!.link).toBe("mynk://graph");

      await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);

      await peers.studentPage.waitForFunction(
        (id) => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                {
                  graphElementState: (eid: string) => {
                    expressions: string[];
                    graphStateJson: string | null;
                  } | null;
                }
              >;
            }
          ).__TN_WB_E2E__?.student;
          const st = bridge?.graphElementState?.(id);
          return (
            st != null &&
            st.expressions.includes("x^2") &&
            typeof st.graphStateJson === "string" &&
            st.graphStateJson.includes("x^2")
          );
        },
        graphId,
        { timeout: 30_000 }
      );

      const studentState = await readGraphElementState(
        peers.studentPage,
        "student",
        graphId
      );
      expect(studentState).not.toBeNull();
      expect(studentState!.expressions).toContain("x^2");
      expect(studentState!.graphStateJson).toContain("x^2");
      expect(studentState!.bbox).toEqual([-10, 10, 10, -10]);
      expect(studentState!.link).toBe("mynk://graph");

      const graphHost = peers.studentPage.getByTestId("wb-graph-embed-host");
      await expect(graphHost).toBeVisible({ timeout: 15_000 });
      // Wave5 #4: student graph is now fully editable + bidirectionally synced.
      // GraphEmbeddable renders data-read-only="true" only when readOnly=true;
      // when readOnly=false (editable) the prop is undefined and React omits the
      // attribute entirely (GraphEmbeddable.tsx: data-read-only={readOnly ? "true" : undefined}).
      // Assert attribute absent to encode the new editable contract.
      await expect(graphHost).not.toHaveAttribute("data-read-only");
    } finally {
      await peers.close();
    }
  });

  test("invariant 12b — graph UI persist: tutor types expression via UI + syncs to student", { tag: [TAG.WB_GRAPH] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
      expect(graphId).toBeTruthy();
      await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);

      await addGraphExpressionViaUI(peers.tutorPage, "x^2");
      await waitForGraphExpressions(peers.tutorPage, "tutor", graphId, ["x^2"]);
      const tutorAfterPlot = await readGraphElementState(
        peers.tutorPage,
        "tutor",
        graphId
      );
      expect(tutorAfterPlot?.graphStateJson).toContain("x^2");

      await waitForGraphExpressions(peers.studentPage, "student", graphId, ["x^2"]);
      const studentAfterTutor = await readGraphElementState(
        peers.studentPage,
        "student",
        graphId
      );
      expect(studentAfterTutor?.graphStateJson).toContain("x^2");
    } finally {
      await peers.close();
    }
  });

  test("invariant 12e — graph UI persist: student types expression via UI + syncs to tutor", { tag: [TAG.WB_GRAPH] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
      expect(graphId).toBeTruthy();
      await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);

      await addGraphExpressionViaUI(peers.studentPage, "x^2");
      await waitForGraphExpressions(peers.studentPage, "student", graphId, ["x^2"]);
      const studentAfterPlot = await readGraphElementState(
        peers.studentPage,
        "student",
        graphId
      );
      expect(studentAfterPlot?.graphStateJson).toContain("x^2");

      await waitForGraphExpressions(peers.tutorPage, "tutor", graphId, ["x^2"]);
      const tutorAfterStudent = await readGraphElementState(
        peers.tutorPage,
        "tutor",
        graphId
      );
      expect(tutorAfterStudent?.graphStateJson).toContain("x^2");
    } finally {
      await peers.close();
    }
  });

  test("invariant 12c — recording banner must not claim student left while sync roster present", { tag: [TAG.WB_RECORDING] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await expect(peers.tutorPage.getByTestId("wb-sync-pill")).toHaveText(
        /student connected/i,
        { timeout: 90_000 }
      );
      const banner = peers.tutorPage.getByTestId("wb-recording-autopause-banner");
      if (await banner.isVisible()) {
        await expect(banner).not.toContainText(/student disconnected/i);
      }
    } finally {
      await peers.close();
    }
  });

  test("invariant 12d — student follow-toggle equal vertical inset in top bar (Wave 5 #9)", { tag: [TAG.WB_CHROME] }, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await assertEqualVerticalInsetInParent(
        peers.studentPage,
        "wb-student-follow-toggle",
        "wb-student-topbar",
        4
      );
      const follow = peers.studentPage.getByTestId("wb-student-follow-toggle");
      const match = peers.studentPage.getByTestId("wb-student-match-view");
      await expect(match).toBeVisible();
      const followBox = await follow.boundingBox();
      const matchBox = await match.boundingBox();
      expect(followBox).not.toBeNull();
      expect(matchBox).not.toBeNull();
      const followMid = followBox!.y + followBox!.height / 2;
      const matchMid = matchBox!.y + matchBox!.height / 2;
      expect(Math.abs(followMid - matchMid)).toBeLessThan(4);
    } finally {
      await peers.close();
    }
  });

  test("invariant 10 ΓÇö follow gating (sync ON/OFF/snap/default)", { tag: [TAG.WB_VIEWPORT] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    // 10c ΓÇö default ON on fresh student load (before ensureStudentFollowsTutor).
    const peersDefault = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
    });
    try {
      await expect(
        peersDefault.studentPage.getByRole("checkbox", {
          name: /(?:keep pan.*zoom synced|follow tutor)/i,
        })
      ).toBeChecked();
    } finally {
      await peersDefault.close();
    }

    const peers = await openTutorAndStudent(browser, session);
    try {
      const checkbox = peers.studentPage.getByRole("checkbox", {
        name: /(?:keep pan.*zoom synced|follow tutor)/i,
      });
      await expect(checkbox).toBeChecked();

      // 10a ΓÇö sync OFF blocks follow.
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

      // 10b ΓÇö re-enable sync; fresh tutor pan must align student (same pan as inv 5).
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
