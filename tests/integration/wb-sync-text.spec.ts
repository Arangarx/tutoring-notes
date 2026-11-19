import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  openTutorAndStudent,
  readActiveWhiteboardPageId,
  readPageDataBucketIds,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Text-tool bidirectional sync.
 *
 * The oracle is the other peer's live scene (`__TN_WB_E2E__.getElements()`):
 * a new element id appears, `type === "text"`, and `text` equals the string
 * typed in the real Text tool. Nothing here is derived from the sync apply path.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-text.spec.ts --project=wb-regression`
 */
const TEXT_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

type Role = "tutor" | "student";

type TextEl = { id: string; type: string; text: string };

const CANVAS_MOUNT: Record<Role, string> = {
  tutor: "tutor-whiteboard-canvas-mount",
  student: "student-whiteboard-canvas-mount",
};

function peerOf(role: Role): Role {
  return role === "tutor" ? "student" : "tutor";
}

function addedIds(before: string[], after: string[]): string[] {
  const prior = new Set(before);
  return after.filter((id) => !prior.has(id));
}

async function readTextElements(page: Page, role: Role): Promise<TextEl[]> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getElements?: () => Array<{ id: string; type?: string; text?: string; isDeleted?: boolean }> }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    const elements = bridge?.getElements?.() ?? [];
    return elements
      .filter((element) => element.type === "text" && element.isDeleted !== true)
      .map((element) => ({
        id: element.id,
        type: element.type ?? "",
        text: element.text ?? "",
      }));
  }, role);
}

/** Viewport point on the text element's center, from the peer's own scene box. */
async function textElementViewportCenter(
  page: Page,
  role: Role,
  elementId: string
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              getElements: () => Array<{
                id: string;
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              }>;
              getAppState: () => Record<string, unknown>;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      if (!bridge?.getElements) throw new Error(`missing bridge for ${r}`);
      const element = bridge.getElements().find((entry) => entry.id === id);
      if (!element) throw new Error(`text ${id} not on ${r} canvas`);
      const state = bridge.getAppState();
      const zoomObj = state.zoom as { value?: number } | undefined;
      const zoom = zoomObj && typeof zoomObj.value === "number" ? zoomObj.value : 1;
      const scrollX = Number(state.scrollX) || 0;
      const scrollY = Number(state.scrollY) || 0;
      const offsetLeft = Number(state.offsetLeft) || 0;
      const offsetTop = Number(state.offsetTop) || 0;
      const sceneX = (Number(element.x) || 0) + (Number(element.width) || 0) / 2;
      const sceneY = (Number(element.y) || 0) + (Number(element.height) || 0) / 2;
      return {
        x: (sceneX + scrollX) * zoom + offsetLeft,
        y: (sceneY + scrollY) * zoom + offsetTop,
      };
    },
    { r: role, id: elementId }
  );
}

async function commitWysiwyg(page: Page, value: string): Promise<void> {
  const editor = page.locator("textarea.excalidraw-wysiwyg");
  await expect(editor).toBeVisible({ timeout: 10_000 });
  await editor.fill(value);
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden({ timeout: 10_000 });
}

/** Click Text (T), click the canvas, type, and commit with Escape. */
async function typeCommittedText(page: Page, role: Role, sentinel: string): Promise<void> {
  const textTool = page.getByRole("button", { name: "Text (T)" });
  await textTool.click();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");
  const canvas = page.locator(`[data-testid="${CANVAS_MOUNT[role]}"] .excalidraw`).first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box, "excalidraw canvas box").not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.4);
  await commitWysiwyg(page, sentinel);
}

/** Re-enter an existing text element and replace its string. */
async function editCommittedText(
  page: Page,
  role: Role,
  elementId: string,
  nextText: string
): Promise<void> {
  const select = page.getByRole("button", { name: "Select (V)" });
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  const center = await textElementViewportCenter(page, role, elementId);
  await page.mouse.dblclick(center.x, center.y);
  await commitWysiwyg(page, nextText);
}

async function waitForPeerText(
  page: Page,
  role: Role,
  elementId: string,
  text: string,
  timeoutMs = 45_000
): Promise<void> {
  await page.waitForFunction(
    ({ r, id, text: expected }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            { getElements?: () => Array<{ id: string; type?: string; text?: string }> }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      const element = bridge?.getElements?.().find((entry) => entry.id === id);
      return element?.type === "text" && element.text === expected;
    },
    { r: role, id: elementId, text },
    { timeout: timeoutMs }
  );
}

/**
 * Type `sentinel` on `author` and return the one new text element id.
 * The other peer must gain that same id, with `text` equal to the sentinel,
 * and no other new scene element.
 */
async function syncNewText(
  authorPage: Page,
  author: Role,
  peerPage: Page,
  peer: Role,
  sentinel: string
): Promise<string> {
  const authorBefore = await readSceneElementIds(authorPage, author);
  const peerBefore = await readSceneElementIds(peerPage, peer);
  const peerTextsBefore = await readTextElements(peerPage, peer);
  expect(peerTextsBefore.map((element) => element.text)).not.toContain(sentinel);

  await typeCommittedText(authorPage, author, sentinel);
  await expect
    .poll(
      async () =>
        (await readTextElements(authorPage, author)).some((element) => element.text === sentinel),
      { timeout: 15_000 }
    )
    .toBe(true);

  const authorAdded = addedIds(authorBefore, await readSceneElementIds(authorPage, author));
  expect(authorAdded, "author scene gains one element").toHaveLength(1);
  const elementId = authorAdded[0];
  if (!elementId) throw new Error("author text element id missing");
  const authorText = (await readTextElements(authorPage, author)).find(
    (element) => element.id === elementId
  );
  expect(authorText?.type).toBe("text");
  expect(authorText?.text).toBe(sentinel);

  await waitForElementOnPeer(peerPage, peer, elementId);
  await waitForPeerText(peerPage, peer, elementId, sentinel);

  const peerAdded = addedIds(peerBefore, await readSceneElementIds(peerPage, peer));
  expect(peerAdded, "peer gains exactly the new text element").toEqual([elementId]);
  const peerText = (await readTextElements(peerPage, peer)).filter(
    (element) => element.text === sentinel
  );
  expect(peerText).toEqual([{ id: elementId, type: "text", text: sentinel }]);
  return elementId;
}

type BoardSnapshot = {
  activePageId: string;
  tutorLive: TextEl[];
  studentLive: TextEl[];
  tutorSceneIds: string[];
  studentSceneIds: string[];
  board1Ids: string[];
  board2Ids: string[];
};

async function readBoardSnapshot(
  peers: { tutorPage: Page; studentPage: Page },
  board1Id: string,
  board2Id: string
): Promise<BoardSnapshot> {
  const [activePageId, tutorLive, studentLive, tutorSceneIds, studentSceneIds, board1Ids, board2Ids] =
    await Promise.all([
      readActiveWhiteboardPageId(peers.tutorPage),
      readTextElements(peers.tutorPage, "tutor"),
      readTextElements(peers.studentPage, "student"),
      readSceneElementIds(peers.tutorPage, "tutor"),
      readSceneElementIds(peers.studentPage, "student"),
      readPageDataBucketIds(peers.tutorPage, board1Id),
      readPageDataBucketIds(peers.tutorPage, board2Id),
    ]);
  return {
    activePageId,
    tutorLive,
    studentLive,
    tutorSceneIds,
    studentSceneIds,
    board1Ids,
    board2Ids,
  };
}

test.describe("whiteboard text-tool live sync", { tag: [...TEXT_TAGS] }, () => {
  for (const author of ["tutor", "student"] as const) {
    const peer = peerOf(author);

    test(
      `text typed on one peer appears as a text element on the other (${author} → ${peer})`,
      { tag: [...TEXT_TAGS] },
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          const sentinel = `pwTxt${author}${Date.now()}`;
          await syncNewText(
            author === "tutor" ? peers.tutorPage : peers.studentPage,
            author,
            peer === "tutor" ? peers.tutorPage : peers.studentPage,
            peer,
            sentinel
          );
        } finally {
          await peers.close();
        }
      }
    );

    test(
      `editing a synced text element updates text on the other peer (${author} edits)`,
      { tag: [...TEXT_TAGS] },
      async ({ browser }) => {
        test.setTimeout(180_000);
        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);
        try {
          const authorPage = author === "tutor" ? peers.tutorPage : peers.studentPage;
          const peerPage = peer === "tutor" ? peers.tutorPage : peers.studentPage;
          const sentinel = `pwTxtEdit${author}${Date.now()}`;
          const revised = `${sentinel}X`;
          const authorBefore = await readSceneElementIds(authorPage, author);
          const peerBefore = await readSceneElementIds(peerPage, peer);
          const elementId = await syncNewText(authorPage, author, peerPage, peer, sentinel);

          await editCommittedText(authorPage, author, elementId, revised);

          const authorTexts = await readTextElements(authorPage, author);
          expect(authorTexts.find((element) => element.id === elementId)?.text).toBe(revised);
          expect(authorTexts.filter((element) => element.text === sentinel)).toEqual([]);
          expect(addedIds(authorBefore, await readSceneElementIds(authorPage, author))).toEqual([
            elementId,
          ]);

          await waitForPeerText(peerPage, peer, elementId, revised);
          const peerTexts = await readTextElements(peerPage, peer);
          expect(peerTexts.filter((element) => element.id === elementId)).toEqual([
            { id: elementId, type: "text", text: revised },
          ]);
          expect(peerTexts.filter((element) => element.text === sentinel)).toEqual([]);
          expect(
            addedIds(peerBefore, await readSceneElementIds(peerPage, peer)),
            "edit updates the same element id"
          ).toEqual([elementId]);
        } finally {
          await peers.close();
        }
      }
    );
  }

  test(
    "student text stays on the board it was typed on after the tutor changes boards",
    { tag: [...TEXT_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const sentinel = `pwTxtCarry${Date.now()}`;
        const board1Id = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(board1Id, "Board 1 page id").not.toBe("");

        const elementId = await syncNewText(
          peers.studentPage,
          "student",
          peers.tutorPage,
          "tutor",
          sentinel
        );

        await peers.tutorPage
          .getByTestId("wb-tutor-page-strip")
          .getByRole("button", { name: "Add board" })
          .click();
        await expect(
          peers.tutorPage
            .getByTestId("wb-tutor-page-strip")
            .getByRole("tab", { name: "Board 2", exact: true })
        ).toBeVisible({ timeout: 10_000 });
        // Add board switches the tutor to Board 2; the student strip follows.
        await expect(
          peers.studentPage
            .getByTestId("wb-student-page-strip")
            .getByRole("tab", { name: "Board 2", exact: true })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });

        const board2Id = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(board2Id).not.toBe(board1Id);

        // Marker drawn after the switch: its arrival means the live scene is Board 2.
        const board2Marker = `pw-b2-marker-${Date.now()}`;
        await drawTestStrokeOnRole(
          peers.tutorPage,
          "tutor",
          board2Marker,
          240,
          80,
          360,
          160
        );
        await waitForElementOnPeer(peers.studentPage, "student", board2Marker);

        const onBoard2 = await readBoardSnapshot(peers, board1Id, board2Id);
        const board2View = {
          tutorLiveHasSentinel: onBoard2.tutorLive.some(
            (element) => element.id === elementId || element.text === sentinel
          ),
          studentLiveHasSentinel: onBoard2.studentLive.some(
            (element) => element.id === elementId || element.text === sentinel
          ),
          tutorSceneHasSentinelId: onBoard2.tutorSceneIds.includes(elementId),
          studentSceneHasSentinelId: onBoard2.studentSceneIds.includes(elementId),
          board1BucketHasId: onBoard2.board1Ids.includes(elementId),
          board2BucketHasId: onBoard2.board2Ids.includes(elementId),
          tutorSceneHasMarker: onBoard2.tutorSceneIds.includes(board2Marker),
          studentSceneHasMarker: onBoard2.studentSceneIds.includes(board2Marker),
        };
        expect(board2View, `Board 2 live state ${JSON.stringify(onBoard2)}`).toEqual({
          tutorLiveHasSentinel: false,
          studentLiveHasSentinel: false,
          tutorSceneHasSentinelId: false,
          studentSceneHasSentinelId: false,
          board1BucketHasId: true,
          board2BucketHasId: false,
          tutorSceneHasMarker: true,
          studentSceneHasMarker: true,
        });

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        await expect(
          peers.studentPage
            .getByTestId("wb-student-page-strip")
            .getByRole("tab", { name: "Board 1", exact: true })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });

        try {
          await waitForElementOnPeer(peers.studentPage, "student", elementId);
          await waitForElementOnPeer(peers.tutorPage, "tutor", elementId);
          await waitForPeerText(peers.tutorPage, "tutor", elementId, sentinel);
          await waitForPeerText(peers.studentPage, "student", elementId, sentinel);
        } catch (error) {
          const back = await readBoardSnapshot(peers, board1Id, board2Id);
          throw new Error(
            `${error instanceof Error ? error.message : String(error)}\nBoard 1 return state ${JSON.stringify(back)}`
          );
        }

        const onBoard1 = await readBoardSnapshot(peers, board1Id, board2Id);
        expect(
          {
            tutor: onBoard1.tutorLive.filter((element) => element.text === sentinel),
            student: onBoard1.studentLive.filter((element) => element.text === sentinel),
            tutorHasMarker: onBoard1.tutorSceneIds.includes(board2Marker),
            studentHasMarker: onBoard1.studentSceneIds.includes(board2Marker),
          },
          `Board 1 return state ${JSON.stringify(onBoard1)}`
        ).toEqual({
          tutor: [{ id: elementId, type: "text", text: sentinel }],
          student: [{ id: elementId, type: "text", text: sentinel }],
          tutorHasMarker: false,
          studentHasMarker: false,
        });
      } finally {
        await peers.close();
      }
    }
  );
});
