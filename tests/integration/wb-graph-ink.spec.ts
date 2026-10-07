/**
 * Wave D — graph points and free draw.
 *
 * Oracle: each peer's JSXGraph objects in user coordinates (library X()/Y()
 * and curve data), never pixels compared across peers.
 *
 * Tags: @wb-graph @wb-sync
 */
import { expect, test, type Page } from "./fixtures";
import { TAG } from "../test-tags";
import {
  insertGraphOnRole,
  openTutorAndStudent,
  pointerReachesGraphHost,
  readElementVersion,
  readMountedGraphInk,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
  waitForWbE2eBridge,
  type MountedGraphInk,
} from "./whiteboard-live-sync.helpers";

function expectSameUserCoords(actual: MountedGraphInk, expected: MountedGraphInk): void {
  expect(actual.points.map((p) => p.id)).toEqual(expected.points.map((p) => p.id));
  for (let i = 0; i < expected.points.length; i++) {
    expect(actual.points[i].x).toBeCloseTo(expected.points[i].x, 4);
    expect(actual.points[i].y).toBeCloseTo(expected.points[i].y, 4);
  }
  expect(actual.strokes.map((s) => s.id)).toEqual(expected.strokes.map((s) => s.id));
  for (let i = 0; i < expected.strokes.length; i++) {
    expect(actual.strokes[i].pts).toHaveLength(expected.strokes[i].pts.length);
    for (let p = 0; p < expected.strokes[i].pts.length; p++) {
      expect(actual.strokes[i].pts[p][0]).toBeCloseTo(expected.strokes[i].pts[p][0], 4);
      expect(actual.strokes[i].pts[p][1]).toBeCloseTo(expected.strokes[i].pts[p][1], 4);
    }
  }
}

async function activateTutorGraph(tutorPage: Page): Promise<{ x: number; y: number }> {
  const host = tutorPage.getByTestId("wb-graph-embed-host").first();
  await expect(host).toBeVisible({ timeout: 30_000 });
  const hostBox = await host.boundingBox();
  const mountBox = await tutorPage.getByTestId("tutor-whiteboard-canvas-mount").boundingBox();
  expect(hostBox, "graph host bounding box").not.toBeNull();
  expect(mountBox, "canvas mount bounding box").not.toBeNull();
  await tutorPage.mouse.click(mountBox!.x + 80, mountBox!.y + 80);
  const x = hostBox!.x + hostBox!.width / 2 + hostBox!.width * 0.08;
  const y = hostBox!.y + hostBox!.height / 2 - hostBox!.height * 0.08;
  expect(await pointerReachesGraphHost(tutorPage, x, y)).toBe(false);
  await tutorPage.mouse.move(x - 4, y);
  await tutorPage.mouse.move(x, y);
  await tutorPage.mouse.click(x, y);
  await expect
    .poll(() => pointerReachesGraphHost(tutorPage, x, y), { timeout: 10_000 })
    .toBe(true);
  return { x, y };
}

test.describe("graph points and free draw", () => {
  test.setTimeout(240_000);

  test(
    "tutor points and one stroke sync in user coordinates, persist once, and survive reload",
    { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const { tutorPage, studentPage } = peers;
        const graphId = await insertGraphOnRole(tutorPage, "tutor", session, []);
        await waitForElementOnPeer(studentPage, "student", graphId, 30_000);
        await expect(studentPage.getByTestId("wb-graph-embed-host").first()).toBeVisible({
          timeout: 30_000,
        });

        const interactAt = await activateTutorGraph(tutorPage);
        // Let any view-fit persist from the activation click settle before counting.
        await tutorPage.waitForTimeout(700);
        const versionBeforePoints = await readElementVersion(tutorPage, "tutor", graphId);

        const pointMode = tutorPage.getByTestId("wb-graph-mode-point");
        await expect(pointMode).toBeVisible({ timeout: 15_000 });
        await pointMode.click();

        const host = tutorPage.locator(".wb-graph-board-host").first();
        const box = await host.boundingBox();
        expect(box, "graph board box").not.toBeNull();
        const pointA = {
          x: box!.x + box!.width * 0.58,
          y: box!.y + box!.height * 0.22,
        };
        const pointB = {
          x: box!.x + box!.width * 0.78,
          y: box!.y + box!.height * 0.38,
        };
        await tutorPage.mouse.click(pointA.x, pointA.y);
        await tutorPage.mouse.click(pointB.x, pointB.y);
        await expect
          .poll(async () => (await readMountedGraphInk(tutorPage)).points.length, {
            timeout: 15_000,
          })
          .toBe(2);
        await tutorPage.waitForTimeout(700);
        const versionAfterPoints = await readElementVersion(tutorPage, "tutor", graphId);
        expect(versionAfterPoints - versionBeforePoints).toBe(2);

        await tutorPage.getByTestId("wb-graph-mode-draw").click();
        const strokeStart = {
          x: box!.x + box!.width * 0.42,
          y: box!.y + box!.height * 0.28,
        };
        const strokeEnd = {
          x: box!.x + box!.width * 0.7,
          y: box!.y + box!.height * 0.18,
        };
        await tutorPage.mouse.move(strokeStart.x, strokeStart.y);
        await tutorPage.mouse.down();
        await tutorPage.mouse.move(
          strokeStart.x + (strokeEnd.x - strokeStart.x) * 0.5,
          strokeStart.y + (strokeEnd.y - strokeStart.y) * 0.5,
          { steps: 4 }
        );
        await tutorPage.waitForTimeout(40);
        await tutorPage.mouse.move(strokeEnd.x, strokeEnd.y, { steps: 4 });
        await tutorPage.waitForTimeout(40);
        await tutorPage.mouse.up();

        await expect
          .poll(async () => (await readMountedGraphInk(tutorPage)).strokes.length, {
            timeout: 15_000,
          })
          .toBe(1);
        const tutorInk = await readMountedGraphInk(tutorPage);
        expect(tutorInk.points).toHaveLength(2);
        expect(tutorInk.strokes[0].pts.length).toBeGreaterThanOrEqual(2);
        await tutorPage.waitForTimeout(700);
        const versionAfterStroke = await readElementVersion(tutorPage, "tutor", graphId);
        expect(versionAfterStroke - versionAfterPoints).toBe(1);

        await expect
          .poll(async () => (await readMountedGraphInk(studentPage)).points.length, {
            timeout: 20_000,
          })
          .toBe(2);
        const studentInk = await readMountedGraphInk(studentPage);
        expectSameUserCoords(studentInk, tutorInk);

        // The persist replaced the element; the graph still takes the pointer.
        expect(await pointerReachesGraphHost(tutorPage, interactAt.x, interactAt.y)).toBe(true);
        await expect(tutorPage.getByText("Click to interact")).toHaveCount(0);

        await tutorPage.getByTestId("wb-graph-mode-pan").click();
        const beforeView = await readMountedGraphInk(tutorPage);
        await tutorPage.getByTestId("wb-graph-pan-right").click();
        await tutorPage.getByTestId("wb-graph-zoom-in").click();
        const afterView = await readMountedGraphInk(tutorPage);
        expect(beforeView.bbox).not.toBeNull();
        expect(afterView.bbox).not.toBeNull();
        const viewMoved = beforeView.bbox!.some(
          (value, index) => Math.abs(value - afterView.bbox![index]) > 1e-3
        );
        expect(viewMoved).toBe(true);
        expectSameUserCoords(afterView, beforeView);

        const saved = await readMountedGraphInk(tutorPage);
        await tutorPage.reload({ waitUntil: "domcontentloaded" });
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(tutorPage, "tutor");
        await expect
          .poll(async () => (await readMountedGraphInk(tutorPage)).points.length, {
            timeout: 30_000,
          })
          .toBe(2);
        expectSameUserCoords(await readMountedGraphInk(tutorPage), saved);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "draw preview follows the drag locally, persists once on release, and cancels on Escape or mode switch",
    { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const { tutorPage, studentPage } = peers;
        const graphId = await insertGraphOnRole(tutorPage, "tutor", session, []);
        await waitForElementOnPeer(studentPage, "student", graphId, 30_000);
        await activateTutorGraph(tutorPage);
        await tutorPage.waitForTimeout(700);
        await tutorPage.getByTestId("wb-graph-mode-draw").click();

        const host = tutorPage.locator(".wb-graph-board-host").first();
        const box = await host.boundingBox();
        expect(box, "graph board box").not.toBeNull();
        const strokeStart = {
          x: box!.x + box!.width * 0.35,
          y: box!.y + box!.height * 0.4,
        };
        const strokeEnd = {
          x: box!.x + box!.width * 0.72,
          y: box!.y + box!.height * 0.22,
        };

        const versionBefore = await readElementVersion(tutorPage, "tutor", graphId);
        await tutorPage.mouse.move(strokeStart.x, strokeStart.y);
        await tutorPage.mouse.down();
        await tutorPage.mouse.move(
          strokeStart.x + (strokeEnd.x - strokeStart.x) * 0.5,
          strokeStart.y + (strokeEnd.y - strokeStart.y) * 0.5,
          { steps: 6 }
        );
        await tutorPage.waitForTimeout(50);
        await tutorPage.mouse.move(strokeEnd.x, strokeEnd.y, { steps: 6 });
        await tutorPage.waitForTimeout(50);

        // In-progress curve is on the tutor board, in user coords, before release.
        const startUser = await graphUserAt(tutorPage, strokeStart.x, strokeStart.y);
        const endUser = await graphUserAt(tutorPage, strokeEnd.x, strokeEnd.y);
        const midDrag = await readMountedGraphInk(tutorPage);
        expect(midDrag.strokes).toHaveLength(0);
        expect(midDrag.previews).toHaveLength(1);
        expect(midDrag.previews[0].pts.length).toBeGreaterThanOrEqual(2);
        expect(nearestGraphDistance(midDrag.previews[0].pts, startUser)).toBeLessThan(0.6);
        expect(nearestGraphDistance(midDrag.previews[0].pts, endUser)).toBeLessThan(0.6);
        expect(await readElementVersion(tutorPage, "tutor", graphId)).toBe(versionBefore);
        expect((await readMountedGraphInk(studentPage)).strokes).toHaveLength(0);
        expect((await readMountedGraphInk(studentPage)).previews).toHaveLength(0);

        await tutorPage.mouse.up();
        await expect
          .poll(async () => (await readMountedGraphInk(tutorPage)).strokes.length, {
            timeout: 10_000,
          })
          .toBe(1);
        expect((await readMountedGraphInk(tutorPage)).previews).toHaveLength(0);
        await tutorPage.waitForTimeout(700);
        expect((await readElementVersion(tutorPage, "tutor", graphId)) - versionBefore).toBe(1);
        await expect
          .poll(async () => (await readMountedGraphInk(studentPage)).strokes.length, {
            timeout: 20_000,
          })
          .toBe(1);

        const versionAfterPersist = await readElementVersion(tutorPage, "tutor", graphId);
        const cancelStart = {
          x: box!.x + box!.width * 0.3,
          y: box!.y + box!.height * 0.62,
        };
        const cancelEnd = {
          x: box!.x + box!.width * 0.6,
          y: box!.y + box!.height * 0.55,
        };
        await tutorPage.mouse.move(cancelStart.x, cancelStart.y);
        await tutorPage.mouse.down();
        await tutorPage.mouse.move(cancelEnd.x, cancelEnd.y, { steps: 6 });
        await tutorPage.waitForTimeout(50);
        expect((await readMountedGraphInk(tutorPage)).previews).toHaveLength(1);
        await tutorPage.keyboard.press("Escape");
        expect((await readMountedGraphInk(tutorPage)).previews).toHaveLength(0);
        expect((await readMountedGraphInk(tutorPage)).strokes).toHaveLength(1);
        await tutorPage.mouse.up();
        await tutorPage.waitForTimeout(400);
        expect((await readMountedGraphInk(tutorPage)).strokes).toHaveLength(1);
        expect(await readElementVersion(tutorPage, "tutor", graphId)).toBe(versionAfterPersist);

        await tutorPage.getByTestId("wb-graph-mode-draw").click();
        const switchStart = {
          x: box!.x + box!.width * 0.4,
          y: box!.y + box!.height * 0.7,
        };
        await tutorPage.mouse.move(switchStart.x, switchStart.y);
        await tutorPage.mouse.down();
        await tutorPage.mouse.move(switchStart.x + 40, switchStart.y - 24, { steps: 4 });
        await tutorPage.waitForTimeout(50);
        expect((await readMountedGraphInk(tutorPage)).previews).toHaveLength(1);
        const panBtn = tutorPage.getByTestId("wb-graph-mode-pan");
        const panBox = await panBtn.boundingBox();
        expect(panBox, "pan mode button box").not.toBeNull();
        await tutorPage.mouse.move(
          panBox!.x + panBox!.width / 2,
          panBox!.y + panBox!.height / 2,
          { steps: 8 }
        );
        await tutorPage.mouse.up();
        await expect(panBtn).toHaveAttribute("aria-pressed", "true");
        await tutorPage.waitForTimeout(400);
        expect((await readMountedGraphInk(tutorPage)).previews).toHaveLength(0);
        expect((await readMountedGraphInk(tutorPage)).strokes).toHaveLength(1);
        expect(await readElementVersion(tutorPage, "tutor", graphId)).toBe(versionAfterPersist);
        expect((await readMountedGraphInk(studentPage)).strokes).toHaveLength(1);
      } finally {
        await peers.close();
      }
    }
  );

async function graphUserAt(
  page: Page,
  clientX: number,
  clientY: number
): Promise<[number, number]> {
  return page.evaluate(
    ({ x, y }) => {
      const host = document.querySelector(
        '[data-testid="wb-graph-embed-host"] .wb-graph-board-host'
      );
      const JXG = (
        window as unknown as {
          JXG?: {
            boards: Record<
              string,
              {
                containerObj?: Element | null;
                getUsrCoordsOfMouse?: (evt: MouseEvent) => number[];
              }
            >;
          };
        }
      ).JXG;
      if (!JXG || !host) return [Number.NaN, Number.NaN];
      const board = Object.values(JXG.boards).find(
        (candidate) =>
          candidate.containerObj === host ||
          (candidate.containerObj != null && host.contains(candidate.containerObj))
      );
      const coords = board?.getUsrCoordsOfMouse?.(
        new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true })
      );
      if (!coords || coords.length < 2) return [Number.NaN, Number.NaN];
      return [coords[0], coords[1]] as [number, number];
    },
    { x: clientX, y: clientY }
  );
}

function nearestGraphDistance(
  pts: [number, number][],
  target: [number, number]
): number {
  let best = Number.POSITIVE_INFINITY;
  for (const pt of pts) {
    const d = Math.hypot(pt[0] - target[0], pt[1] - target[1]);
    if (d < best) best = d;
  }
  return best;
}

  test(
    "a graph with no points or strokes still plots its expression",
    { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const graphId = await insertGraphOnRole(
          peers.tutorPage,
          "tutor",
          session,
          ["x^2"]
        );
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        await expect
          .poll(async () => (await readMountedGraphInk(peers.tutorPage)).functionGraphCount, {
            timeout: 20_000,
          })
          .toBeGreaterThan(0);
        const tutorInk = await readMountedGraphInk(peers.tutorPage);
        expect(tutorInk.points).toEqual([]);
        expect(tutorInk.strokes).toEqual([]);
        await expect
          .poll(async () => (await readMountedGraphInk(peers.studentPage)).functionGraphCount, {
            timeout: 20_000,
          })
          .toBeGreaterThan(0);
        const studentInk = await readMountedGraphInk(peers.studentPage);
        expect(studentInk.points).toEqual([]);
        expect(studentInk.strokes).toEqual([]);
      } finally {
        await peers.close();
      }
    }
  );
});
