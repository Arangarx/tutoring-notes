import { test, expect } from "./fixtures";
import {
  addTutorBoard,
  deleteTutorBoardAt,
  drawShapeWithTool,
  openTutorAndStudent,
  readActiveWhiteboardPageId,
  readBoardStrip,
  readSceneElement,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForAddedElement,
  waitForPeerElement,
  type SceneElementSummary,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Board-delete sync.
 *
 * Page add, rename, and isolation are invariant 9 in
 * whiteboard-live-sync-regression.spec.ts. This file only deletes.
 *
 * `__TN_WB_E2E__` does not expose the page-id list. The tutor active id is
 * `__WBX_GET_ACTIVE_PAGE_ID__` (tutor page only). The page list both peers
 * render is the board strip (`Board N`). Returning to the remaining board
 * is also the live scene: the rectangle drawn on board 1 leaves the scene
 * while board 2 is active and comes back after the delete.
 *
 * `__WBX_FORCE_LIVE_SCENE__` fires onChange and can broadcast to the peer
 * (`captureUpdate: "NEVER"` only skips undo history). It must not be used
 * for a red-proof while sync is live. The red-proof runs `sizeAgrees` on a
 * synthetic 1×1 copy of the live rectangle. The strip stays on Board 1.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-pages.spec.ts --project=wb-regression`
 */
const PAGE_TAGS = [TAG.WB_PRESENCE, TAG.WB_SYNC] as const;

const GEOMETRY_PX = 4;

function sizeAgrees(author: SceneElementSummary, peer: SceneElementSummary): true | string {
  const widthDelta = Math.abs(peer.width - author.width);
  const heightDelta = Math.abs(peer.height - author.height);
  if (widthDelta <= GEOMETRY_PX && heightDelta <= GEOMETRY_PX) return true;
  return `width author=${author.width} peer=${peer.width} height author=${author.height} peer=${peer.height}`;
}

test.describe("whiteboard board-delete live sync", { tag: [...PAGE_TAGS] }, () => {
  test(
    "tutor board delete syncs: both peers return to the remaining board and the deleted id is gone",
    { tag: [...PAGE_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        // Student strip is read-only (wave5 item 6): tabs stay aria-disabled
        // and there is no delete control. Student-initiated delete is skipped below.
        const studentTabs = peers.studentPage
          .getByTestId("wb-student-page-strip")
          .getByRole("tab");
        await expect(studentTabs.first()).toHaveAttribute("aria-disabled", "true");
        await expect(
          peers.studentPage.getByTestId("wb-student-page-strip").locator(".mynk-wb-board-tab-del")
        ).toHaveCount(0);

        const tutorBefore = await readSceneElementIds(peers.tutorPage, "tutor");
        await drawShapeWithTool(
          peers.tutorPage,
          "tutor",
          "rectangle",
          { xFrac: 0.32, yFrac: 0.4 },
          { xFrac: 0.5, yFrac: 0.62 }
        );
        const rectangle = await waitForAddedElement(
          peers.tutorPage,
          "tutor",
          tutorBefore,
          (element) => element.type === "rectangle" && element.width > 1 && element.height > 1
        );
        await waitForPeerElement(
          peers.studentPage,
          "student",
          rectangle.id,
          (element) => element.type === "rectangle" && !element.isDeleted
        );

        const originalId = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(originalId, "board 1 has an id").not.toBe("");

        await addTutorBoard(peers.tutorPage);
        await expect
          .poll(async () => (await readBoardStrip(peers.tutorPage, "tutor")).selectedLabel, {
            timeout: 15_000,
          })
          .toBe("Board 2");
        const deletedId = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(deletedId).not.toBe("");
        expect(deletedId).not.toBe(originalId);

        await expect
          .poll(async () => (await readBoardStrip(peers.studentPage, "student")).selectedLabel, {
            timeout: 20_000,
          })
          .toBe("Board 2");
        await expect
          .poll(
            async () => {
              const tutor = await readSceneElement(peers.tutorPage, "tutor", rectangle.id);
              const student = await readSceneElement(peers.studentPage, "student", rectangle.id);
              const tutorGone = !tutor || tutor.isDeleted;
              const studentGone = !student || student.isDeleted;
              return tutorGone && studentGone ? "left-board-1" : "still-on-board-1";
            },
            { timeout: 20_000 }
          )
          .toBe("left-board-1");

        await deleteTutorBoardAt(peers.tutorPage, 1);

        await expect
          .poll(
            async () => {
              const tutorStrip = await readBoardStrip(peers.tutorPage, "tutor");
              const studentStrip = await readBoardStrip(peers.studentPage, "student");
              const active = await readActiveWhiteboardPageId(peers.tutorPage);
              const tutorEl = await readSceneElement(peers.tutorPage, "tutor", rectangle.id);
              const studentEl = await readSceneElement(peers.studentPage, "student", rectangle.id);
              const strips =
                tutorStrip.labels.join("|") === "Board 1" &&
                studentStrip.labels.join("|") === "Board 1" &&
                tutorStrip.selectedLabel === "Board 1" &&
                studentStrip.selectedLabel === "Board 1";
              const back =
                active === originalId &&
                active !== deletedId &&
                tutorEl != null &&
                !tutorEl.isDeleted &&
                studentEl != null &&
                !studentEl.isDeleted;
              if (strips && back) return "deleted";
              return `tutor=${tutorStrip.labels.join("|")}/${tutorStrip.selectedLabel} student=${studentStrip.labels.join("|")}/${studentStrip.selectedLabel} active=${active}`;
            },
            { timeout: 45_000 }
          )
          .toBe("deleted");

        // `__WBX_FORCE_LIVE_SCENE__` fires onChange and can broadcast to the
        // peer, so this red-proof does not mutate the live scene.
        const liveRow = await readSceneElement(peers.tutorPage, "tutor", rectangle.id);
        expect(liveRow, "rectangle is on the tutor after the delete").toBeTruthy();
        const poisonedRow: SceneElementSummary = { ...liveRow!, width: 1, height: 1 };
        expect(
          sizeAgrees(liveRow!, poisonedRow),
          "red-proof: a 1×1 copy does not size-agree"
        ).not.toBe(true);
        const tutorStrip = await readBoardStrip(peers.tutorPage, "tutor");
        const studentStrip = await readBoardStrip(peers.studentPage, "student");
        expect(tutorStrip.labels).toEqual(["Board 1"]);
        expect(studentStrip.labels).toEqual(["Board 1"]);
        expect(await readActiveWhiteboardPageId(peers.tutorPage)).toBe(originalId);
      } finally {
        await peers.close();
      }
    }
  );

  test.skip(
    "student-initiated board delete — student strip is read-only (wave5 item 6, tabs aria-disabled)",
    { tag: [...PAGE_TAGS] },
    async () => {
      // The student board/page strip is read-only. Tabs are aria-disabled and
      // onDeletePage is not provided, so a student cannot delete a board.
      // Tutor-delete → both peers leave the deleted board is the test above.
    }
  );
});
