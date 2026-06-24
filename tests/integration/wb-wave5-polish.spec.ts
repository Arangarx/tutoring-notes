import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  assertEqualVerticalInsetInParent,
  clickBoardPageTab,
  drawTestStrokeOnRole,
  expectedAlignedStudentScroll,
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
    const studentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
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
      await studentPage.goto(`/w/${session.joinToken}#k=${encryptionKey}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });
      await waitForWbE2eBridge(studentPage, "student");

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

    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 844, height: 390 },
    });
    const tutorPage = await tutorContext.newPage();
    await loadTutorBoard(tutorPage, session);
    await assertDropdownOpensBelowTrigger(tutorPage, "wb-topbar-overflow");
    await tutorContext.close();

    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.studentPage.setViewportSize({ width: 844, height: 390 });
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

    for (const role of ["tutor", "student"] as const) {
      const viewport = { width: 1280, height: 500 };
      const context =
        role === "tutor"
          ? await browser.newContext({
              storageState: "tests/integration/.auth/tutor.json",
              viewport,
            })
          : await browser.newContext({ viewport });
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
        await page.goto(`/w/${session.joinToken}#k=${key}`, {
          waitUntil: "domcontentloaded",
        });
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
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 850, height: 900 },
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

  test("item 13 — review thumbnail renders JSXGraph board, not mynk://graph text", { tag: [TAG.WB_GRAPH] }, async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    const env = readLocalEnv();
    test.skip(
      !env.BLOB_READ_WRITE_TOKEN?.trim(),
      "Set BLOB_READ_WRITE_TOKEN in .env for end-session review thumbnail test."
    );

    const session = await seedWbLiveSyncSession();
    const prisma = new PrismaClient();
    try {
      await prisma.student.update({
        where: { id: session.studentId },
        data: { recordingDefaultEnabled: true },
      });
    } finally {
      await prisma.$disconnect();
    }

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
    await expect(
      graphHost.locator(".wb-graph-board-host .jxgbox svg, .wb-graph-board-host .JXGtext").first()
    ).toBeVisible({ timeout: 60_000 });
    await context.close();
  });
});
