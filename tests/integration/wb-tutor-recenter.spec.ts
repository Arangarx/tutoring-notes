/**
 * Tutor recenter — content bounding-box center meets the visible canvas center.
 * Students do not get the control.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  drawTestStrokeOnRole,
  openTutorAndStudent,
  seedWbLiveSyncSession,
  setViewportOnRole,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function contentCenterGap(page: Page): Promise<{ dx: number; dy: number }> {
  return page.evaluate(() => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          {
            getElements: () => Array<{
              x?: number;
              y?: number;
              width?: number;
              height?: number;
              isDeleted?: boolean;
            }>;
            getAppState: () => Record<string, unknown>;
          }
        >;
      }
    ).__TN_WB_E2E__?.tutor;
    if (!bridge) return { dx: 999, dy: 999 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let any = false;
    for (const el of bridge.getElements()) {
      if (el.isDeleted || typeof el.x !== "number" || typeof el.y !== "number") continue;
      any = true;
      const w = el.width ?? 0;
      const h = el.height ?? 0;
      minX = Math.min(minX, el.x, el.x + w);
      minY = Math.min(minY, el.y, el.y + h);
      maxX = Math.max(maxX, el.x, el.x + w);
      maxY = Math.max(maxY, el.y, el.y + h);
    }
    if (!any) return { dx: 999, dy: 999 };
    const st = bridge.getAppState();
    const zoomObj = st.zoom as { value?: number } | undefined;
    const zoom = zoomObj?.value && zoomObj.value > 0 ? zoomObj.value : 1;
    const contentX =
      ((minX + maxX) / 2 + (Number(st.scrollX) || 0)) * zoom + (Number(st.offsetLeft) || 0);
    const contentY =
      ((minY + maxY) / 2 + (Number(st.scrollY) || 0)) * zoom + (Number(st.offsetTop) || 0);
    const mount = document
      .querySelector("[data-testid='tutor-whiteboard-canvas-mount']")
      ?.getBoundingClientRect();
    if (!mount) return { dx: 999, dy: 999 };
    const vv = window.visualViewport;
    const left = Math.max(mount.left, vv ? vv.offsetLeft : mount.left);
    const top = Math.max(mount.top, vv ? vv.offsetTop : mount.top);
    const right = Math.min(mount.right, vv ? vv.offsetLeft + vv.width : mount.right);
    const bottom = Math.min(mount.bottom, vv ? vv.offsetTop + vv.height : mount.bottom);
    return {
      dx: Math.abs(contentX - (left + right) / 2),
      dy: Math.abs(contentY - (top + bottom) / 2),
    };
  });
}

async function readTutorCamera(page: Page): Promise<{
  scrollX: number;
  scrollY: number;
  zoom: number;
}> {
  return page.evaluate(() => {
    const st = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getAppState: () => { scrollX?: number; scrollY?: number; zoom?: { value?: number } } }
        >;
      }
    ).__TN_WB_E2E__?.tutor?.getAppState();
    const zoom = st?.zoom?.value;
    return {
      scrollX: Number(st?.scrollX) || 0,
      scrollY: Number(st?.scrollY) || 0,
      zoom: typeof zoom === "number" && zoom > 0 ? zoom : 1,
    };
  });
}

function cameraIsOrigin(camera: { scrollX: number; scrollY: number; zoom: number }): boolean {
  return (
    Math.abs(camera.scrollX) <= 1 &&
    Math.abs(camera.scrollY) <= 1 &&
    Math.abs(camera.zoom - 1) <= 0.05
  );
}

test.describe("tutor recenter view", { tag: [TAG.WB_CHROME, TAG.WB_VIEWPORT] }, () => {
  test("recenter puts the content center on the visible canvas center", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await drawTestStrokeOnRole(peers.tutorPage, "tutor", "recenter-stroke", 480, 360, 760, 520);
      await setViewportOnRole(peers.tutorPage, "tutor", -900, -700, 1.4);
      await peers.tutorPage.getByRole("button", { name: "Recenter view" }).click();
      await expect
        .poll(async () => {
          const gap = await contentCenterGap(peers.tutorPage);
          return gap.dx <= 4 && gap.dy <= 4;
        }, { timeout: 10_000 })
        .toBe(true);
      const zoom = await peers.tutorPage.evaluate(() => {
        const st = (
          window as Window & {
            __TN_WB_E2E__?: Record<string, { getAppState: () => { zoom?: { value?: number } } }>;
          }
        ).__TN_WB_E2E__?.tutor?.getAppState();
        return st?.zoom?.value ?? 0;
      });
      expect(Math.abs(zoom - 1.4)).toBeLessThanOrEqual(0.05);
      await expect(peers.studentPage.getByRole("button", { name: "Recenter view" })).toHaveCount(0);
    } finally {
      await peers.close();
    }
  });

  test("recenter uses the bounding box of unequal elements and keeps zoom", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await drawTestStrokeOnRole(peers.tutorPage, "tutor", "recenter-small", 20, 30, 40, 50);
      await drawTestStrokeOnRole(peers.tutorPage, "tutor", "recenter-large", 500, 80, 1100, 140);
      await setViewportOnRole(peers.tutorPage, "tutor", -200, -80, 1.85);
      await peers.tutorPage.getByRole("button", { name: "Recenter view" }).click();
      await expect
        .poll(async () => {
          const gap = await contentCenterGap(peers.tutorPage);
          return gap.dx <= 4 && gap.dy <= 4;
        }, { timeout: 10_000 })
        .toBe(true);
      const zoom = await peers.tutorPage.evaluate(() => {
        const st = (
          window as Window & {
            __TN_WB_E2E__?: Record<string, { getAppState: () => { zoom?: { value?: number } } }>;
          }
        ).__TN_WB_E2E__?.tutor?.getAppState();
        return st?.zoom?.value ?? 0;
      });
      expect(Math.abs(zoom - 1.85)).toBeLessThanOrEqual(0.05);
    } finally {
      await peers.close();
    }
  });

  test("empty board recenter resets zoom to 1 at the origin", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await setViewportOnRole(peers.tutorPage, "tutor", -640, -480, 2);
      await expect
        .poll(async () => (await readTutorCamera(peers.tutorPage)).zoom, { timeout: 5_000 })
        .toBeCloseTo(2, 1);
      await peers.tutorPage.getByRole("button", { name: "Recenter view" }).click();
      await expect
        .poll(async () => cameraIsOrigin(await readTutorCamera(peers.tutorPage)), { timeout: 10_000 })
        .toBe(true);
    } finally {
      await peers.close();
    }
  });

  test("overflow menu recenter resets an empty board to the origin", async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage.setViewportSize({ width: 1000, height: 800 });
      await setViewportOnRole(peers.tutorPage, "tutor", -420, -260, 1.7);
      await expect
        .poll(async () => (await readTutorCamera(peers.tutorPage)).zoom, { timeout: 5_000 })
        .toBeCloseTo(1.7, 1);
      await peers.tutorPage.getByTestId("wb-topbar-overflow").click();
      await peers.tutorPage.getByTestId("wb-recenter-view-menu").click();
      await expect
        .poll(async () => cameraIsOrigin(await readTutorCamera(peers.tutorPage)), { timeout: 10_000 })
        .toBe(true);
      await expect(peers.studentPage.getByTestId("wb-recenter-view-menu")).toHaveCount(0);
    } finally {
      await peers.close();
    }
  });
});
