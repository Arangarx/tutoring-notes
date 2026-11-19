import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  dragOnRoleCanvas,
  dragPointerAcrossSceneBox,
  drawTestStrokeOnRole,
  expectHeld,
  openTutorAndStudent,
  pageForRole,
  peerOf,
  projectSceneRectCenterToScreen,
  readAppStateCenterXY,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  selectStripTool,
  undoRedoButton,
  waitForElementOnPeer,
  waitForPeerElement,
  type SceneElementSummary,
  type WbSyncRole,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Stroke create, eraser, select+Delete, and redo — both directions.
 *
 * The oracle is the other peer's live scene (`__TN_WB_E2E__.getElements()`):
 * id present or absent among non-deleted elements. Nothing here is derived
 * from the sync apply path.
 *
 * The hermetic stroke (`drawTestStrokeOnRole`) is always a `line`. Pencil
 * coverage is a separate test: select Pencil (P) and drag, which must sync
 * a real `type === "freedraw"` element.
 * Undo/redo use the top-bar buttons, then `expectHeld` so a mid-apply frame
 * is not a pass. The undo apply-race itself is T5 — not repeated here.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-eraser.spec.ts --project=wb-regression`
 */
const ERASER_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

let strokeSeq = 0;

function nextStrokeId(prefix: string): string {
  strokeSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${strokeSeq}`;
}

/** Scene segment near the role's current view center, offset so strokes do not stack. */
async function strokeNearViewCenter(
  page: Page,
  role: WbSyncRole,
  dx: number,
  dy: number
): Promise<{ x1: number; y1: number; x2: number; y2: number }> {
  const center = await readAppStateCenterXY(page, role);
  return {
    x1: center.x + dx,
    y1: center.y + dy,
    x2: center.x + dx + 180,
    y2: center.y + dy + 120,
  };
}

async function liveHasId(page: Page, role: WbSyncRole, elementId: string): Promise<boolean> {
  const summary = await readSceneElementSummary(page, role, { omitDeleted: true });
  return summary.some((element) => element.id === elementId);
}

/**
 * Draw a hermetic stroke on `author` and wait until `peer` has that id,
 * not deleted, with the same type the author scene reports.
 */
async function syncNewStroke(
  authorPage: Page,
  author: WbSyncRole,
  peerPage: Page,
  peer: WbSyncRole,
  dx: number,
  dy: number
): Promise<SceneElementSummary> {
  const id = nextStrokeId(`pw-stroke-${author}`);
  const box = await strokeNearViewCenter(authorPage, author, dx, dy);
  await drawTestStrokeOnRole(authorPage, author, id, box.x1, box.y1, box.x2, box.y2);
  await waitForElementOnPeer(authorPage, author, id);
  const authored = (await readSceneElementSummary(authorPage, author, { omitDeleted: true })).find(
    (element) => element.id === id
  );
  if (!authored?.type) throw new Error(`stroke ${id} missing on ${author}`);
  // drawTestStroke → makeLine. A freedraw would be the wrong element here.
  expect(authored.type).toBe("line");
  expect(Math.abs(authored.width) >= 1 || Math.abs(authored.height) >= 1).toBe(true);

  await waitForElementOnPeer(peerPage, peer, id);
  await waitForPeerElement(
    peerPage,
    peer,
    id,
    (element) =>
      element.type === authored.type &&
      element.isDeleted === false &&
      (Math.abs(element.width) >= 1 || Math.abs(element.height) >= 1)
  );
  return authored;
}

/** Peer no longer lists `elementId` among non-deleted elements, and it stays gone. */
async function expectDeletedOn(
  page: Page,
  role: WbSyncRole,
  elementId: string
): Promise<void> {
  await expectHeld(
    async () => {
      const summary = await readSceneElementSummary(page, role);
      const row = summary.find((element) => element.id === elementId);
      const live = summary.filter((element) => !element.isDeleted);
      return {
        absentFromLive: !live.some((element) => element.id === elementId),
        tombstoneOrGone: !row || row.isDeleted === true,
      };
    },
    { absentFromLive: true, tombstoneOrGone: true },
    { holdMs: 1_000, timeoutMs: 20_000 }
  );
}

async function eraseElement(
  page: Page,
  role: WbSyncRole,
  element: SceneElementSummary
): Promise<void> {
  await selectStripTool(page, "Eraser (E)");
  await dragPointerAcrossSceneBox(page, role, element);
}

/** Diagonal Pencil drags. The two roles use different regions so strokes do not overlap. */
const PENCIL_DRAG: Record<
  WbSyncRole,
  { from: { xFrac: number; yFrac: number }; to: { xFrac: number; yFrac: number } }
> = {
  tutor: { from: { xFrac: 0.22, yFrac: 0.32 }, to: { xFrac: 0.46, yFrac: 0.62 } },
  student: { from: { xFrac: 0.56, yFrac: 0.3 }, to: { xFrac: 0.8, yFrac: 0.64 } },
};

/** A real freedraw stroke, not a 1px speck. Both axes of the scene box count. */
function freedrawExtentOk(element: SceneElementSummary): boolean {
  return Math.abs(element.width) > 1 && Math.abs(element.height) > 1;
}

async function drawPencilStroke(page: Page, role: WbSyncRole): Promise<void> {
  await selectStripTool(page, "Pencil (P)");
  const drag = PENCIL_DRAG[role];
  await dragOnRoleCanvas(page, role, drag.from, drag.to);
}

async function waitForAddedFreedraw(
  page: Page,
  role: WbSyncRole,
  beforeIds: readonly string[]
): Promise<SceneElementSummary> {
  let found: SceneElementSummary | undefined;
  await expect
    .poll(
      async () => {
        const summary = await readSceneElementSummary(page, role, {
          type: "freedraw",
          omitDeleted: true,
        });
        const prior = new Set(beforeIds);
        found = summary.find(
          (element) =>
            !prior.has(element.id) && element.type === "freedraw" && freedrawExtentOk(element)
        );
        return Boolean(found);
      },
      { timeout: 20_000 }
    )
    .toBe(true);
  if (!found) {
    const summary = await readSceneElementSummary(page, role, { omitDeleted: true });
    const prior = new Set(beforeIds);
    const added = summary.filter((element) => !prior.has(element.id));
    throw new Error(
      `${role} scene did not gain a freedraw; new elements=${JSON.stringify(added)}`
    );
  }
  return found;
}

/**
 * Select Pencil and drag on `author`. The peer's non-deleted scene must gain
 * that same id with `type === "freedraw"` and a bounding box over 1px.
 */
async function syncNewFreedraw(
  authorPage: Page,
  author: WbSyncRole,
  peerPage: Page,
  peer: WbSyncRole
): Promise<SceneElementSummary> {
  const before = await readSceneElementIds(authorPage, author);
  await drawPencilStroke(authorPage, author);
  const authored = await waitForAddedFreedraw(authorPage, author, before);
  expect(authored.type).toBe("freedraw");
  expect(freedrawExtentOk(authored)).toBe(true);

  await waitForPeerElement(
    peerPage,
    peer,
    authored.id,
    (element) =>
      element.type === "freedraw" && element.isDeleted === false && freedrawExtentOk(element)
  );
  const peerRow = (
    await readSceneElementSummary(peerPage, peer, { omitDeleted: true })
  ).find((element) => element.id === authored.id);
  expect(peerRow?.id).toBe(authored.id);
  expect(peerRow?.type).toBe("freedraw");
  expect(peerRow?.isDeleted).toBe(false);
  if (!peerRow) throw new Error(`freedraw ${authored.id} missing on ${peer}`);
  expect(freedrawExtentOk(peerRow)).toBe(true);
  return authored;
}

async function selectAndDelete(
  page: Page,
  role: WbSyncRole,
  element: SceneElementSummary
): Promise<void> {
  await selectStripTool(page, "Select (V)");
  const center = await projectSceneRectCenterToScreen(page, role, element);
  await page.mouse.click(center.x, center.y);
  await page.keyboard.press("Delete");
}

test.describe("whiteboard eraser, delete, and redo live sync", { tag: [...ERASER_TAGS] }, () => {
  test(
    "a stroke created on one peer appears on the other (tutor → student and student → tutor)",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`stroke ${author} → ${peer}`, async () => {
            const authored = await syncNewStroke(
              pageForRole(peers, author),
              author,
              pageForRole(peers, peer),
              peer,
              author === "tutor" ? -200 : 40,
              author === "tutor" ? -80 : 40
            );
            const peerRow = (
              await readSceneElementSummary(pageForRole(peers, peer), peer, { omitDeleted: true })
            ).find((element) => element.id === authored.id);
            expect(peerRow?.id).toBe(authored.id);
            expect(peerRow?.type).toBe(authored.type);
            expect(peerRow?.isDeleted).toBe(false);
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "a pencil freedraw stroke created on one peer appears on the other (tutor → student and student → tutor)",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`freedraw ${author} → ${peer}`, async () => {
            await syncNewFreedraw(
              pageForRole(peers, author),
              author,
              pageForRole(peers, peer),
              peer
            );
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "the creator erases a pencil freedraw and the other peer sees it deleted",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const author: WbSyncRole = "tutor";
        const peer = peerOf(author);
        const authorPage = pageForRole(peers, author);
        const peerPage = pageForRole(peers, peer);
        const authored = await syncNewFreedraw(authorPage, author, peerPage, peer);
        const local = (
          await readSceneElementSummary(authorPage, author, { omitDeleted: true })
        ).find((element) => element.id === authored.id);
        if (!local) throw new Error(`freedraw ${authored.id} left ${author} before erase`);
        expect(local.type).toBe("freedraw");
        await eraseElement(authorPage, author, local);
        await expectDeletedOn(authorPage, author, authored.id);
        await expectDeletedOn(peerPage, peer, authored.id);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "the creator erases the stroke and the other peer sees it deleted",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`${author} erases, ${peer} sees the deletion`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const authored = await syncNewStroke(
              authorPage,
              author,
              peerPage,
              peer,
              author === "tutor" ? -200 : 40,
              -70
            );
            // Re-read on the eraser's page so the drag uses that viewer's box.
            const local = (
              await readSceneElementSummary(authorPage, author, { omitDeleted: true })
            ).find((element) => element.id === authored.id);
            if (!local) throw new Error(`stroke ${authored.id} left ${author} before erase`);
            await eraseElement(authorPage, author, local);
            await expectDeletedOn(authorPage, author, authored.id);
            await expectDeletedOn(peerPage, peer, authored.id);
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "the other peer erases the creator's stroke and the creator sees it deleted",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`${peer} erases ${author}'s stroke`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const authored = await syncNewStroke(
              authorPage,
              author,
              peerPage,
              peer,
              author === "tutor" ? -200 : 40,
              30
            );
            const onEraser = (
              await readSceneElementSummary(peerPage, peer, { omitDeleted: true })
            ).find((element) => element.id === authored.id);
            if (!onEraser) throw new Error(`stroke ${authored.id} missing on ${peer} before erase`);
            await eraseElement(peerPage, peer, onEraser);
            await expectDeletedOn(peerPage, peer, authored.id);
            await expectDeletedOn(authorPage, author, authored.id);
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "select and the Delete key remove the element on the other peer",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`${author} selects and deletes, ${peer} sees it gone`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const authored = await syncNewStroke(
              authorPage,
              author,
              peerPage,
              peer,
              author === "tutor" ? -180 : 60,
              author === "tutor" ? -40 : 80
            );
            const local = (
              await readSceneElementSummary(authorPage, author, { omitDeleted: true })
            ).find((element) => element.id === authored.id);
            if (!local) throw new Error(`stroke ${authored.id} missing on ${author} before delete`);
            await selectAndDelete(authorPage, author, local);
            await expectDeletedOn(authorPage, author, authored.id);
            await expectDeletedOn(peerPage, peer, authored.id);
          });
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "undo removes the stroke from both scenes and redo puts it back on both",
    { tag: [...ERASER_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        for (const author of ["tutor", "student"] as const) {
          const peer = peerOf(author);
          await test.step(`${author} undo then redo syncs`, async () => {
            const authorPage = pageForRole(peers, author);
            const peerPage = pageForRole(peers, peer);
            const authored = await syncNewStroke(
              authorPage,
              author,
              peerPage,
              peer,
              author === "tutor" ? -160 : 80,
              author === "tutor" ? -90 : 20
            );

            const undo = undoRedoButton(authorPage, author, "undo");
            await expect(undo).toBeEnabled({ timeout: 10_000 });
            await undo.click();
            await expectHeld(
              async () => ({
                author: await liveHasId(authorPage, author, authored.id),
                peer: await liveHasId(peerPage, peer, authored.id),
              }),
              { author: false, peer: false },
              { holdMs: 2_000, timeoutMs: 20_000 }
            );

            const redo = undoRedoButton(authorPage, author, "redo");
            await expect(redo).toBeEnabled({ timeout: 10_000 });
            await redo.click();
            await expectHeld(
              async () => ({
                author: await liveHasId(authorPage, author, authored.id),
                peer: await liveHasId(peerPage, peer, authored.id),
              }),
              { author: true, peer: true },
              { holdMs: 2_000, timeoutMs: 20_000 }
            );
          });
        }
      } finally {
        await peers.close();
      }
    }
  );
});
