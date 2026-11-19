import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  addedIds,
  clickBoardPageTab,
  commitWysiwyg,
  drawTestStrokeOnRole,
  expectHeld,
  fillExcalidrawWysiwyg,
  openTutorAndStudent,
  peerOf,
  projectSceneRectCenterToScreen,
  readActiveWhiteboardPageId,
  readPageDataBucketIds,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
  waitForPeerElement,
  type SceneElementSummary,
  type WbSyncRole,
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

const CANVAS_MOUNT: Record<WbSyncRole, string> = {
  tutor: "tutor-whiteboard-canvas-mount",
  student: "student-whiteboard-canvas-mount",
};

type TextEl = { id: string; type: "text"; text: string };

type Peers = { tutorPage: Page; studentPage: Page };

function pageFor(peers: Peers, role: WbSyncRole): Page {
  return role === "tutor" ? peers.tutorPage : peers.studentPage;
}

async function readLiveText(page: Page, role: WbSyncRole): Promise<TextEl[]> {
  const summary = await readSceneElementSummary(page, role, {
    type: "text",
    omitDeleted: true,
  });
  return summary.map((element) => ({
    id: element.id,
    type: "text",
    text: element.text,
  }));
}

/** Click Text (T) and click the canvas so the wysiwyg opens. */
async function armTextEditor(page: Page, role: WbSyncRole): Promise<void> {
  const textTool = page.getByRole("button", { name: "Text (T)" });
  await textTool.click();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");
  const canvas = page.locator(`[data-testid="${CANVAS_MOUNT[role]}"] .excalidraw`).first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box, "excalidraw canvas box").not.toBeNull();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height * 0.4);
}

/** Click Text (T), click the canvas, type, and commit with Escape. */
async function typeCommittedText(page: Page, role: WbSyncRole, sentinel: string): Promise<void> {
  await armTextEditor(page, role);
  await commitWysiwyg(page, sentinel);
}

/** Re-enter an existing text element and replace its string. */
async function editCommittedText(
  page: Page,
  role: WbSyncRole,
  elementId: string,
  nextText: string
): Promise<void> {
  const select = page.getByRole("button", { name: "Select (V)" });
  await select.click();
  await expect(select).toHaveAttribute("aria-pressed", "true");
  const summary = await readSceneElementSummary(page, role);
  const element = summary.find((entry) => entry.id === elementId);
  if (!element) throw new Error(`text ${elementId} not on ${role} canvas`);
  const center = await projectSceneRectCenterToScreen(page, role, element);
  await page.mouse.dblclick(center.x, center.y);
  await commitWysiwyg(page, nextText);
}

/**
 * Type `sentinel` on `author` and return the one new text element id.
 * The other peer must gain that same id, with `text` equal to the sentinel,
 * and no other new scene element.
 */
async function syncNewText(
  authorPage: Page,
  author: WbSyncRole,
  peerPage: Page,
  peer: WbSyncRole,
  sentinel: string
): Promise<string> {
  const authorBefore = await readSceneElementIds(authorPage, author);
  const peerBefore = await readSceneElementIds(peerPage, peer);

  await typeCommittedText(authorPage, author, sentinel);
  await expect
    .poll(
      async () => (await readLiveText(authorPage, author)).some((element) => element.text === sentinel),
      { timeout: 15_000 }
    )
    .toBe(true);

  const authorAdded = addedIds(authorBefore, await readSceneElementIds(authorPage, author));
  expect(authorAdded, "author scene gains one element").toHaveLength(1);
  const elementId = authorAdded[0];
  if (!elementId) throw new Error("author text element id missing");
  const authorText = (await readLiveText(authorPage, author)).find((element) => element.id === elementId);
  expect(authorText?.type).toBe("text");
  expect(authorText?.text).toBe(sentinel);

  await waitForElementOnPeer(peerPage, peer, elementId);
  await waitForPeerElement(
    peerPage,
    peer,
    elementId,
    (element: SceneElementSummary) => element.type === "text" && element.text === sentinel
  );

  const peerAdded = addedIds(peerBefore, await readSceneElementIds(peerPage, peer));
  // TEXT elements have no bound children, so the peer's new ids are exactly
  // [elementId]. Batches B/C/D (shapes, arrows, frames, embeds with bindings)
  // must relax this to "contains the new element" plus an explicit allowlist
  // of bound ids — do not copy the strict one-element equality.
  expect(peerAdded, "peer gains exactly the new text element").toEqual([elementId]);
  const peerText = (await readLiveText(peerPage, peer)).filter((element) => element.text === sentinel);
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
  peers: Peers,
  board1Id: string,
  board2Id: string
): Promise<BoardSnapshot> {
  const [activePageId, tutorLive, studentLive, tutorSceneIds, studentSceneIds, board1Ids, board2Ids] =
    await Promise.all([
      readActiveWhiteboardPageId(peers.tutorPage),
      readLiveText(peers.tutorPage, "tutor"),
      readLiveText(peers.studentPage, "student"),
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

/** Live + bucket presence of one text element while a board-2 marker is up. */
function isolationView(snap: BoardSnapshot, elementId: string, sentinel: string, markerId: string) {
  const liveHas = (elements: TextEl[]) =>
    elements.some((element) => element.id === elementId || element.text === sentinel);
  return {
    tutorLiveHasSentinel: liveHas(snap.tutorLive),
    studentLiveHasSentinel: liveHas(snap.studentLive),
    tutorSceneHasSentinelId: snap.tutorSceneIds.includes(elementId),
    studentSceneHasSentinelId: snap.studentSceneIds.includes(elementId),
    board1BucketHasId: snap.board1Ids.includes(elementId),
    board2BucketHasId: snap.board2Ids.includes(elementId),
    tutorSceneHasMarker: snap.tutorSceneIds.includes(markerId),
    studentSceneHasMarker: snap.studentSceneIds.includes(markerId),
  };
}

async function addBoardAndFollow(peers: Peers, boardTitle: string): Promise<string> {
  const previousId = await readActiveWhiteboardPageId(peers.tutorPage);
  await peers.tutorPage
    .getByTestId("wb-tutor-page-strip")
    .getByRole("button", { name: "Add board" })
    .click();
  await expect(
    peers.tutorPage
      .getByTestId("wb-tutor-page-strip")
      .getByRole("tab", { name: boardTitle, exact: true })
  ).toBeVisible({ timeout: 10_000 });
  // Add board switches the tutor; the student strip follows.
  await expect(
    peers.studentPage
      .getByTestId("wb-student-page-strip")
      .getByRole("tab", { name: boardTitle, exact: true })
  ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
  const boardId = await readActiveWhiteboardPageId(peers.tutorPage);
  expect(boardId, `${boardTitle} page id`).not.toBe("");
  expect(boardId).not.toBe(previousId);
  return boardId;
}

/** Marker drawn after the switch: its arrival means the live scene is that board. */
async function markLiveBoard(peers: Peers, prefix: string): Promise<string> {
  const markerId = `${prefix}-${Date.now()}`;
  await drawTestStrokeOnRole(peers.tutorPage, "tutor", markerId, 240, 80, 360, 160);
  await waitForElementOnPeer(peers.studentPage, "student", markerId);
  return markerId;
}

const BOARD2_ABSENCE = {
  tutorLiveHasSentinel: false,
  studentLiveHasSentinel: false,
  tutorSceneHasSentinelId: false,
  studentSceneHasSentinelId: false,
  board1BucketHasId: true,
  board2BucketHasId: false,
  tutorSceneHasMarker: true,
  studentSceneHasMarker: true,
};

async function expectBoard2AbsenceHeld(
  peers: Peers,
  board1Id: string,
  board2Id: string,
  elementId: string,
  sentinel: string,
  markerId: string
): Promise<void> {
  try {
    await expectHeld(
      async () => isolationView(await readBoardSnapshot(peers, board1Id, board2Id), elementId, sentinel, markerId),
      BOARD2_ABSENCE,
      { holdMs: 3_000, timeoutMs: 15_000 }
    );
  } catch (error) {
    const snap = await readBoardSnapshot(peers, board1Id, board2Id);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nBoard 2 state ${JSON.stringify(snap)}`
    );
  }
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
            pageFor(peers, author),
            author,
            pageFor(peers, peer),
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
          const authorPage = pageFor(peers, author);
          const peerPage = pageFor(peers, peer);
          const sentinel = `pwTxtEdit${author}${Date.now()}`;
          const revised = `${sentinel}X`;
          const authorBefore = await readSceneElementIds(authorPage, author);
          const peerBefore = await readSceneElementIds(peerPage, peer);
          const elementId = await syncNewText(authorPage, author, peerPage, peer, sentinel);

          await editCommittedText(authorPage, author, elementId, revised);

          const authorTexts = await readLiveText(authorPage, author);
          expect(authorTexts.find((element) => element.id === elementId)?.text).toBe(revised);
          expect(authorTexts.filter((element) => element.text === sentinel)).toEqual([]);
          expect(addedIds(authorBefore, await readSceneElementIds(authorPage, author))).toEqual([
            elementId,
          ]);

          await waitForPeerElement(
            peerPage,
            peer,
            elementId,
            (element: SceneElementSummary) => element.type === "text" && element.text === revised
          );
          const peerTexts = await readLiveText(peerPage, peer);
          expect(peerTexts.filter((element) => element.id === elementId)).toEqual([
            { id: elementId, type: "text", text: revised },
          ]);
          expect(peerTexts.filter((element) => element.text === sentinel)).toEqual([]);
          // Same strict-one rule as syncNewText: an edit must not allocate a
          // second id. B/C/D binding shapes must not copy this equality.
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

        const board2Id = await addBoardAndFollow(peers, "Board 2");
        const board2Marker = await markLiveBoard(peers, "pw-b2-marker");
        await expectBoard2AbsenceHeld(
          peers,
          board1Id,
          board2Id,
          elementId,
          sentinel,
          board2Marker
        );

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        await expect(
          peers.studentPage
            .getByTestId("wb-student-page-strip")
            .getByRole("tab", { name: "Board 1", exact: true })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });

        try {
          await waitForElementOnPeer(peers.studentPage, "student", elementId);
          await waitForElementOnPeer(peers.tutorPage, "tutor", elementId);
          await waitForPeerElement(
            peers.tutorPage,
            "tutor",
            elementId,
            (element: SceneElementSummary) => element.type === "text" && element.text === sentinel
          );
          await waitForPeerElement(
            peers.studentPage,
            "student",
            elementId,
            (element: SceneElementSummary) => element.type === "text" && element.text === sentinel
          );
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

  // SMOKE-BUG-3: uncommitted wysiwyg stays open across a tutor board switch.
  // Reproduced 2026-11-19 on this branch (throwaway not involved). Student
  // opens Text, fills the sentinel, does not press Escape. Tutor clicks
  // Add board. Both peers land on Board 2 (marker id present on both live
  // scenes). Scene data does NOT cross: tutor and student live text lists
  // are empty, Board 2 bucket is only the marker, Board 1 bucket still
  // holds the text element id. The failure is the editor chrome:
  // editorStillShowsSentinel stays true for the whole 3s hold — the
  // student's textarea.excalidraw-wysiwyg is still visible and still
  // contains the Board 1 draft while Board 2 is active.
  // Captured state: activePageId=p1795123036609-oefy4h (Board 2),
  // tutorLive=[], studentLive=[], tutorSceneIds=[pw-b2-open-1795123036863],
  // studentSceneIds=[pw-b2-open-1795123036863],
  // board1Ids=[_ppyauvYIUsK5lyJr5uU1], board2Ids=[pw-b2-open-1795123036863],
  // editorOpenWithSentinel=true.
  // Do not edit this test or the sync engine here — escalate the engine fix.
  test.fixme(
    "uncommitted text stays off Board 2 when the tutor switches with the editor open",
    { tag: [...TEXT_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const sentinel = `pwTxtOpen${Date.now()}`;
        const board1Id = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(board1Id, "Board 1 page id").not.toBe("");

        await armTextEditor(peers.studentPage, "student");
        await fillExcalidrawWysiwyg(peers.studentPage, sentinel, { commit: false });
        await expect(peers.studentPage.locator("textarea.excalidraw-wysiwyg")).toBeVisible();

        let elementId = "";
        try {
          await expect
            .poll(
              async () => {
                const live = await readLiveText(peers.studentPage, "student");
                return live.find((element) => element.text === sentinel)?.id ?? "";
              },
              { timeout: 8_000 }
            )
            .not.toBe("");
          const live = await readLiveText(peers.studentPage, "student");
          elementId = live.find((element) => element.text === sentinel)?.id ?? "";
        } catch {
          elementId = "";
        }

        // The wysiwyg is still open — that is the variant under test.
        await expect(peers.studentPage.locator("textarea.excalidraw-wysiwyg")).toBeVisible();
        const board2Id = await addBoardAndFollow(peers, "Board 2");
        const board2Marker = await markLiveBoard(peers, "pw-b2-open");
        const editor = peers.studentPage.locator("textarea.excalidraw-wysiwyg");

        if (elementId) {
          try {
            await expectHeld(
              async () => {
                const view = isolationView(
                  await readBoardSnapshot(peers, board1Id, board2Id),
                  elementId,
                  sentinel,
                  board2Marker
                );
                const editorOpenWithSentinel =
                  (await editor.isVisible()) && (await editor.inputValue()) === sentinel;
                return { ...view, editorStillShowsSentinel: editorOpenWithSentinel };
              },
              { ...BOARD2_ABSENCE, editorStillShowsSentinel: false },
              { holdMs: 3_000, timeoutMs: 15_000 }
            );
          } catch (error) {
            const snap = await readBoardSnapshot(peers, board1Id, board2Id);
            const editorOpenWithSentinel =
              (await editor.isVisible().catch(() => false)) &&
              (await editor.inputValue().catch(() => "")) === sentinel;
            throw new Error(
              `${error instanceof Error ? error.message : String(error)}\nBoard 2 state ${JSON.stringify(snap)} editorOpenWithSentinel=${editorOpenWithSentinel}`
            );
          }
        } else {
          await expectHeld(
            async () => {
              const snap = await readBoardSnapshot(peers, board1Id, board2Id);
              const editorOpenWithSentinel =
                (await editor.isVisible()) && (await editor.inputValue()) === sentinel;
              return {
                tutorLiveHasSentinel: snap.tutorLive.some((element) => element.text === sentinel),
                studentLiveHasSentinel: snap.studentLive.some((element) => element.text === sentinel),
                tutorSceneHasMarker: snap.tutorSceneIds.includes(board2Marker),
                studentSceneHasMarker: snap.studentSceneIds.includes(board2Marker),
                editorStillShowsSentinel: editorOpenWithSentinel,
              };
            },
            {
              tutorLiveHasSentinel: false,
              studentLiveHasSentinel: false,
              tutorSceneHasMarker: true,
              studentSceneHasMarker: true,
              editorStillShowsSentinel: false,
            },
            { holdMs: 3_000, timeoutMs: 15_000 }
          );
        }
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "student text typed on Board 2 after the tutor switches stays off Board 1",
    { tag: [...TEXT_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        const board1Sentinel = `pwTxtB1${Date.now()}`;
        const board1Id = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(board1Id, "Board 1 page id").not.toBe("");
        const board1ElementId = await syncNewText(
          peers.studentPage,
          "student",
          peers.tutorPage,
          "tutor",
          board1Sentinel
        );

        const board2Id = await addBoardAndFollow(peers, "Board 2");
        const board2Marker = await markLiveBoard(peers, "pw-b2-type");
        await expectBoard2AbsenceHeld(
          peers,
          board1Id,
          board2Id,
          board1ElementId,
          board1Sentinel,
          board2Marker
        );

        const board2Sentinel = `pwTxtB2${Date.now()}`;
        const board2ElementId = await syncNewText(
          peers.studentPage,
          "student",
          peers.tutorPage,
          "tutor",
          board2Sentinel
        );

        await expectHeld(
          async () => {
            const snap = await readBoardSnapshot(peers, board1Id, board2Id);
            return {
              tutorBoard2: snap.tutorLive.filter((element) => element.text === board2Sentinel),
              studentBoard2: snap.studentLive.filter((element) => element.text === board2Sentinel),
              tutorStillHasBoard1: snap.tutorLive.some(
                (element) => element.id === board1ElementId || element.text === board1Sentinel
              ),
              studentStillHasBoard1: snap.studentLive.some(
                (element) => element.id === board1ElementId || element.text === board1Sentinel
              ),
              board1HasBoard1Id: snap.board1Ids.includes(board1ElementId),
              board1HasBoard2Id: snap.board1Ids.includes(board2ElementId),
              board2HasBoard1Id: snap.board2Ids.includes(board1ElementId),
              board2HasBoard2Id: snap.board2Ids.includes(board2ElementId),
            };
          },
          {
            tutorBoard2: [{ id: board2ElementId, type: "text", text: board2Sentinel }],
            studentBoard2: [{ id: board2ElementId, type: "text", text: board2Sentinel }],
            tutorStillHasBoard1: false,
            studentStillHasBoard1: false,
            board1HasBoard1Id: true,
            board1HasBoard2Id: false,
            board2HasBoard1Id: false,
            board2HasBoard2Id: true,
          },
          { holdMs: 3_000, timeoutMs: 15_000 }
        );

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        await expect(
          peers.studentPage
            .getByTestId("wb-student-page-strip")
            .getByRole("tab", { name: "Board 1", exact: true })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
        await waitForElementOnPeer(peers.tutorPage, "tutor", board1ElementId);
        await waitForPeerElement(
          peers.tutorPage,
          "tutor",
          board1ElementId,
          (element: SceneElementSummary) =>
            element.type === "text" && element.text === board1Sentinel
        );

        const back = await readBoardSnapshot(peers, board1Id, board2Id);
        expect({
          tutorBoard1: back.tutorLive.filter((element) => element.text === board1Sentinel),
          studentBoard1: back.studentLive.filter((element) => element.text === board1Sentinel),
          tutorHasBoard2: back.tutorLive.some((element) => element.text === board2Sentinel),
          studentHasBoard2: back.studentLive.some((element) => element.text === board2Sentinel),
          tutorHasMarker: back.tutorSceneIds.includes(board2Marker),
          studentHasMarker: back.studentSceneIds.includes(board2Marker),
        }).toEqual({
          tutorBoard1: [{ id: board1ElementId, type: "text", text: board1Sentinel }],
          studentBoard1: [{ id: board1ElementId, type: "text", text: board1Sentinel }],
          tutorHasBoard2: false,
          studentHasBoard2: false,
          tutorHasMarker: false,
          studentHasMarker: false,
        });
      } finally {
        await peers.close();
      }
    }
  );

  // SMOKE-BUG-3 variant not run: the student page strip is read-only
  // (wave5 item 6 — tabs are aria-disabled; see wb-wave5-polish.spec.ts
  // "item 6 — student page strip read-only active highlight tracks tutor").
  // A student cannot initiate a board switch, so there is no student-switch
  // path to assert. Re-enable if the student strip becomes interactive.
  test.skip(
    "student-initiated board switch keeps text on the board where it was typed",
    { tag: [...TEXT_TAGS] },
    async () => {
      // Intentionally empty. See the comment above this test.
    }
  );
});
