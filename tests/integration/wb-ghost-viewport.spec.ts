/**
 * Item 6 — the other person's view box shows up on the new board
 * right after a switch, positioned by the item-3 visible-area oracle.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  openTutorAndStudent,
  projectSceneRectToScreen,
  readAppStateCenterXY,
  readVisibleScene,
  seedWbLiveSyncSession,
  setViewportOnRole,
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
