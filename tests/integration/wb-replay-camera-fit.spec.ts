/**
 * Replay Fit view — in-frame player and full-page WhiteboardReplay.
 *
 * Default keeps the tutor zoom and center-matches. Fit view uses one uniform
 * zoom so the spilling side matches the replay window. The slack side shows
 * more board than the tutor saw. Toggling Fit view off restores the tutor zoom.
 *
 * Oracle: magenta rectangle ink on the replay canvas (Excalidraw draws shapes
 * on a canvas, so the screen box is the ink bounds in client pixels — the same
 * width/position getBoundingClientRect would report for a DOM rectangle).
 * Observed zoom = that screen width / scene width from the event log.
 * Recorded width, height, and zoom are read back from the seeded log.
 * Record-time center uses the vendored viewport transform.
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-camera-fit.spec.ts --project=wb-regression --workers=1
 */

import { expect, test, type Page } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { viewportCoordsToSceneCoords } from "@/lib/whiteboard/excalidraw-viewport-coords";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { uploadReplayEvents } from "./wb-replay-harness.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

const RECT_ID = "pw-camera-fit-rect";

type SeededCamera = {
  panX: number;
  panY: number;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  sceneWidth: number;
  sceneHeight: number;
  sceneCenterX: number;
  sceneCenterY: number;
};

type InkBox = {
  inkPixels: number;
  screenWidth: number;
  screenHeight: number;
  /** Client-pixel center of the ink, same space as getBoundingClientRect. */
  rectCenterX: number;
  rectCenterY: number;
  canvasCenterX: number;
  canvasCenterY: number;
  hostW: number;
  hostH: number;
};

function cameraFitEventsJson(): string {
  const recordedZoom = 0.51;
  const recordW = 1800;
  const recordH = 1049;
  const panX = 40;
  const panY = -80;
  const sceneWidth = 640;
  const sceneHeight = 280;
  const center = viewportCoordsToSceneCoords(
    { clientX: recordW / 2, clientY: recordH / 2 },
    {
      zoom: { value: recordedZoom },
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: panX,
      scrollY: panY,
    }
  );
  return JSON.stringify({
    schemaVersion: 1,
    startedAt: "2026-10-12T18:00:00.000Z",
    durationMs: 800,
    events: [
      {
        t: 0,
        type: "viewport",
        panX,
        panY,
        zoom: recordedZoom,
        viewportWidth: recordW,
        viewportHeight: recordH,
      },
      {
        t: 0,
        type: "snapshot",
        elements: [
          {
            id: RECT_ID,
            type: "rectangle",
            x: center.x - sceneWidth / 2,
            y: center.y - sceneHeight / 2,
            width: sceneWidth,
            height: sceneHeight,
            strokeColor: "#ff00aa",
            backgroundColor: "#ff00aa",
            strokeWidth: 2,
          },
        ],
      },
    ],
  });
}

function cameraFromLog(log: {
  events: Array<Record<string, unknown>>;
}): SeededCamera {
  const viewport = log.events.find((event) => event.type === "viewport");
  const snapshot = log.events.find((event) => event.type === "snapshot");
  const elements = snapshot?.elements as
    | Array<Record<string, unknown>>
    | undefined;
  const rect = elements?.find((element) => element.id === RECT_ID);
  if (!viewport || !rect) {
    throw new Error("seeded log is missing the viewport or rectangle");
  }
  const zoom = viewport.zoom as number;
  const viewportWidth = viewport.viewportWidth as number;
  const viewportHeight = viewport.viewportHeight as number;
  const panX = viewport.panX as number;
  const panY = viewport.panY as number;
  const sceneWidth = rect.width as number;
  const sceneHeight = rect.height as number;
  const sceneX = rect.x as number;
  const sceneY = rect.y as number;
  return {
    panX,
    panY,
    zoom,
    viewportWidth,
    viewportHeight,
    sceneWidth,
    sceneHeight,
    sceneCenterX: sceneX + sceneWidth / 2,
    sceneCenterY: sceneY + sceneHeight / 2,
  };
}

/** Ink bounds of the magenta rectangle, in client pixels. */
async function readRectangleInk(
  page: Page,
  rootTestId: string
): Promise<InkBox | null> {
  return page.evaluate((rootId) => {
    const frame = document.querySelector(`[data-testid="${rootId}"]`);
    const host = frame?.querySelector(
      "[data-replay-viewport-metrics]"
    ) as HTMLElement | null;
    const canvas = frame?.querySelector(
      "canvas.excalidraw__canvas.static"
    ) as HTMLCanvasElement | null;
    if (!host || !canvas) return null;
    const hostBox = host.getBoundingClientRect();
    const canvasBox = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width < 2 || canvas.height < 2 || hostBox.width < 2) {
      return null;
    }
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        const a = data[i + 3] ?? 0;
        if (a > 40 && r > 170 && b > 70 && g < 120 && r > g + 50) {
          count += 1;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (count < 30 || maxX < minX) return null;
    const scaleX = canvasBox.width / width;
    const scaleY = canvasBox.height / height;
    const screenWidth = (maxX - minX + 1) * scaleX;
    const screenHeight = (maxY - minY + 1) * scaleY;
    return {
      inkPixels: count,
      screenWidth,
      screenHeight,
      rectCenterX: canvasBox.left + ((minX + maxX + 1) / 2) * scaleX,
      rectCenterY: canvasBox.top + ((minY + maxY + 1) / 2) * scaleY,
      canvasCenterX: hostBox.left + hostBox.width / 2,
      canvasCenterY: hostBox.top + hostBox.height / 2,
      hostW: hostBox.width,
      hostH: hostBox.height,
    };
  }, rootTestId);
}

function expectZoomClose(observed: number, expected: number, label: string) {
  const relative = Math.abs(observed - expected) / expected;
  expect(relative, `${label}: observed ${observed} vs expected ${expected}`).toBeLessThan(
    0.08
  );
}

/** Slack side's visible scene (pixels / zoom) is larger than the tutor's. */
function expectSlackSideShowsMoreBoard(
  ink: InkBox,
  camera: SeededCamera,
  observedZoom: number
) {
  const widthRatio = ink.hostW / camera.viewportWidth;
  const heightRatio = ink.hostH / camera.viewportHeight;
  const tutorVisibleW = camera.viewportWidth / camera.zoom;
  const tutorVisibleH = camera.viewportHeight / camera.zoom;
  const replayVisibleW = ink.hostW / observedZoom;
  const replayVisibleH = ink.hostH / observedZoom;
  if (widthRatio > heightRatio) {
    expect(
      replayVisibleW,
      "slack width should show more board than the tutor saw"
    ).toBeGreaterThan(tutorVisibleW);
  } else if (heightRatio > widthRatio) {
    expect(
      replayVisibleH,
      "slack height should show more board than the tutor saw"
    ).toBeGreaterThan(tutorVisibleH);
  } else {
    throw new Error(
      `replay window aspect matches the recording (${widthRatio}); no slack side`
    );
  }
}

function expectCenterHeld(ink: InkBox, camera: SeededCamera) {
  const observedZoom = ink.screenWidth / camera.sceneWidth;
  const sceneAtCanvasCenterX =
    camera.sceneCenterX + (ink.canvasCenterX - ink.rectCenterX) / observedZoom;
  const sceneAtCanvasCenterY =
    camera.sceneCenterY + (ink.canvasCenterY - ink.rectCenterY) / observedZoom;
  const recordCenter = viewportCoordsToSceneCoords(
    { clientX: camera.viewportWidth / 2, clientY: camera.viewportHeight / 2 },
    {
      zoom: { value: camera.zoom },
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: camera.panX,
      scrollY: camera.panY,
    }
  );
  const sceneSlack = 14 / observedZoom;
  expect(Math.abs(ink.rectCenterX - ink.canvasCenterX)).toBeLessThan(14);
  expect(Math.abs(ink.rectCenterY - ink.canvasCenterY)).toBeLessThan(14);
  expect(Math.abs(sceneAtCanvasCenterX - recordCenter.x)).toBeLessThan(sceneSlack);
  expect(Math.abs(sceneAtCanvasCenterY - recordCenter.y)).toBeLessThan(sceneSlack);
}

async function seedCameraReplay(
  page: Page,
  options: { ended: boolean }
): Promise<SeededCamera> {
  assertLocalDatabaseUrlForHarness();
  const session = await seedWbLiveSyncSession();
  if (options.ended) {
    const prisma = new PrismaClient();
    try {
      await prisma.whiteboardSession.update({
        where: { id: session.whiteboardSessionId },
        data: { endedAt: new Date("2026-10-12T18:30:00.000Z") },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  await uploadReplayEvents({
    request: page.request,
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    whiteboardSessionId: session.whiteboardSessionId,
    eventsJson: cameraFitEventsJson(),
  });

  const logRes = await page.request.get(
    `/api/whiteboard/${session.whiteboardSessionId}/events`
  );
  expect(logRes.ok()).toBe(true);
  const camera = cameraFromLog(
    (await logRes.json()) as { events: Array<Record<string, unknown>> }
  );

  const path = options.ended
    ? `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace?surface=replay`
    : `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}`;
  await page.goto(path, { waitUntil: "domcontentloaded" });
  return camera;
}

async function expectReplayCameraFit(page: Page, rootTestId: string, camera: SeededCamera) {
  const play = page.getByTestId("wb-replay-play-toggle");
  await expect(play).toBeVisible({ timeout: 30_000 });
  if ((await play.innerText()).trim() === "Pause") {
    await play.click();
  }

  let ink: InkBox | null = null;
  await expect
    .poll(async () => {
      ink = await readRectangleInk(page, rootTestId);
      return ink?.inkPixels ?? 0;
    }, { timeout: 30_000 })
    .toBeGreaterThan(30);

  if (!ink) throw new Error("rectangle ink was not measured");
  const defaultZoom = ink.screenWidth / camera.sceneWidth;
  expectZoomClose(defaultZoom, camera.zoom, "default zoom");
  expectCenterHeld(ink, camera);

  const fitButton = page.getByTestId("wb-replay-camera-fit");
  await expect(fitButton).toBeVisible();
  await expect(fitButton).toHaveAttribute("aria-pressed", "false");
  await expect(fitButton).toHaveAttribute(
    "title",
    "Show the whole area the tutor was looking at"
  );

  await fitButton.click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "true");
  await expect(fitButton).toHaveAttribute("title", "Use the tutor's zoom");

  let fitInk: InkBox | null = null;
  await expect
    .poll(async () => {
      fitInk = await readRectangleInk(page, rootTestId);
      if (!fitInk) return 0;
      return fitInk.screenWidth / camera.sceneWidth;
    }, { timeout: 15_000 })
    .not.toBeCloseTo(camera.zoom, 1);

  if (!fitInk) throw new Error("fit-view ink was not measured");
  const observedFit = fitInk.screenWidth / camera.sceneWidth;
  const expectedFit =
    camera.zoom *
    Math.min(
      fitInk.hostW / camera.viewportWidth,
      fitInk.hostH / camera.viewportHeight
    );
  expectZoomClose(observedFit, expectedFit, "fit zoom");
  expectCenterHeld(fitInk, camera);
  expectSlackSideShowsMoreBoard(fitInk, camera, observedFit);

  await fitButton.click();
  await expect(fitButton).toHaveAttribute("aria-pressed", "false");

  let restored: InkBox | null = null;
  await expect
    .poll(async () => {
      restored = await readRectangleInk(page, rootTestId);
      if (!restored) return Number.POSITIVE_INFINITY;
      return Math.abs(restored.screenWidth / camera.sceneWidth - camera.zoom) / camera.zoom;
    }, { timeout: 15_000 })
    .toBeLessThan(0.08);

  if (!restored) throw new Error("restored tutor-zoom ink was not measured");
  expectZoomClose(restored.screenWidth / camera.sceneWidth, camera.zoom, "restored tutor zoom");
  expectCenterHeld(restored, camera);
}

test.describe("replay camera fit view", { tag: [TAG.WB_VIEWPORT] }, () => {
  test("in-frame replay keeps tutor zoom, then Fit view scales uniformly", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const camera = await seedCameraReplay(page, { ended: true });
    await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
      timeout: 60_000,
    });
    await expectReplayCameraFit(page, "wb-replay-in-frame", camera);
  });

  test("full-page replay keeps tutor zoom, then Fit view scales uniformly", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const camera = await seedCameraReplay(page, { ended: false });
    await expect(page).not.toHaveURL(/[?&]surface=replay/);
    await expect(page.getByTestId("wb-replay")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("wb-replay-in-frame")).toHaveCount(0);
    await expectReplayCameraFit(page, "wb-replay", camera);
  });
});
