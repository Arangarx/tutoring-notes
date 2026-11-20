import { test, expect } from "./fixtures";
import {
  addedIds,
  clickZOrderAction,
  dragSceneTransformHandle,
  drawShapeWithTool,
  expectPeerReflectsAuthor,
  openTutorAndStudent,
  pageForRole,
  peerOf,
  readSceneElement,
  readSceneElementIds,
  readSceneElementSummary,
  restyleSelectedElement,
  seedWbLiveSyncSession,
  selectSceneElement,
  waitForAddedElement,
  waitForPeerElement,
  type SceneElementSummary,
  type WbSyncRole,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Element-transform bidirectional sync.
 *
 * Each mutation is a real pointer gesture or a real Excalidraw property /
 * z-order control. Those fire onChange, which is the app's normal broadcast.
 * `__WBX_FORCE_LIVE_SCENE__` also fires onChange and can broadcast to the
 * peer (`captureUpdate: "NEVER"` only skips undo history), so it must not
 * be used for a red-proof while sync is live. The resize red-proof runs
 * `sizeAgrees` on a synthetic 1×1 copy of the live row.
 *
 * The oracle is the other peer's live scene (`__TN_WB_E2E__.getElements()`).
 * The peer must match the author's own resulting value. Geometry is not a
 * hardcoded box.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-transform.spec.ts --project=wb-regression`
 */
const TRANSFORM_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

const GEOMETRY_PX = 4;
const ANGLE_TOL = 0.05;

const RECT_DRAG = {
  // Left of the live-video panel, and stacked so a resize drag cannot
  // start on the other shape. The right side of the canvas is covered
  // by the participant tiles.
  tutor: {
    from: { xFrac: 0.26, yFrac: 0.24 },
    to: { xFrac: 0.44, yFrac: 0.44 },
  },
  student: {
    from: { xFrac: 0.26, yFrac: 0.56 },
    to: { xFrac: 0.44, yFrac: 0.76 },
  },
} as const;

type Peers = Awaited<ReturnType<typeof openTutorAndStudent>>;

function sizeAgrees(author: SceneElementSummary, peer: SceneElementSummary): true | string {
  const widthDelta = Math.abs(peer.width - author.width);
  const heightDelta = Math.abs(peer.height - author.height);
  if (widthDelta <= GEOMETRY_PX && heightDelta <= GEOMETRY_PX) return true;
  return `width author=${author.width} peer=${peer.width} height author=${author.height} peer=${peer.height}`;
}

function angleAgrees(author: SceneElementSummary, peer: SceneElementSummary): true | string {
  if (Math.abs(author.angle) <= ANGLE_TOL) {
    return `author angle still ${author.angle}`;
  }
  if (Math.abs(peer.angle - author.angle) <= ANGLE_TOL) return true;
  return `angle author=${author.angle} peer=${peer.angle}`;
}

/** Draw a rectangle on `author` and wait until the peer's live scene has it. */
async function drawSyncedRectangle(peers: Peers, author: WbSyncRole): Promise<string> {
  const peer = peerOf(author);
  const authorPage = pageForRole(peers, author);
  const peerPage = pageForRole(peers, peer);
  const authorBefore = await readSceneElementIds(authorPage, author);
  const peerBefore = await readSceneElementIds(peerPage, peer);
  await drawShapeWithTool(authorPage, author, "rectangle", RECT_DRAG[author].from, RECT_DRAG[author].to);
  const authored = await waitForAddedElement(
    authorPage,
    author,
    authorBefore,
    (element) => element.type === "rectangle" && element.width > 1 && element.height > 1
  );
  await waitForPeerElement(peerPage, peer, authored.id, (element) => element.type === "rectangle");
  const peerSummary = await readSceneElementSummary(peerPage, peer, { omitDeleted: true });
  expect(
    addedIds(
      peerBefore,
      peerSummary.map((element) => element.id)
    ),
    "rectangle id is on the peer"
  ).toContain(authored.id);
  await expectPeerReflectsAuthor(authorPage, author, peerPage, peer, authored.id, sizeAgrees);
  return authored.id;
}

/**
 * Pure red-proof: `sizeAgrees` rejects a 1×1 copy of the live row.
 * Does not mutate the scene. `__WBX_FORCE_LIVE_SCENE__` fires onChange
 * and can broadcast, so it is not used while sync is live.
 */
async function proveSizeMatchCanFail(
  authorPage: Parameters<typeof pageForRole>[0]["tutorPage"],
  author: WbSyncRole,
  elementId: string
): Promise<void> {
  const row = await readSceneElement(authorPage, author, elementId);
  expect(row, "red-proof reads the live rectangle").toBeTruthy();
  const poisoned: SceneElementSummary = { ...row!, width: 1, height: 1 };
  expect(
    sizeAgrees(row!, poisoned),
    "red-proof: a 1×1 copy does not size-agree"
  ).not.toBe(true);
}

test.describe("whiteboard transform live sync", { tag: [...TRANSFORM_TAGS] }, () => {
  test(
    "resize syncs both ways (peer width and height match the author)",
    { tag: [...TRANSFORM_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`resize ${author} → ${peer}`, async () => {
            const id = await drawSyncedRectangle(peers, author);
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const before = await readSceneElement(authorPage, author, id);
            expect(before, "rectangle is on the author").toBeTruthy();
            await selectSceneElement(authorPage, author, before!);
            const selected = await readSceneElement(authorPage, author, id);
            // Drag the SE handle up-left so the pointer stays on the canvas
            // (the right edge is the video panel). Shrinking is still a resize.
            await dragSceneTransformHandle(authorPage, author, selected!, "se", {
              x: -56,
              y: -40,
            });
            await expect
              .poll(
                async () => {
                  const now = await readSceneElement(authorPage, author, id);
                  if (!now || !before) return "missing";
                  const grew =
                    Math.abs(now.width - before.width) > 8 ||
                    Math.abs(now.height - before.height) > 8;
                  return grew ? "resized" : `width ${now.width} height ${now.height}`;
                },
                { timeout: 10_000 }
              )
              .toBe("resized");
            await expectPeerReflectsAuthor(
              authorPage,
              author,
              peerPage,
              peer,
              id,
              sizeAgrees
            );
          });
        }
        // `find` returns the first rectangle on the student scene. The tutor
        // draws first, so that element is the tutor-authored rectangle.
        const firstRectangleId = (
          await readSceneElementSummary(peers.studentPage, "student", { omitDeleted: true })
        ).find((element) => element.type === "rectangle")?.id;
        expect(firstRectangleId, "tutor-authored rectangle is first on the student scene").toBeTruthy();
        await proveSizeMatchCanFail(peers.studentPage, "student", firstRectangleId!);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "rotate syncs both ways (peer angle matches the author's non-zero angle)",
    { tag: [...TRANSFORM_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`rotate ${author} → ${peer}`, async () => {
            const id = await drawSyncedRectangle(peers, author);
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const before = await readSceneElement(authorPage, author, id);
            expect(before).toBeTruthy();
            await selectSceneElement(authorPage, author, before!);
            const selected = await readSceneElement(authorPage, author, id);
            await dragSceneTransformHandle(authorPage, author, selected!, "rotation", {
              x: 90,
              y: 12,
            });
            await expect
              .poll(
                async () => {
                  const now = await readSceneElement(authorPage, author, id);
                  if (!now) return "missing";
                  return Math.abs(now.angle) > ANGLE_TOL ? "rotated" : `angle ${now.angle}`;
                },
                { timeout: 10_000 }
              )
              .toBe("rotated");
            await expectPeerReflectsAuthor(
              authorPage,
              author,
              peerPage,
              peer,
              id,
              angleAgrees
            );
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "style syncs both ways (peer stroke matches the author's resulting stroke)",
    { tag: [...TRANSFORM_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`style ${author} → ${peer}`, async () => {
            const id = await drawSyncedRectangle(peers, author);
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const before = await readSceneElement(authorPage, author, id);
            expect(before).toBeTruthy();
            await restyleSelectedElement(authorPage, author, before!);
            await expect
              .poll(
                async () => {
                  const now = await readSceneElement(authorPage, author, id);
                  if (!now || !before) return "missing";
                  const changed =
                    now.strokeWidth !== before.strokeWidth ||
                    now.strokeColor !== before.strokeColor;
                  return changed
                    ? "styled"
                    : `strokeWidth ${now.strokeWidth} strokeColor ${now.strokeColor}`;
                },
                { timeout: 10_000 }
              )
              .toBe("styled");
            await expectPeerReflectsAuthor(
              authorPage,
              author,
              peerPage,
              peer,
              id,
              (authorEl, peerEl) => {
                if (authorEl.strokeWidth !== peerEl.strokeWidth) {
                  return `strokeWidth author=${authorEl.strokeWidth} peer=${peerEl.strokeWidth}`;
                }
                if (authorEl.strokeColor !== peerEl.strokeColor) {
                  return `strokeColor author=${authorEl.strokeColor} peer=${peerEl.strokeColor}`;
                }
                if (
                  authorEl.strokeWidth === before!.strokeWidth &&
                  authorEl.strokeColor === before!.strokeColor
                ) {
                  return "author stroke did not change";
                }
                return true;
              }
            );
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "z-order syncs both ways (peer stacking order matches the author)",
    { tag: [...TRANSFORM_TAGS] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const regions = {
          tutor: [
            {
              from: { xFrac: 0.22, yFrac: 0.28 },
              to: { xFrac: 0.38, yFrac: 0.46 },
            },
            {
              from: { xFrac: 0.42, yFrac: 0.28 },
              to: { xFrac: 0.58, yFrac: 0.46 },
            },
          ],
          student: [
            {
              from: { xFrac: 0.22, yFrac: 0.52 },
              to: { xFrac: 0.38, yFrac: 0.7 },
            },
            {
              from: { xFrac: 0.42, yFrac: 0.52 },
              to: { xFrac: 0.58, yFrac: 0.7 },
            },
          ],
        } as const;

        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`z-order ${author} → ${peer}`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const ids: string[] = [];
            for (const drag of regions[author]) {
              const before = await readSceneElementIds(authorPage, author);
              await drawShapeWithTool(authorPage, author, "rectangle", drag.from, drag.to);
              const added = await waitForAddedElement(
                authorPage,
                author,
                before,
                (element) => element.type === "rectangle" && element.width > 1
              );
              await waitForPeerElement(peerPage, peer, added.id, (element) => !element.isDeleted);
              ids.push(added.id);
            }

            const pairOrder = async (role: WbSyncRole) => {
              const page = pageForRole(peers, role);
              const summary = await readSceneElementSummary(page, role, { omitDeleted: true });
              const wanted = new Set(ids);
              return summary.filter((element) => wanted.has(element.id)).map((element) => element.id);
            };

            const initial = await pairOrder(author);
            expect(initial, "two rectangles on the author").toEqual(ids);
            const backId = initial[0]!;
            const back = await readSceneElement(authorPage, author, backId);
            expect(back).toBeTruthy();
            await selectSceneElement(authorPage, author, back!);
            await clickZOrderAction(authorPage, "Bring to front");

            await expect
              .poll(
                async () => {
                  const authorOrder = await pairOrder(author);
                  if (authorOrder[authorOrder.length - 1] !== backId) {
                    return `author order ${authorOrder.join(",")} want front ${backId}`;
                  }
                  const peerOrder = await pairOrder(peer);
                  if (peerOrder.join(",") !== authorOrder.join(",")) {
                    return `peer ${peerOrder.join(",")} author ${authorOrder.join(",")}`;
                  }
                  const authorSummary = await readSceneElementSummary(authorPage, author);
                  const peerSummary = await readSceneElementSummary(peerPage, peer);
                  for (const id of ids) {
                    const authorEl = authorSummary.find((element) => element.id === id);
                    const peerEl = peerSummary.find((element) => element.id === id);
                    if (
                      authorEl?.index != null &&
                      peerEl?.index != null &&
                      authorEl.index !== peerEl.index
                    ) {
                      return `index ${id} author=${authorEl.index} peer=${peerEl.index}`;
                    }
                  }
                  return "match";
                },
                { timeout: 15_000 }
              )
              .toBe("match");

            await clickZOrderAction(authorPage, "Send to back");
            await expect
              .poll(
                async () => {
                  const authorOrder = await pairOrder(author);
                  if (authorOrder[0] !== backId) {
                    return `author order ${authorOrder.join(",")} want back ${backId}`;
                  }
                  const peerOrder = await pairOrder(peer);
                  if (peerOrder.join(",") !== authorOrder.join(",")) {
                    return `peer ${peerOrder.join(",")} author ${authorOrder.join(",")}`;
                  }
                  return "match";
                },
                { timeout: 15_000 }
              )
              .toBe("match");
          });
        }
      } finally {
        await peers.close();
      }
    }
  );
});
