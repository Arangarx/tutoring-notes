import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  assertControlFullyInViewport,
  assertEqualVerticalInsetInParent,
  assertStudentPortraitTopBarControls,
  clickBoardPageTab,
  drawTestStrokeOnRole,
  expectedAlignedStudentScroll,
  loginLearnerInContext,
  openTutorAndStudent,
  readOverflowMenuItemLeftEdges,
  readViewportSnapshot,
  seedWbLiveSyncSession,
  setStudentFollowTutor,
  setViewportOnRole,
  waitForElementOnPeer,
  waitForTutorStudentConnected,
  waitForViewportAligned,
  waitForWbE2eBridge,
  addGraphExpressionViaUI,
  type WbViewportSize,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function loadTutorBoard(
  page: Page,
  session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
) {
  await page.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
}

async function assertDropdownOpensBelowTrigger(
  page: Page,
  triggerTestId: string
) {
  const trigger = page.getByTestId(triggerTestId);
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dropdown = page.getByTestId("wb-topbar-overflow-dropdown");
  await expect(dropdown).toBeVisible({ timeout: 3_000 });
  const triggerBox = await trigger.boundingBox();
  const dropdownBox = await dropdown.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(dropdownBox).not.toBeNull();
  expect(dropdownBox!.y).toBeGreaterThanOrEqual(
    triggerBox!.y + triggerBox!.height - 2
  );
  await page.keyboard.press("Escape");
}

async function readGridEnabled(page: Page, role: "tutor" | "student"): Promise<boolean> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<string, { getAppState: () => Record<string, unknown> }>;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getAppState) return false;
    return Boolean(bridge.getAppState().gridModeEnabled);
  }, role);
}

/** Parse rgb()/rgba() for contrast oracle (native select option list). */
function rgbTriplet(css: string): [number, number, number] | null {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function avgChannel(triplet: [number, number, number]): number {
  return (triplet[0] + triplet[1] + triplet[2]) / 3;
}

async function assertNativeSelectReadable(page: Page, selectTestId: string) {
  const styles = await page.evaluate((testId) => {
    const sel = document.querySelector(`[data-testid="${testId}"]`);
    const opt = sel?.querySelector("option");
    if (!sel || !opt) return null;
    const sc = getComputedStyle(sel);
    const oc = getComputedStyle(opt);
    return {
      colorScheme: sc.colorScheme,
      selectColor: sc.color,
      selectBg: sc.backgroundColor,
      optionColor: oc.color,
      optionBg: oc.backgroundColor,
    };
  }, selectTestId);
  expect(styles).not.toBeNull();
  expect(styles!.colorScheme).toMatch(/dark/i);

  const optColor = rgbTriplet(styles!.optionColor);
  const optBg = rgbTriplet(styles!.optionBg);
  expect(optColor).not.toBeNull();
  expect(optBg).not.toBeNull();

  const bgLight = avgChannel(optBg!) > 180;
  const textLight = avgChannel(optColor!) > 180;
  expect(bgLight && textLight).toBe(false);

  const selColor = rgbTriplet(styles!.selectColor);
  const selBg = rgbTriplet(styles!.selectBg);
  expect(selColor).not.toBeNull();
  expect(selBg).not.toBeNull();
  const closedBgLight = avgChannel(selBg!) > 180;
  const closedTextLight = avgChannel(selColor!) > 180;
  if (closedBgLight) {
    expect(closedTextLight).toBe(false);
  }
}

/**
 * Wave 5 polish smokebook — Playwright coverage for items 1–6, 7, 10, 11, 13.
 * Items 8/12 (12e) and 9 (12d) live in whiteboard-live-sync-regression.spec.ts.
 * Item 7 also covered by invariants 10 + 13 in regression spec.
 */
test.describe("Wave 5 polish smokebook", { tag: [TAG.WB_CHROME] }, () => {
  test("item 1 — coral student Exit: accent styling, icon, aria-label, disconnects", { tag: [TAG.WB_PRESENCE] }, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const exit = peers.studentPage.getByTestId("wb-student-exit");
      await expect(exit).toBeVisible({ timeout: 30_000 });
      await expect(exit).toHaveAttribute("aria-label", "Exit");
      await expect(exit).toHaveClass(/mynk-wb-tb-btn--exit/);
      await expect(exit.locator("svg")).toBeVisible();

      const usesAccentFill = await exit.evaluate((el) => {
        const style = getComputedStyle(el);
        const accent = getComputedStyle(document.documentElement)
          .getPropertyValue("--accent")
          .trim();
        const bg = style.backgroundColor;
        if (!accent || !bg || bg === "rgba(0, 0, 0, 0)") return false;
        return bg !== getComputedStyle(document.documentElement).backgroundColor;
      });
      expect(usesAccentFill).toBe(true);

      await exit.click();
      await expect(peers.studentPage.getByRole("status")).toHaveText(
        /you left the session/i,
        { timeout: 15_000 }
      );
      await expect(peers.tutorPage.getByTestId("wb-end-session")).toBeVisible();
    } finally {
      await peers.close();
    }
  });

  test("item 2 — follow link icon + match crosshair on student desktop", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const followLabel = peers.studentPage.locator("label.mynk-wb-follow-toggle");
      const match = peers.studentPage.getByTestId("wb-student-match-view");
      await expect(followLabel).toBeVisible({ timeout: 30_000 });
      await expect(match).toBeVisible();
      await expect(followLabel.locator(".mynk-wb-menu-item__icon svg")).toBeVisible();
      await expect(match.locator("svg")).toBeVisible();

      await peers.studentPage.getByTestId("wb-student-follow-toggle").check();
      await expect(
        peers.studentPage.locator("label.mynk-wb-follow-toggle--synced")
      ).toBeVisible();
    } finally {
      await peers.close();
    }
  });

  test("item 3 — student overflow sheet left-alignment at mobile viewport", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    // Use pre-created learner storage state (avoids rate-limiting /api/auth/learner/login
    // when many tests run sequentially; falls back to a fresh login if file is absent).
    const learnerAuthFile = path.join(process.cwd(), "tests", "integration", ".auth", "learner.json");
    const learnerOpts = fs.existsSync(learnerAuthFile) ? { storageState: learnerAuthFile } : {};
    const studentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      ...learnerOpts,
    });
    if (!fs.existsSync(learnerAuthFile)) {
      await loginLearnerInContext(studentContext, session.learnerHandle, session.learnerPin);
    }
    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const tutorPage = await tutorContext.newPage();
      await loadTutorBoard(tutorPage, session);
      const studentPage = await studentContext.newPage();
      const encryptionKey = await tutorPage.evaluate(() => {
        const m = window.location.hash.match(/[#&]k=([^&]+)/);
        return m?.[1] ? decodeURIComponent(m[1]) : "";
      });
      // Use authenticated /join/[sessionId] path (workstream 1 — /w/ is retired).
      await studentPage.goto(
        `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(studentPage, "student");
      await waitForTutorStudentConnected(tutorPage);

      await assertStudentPortraitTopBarControls(studentPage);

      await studentPage.getByTestId("wb-student-topbar-overflow").click();
      const edges = await readOverflowMenuItemLeftEdges(studentPage);
      expect(edges.length).toBeGreaterThan(2);
      const minX = Math.min(...edges);
      const maxX = Math.max(...edges);
      expect(maxX - minX).toBeLessThanOrEqual(8);
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });

  test("item 4 — overflow dropdown opens downward (tutor + student at ≤900px)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    // The top-bar overflow `⋯` is touch-only chrome — `display:none` on
    // desktop/non-touch layouts (useWbLayoutMode `isTouchPrimaryDevice`; CSS
    // `.mynk-wb-topbar__overflow-btn` only `inline-flex` for narrow/tablet/
    // phone-landscape). After the half-width-desktop fix (Andrew 2026-06-24),
    // a resized *desktop* window at 844×390 stays desktop chrome with NO
    // overflow — so this test must emulate a real touch device. `hasTouch`
    // alone yields pointer:coarse in Chromium → phone-landscape layout.
    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 844, height: 390 },
      hasTouch: true,
    });
    const tutorPage = await tutorContext.newPage();
    await loadTutorBoard(tutorPage, session);
    await assertDropdownOpensBelowTrigger(tutorPage, "wb-topbar-overflow");
    await tutorContext.close();

    const peers = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 844, height: 390 },
      studentHasTouch: true,
      // This test asserts only overflow-dropdown geometry; follow state is
      // irrelevant. Skip ensureStudentFollowsTutor — on a compact student the
      // follow checkbox exists both inline and inside the overflow dropdown, so
      // the helper's role/name locator is ambiguous (strict-mode violation).
      ensureFollow: false,
    });
    try {
      await assertControlFullyInViewport(
        peers.studentPage,
        "wb-student-topbar-overflow"
      );
      await assertControlFullyInViewport(peers.studentPage, "wb-student-exit");
      await assertDropdownOpensBelowTrigger(
        peers.studentPage,
        "wb-student-topbar-overflow"
      );
    } finally {
      await peers.close();
    }
  });

  test("item 5 — grid icon toggle on desktop (tutor + student)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      for (const [page, role] of [
        [peers.tutorPage, "tutor"] as const,
        [peers.studentPage, "student"] as const,
      ]) {
        const grid = page.getByTestId("wb-grid-toggle");
        await expect(grid).toBeVisible({ timeout: 30_000 });
        const before = await readGridEnabled(page, role);
        await grid.click();
        await page.waitForFunction(
          ({ r, prev }) => {
            const bridge = (
              window as Window & {
                __TN_WB_E2E__?: Record<
                  string,
                  { getAppState: () => Record<string, unknown> }
                >;
              }
            ).__TN_WB_E2E__?.[r];
            if (!bridge?.getAppState) return false;
            return Boolean(bridge.getAppState().gridModeEnabled) !== prev;
          },
          { r: role, prev: before },
          { timeout: 5_000 }
        );
      }
    } finally {
      await peers.close();
    }
  });

  test("item 6 — student page strip read-only active highlight tracks tutor", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage
        .getByTestId("wb-tutor-page-strip")
        .getByRole("button", { name: "Add board" })
        .click();
      await expect(
        peers.studentPage.getByTestId("wb-student-page-strip").getByRole("tab")
      ).toHaveCount(2, { timeout: 15_000 });

      const strip = peers.studentPage.getByTestId("wb-student-page-strip");
      const board1 = strip.getByRole("tab", { name: "Board 1", exact: true });
      const board2 = strip.getByRole("tab", { name: "Board 2", exact: true });
      // Add board switches tutor to Board 2 — student highlight follows.
      await expect(board2).toHaveAttribute("aria-current", "page", {
        timeout: 15_000,
      });
      await expect(board1).not.toHaveAttribute("aria-current", "page");
      await expect(board1).toHaveAttribute("aria-disabled", "true");
      await expect(board2).toHaveAttribute("aria-disabled", "true");

      await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
      await expect(board1).toHaveAttribute("aria-current", "page", {
        timeout: 15_000,
      });
      await expect(board2).not.toHaveAttribute("aria-current", "page");

      await clickBoardPageTab(peers.tutorPage, "tutor", "Board 2");
      const p2Stroke = `pw-w5-tab-${Date.now()}`;
      await drawTestStrokeOnRole(
        peers.tutorPage,
        "tutor",
        p2Stroke,
        120,
        120,
        220,
        220
      );
      await waitForElementOnPeer(peers.studentPage, "student", p2Stroke, 45_000);

      await expect(board2).toHaveAttribute("aria-current", "page", {
        timeout: 15_000,
      });
      await expect(board1).not.toHaveAttribute("aria-current", "page");
    } finally {
      await peers.close();
    }
  });

  test("item 7 — view lock: student wheel pan reverts while follow ON", { tag: [TAG.WB_VIEWPORT] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await setViewportOnRole(peers.tutorPage, "tutor", 280, 180, 1.25);
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

      const canvas = peers.studentPage
        .locator('[data-testid="student-whiteboard-canvas-mount"] .excalidraw')
        .first();
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      await peers.studentPage.mouse.move(
        box!.x + box!.width / 2,
        box!.y + box!.height / 2
      );
      await peers.studentPage.mouse.wheel(0, 240);
      await peers.studentPage.waitForTimeout(400);

      const afterWheel = await readViewportSnapshot(peers.studentPage, "student");
      const tutorAfter = await readViewportSnapshot(peers.tutorPage, "tutor");
      const oracle = expectedAlignedStudentScroll(tutorAfter, afterWheel);
      expect(Math.abs(afterWheel.scrollX - oracle.scrollX)).toBeLessThanOrEqual(8);
      expect(Math.abs(afterWheel.scrollY - oracle.scrollY)).toBeLessThanOrEqual(8);

      await setStudentFollowTutor(peers.studentPage, false);
      await setViewportOnRole(peers.studentPage, "student", 50, 50, 1);
      await peers.studentPage.waitForTimeout(200);
      const independent = await readViewportSnapshot(peers.studentPage, "student");
      expect(Math.abs(independent.scrollX - oracle.scrollX)).toBeGreaterThan(20);
    } finally {
      await peers.close();
    }
  });

  test("item 10 — left rail More reachable at short viewport (tutor + student)", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();

    // Resolve learner storage state once (avoids per-test rate-limiting).
    const _learnerAuthFile10 = path.join(process.cwd(), "tests", "integration", ".auth", "learner.json");
    const _learnerOpts10 = fs.existsSync(_learnerAuthFile10) ? { storageState: _learnerAuthFile10 } : {};

    for (const role of ["tutor", "student"] as const) {
      const viewport = { width: 1280, height: 500 };
      const context =
        role === "tutor"
          ? await browser.newContext({
              storageState: "tests/integration/.auth/tutor.json",
              viewport,
            })
          : await browser.newContext({ viewport, ..._learnerOpts10 });
      const page = await context.newPage();
      if (role === "tutor") {
        await loadTutorBoard(page, session);
      } else {
        const tutorContext = await browser.newContext({
          storageState: "tests/integration/.auth/tutor.json",
          viewport: { width: 1280, height: 900 },
        });
        const tutorPage = await tutorContext.newPage();
        await loadTutorBoard(tutorPage, session);
        const key = await tutorPage.evaluate(() => {
          const m = window.location.hash.match(/[#&]k=([^&]+)/);
          return m?.[1] ? decodeURIComponent(m[1]) : "";
        });
        // Fall back to fresh login if no stored state is available.
        if (!fs.existsSync(_learnerAuthFile10)) {
          await loginLearnerInContext(context, session.learnerHandle, session.learnerPin);
        }
        await page.goto(
          `/join/${session.whiteboardSessionId}#k=${key}`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(
          page.getByTestId("student-whiteboard-canvas-mount")
        ).toBeVisible({ timeout: 90_000 });
        await tutorContext.close();
      }

      const moreBtn = page.getByRole("button", {
        name: /More — z-order, delete, hand/i,
      });
      await expect(moreBtn).toBeAttached({ timeout: 10_000 });
      await moreBtn.scrollIntoViewIfNeeded();
      const box = await moreBtn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(500);
      await context.close();
    }
  });

  test("item 11 — overflow open then widen: dropdown closes, page stays interactive", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    // Touch context: the overflow `⋯` only exists on touch layouts (see item 4).
    // 850×900 + touch → tablet-portrait (overflow shown). Widening to 1280×900
    // crosses to desktop layout → the layout-change effect fires
    // setOpenMenu(null) and the overflow button hides, so the open dropdown must
    // close. `hasTouch` keeps pointer:coarse across the resize so the only thing
    // that changes is the width-driven layout mode.
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 850, height: 900 },
      hasTouch: true,
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    await page.getByTestId("wb-topbar-overflow").click();
    await expect(page.getByTestId("wb-topbar-overflow-dropdown")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByTestId("wb-topbar-overflow-dropdown")).not.toBeVisible({
      timeout: 5_000,
    });

    await page.getByRole("button", { name: "Pencil (P)" }).click();
    await expect(page.getByRole("button", { name: "Pencil (P)" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await context.close();
  });

  test("native select — mic/cam device pickers readable on dark theme (regression)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone", "camera"],
      colorScheme: "dark",
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    await page.getByTestId("wb-topbar-mic-settings").click();
    // Tutor mic popover renders <MicControls/> → native <select
    // data-testid="mic-device-select"> (NOT "audio-device-select", which never
    // existed on this surface — stale selector from before the mic-popover
    // refactor; corrected 2026-06-26, Part 1 checkpoint).
    await expect(page.getByTestId("mic-device-select")).toBeVisible({
      timeout: 10_000,
    });
    await assertNativeSelectReadable(page, "mic-device-select");

    await page.keyboard.press("Escape");
    const camCaret = page.getByTestId("wb-topbar-cam-settings");
    if (await camCaret.isVisible()) {
      await camCaret.click();
      const videoSelect = page.getByTestId("video-device-select");
      if (await videoSelect.isVisible()) {
        await assertNativeSelectReadable(page, "video-device-select");
      }
    }

    await context.close();
  });

  const STUDENT_PORTRAIT_VIEWPORTS: ReadonlyArray<
    WbViewportSize & { label: string }
  > = [
    { label: "390x844", width: 390, height: 844 },
    { label: "320x568", width: 320, height: 568 },
  ];

  for (const viewport of STUDENT_PORTRAIT_VIEWPORTS) {
    test(`item 19 — student phone portrait topbar (${viewport.label})`, async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentViewport: { width: viewport.width, height: viewport.height },
        ensureFollow: false,
      });
      try {
        await assertStudentPortraitTopBarControls(peers.studentPage);

        const overflow = peers.studentPage.getByTestId(
          "wb-student-topbar-overflow"
        );
        await overflow.click();
        await expect(
          peers.studentPage.getByTestId("wb-overflow-mic")
        ).toBeVisible({ timeout: 5_000 });
        await expect(
          peers.studentPage.getByTestId("wb-overflow-cam")
        ).toBeVisible();
        await expect(
          peers.studentPage.getByTestId("wb-overflow-toolbar-toggle")
        ).toBeVisible();

        const avCluster = peers.studentPage.getByTestId("wb-student-av-row");
        await expect(avCluster).toBeVisible({ timeout: 30_000 });
        await assertControlFullyInViewport(peers.studentPage, "wb-student-av-row");
      } finally {
        await peers.close();
      }
    });
  }

  test("item 20 — half-width desktop stays desktop chrome; touch at same width flips (layout firewall)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();

    // --- Non-touch desktop: resizing a desktop window down to half-width must
    // NOT flip to a touch/phone layout (Andrew 2026-06-24 smoke: half-screen on
    // a monitor flipped to mobile chrome). detectLayoutMode keeps "desktop" for
    // mouse/fine-pointer down to the 400px emergency floor.
    const desktopCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const desktopPage = await desktopCtx.newPage();
      await loadTutorBoard(desktopPage, session);
      const chrome = desktopPage.getByTestId("mynk-wb-chrome");
      await expect(chrome).toHaveAttribute("data-layout", "desktop");

      // Half-screen on a 1280 monitor ≈ 700px. Must stay desktop.
      await desktopPage.setViewportSize({ width: 700, height: 900 });
      await expect(chrome).toHaveAttribute("data-layout", "desktop", {
        timeout: 5_000,
      });
    } finally {
      await desktopCtx.close();
    }

    // --- Touch device at the SAME 700px width: the input capability (coarse
    // pointer / no hover), not the width, is what flips to compact chrome. At
    // 700px (< 768) that is "narrow". This is the contrast that proves the fix
    // keys off input capability, not viewport width alone.
    const touchCtx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 700, height: 900 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const touchPage = await touchCtx.newPage();
      await loadTutorBoard(touchPage, session);

      // Positive control: the context really emulates a coarse-pointer device.
      // Without this a setup regression (no touch emulation) would silently make
      // the touch case behave like desktop and false-green the firewall claim.
      const coarse = await touchPage.evaluate(
        () => window.matchMedia("(hover: none), (pointer: coarse)").matches
      );
      expect(
        coarse,
        "touch context did not emulate a coarse pointer — test setup issue"
      ).toBe(true);

      await expect(touchPage.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "narrow",
        { timeout: 5_000 }
      );
    } finally {
      await touchCtx.close();
    }
  });

  test("item 21 — phone-landscape left rail: Shapes + More reachable and not clipped (tutor)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();

    // Phone landscape (≈844×390) with a real coarse pointer (hasTouch alone
    // yields pointer:coarse in Chromium without the isMobile visual-viewport
    // split). The historical smokebook bug: the slim left rail / its Shapes &
    // More sheets were unusable. Oracle = containment + reachability AFTER the
    // slide-up transition settles, NOT absolute coords (visual-layout-oracles).
    // NOTE: action sheets animate via `transform: translateY(100%→0)` over
    // 0.25s; measuring before the transition settles reads the closed (off-
    // screen) position — hence the explicit settle below.
    const ctx = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 844, height: 390 },
      hasTouch: true,
    });
    try {
      const page = await ctx.newPage();
      await loadTutorBoard(page, session);

      // Positive control + sanity: really a coarse-pointer phone-landscape layout.
      const coarse = await page.evaluate(
        () => window.matchMedia("(hover: none), (pointer: coarse)").matches
      );
      expect(
        coarse,
        "context did not emulate a coarse pointer — test setup issue"
      ).toBe(true);
      await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "phone-landscape",
        { timeout: 5_000 }
      );

      const innerH = await page.evaluate(() => window.innerHeight);
      const innerW = await page.evaluate(() => window.innerWidth);
      const within = (
        box: { x: number; y: number; width: number; height: number } | null
      ) => {
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.y).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(innerW + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(innerH + 1);
      };

      const rail = page.getByTestId("wb-bottom-toolbar");
      await expect(rail).toBeVisible();

      const shapes = rail.getByRole("button", { name: "Shapes" });
      const more = rail.getByRole("button", { name: /More — z-order/i });
      await expect(shapes).toBeVisible();
      await expect(more).toBeVisible();

      // Each rail control is fully inside the viewport (rail is scrollable).
      await shapes.scrollIntoViewIfNeeded();
      within(await shapes.boundingBox());
      await more.scrollIntoViewIfNeeded();
      within(await more.boundingBox());

      // Open a sheet, wait for the slide-up to settle (bottom anchored to the
      // viewport bottom), then assert it is fully within the viewport — its
      // scrollable body keeps all items reachable on the short landscape height.
      const assertSheetReachable = async (testId: string) => {
        const sheet = page.getByTestId(testId);
        // These sheets are always in the DOM (display:flex) and toggle open via
        // the `--open` class (closed = translateY(100%) off-screen), so the open
        // signal is the class, not Playwright visibility.
        await expect(sheet).toHaveClass(/mynk-wb-action-sheet--open/, {
          timeout: 5_000,
        });
        await expect
          .poll(
            async () => {
              const box = await sheet.boundingBox();
              return box ? Math.round(box.y + box.height) : Number.MAX_SAFE_INTEGER;
            },
            { timeout: 5_000, message: `${testId} never settled within viewport` }
          )
          .toBeLessThanOrEqual(innerH + 1);
        within(await sheet.boundingBox());
        // Body is the scroll container so overflowing items stay reachable.
        const bodyOverflow = await sheet
          .locator(".mynk-wb-action-sheet__body")
          .evaluate((el) => getComputedStyle(el).overflowY);
        expect(["auto", "scroll"]).toContain(bodyOverflow);
      };

      await shapes.click();
      await assertSheetReachable("wb-shapes-sheet");
      // Touch sheets dismiss via the × button (not Escape).
      await page
        .getByTestId("wb-shapes-sheet")
        .getByRole("button", { name: "Dismiss" })
        .click();
      await expect(page.getByTestId("wb-shapes-sheet")).not.toHaveClass(
        /mynk-wb-action-sheet--open/,
        { timeout: 5_000 }
      );

      await more.click();
      await assertSheetReachable("wb-more-sheet");
    } finally {
      await ctx.close();
    }
  });

  test("item 22 — student narrow top bar: no horizontal overflow, controls don't overlap", { tag: [TAG.WB_PRESENCE] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    // Tightest supported narrow width (matches item 19's 320×568 stress case).
    // Smokebook bug class: cramped/overlapping top-bar controls at narrow width.
    // Containment is already asserted by assertStudentPortraitTopBarControls;
    // this adds the spacing oracle: the header must not horizontally overflow
    // and the leading pill / trailing overflow + exit must not overlap.
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      studentViewport: { width: 320, height: 568 },
    });
    try {
      const page = peers.studentPage;
      await assertStudentPortraitTopBarControls(page);

      const header = page.locator(".mynk-wb-topbar");
      // No clipped/overflowing content: scrollWidth must fit clientWidth.
      const overflow = await header.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        "student narrow top bar overflows horizontally (content clipped)"
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // Trailing controls + leading pill must not overlap each other.
      const ids = [
        "wb-student-sync-pill",
        "wb-student-topbar-overflow",
        "wb-student-exit",
      ];
      const boxes = await Promise.all(
        ids.map(async (id) => ({
          id,
          box: await page.getByTestId(id).boundingBox(),
        }))
      );
      for (const b of boxes) {
        expect(b.box, `${b.id} bounding box`).not.toBeNull();
      }
      const overlaps = (
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number }
      ) =>
        a.x < b.x + b.width &&
        b.x < a.x + a.width &&
        a.y < b.y + b.height &&
        b.y < a.y + a.height;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(
            overlaps(boxes[i].box!, boxes[j].box!),
            `${boxes[i].id} overlaps ${boxes[j].id}`
          ).toBe(false);
        }
      }
    } finally {
      await peers.close();
    }
  });

  test("item 13 — review thumbnail renders JSXGraph board, not mynk://graph text", { tag: [TAG.WB_GRAPH] }, async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const session = await seedWbLiveSyncSession();

    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Solo recording grace: allow audio bridge + recorder to arm before scene capture.
    await expect(page.getByTestId("wb-recording-pill")).toContainText(/live/i, {
      timeout: 60_000,
    });
    await page.waitForTimeout(2_000);
    await drawTestStrokeOnRole(
      page,
      "tutor",
      `pw-w5-review-prime-${Date.now()}`,
      60,
      60,
      120,
      120
    );
    await page.waitForTimeout(2_000);

    await page.getByTestId("wb-insert-graph").click();
    await page.getByTestId("wb-graph-mode-blank").click();
    await page.getByTestId("wb-graph-insert").click();
    await addGraphExpressionViaUI(page, "x^2");
    await drawTestStrokeOnRole(
      page,
      "tutor",
      `pw-w5-review-${Date.now()}`,
      80,
      80,
      160,
      160
    );
    await page.waitForTimeout(3_000);

    await page.getByTestId("wb-end-session").click();
    const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await expect(page.getByRole("toolbar", { name: "Session review" })).toBeVisible({
      timeout: 180_000,
    });

    const eventsRes = await page.request.get(
      `/api/whiteboard/${session.whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = await eventsRes.json();
    const eventsJson = JSON.stringify(eventsBody);
    expect(eventsJson).toContain("mynk://graph");
    expect(eventsJson).toMatch(/"type"\s*:\s*"graph"/);

    const thumbWrap = page.getByTestId("wb-review-board-thumbnail-wrap");
    const thumbnail = thumbWrap.getByTestId("wb-review-board-thumbnail");
    await expect(thumbnail).toBeAttached({ timeout: 90_000 });
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbWrap).not.toContainText("mynk://graph");

    const graphHost = thumbWrap.locator('[data-testid="wb-graph-embed-host"]');
    await expect(graphHost).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          thumbWrap.locator(
            ".wb-graph-board-host .jxgbox svg path, .wb-graph-board-host .JXGtext"
          ).count(),
        { timeout: 90_000 }
      )
      .toBeGreaterThan(0);
    await context.close();
  });

  test("item 23 — narrow-desktop top bar: controls compact to overflow, End Session always visible, no clip", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const session = await seedWbLiveSyncSession();
    const widths = [1280, 900, 640, 460] as const;

    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    try {
      const page = await context.newPage();
      await loadTutorBoard(page, session);
      const chrome = page.getByTestId("mynk-wb-chrome");
      await expect(chrome).toHaveAttribute("data-layout", "desktop");

      for (const width of widths) {
        if (width !== 1280) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(200);
        }
        await expect(chrome).toHaveAttribute("data-layout", "desktop", {
          timeout: 5_000,
        });

        const header = page.locator(".mynk-wb-topbar");
        const overflow = await header.evaluate((el) => ({
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));
        expect(
          overflow.scrollWidth,
          `top bar overflows horizontally at ${width}px`
        ).toBeLessThanOrEqual(overflow.clientWidth + 2);

        await assertControlFullyInViewport(page, "wb-end-session");

        const overflowBtn = page.getByTestId("wb-topbar-overflow");
        if (width >= 1100) {
          await expect(overflowBtn).not.toBeVisible();
          await expect(page.getByTestId("wb-theme-toggle")).toBeVisible();
        } else {
          await expect(overflowBtn).toBeVisible();
          await overflowBtn.scrollIntoViewIfNeeded();
          await overflowBtn.click();
          await expect(overflowBtn).toHaveAttribute("aria-expanded", "true", {
            timeout: 5_000,
          });
          const dropdown = page.getByTestId("wb-topbar-overflow-dropdown");
          await expect(dropdown).toBeVisible({ timeout: 5_000 });
          const triggerBox = await overflowBtn.boundingBox();
          const dropdownBox = await dropdown.boundingBox();
          expect(triggerBox).not.toBeNull();
          expect(dropdownBox).not.toBeNull();
          expect(dropdownBox!.y).toBeGreaterThanOrEqual(
            triggerBox!.y + triggerBox!.height - 2
          );
          await overflowBtn.click();
          await expect(dropdown).not.toBeVisible({ timeout: 3_000 });
        }
      }
    } finally {
      await context.close();
    }
  });
});
