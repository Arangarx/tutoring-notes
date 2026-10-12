/**
 * Item 6 — the other person's view box shows up on the new board
 * right after a switch, positioned by the item-3 visible-area oracle.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  driveTutorViewportStream,
  openTutorAndStudent,
  projectSceneRectToScreen,
  readAppStateCenterXY,
  readViewportSnapshot,
  readVisibleScene,
  seedWbLiveSyncSession,
  setStudentFollowTutor,
  setViewportOnRole,
  type ViewportSnapshot,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function ghostsMatchVisibleAreas(
  tutorPage: Page,
  studentPage: Page
): Promise<boolean> {
  const studentScene = await readVisibleScene(studentPage, "student");
  const tutorScene = await readVisibleScene(tutorPage, "tutor");
  const tutorExpected = await projectSceneRectToScreen(tutorPage, "tutor", studentScene);
  const studentExpected = await projectSceneRectToScreen(studentPage, "student", tutorScene);
  const tutorBox = await tutorPage.getByTestId("wb-ghost-viewport-rect").boundingBox();
  const studentBox = await studentPage.getByTestId("wb-ghost-viewport-rect").boundingBox();
  if (!tutorBox || !studentBox) return false;
  const near = (
    box: { x: number; y: number; width: number; height: number },
    expected: { x: number; y: number; width: number; height: number }
  ) =>
    Math.abs(box.x - expected.x) <= 4 &&
    Math.abs(box.y - expected.y) <= 4 &&
    Math.abs(box.width - expected.width) <= 4 &&
    Math.abs(box.height - expected.height) <= 4;
  return near(tutorBox, tutorExpected) && near(studentBox, studentExpected);
}

async function tutorGhostMatchesStudent(tutorPage: Page, studentPage: Page): Promise<boolean> {
  const rect = tutorPage.getByTestId("wb-ghost-viewport-rect");
  if ((await rect.count()) === 0) return false;
  const label = await rect.getByTestId("wb-ghost-viewport-label").textContent();
  if (!label?.includes("Student view")) return false;
  const studentScene = await readVisibleScene(studentPage, "student");
  const expected = await projectSceneRectToScreen(tutorPage, "tutor", studentScene);
  const box = await rect.boundingBox();
  if (!box) return false;
  return (
    Math.abs(box.x - expected.x) <= 4 &&
    Math.abs(box.y - expected.y) <= 4 &&
    Math.abs(box.width - expected.width) <= 4 &&
    Math.abs(box.height - expected.height) <= 4
  );
}

test.describe("ghost viewport after a board switch", {
  tag: [TAG.WB_VIEWPORT, TAG.WB_PRESENCE, TAG.WB_CHROME],
}, () => {
  test("add board shows both view boxes within 1500ms", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const started = Date.now();
      await peers.tutorPage.getByRole("button", { name: "Add board" }).click();
      await expect
        .poll(async () => {
          if (Date.now() - started > 1500) return "late";
          const studentOnNew = await peers.studentPage
            .getByRole("tab", { name: "Board 2" })
            .getAttribute("aria-current");
          const tutorOnNew = await peers.tutorPage
            .getByRole("tab", { name: "Board 2" })
            .getAttribute("aria-selected");
          if (studentOnNew !== "page" || tutorOnNew !== "true") return "waiting";
          const tutorLabel = await peers.tutorPage.getByTestId("wb-ghost-viewport-label").textContent();
          const studentLabel = await peers.studentPage.getByTestId("wb-ghost-viewport-label").textContent();
          if (!tutorLabel?.includes("Student view") || !studentLabel?.includes("Tutor view")) {
            return "waiting";
          }
          return (await ghostsMatchVisibleAreas(peers.tutorPage, peers.studentPage))
            ? "ready"
            : "waiting";
        }, { timeout: 1500 })
        .toBe("ready");
    } finally {
      await peers.close();
    }
  });

  test("switching back to the first board shows both view boxes within 1500ms", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage.getByRole("button", { name: "Add board" }).click();
      await expect(peers.studentPage.getByRole("tab", { name: "Board 2" })).toHaveAttribute(
        "aria-current",
        "page",
        { timeout: 20_000 }
      );
      const started = Date.now();
      await peers.tutorPage.getByRole("tab", { name: "Board 1" }).click();
      await expect
        .poll(async () => {
          if (Date.now() - started > 1500) return "late";
          const studentOnFirst = await peers.studentPage
            .getByRole("tab", { name: "Board 1" })
            .getAttribute("aria-current");
          const tutorOnFirst = await peers.tutorPage
            .getByRole("tab", { name: "Board 1" })
            .getAttribute("aria-selected");
          if (studentOnFirst !== "page" || tutorOnFirst !== "true") return "waiting";
          return (await ghostsMatchVisibleAreas(peers.tutorPage, peers.studentPage))
            ? "ready"
            : "waiting";
        }, { timeout: 1500 })
        .toBe("ready");
    } finally {
      await peers.close();
    }
  });

  test("a panned board switch matches the tutor view within 1500ms both ways", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    const readZoom = async (page: Page, role: "tutor" | "student") =>
      page.evaluate((r) => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<string, { getAppState: () => { zoom?: { value?: number } } }>;
          }
        ).__TN_WB_E2E__?.[r];
        const z = bridge?.getAppState()?.zoom?.value;
        return typeof z === "number" && z > 0 ? z : 1;
      }, role);
    const camerasMatch = async () => {
      const tutorCenter = await readAppStateCenterXY(peers.tutorPage, "tutor");
      const studentCenter = await readAppStateCenterXY(peers.studentPage, "student");
      const tutorZoom = await readZoom(peers.tutorPage, "tutor");
      const studentZoom = await readZoom(peers.studentPage, "student");
      return (
        Math.abs(tutorCenter.x - studentCenter.x) <= 8 &&
        Math.abs(tutorCenter.y - studentCenter.y) <= 8 &&
        Math.abs(tutorZoom - studentZoom) <= 0.05
      );
    };
    const studentGhostMatchesTutor = async () => {
      const label = await peers.studentPage.getByTestId("wb-ghost-viewport-label").textContent();
      if (!label?.includes("Tutor view")) return false;
      const tutorScene = await readVisibleScene(peers.tutorPage, "tutor");
      const expected = await projectSceneRectToScreen(peers.studentPage, "student", tutorScene);
      const box = await peers.studentPage.getByTestId("wb-ghost-viewport-rect").boundingBox();
      if (!box) return false;
      return (
        Math.abs(box.x - expected.x) <= 4 &&
        Math.abs(box.y - expected.y) <= 4 &&
        Math.abs(box.width - expected.width) <= 4 &&
        Math.abs(box.height - expected.height) <= 4
      );
    };
    try {
      await setViewportOnRole(peers.tutorPage, "tutor", -1400, -900, 1.75);
      await peers.tutorPage.getByRole("button", { name: "Add board" }).click();
      await expect(peers.studentPage.getByRole("tab", { name: "Board 2" })).toHaveAttribute(
        "aria-current",
        "page",
        { timeout: 20_000 }
      );
      await setViewportOnRole(peers.tutorPage, "tutor", 1100, 640, 0.5);
      await expect
        .poll(async () => readZoom(peers.tutorPage, "tutor"), { timeout: 5_000 })
        .toBeCloseTo(0.5, 1);

      const switchAndMatch = async (tabName: string) => {
        const started = Date.now();
        await peers.tutorPage.getByRole("tab", { name: tabName }).click();
        await expect
          .poll(async () => {
            if (Date.now() - started > 1500) return false;
            const studentOn = await peers.studentPage
              .getByRole("tab", { name: tabName })
              .getAttribute("aria-current");
            const tutorOn = await peers.tutorPage
              .getByRole("tab", { name: tabName })
              .getAttribute("aria-selected");
            return studentOn === "page" && tutorOn === "true";
          }, { timeout: 1500, intervals: [50] })
          .toBe(true);
        const ghost = await studentGhostMatchesTutor();
        const camera = await camerasMatch();
        const elapsed = Date.now() - started;
        expect(ghost, `${tabName} tutor-view ghost at ${elapsed}ms`).toBe(true);
        expect(camera, `${tabName} student camera at ${elapsed}ms`).toBe(true);
        expect(elapsed).toBeLessThanOrEqual(1500);
      };

      await switchAndMatch("Board 1");
      await switchAndMatch("Board 2");
    } finally {
      await peers.close();
    }
  });

  test("independent student view appears on a new board within 1500ms", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      const follow = peers.studentPage.getByTestId("wb-student-follow-toggle");
      await follow.uncheck();
      await expect(follow).not.toBeChecked();

      const switchAndMatch = async (tabName: string, go: () => Promise<void>) => {
        const started = Date.now();
        await go();
        await expect
          .poll(async () => {
            if (Date.now() - started > 1500) return "late";
            const studentOn = await peers.studentPage
              .getByRole("tab", { name: tabName })
              .getAttribute("aria-current");
            const tutorOn = await peers.tutorPage
              .getByRole("tab", { name: tabName })
              .getAttribute("aria-selected");
            if (studentOn !== "page" || tutorOn !== "true") return "waiting";
            return (await tutorGhostMatchesStudent(peers.tutorPage, peers.studentPage))
              ? "ready"
              : "waiting";
          }, { timeout: 2_500 })
          .toBe("ready");
      };

      await switchAndMatch("Board 2", () =>
        peers.tutorPage.getByRole("button", { name: "Add board" }).click()
      );
      await switchAndMatch("Board 1", () =>
        peers.tutorPage.getByRole("tab", { name: "Board 1" }).click()
      );
    } finally {
      await peers.close();
    }
  });
});

type ScreenBox = { x: number; y: number; width: number; height: number };

function cameraScreenShift(before: ViewportSnapshot, after: ViewportSnapshot): number {
  const zoom = after.zoom > 0 ? after.zoom : 1;
  return Math.hypot(
    (after.scrollX - before.scrollX) * zoom,
    (after.scrollY - before.scrollY) * zoom
  );
}

function boxCenterShift(a: ScreenBox, b: ScreenBox): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ghost stays fixed on the viewer's screen (relational, ~2px). */
function expectGhostHeld(actual: ScreenBox | null, rest: ScreenBox, what: string) {
  expect(actual, what).not.toBeNull();
  const box = actual as ScreenBox;
  expect(Math.abs(box.x - rest.x), `${what} x`).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y - rest.y), `${what} y`).toBeLessThanOrEqual(2);
  expect(Math.abs(box.width - rest.width), `${what} width`).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - rest.height), `${what} height`).toBeLessThanOrEqual(2);
}

async function nextFrame(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  );
}

async function readGhost(page: Page): Promise<ScreenBox | null> {
  return page.getByTestId("wb-ghost-viewport-rect").boundingBox();
}

test.describe("ghost viewport freezes on the viewer's screen during a pan", {
  tag: [TAG.WB_VIEWPORT, TAG.WB_PRESENCE, TAG.WB_CHROME],
}, () => {
  test("locked student ghost stays fixed while the tutor pans, including a ctrl-wheel", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await expect
        .poll(() => tutorGhostMatchesStudent(peers.tutorPage, peers.studentPage), {
          timeout: 20_000,
        })
        .toBe(true);

      const rest = await readGhost(peers.tutorPage);
      expect(rest).not.toBeNull();
      const beforeWheel = await readViewportSnapshot(peers.tutorPage, "tutor");
      const canvas = peers.tutorPage
        .locator('[data-testid="tutor-whiteboard-canvas-mount"] .excalidraw')
        .first();
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      const cx = canvasBox!.x + canvasBox!.width / 2;
      const cy = canvasBox!.y + canvasBox!.height / 2;
      await peers.tutorPage.mouse.move(cx, cy);
      await peers.tutorPage.mouse.click(cx, cy);
      await peers.tutorPage.keyboard.down("Control");
      try {
        for (let i = 0; i < 3; i++) {
          await peers.tutorPage.mouse.wheel(0, 240);
          await nextFrame(peers.tutorPage);
          expectGhostHeld(await readGhost(peers.tutorPage), rest!, `ctrl-wheel sample ${i}`);
        }
      } finally {
        await peers.tutorPage.keyboard.up("Control");
      }
      const afterWheel = await readViewportSnapshot(peers.tutorPage, "tutor");
      const wheelMoved =
        cameraScreenShift(beforeWheel, afterWheel) > 8 ||
        Math.abs(afterWheel.zoom - beforeWheel.zoom) > 0.05;
      expect(wheelMoved).toBe(true);

      await expect
        .poll(() => tutorGhostMatchesStudent(peers.tutorPage, peers.studentPage), {
          timeout: 1_200,
          intervals: [50],
        })
        .toBe(true);

      const anchor = await readGhost(peers.tutorPage);
      expect(anchor).not.toBeNull();
      const studentScene = await readVisibleScene(peers.studentPage, "student");
      const camBefore = await readViewportSnapshot(peers.tutorPage, "tutor");
      const zoom = camBefore.zoom > 0 ? camBefore.zoom : 1;
      const steps = [1, 2, 3, 4].map((i) => ({
        scrollX: camBefore.scrollX + (i * 320) / zoom / 4,
        scrollY: camBefore.scrollY + (i * 40) / zoom / 4,
        zoom,
      }));
      for (let i = 0; i < steps.length; i += 2) {
        await driveTutorViewportStream(peers.tutorPage, steps.slice(i, i + 2), 8);
        await nextFrame(peers.tutorPage);
        expectGhostHeld(await readGhost(peers.tutorPage), anchor!, `pan sample ${i}`);
      }
      await setViewportOnRole(
        peers.tutorPage,
        "tutor",
        steps[steps.length - 1].scrollX,
        steps[steps.length - 1].scrollY,
        zoom * 1.45
      );
      await nextFrame(peers.tutorPage);
      expectGhostHeld(await readGhost(peers.tutorPage), anchor!, "zoom sample");

      const camAfter = await readViewportSnapshot(peers.tutorPage, "tutor");
      expect(cameraScreenShift(camBefore, camAfter)).toBeGreaterThan(200);
      const slid = await projectSceneRectToScreen(peers.tutorPage, "tutor", studentScene);
      expect(boxCenterShift(slid, anchor!)).toBeGreaterThan(200);
      expect(Math.abs(slid.width - anchor!.width)).toBeGreaterThan(20);

      await expect
        .poll(async () => {
          const scene = await readVisibleScene(peers.studentPage, "student");
          const expected = await projectSceneRectToScreen(peers.tutorPage, "tutor", scene);
          const box = await readGhost(peers.tutorPage);
          if (!box) return false;
          return (
            Math.abs(box.x - expected.x) <= 2 &&
            Math.abs(box.y - expected.y) <= 2 &&
            Math.abs(box.width - expected.width) <= 2 &&
            Math.abs(box.height - expected.height) <= 2
          );
        }, { timeout: 1_200, intervals: [50] })
        .toBe(true);
    } finally {
      await peers.close();
    }
  });

  test("independent student ghost stays fixed during the tutor pan, then shifts by pan times zoom", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await setStudentFollowTutor(peers.studentPage, false);
      await peers.studentPage.waitForTimeout(600);
      await expect
        .poll(() => tutorGhostMatchesStudent(peers.tutorPage, peers.studentPage), {
          timeout: 20_000,
        })
        .toBe(true);

      const rest = await readGhost(peers.tutorPage);
      expect(rest).not.toBeNull();
      const before = await readViewportSnapshot(peers.tutorPage, "tutor");
      const zoom = before.zoom > 0 ? before.zoom : 1;
      const steps = [1, 2, 3, 4].map((i) => ({
        scrollX: before.scrollX + (i * 360) / zoom / 4,
        scrollY: before.scrollY + (i * 120) / zoom / 4,
        zoom,
      }));
      for (let i = 0; i < steps.length; i += 2) {
        await driveTutorViewportStream(peers.tutorPage, steps.slice(i, i + 2), 8);
        await nextFrame(peers.tutorPage);
        expectGhostHeld(await readGhost(peers.tutorPage), rest!, `independent sample ${i}`);
      }
      const after = await readViewportSnapshot(peers.tutorPage, "tutor");
      expect(cameraScreenShift(before, after)).toBeGreaterThan(200);

      await expect
        .poll(async () => {
          const box = await readGhost(peers.tutorPage);
          if (!box) return "missing";
          const dx = (after.scrollX - before.scrollX) * after.zoom;
          const dy = (after.scrollY - before.scrollY) * after.zoom;
          const moved =
            Math.abs(box.x - rest!.x - dx) <= 2 &&
            Math.abs(box.y - rest!.y - dy) <= 2 &&
            Math.abs(box.width - rest!.width) <= 2 &&
            Math.abs(box.height - rest!.height) <= 2;
          return moved ? "moved" : "frozen";
        }, { timeout: 380, intervals: [40] })
        .toBe("moved");

      const scene = await readVisibleScene(peers.studentPage, "student");
      const expected = await projectSceneRectToScreen(peers.tutorPage, "tutor", scene);
      expectGhostHeld(await readGhost(peers.tutorPage), expected, "independent oracle");
    } finally {
      await peers.close();
    }
  });

  test("student pan keeps the tutor-view ghost fixed on the student screen, then reprojects", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await setStudentFollowTutor(peers.studentPage, false);
      await peers.studentPage.waitForTimeout(600);
      await expect
        .poll(async () => {
          const label = await peers.studentPage.getByTestId("wb-ghost-viewport-label").textContent();
          if (!label?.includes("Tutor view")) return false;
          const tutorScene = await readVisibleScene(peers.tutorPage, "tutor");
          const expected = await projectSceneRectToScreen(
            peers.studentPage,
            "student",
            tutorScene
          );
          const box = await readGhost(peers.studentPage);
          if (!box) return false;
          return boxCenterShift(box, expected) <= 4;
        }, { timeout: 20_000 })
        .toBe(true);

      const rest = await readGhost(peers.studentPage);
      expect(rest).not.toBeNull();
      const before = await readViewportSnapshot(peers.studentPage, "student");
      const zoom = before.zoom > 0 ? before.zoom : 1;
      const steps = [1, 2, 3].map((i) => ({
        scrollX: before.scrollX + (i * 300) / zoom / 3,
        scrollY: before.scrollY - (i * 80) / zoom / 3,
        zoom,
      }));
      for (const step of steps) {
        await setViewportOnRole(
          peers.studentPage,
          "student",
          step.scrollX,
          step.scrollY,
          step.zoom
        );
        await nextFrame(peers.studentPage);
        expectGhostHeld(await readGhost(peers.studentPage), rest!, "student pan");
      }

      await expect
        .poll(async () => {
          const tutorScene = await readVisibleScene(peers.tutorPage, "tutor");
          const expected = await projectSceneRectToScreen(
            peers.studentPage,
            "student",
            tutorScene
          );
          const box = await readGhost(peers.studentPage);
          if (!box) return false;
          return (
            Math.abs(box.x - expected.x) <= 2 &&
            Math.abs(box.y - expected.y) <= 2 &&
            Math.abs(box.width - expected.width) <= 2 &&
            Math.abs(box.height - expected.height) <= 2
          );
        }, { timeout: 800, intervals: [50] })
        .toBe(true);
    } finally {
      await peers.close();
    }
  });

  test("a board switch during a hold does not keep the frozen screen box", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await setStudentFollowTutor(peers.studentPage, false);
      await peers.studentPage.waitForTimeout(600);
      await expect
        .poll(() => tutorGhostMatchesStudent(peers.tutorPage, peers.studentPage), {
          timeout: 20_000,
        })
        .toBe(true);

      const origin = await readGhost(peers.tutorPage);
      expect(origin).not.toBeNull();
      const beforeStudentPan = await readViewportSnapshot(peers.studentPage, "student");
      const studentZoom = beforeStudentPan.zoom > 0 ? beforeStudentPan.zoom : 1;
      await setViewportOnRole(
        peers.studentPage,
        "student",
        beforeStudentPan.scrollX + 700 / studentZoom,
        beforeStudentPan.scrollY + 180 / studentZoom,
        studentZoom
      );
      let distinctive: ScreenBox | null = null;
      await expect
        .poll(async () => {
          const scene = await readVisibleScene(peers.studentPage, "student");
          const expected = await projectSceneRectToScreen(peers.tutorPage, "tutor", scene);
          const box = await readGhost(peers.tutorPage);
          if (!box || !origin) return false;
          const settled =
            Math.abs(box.x - expected.x) <= 4 &&
            Math.abs(box.y - expected.y) <= 4 &&
            Math.abs(box.width - expected.width) <= 4 &&
            Math.abs(box.height - expected.height) <= 4;
          if (!settled || boxCenterShift(box, origin) <= 80) return false;
          distinctive = box;
          return true;
        }, { timeout: 4_000 })
        .toBe(true);
      expect(distinctive).not.toBeNull();
      const frozenAt = distinctive as ScreenBox;

      const tutorCam = await readViewportSnapshot(peers.tutorPage, "tutor");
      const tutorZoom = tutorCam.zoom > 0 ? tutorCam.zoom : 1;
      await setViewportOnRole(
        peers.tutorPage,
        "tutor",
        tutorCam.scrollX + 240 / tutorZoom,
        tutorCam.scrollY,
        tutorZoom
      );
      await nextFrame(peers.tutorPage);
      expectGhostHeld(await readGhost(peers.tutorPage), frozenAt, "held before board switch");

      await peers.tutorPage.getByRole("button", { name: "Add board" }).click();
      await expect
        .poll(async () => {
          const tutorOn = await peers.tutorPage
            .getByRole("tab", { name: "Board 2" })
            .getAttribute("aria-selected");
          const studentOn = await peers.studentPage
            .getByRole("tab", { name: "Board 2" })
            .getAttribute("aria-current");
          if (tutorOn !== "true" || studentOn !== "page") {
            const live = await readViewportSnapshot(peers.tutorPage, "tutor");
            await setViewportOnRole(
              peers.tutorPage,
              "tutor",
              live.scrollX + 12,
              live.scrollY,
              live.zoom
            );
            return "switching";
          }
          const scene = await readVisibleScene(peers.studentPage, "student");
          const expected = await projectSceneRectToScreen(peers.tutorPage, "tutor", scene);
          const box = await readGhost(peers.tutorPage);
          if (!box) return "no-box";
          if (boxCenterShift(expected, frozenAt) <= 30) return "oracle-not-distinct";
          const stale =
            Math.abs(box.x - frozenAt.x) <= 2 &&
            Math.abs(box.y - frozenAt.y) <= 2 &&
            Math.abs(box.width - frozenAt.width) <= 2 &&
            Math.abs(box.height - frozenAt.height) <= 2;
          if (stale) return "stale";
          const fresh =
            Math.abs(box.x - expected.x) <= 2 &&
            Math.abs(box.y - expected.y) <= 2 &&
            Math.abs(box.width - expected.width) <= 2 &&
            Math.abs(box.height - expected.height) <= 2;
          return fresh ? "fresh" : "moving";
        }, { timeout: 2_500, intervals: [40] })
        .toBe("fresh");
    } finally {
      await peers.close();
    }
  });
});
