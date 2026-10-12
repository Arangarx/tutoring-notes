/**
 * Locked student view: pan and zoom never reach the camera.
 * Oracle is Excalidraw's own onScrollChange (the snap-back fires it).
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  armScrollChangeCounter,
  openTutorAndStudent,
  readScrollChangeCount,
  readViewportSnapshot,
  resetScrollChangeCount,
  seedWbLiveSyncSession,
  setStudentFollowTutor,
  setViewportOnRole,
  expectedAlignedStudentScroll,
  waitForViewportAligned,
  type ViewportSnapshot,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

test.describe("student view lock", {
  tag: [TAG.WB_VIEWPORT, TAG.WB_CHROME, TAG.WB_SYNC],
}, () => {
  test("wheel, ctrl-wheel, gesture, and keyboard do not move a locked camera", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.waitForTimeout(250);

      await heldAttempt(peers.studentPage, "plain wheel", async () => {
        await wheelOnCanvas(peers.studentPage, 240);
      });
      await heldAttempt(peers.studentPage, "ctrl wheel", async () => {
        await peers.studentPage.keyboard.down("Control");
        try {
          await wheelOnCanvas(peers.studentPage, 200);
        } finally {
          await peers.studentPage.keyboard.up("Control");
        }
      });
      await heldAttempt(peers.studentPage, "gesturechange", async () => {
        await dispatchCanvasGesture(peers.studentPage);
      });
      await heldAttempt(peers.studentPage, "Space drag", async () => {
        await focusCanvas(peers.studentPage);
        await peers.studentPage.keyboard.down("Space");
        try {
          const box = await canvasBox(peers.studentPage);
          await peers.studentPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await peers.studentPage.mouse.down();
          await peers.studentPage.mouse.move(
            box.x + box.width / 2 + 90,
            box.y + box.height / 2 + 40,
            { steps: 6 }
          );
          await peers.studentPage.mouse.up();
        } finally {
          await peers.studentPage.keyboard.up("Space");
        }
      });
      await heldAttempt(peers.studentPage, "plus key", async () => {
        await focusCanvas(peers.studentPage);
        await peers.studentPage.keyboard.down("Control");
        try {
          await peers.studentPage.keyboard.press("+");
        } finally {
          await peers.studentPage.keyboard.up("Control");
        }
      });

      await wheelOnCanvas(peers.studentPage, 80);
      await expect(
        peers.studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toHaveAttribute("data-wb-lock-nudge", "1");
    } finally {
      await peers.close();
    }
  });

  test("two-finger pinch and pan do not move a locked camera", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 390, height: 844 },
      studentHasTouch: true,
      studentIsMobile: true,
    });
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.waitForTimeout(250);
      const box = await canvasBox(peers.studentPage);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;

      await heldAttempt(peers.studentPage, "two-finger pinch", async () => {
        await dispatchTwoFinger(
          peers.studentPage,
          [
            { x: cx - 24, y: cy },
            { x: cx + 24, y: cy },
          ],
          [
            { x: cx - 90, y: cy },
            { x: cx + 90, y: cy },
          ]
        );
      });
      await heldAttempt(peers.studentPage, "two-finger pan", async () => {
        await dispatchTwoFinger(
          peers.studentPage,
          [
            { x: cx - 20, y: cy },
            { x: cx + 20, y: cy },
          ],
          [
            { x: cx + 50, y: cy + 36 },
            { x: cx + 90, y: cy + 36 },
          ]
        );
      });
    } finally {
      await peers.close();
    }
  });

  test("Space on the focused lock pill opens the unlock dialog", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      const pill = peers.studentPage.getByTestId("wb-view-locked-indicator");
      const dialog = peers.studentPage.getByTestId("wb-view-locked-unlock-dialog");
      await expect(pill).toBeVisible();
      await expect(dialog).toBeHidden();
      await tabToTestId(peers.studentPage, "wb-view-locked-indicator");
      await peers.studentPage.keyboard.press("Space");
      await expect(dialog).toBeVisible();
    } finally {
      await peers.close();
    }
  });

  test("one-finger stroke still draws and syncs while locked", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.getByRole("button", { name: "Pencil (P)" }).click();
      await resetScrollChangeCount(peers.studentPage);
      const beforeCamera = await readViewportSnapshot(peers.studentPage, "student");
      const beforeTutor = await liveElementCount(peers.tutorPage, "tutor");
      const box = await canvasBox(peers.studentPage);
      const x0 = box.x + box.width * 0.35;
      const y0 = box.y + box.height * 0.45;
      await peers.studentPage.mouse.move(x0, y0);
      await peers.studentPage.mouse.down();
      await peers.studentPage.mouse.move(x0 + 80, y0 + 50, { steps: 8 });
      await peers.studentPage.mouse.up();

      await expect
        .poll(() => liveElementCount(peers.tutorPage, "tutor"), { timeout: 20_000 })
        .toBeGreaterThan(beforeTutor);
      const studentCount = await liveElementCount(peers.studentPage, "student");
      expect(studentCount).toBeGreaterThan(beforeTutor);
      await expectCameraUnmoved(peers.studentPage, beforeCamera, "one-finger stroke");
    } finally {
      await peers.close();
    }
  });

  test("a second finger mid-stroke does not move the camera and the stroke syncs", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.getByRole("button", { name: "Pencil (P)" }).click();
      await resetScrollChangeCount(peers.studentPage);
      const beforeCamera = await readViewportSnapshot(peers.studentPage, "student");
      const beforeStudent = await liveElementCount(peers.studentPage, "student");
      const beforeTutor = await liveElementCount(peers.tutorPage, "tutor");
      const box = await canvasBox(peers.studentPage);
      const x0 = box.x + box.width * 0.35;
      const y0 = box.y + box.height * 0.45;
      await dispatchStrokeWithSecondFinger(peers.studentPage, {
        start: { x: x0, y: y0 },
        mid: { x: x0 + 36, y: y0 + 18 },
        end: { x: x0 + 90, y: y0 + 48 },
        second: { x: x0 + 28, y: y0 - 36 },
      });

      await expectCameraUnmoved(peers.studentPage, beforeCamera, "second finger mid-stroke");
      await expect
        .poll(() => liveElementCount(peers.tutorPage, "tutor"), { timeout: 20_000 })
        .toBeGreaterThan(beforeTutor);
      expect(await liveElementCount(peers.studentPage, "student")).toBeGreaterThan(beforeStudent);
    } finally {
      await peers.close();
    }
  });

  test("a wheel over the overflow menu still scrolls it", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 390, height: 844 },
      studentHasTouch: true,
      studentIsMobile: true,
    });
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.getByTestId("wb-student-topbar-overflow").click();
      const scroller = peers.studentPage.locator(
        ".mynk-wb-topbar-overflow-dropdown__scroll"
      );
      await expect(scroller).toBeVisible();
      const metrics = await scroller.evaluate((el) => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
      }));
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight + 8);
      const box = await scroller.boundingBox();
      expect(box).not.toBeNull();
      await resetScrollChangeCount(peers.studentPage);
      const beforeCamera = await readViewportSnapshot(peers.studentPage, "student");
      await peers.studentPage.mouse.move(box!.x + box!.width / 2, box!.y + 30);
      await peers.studentPage.mouse.wheel(0, 180);
      await expect
        .poll(() => scroller.evaluate((el) => el.scrollTop))
        .toBeGreaterThan(metrics.scrollTop);
      await expectCameraUnmoved(peers.studentPage, beforeCamera, "overflow wheel");
    } finally {
      await peers.close();
    }
  });

  test("follow off lets a wheel change the camera", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await setStudentFollowTutor(peers.studentPage, false);
      await armScrollChangeCounter(peers.studentPage, "student");
      await resetScrollChangeCount(peers.studentPage);
      const before = await readViewportSnapshot(peers.studentPage, "student");
      await wheelOnCanvas(peers.studentPage, 280);
      await peers.studentPage.waitForTimeout(300);
      const after = await readViewportSnapshot(peers.studentPage, "student");
      const moved =
        Math.abs(after.scrollX - before.scrollX) > 0.5 ||
        Math.abs(after.scrollY - before.scrollY) > 0.5 ||
        Math.abs(after.zoom - before.zoom) > 0.001;
      expect(moved).toBe(true);
      expect(await readScrollChangeCount(peers.studentPage)).toBeGreaterThan(0);
    } finally {
      await peers.close();
    }
  });

  test("the lock pill is inside the canvas and clear of the top bar at phone size", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 390, height: 844 },
      studentHasTouch: true,
      studentIsMobile: true,
    });
    try {
      await expect(peers.studentPage.getByTestId("wb-topbar-overflow-dropdown")).toBeHidden();
      const pill = peers.studentPage.getByTestId("wb-view-locked-indicator");
      await expect(pill).toBeVisible();
      await expect(pill).toContainText("Locked to tutor's view");
      const pillBox = await pill.boundingBox();
      const canvasBox = await peers.studentPage
        .getByTestId("student-whiteboard-canvas-mount")
        .boundingBox();
      const barBox = await peers.studentPage.locator(".mynk-wb-topbar").first().boundingBox();
      expect(pillBox).not.toBeNull();
      expect(canvasBox).not.toBeNull();
      expect(barBox).not.toBeNull();
      // Inside the canvas rect.
      expect(pillBox!.x).toBeGreaterThanOrEqual(canvasBox!.x - 1);
      expect(pillBox!.y).toBeGreaterThanOrEqual(canvasBox!.y - 1);
      expect(pillBox!.x + pillBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 1);
      expect(pillBox!.y + pillBox!.height).toBeLessThanOrEqual(
        canvasBox!.y + canvasBox!.height + 1
      );
      // Does not overlap the top bar.
      const overlaps =
        pillBox!.x < barBox!.x + barBox!.width &&
        pillBox!.x + pillBox!.width > barBox!.x &&
        pillBox!.y < barBox!.y + barBox!.height &&
        pillBox!.y + pillBox!.height > barBox!.y;
      expect(overlaps).toBe(false);
    } finally {
      await peers.close();
    }
  });

  test("tapping the pill confirms unlock; cancel leaves the camera locked", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      await armScrollChangeCounter(peers.studentPage, "student");
      const pill = peers.studentPage.getByTestId("wb-view-locked-indicator");
      await pill.click();
      const dialog = peers.studentPage.getByTestId("wb-view-locked-unlock-dialog");
      await expect(dialog).toBeVisible();
      await peers.studentPage.getByTestId("wb-view-locked-unlock-cancel").click();
      await expect(dialog).toBeHidden();
      await expect(pill).toBeVisible();
      await heldAttempt(peers.studentPage, "wheel after cancel", async () => {
        await wheelOnCanvas(peers.studentPage, 220);
      });

      await pill.click();
      await expect(dialog).toBeVisible();
      await peers.studentPage.getByTestId("wb-view-locked-unlock-confirm").click();
      await expect(pill).toHaveCount(0);
      await expect(
        peers.studentPage.getByRole("checkbox", { name: /follow tutor/i })
      ).not.toBeChecked();

      await resetScrollChangeCount(peers.studentPage);
      const before = await readViewportSnapshot(peers.studentPage, "student");
      await wheelOnCanvas(peers.studentPage, -220);
      await peers.studentPage.waitForTimeout(300);
      const after = await readViewportSnapshot(peers.studentPage, "student");
      const moved =
        Math.abs(after.scrollX - before.scrollX) > 0.5 ||
        Math.abs(after.scrollY - before.scrollY) > 0.5 ||
        Math.abs(after.zoom - before.zoom) > 0.001;
      expect(moved, "wheel after unlock").toBe(true);
    } finally {
      await peers.close();
    }
  });

  test("webkit iPhone blocks a wheel and shows the lock pill", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      studentBrowser: "webkit",
    });
    try {
      await settleStudentOnTutor(peers.tutorPage, peers.studentPage);
      const pill = peers.studentPage.getByTestId("wb-view-locked-indicator");
      await expect(pill).toBeVisible();
      await expect(pill).toContainText("Locked to tutor's view");
      await expect(peers.studentPage.getByTestId("wb-topbar-overflow-dropdown")).toBeHidden();
      await armScrollChangeCounter(peers.studentPage, "student");
      await peers.studentPage.waitForTimeout(250);
      await heldAttempt(peers.studentPage, "webkit wheel", async () => {
        await wheelOnCanvas(peers.studentPage, 200);
      });
    } finally {
      await peers.close();
    }
  });
});

async function settleStudentOnTutor(tutorPage: Page, studentPage: Page): Promise<void> {
  await setViewportOnRole(tutorPage, "tutor", 280, 180, 1.25);
  const tutorVp = await readViewportSnapshot(tutorPage, "tutor");
  const studentVp = await readViewportSnapshot(studentPage, "student");
  const expected = expectedAlignedStudentScroll(tutorVp, studentVp);
  await waitForViewportAligned(
    studentPage,
    "student",
    expected.scrollX,
    expected.scrollY,
    8,
    12_000
  );
}

async function canvasBox(page: Page) {
  const canvas = page
    .locator('[data-testid="student-whiteboard-canvas-mount"] .excalidraw')
    .first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no box");
  return box;
}

async function wheelOnCanvas(page: Page, deltaY: number): Promise<void> {
  const box = await canvasBox(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  try {
    await page.mouse.wheel(0, deltaY);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Playwright has no mouse wheel on mobile WebKit. A ctrl-wheel is the
    // event that used to move the camera (plain wheel is a no-op under follow).
    if (!/not supported in mobile WebKit/i.test(message)) throw err;
    await page.evaluate(
      ({ clientX, clientY, deltaY: dy }) => {
        const target = document.querySelector(
          '[data-testid="student-whiteboard-canvas-mount"] canvas.interactive'
        );
        if (!(target instanceof HTMLElement)) throw new Error("no interactive canvas");
        target.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            deltaY: dy,
            ctrlKey: true,
          })
        );
      },
      { clientX: x, clientY: y, deltaY }
    );
  }
}

async function tabToTestId(page: Page, testId: string): Promise<void> {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  for (let i = 0; i < 80; i++) {
    const hit = await page.evaluate(
      (id) => document.activeElement?.getAttribute("data-testid") === id,
      testId
    );
    if (hit) return;
    await page.keyboard.press("Tab");
  }
  const last = await page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return "(none)";
    return el.getAttribute("data-testid") ?? el.tagName;
  });
  throw new Error(`never tabbed to ${testId}; last focus ${last}`);
}

async function focusCanvas(page: Page): Promise<void> {
  const box = await canvasBox(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function expectCameraUnmoved(
  page: Page,
  before: ViewportSnapshot,
  label: string
): Promise<void> {
  await page.waitForTimeout(450);
  const changes = await readScrollChangeCount(page);
  const after = await readViewportSnapshot(page, "student");
  expect(changes, `${label} scroll changes`).toBe(0);
  expect(Math.abs(after.scrollX - before.scrollX), `${label} scrollX`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.scrollY - before.scrollY), `${label} scrollY`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.zoom - before.zoom), `${label} zoom`).toBeLessThanOrEqual(0.001);
}

async function heldAttempt(
  page: Page,
  label: string,
  run: () => Promise<void>
): Promise<void> {
  await resetScrollChangeCount(page);
  const before = await readViewportSnapshot(page, "student");
  await run();
  await expectCameraUnmoved(page, before, label);
}

async function dispatchCanvasGesture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="student-whiteboard-canvas-mount"] canvas.interactive'
    );
    if (!(target instanceof HTMLElement)) throw new Error("no interactive canvas");
    const fire = (type: string, scale: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "scale", { value: scale });
      target.dispatchEvent(ev);
    };
    fire("gesturestart", 1);
    fire("gesturechange", 1.45);
  });
}

async function dispatchStrokeWithSecondFinger(
  page: Page,
  points: {
    start: { x: number; y: number };
    mid: { x: number; y: number };
    end: { x: number; y: number };
    second: { x: number; y: number };
  }
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const touch = (
    id: number,
    x: number,
    y: number
  ): {
    x: number;
    y: number;
    id: number;
    radiusX: number;
    radiusY: number;
    force: number;
  } => ({
    x: Math.round(x),
    y: Math.round(y),
    id,
    radiusX: 1,
    radiusY: 1,
    force: 1,
  });
  const send = (type: "touchStart" | "touchMove" | "touchEnd", pts: ReturnType<typeof touch>[]) =>
    client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: pts,
      modifiers: 0,
    });
  const finger1 = 1;
  const finger2 = 2;
  await send("touchStart", [touch(finger1, points.start.x, points.start.y)]);
  await page.waitForTimeout(40);
  await send("touchMove", [touch(finger1, points.mid.x, points.mid.y)]);
  await page.waitForTimeout(40);
  await send("touchStart", [touch(finger2, points.second.x, points.second.y)]);
  await page.waitForTimeout(40);
  await send("touchMove", [
    touch(finger2, points.second.x + 22, points.second.y + 14),
  ]);
  await page.waitForTimeout(40);
  await send("touchEnd", [touch(finger2, points.second.x + 22, points.second.y + 14)]);
  await page.waitForTimeout(40);
  await send("touchMove", [touch(finger1, points.end.x, points.end.y)]);
  await page.waitForTimeout(40);
  await send("touchEnd", [touch(finger1, points.end.x, points.end.y)]);
  await client.detach();
}

async function dispatchTwoFinger(
  page: Page,
  start: { x: number; y: number }[],
  move: { x: number; y: number }[]
): Promise<void> {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 2,
  });
  const points = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
      id: i + 1,
      radiusX: 1,
      radiusY: 1,
      force: 1,
    }));
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(start),
    modifiers: 0,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: points(move),
    modifiers: 0,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
    modifiers: 0,
  });
  await client.detach();
}

async function liveElementCount(page: Page, role: "tutor" | "student"): Promise<number> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getElements: () => Array<{ isDeleted?: boolean }> }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) throw new Error(`missing getElements for ${r}`);
    return bridge.getElements().filter((el) => !el.isDeleted).length;
  }, role);
}
