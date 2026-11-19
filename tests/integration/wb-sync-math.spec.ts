import { test, expect } from "./fixtures";
import {
  addedIds,
  forceLiveScene,
  openTutorAndStudent,
  readRawSceneElements,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  waitForAddedElement,
  waitForPeerElement,
  type SceneElementSummary,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Math-insert sync.
 *
 * Insert math is tutor-only (`canInsertAssets` is false on the student, so
 * the button is not mounted). The equation is an image element whose
 * `customData.latex` is the source the tutor submitted.
 *
 * The oracle is the student's live scene: a new image whose latex equals
 * the string typed in the dialog, with a box larger than 1px on both axes,
 * matching the tutor's own box within a few pixels.
 *
 * `__WBX_FORCE_LIVE_SCENE__` is used only in the reverted red-proof.
 *
 * Gate: `npx playwright test tests/integration/wb-sync-math.spec.ts --project=wb-regression`
 */
const MATH_TAGS = [TAG.WB_STROKES, TAG.WB_SYNC] as const;

const EQUATION = "x^{2}+1";
const GEOMETRY_PX = 4;

function plausibleMath(element: SceneElementSummary, latex: string): boolean {
  return (
    element.type === "image" &&
    element.isDeleted === false &&
    element.latex === latex &&
    element.width > 1 &&
    element.height > 1
  );
}

test.describe("whiteboard math-insert live sync", { tag: [...MATH_TAGS] }, () => {
  test(
    "tutor math insert syncs an image equation to the student",
    { tag: [...MATH_TAGS] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await expect(peers.studentPage.getByTestId("wb-insert-math-btn")).toHaveCount(0);

        const tutorBefore = await readSceneElementIds(peers.tutorPage, "tutor");
        const studentBefore = await readSceneElementIds(peers.studentPage, "student");

        await peers.tutorPage.getByTestId("wb-insert-math-btn").click();
        const dialog = peers.tutorPage.getByTestId("wb-math-dialog");
        await expect(dialog).toBeVisible();
        await dialog.locator("summary", { hasText: "LaTeX source" }).click();
        await dialog.getByTestId("wb-math-latex-input").fill(EQUATION);
        await dialog.getByTestId("wb-math-insert-btn").click();
        await expect
          .poll(
            async () => {
              if (await dialog.isHidden()) return "closed";
              const alert = dialog.getByRole("alert");
              if ((await alert.count()) > 0) return `error:${await alert.innerText()}`;
              return "rendering";
            },
            { timeout: 90_000 }
          )
          .toBe("closed");

        const authored = await waitForAddedElement(
          peers.tutorPage,
          "tutor",
          tutorBefore,
          (element) => plausibleMath(element, EQUATION)
        );
        await waitForPeerElement(
          peers.studentPage,
          "student",
          authored.id,
          (element) => plausibleMath(element, EQUATION)
        );

        const studentSummary = await readSceneElementSummary(peers.studentPage, "student", {
          omitDeleted: true,
        });
        expect(
          addedIds(
            studentBefore,
            studentSummary.map((element) => element.id)
          ),
          "equation id is on the student"
        ).toContain(authored.id);

        await expect
          .poll(
            async () => {
              const authorBox = (
                await readSceneElementSummary(peers.tutorPage, "tutor", { omitDeleted: true })
              ).find((element) => element.id === authored.id);
              const peerBox = (
                await readSceneElementSummary(peers.studentPage, "student", { omitDeleted: true })
              ).find((element) => element.id === authored.id);
              if (!authorBox || !peerBox) {
                return `missing author=${Boolean(authorBox)} peer=${Boolean(peerBox)}`;
              }
              if (!plausibleMath(peerBox, EQUATION)) return `peer type=${peerBox.type} latex=${peerBox.latex}`;
              const widthDelta = Math.abs(peerBox.width - authorBox.width);
              const heightDelta = Math.abs(peerBox.height - authorBox.height);
              if (widthDelta <= GEOMETRY_PX && heightDelta <= GEOMETRY_PX) return "match";
              return `width author=${authorBox.width} peer=${peerBox.width} height author=${authorBox.height} peer=${peerBox.height}`;
            },
            { timeout: 15_000 }
          )
          .toBe("match");

        const raw = await readRawSceneElements(peers.tutorPage, "tutor");
        const poisoned = (raw as Array<Record<string, unknown>>).map((element) =>
          element.id === authored.id ? { ...element, width: 1, height: 1 } : element
        );
        await forceLiveScene(peers.tutorPage, poisoned);
        const poisonedRow = (
          await readSceneElementSummary(peers.tutorPage, "tutor")
        ).find((element) => element.id === authored.id);
        expect(poisonedRow?.width, "red-proof: poisoned width is not a real equation box").toBe(1);
        expect(plausibleMath(poisonedRow!, EQUATION), "red-proof: 1px box is not plausible").toBe(
          false
        );
        const peerDuringPoison = (
          await readSceneElementSummary(peers.studentPage, "student", { omitDeleted: true })
        ).find((element) => element.id === authored.id);
        expect(peerDuringPoison && plausibleMath(peerDuringPoison, EQUATION)).toBe(true);
        await forceLiveScene(peers.tutorPage, raw);
        const restored = (
          await readSceneElementSummary(peers.tutorPage, "tutor", { omitDeleted: true })
        ).find((element) => element.id === authored.id);
        expect(restored && plausibleMath(restored, EQUATION)).toBe(true);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "student → tutor math insert",
    { tag: [...MATH_TAGS] },
    async () => {
      // Student chrome does not mount Insert math (`canInsertAssets` is false
      // in deriveWbCapabilities). The live test above asserts the button is
      // absent. There is no student insert to sync.
      test.skip(
        true,
        "Student chrome does not mount Insert math (canInsertAssets is false). Tutor → student is the only direction."
      );
    }
  );
});
