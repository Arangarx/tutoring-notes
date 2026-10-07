/**
 * E2 / BUG-3 — dup-stroke on board-4 after PDF import.
 *
 * Root cause: commitPdfBatch raised pageSwitchProgrammaticRef only at step 7
 * (navigation), leaving steps 3–4 bucket writes unguarded. Stale
 * handleExcalidrawChange from the anchor board could stamp board-3 strokes
 * into the new PDF page bucket / live scene.
 *
 * Oracle (offset-invariant): after PDF import, the first PDF board's scene
 * contains ONLY its PDF image element(s) — none of the anchor board's stroke ids.
 * A captured board-3 scene is then delivered to the workspace onChange handler
 * after the PDF page is active (Excalidraw's late onChange). The PDF bucket and
 * live scene must still exclude that stroke; board 3 must still have it.
 *
 * Red-before: without the entry guard, board-3 stroke ids appear on the PDF board.
 * Green-after: entry guard + tutorSwitchTokenRef bump closes the race.
 *
 * Tags: @wb-strokes @wb-sync @wb-assets
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   npm run test:wb-playwright -- tests/integration/wb-e2-pdf-stroke-leak.spec.ts
 */

import { test, expect } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  boardTab,
  clickBoardPageTab,
  drawTestStrokeOnRole,
  e2eTwoPagePdfBoardTitle,
  openTutorAndStudent,
  readActiveWhiteboardPageId,
  readPageDataBucketIds,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

type SceneElementSummary = { id: string; type?: string };

type WbE2TestWindow = Window & {
  __TN_WB_E2E__?: Record<
    string,
    { getElements: () => Array<{ id: string; type?: string }> }
  >;
  __WBX_INJECT_HANDLE_CHANGE__?: (els: unknown) => void;
  __WBX_FINGERPRINT_HAS__?: (pageId: string) => boolean;
};

/**
 * Settle past selectTutorPage's guard tail so the injected change is a late
 * onChange: programmatic suppression has released and the legitimate PDF
 * onChange has cleared the fingerprint.
 */
async function waitForLateOnChangeWindow(
  page: import("@playwright/test").Page,
  pdfPageId: string
): Promise<void> {
  await page.waitForTimeout(500);
  await expect(async () => {
    const fingerprintActive = await page.evaluate((pageId) => {
      const win = window as WbE2TestWindow;
      return win.__WBX_FINGERPRINT_HAS__?.(pageId) ?? false;
    }, pdfPageId);
    expect(fingerprintActive).toBe(false);
  }).toPass({ timeout: 30_000 });
  await page.waitForTimeout(200);
}

async function readSceneElementSummary(
  page: import("@playwright/test").Page,
  role: "tutor" | "student"
): Promise<SceneElementSummary[]> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<
          string,
          { getElements: () => Array<{ id: string; type?: string }> }
        >;
      }
    ).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return [];
    return bridge.getElements().map((e) => ({ id: e.id, type: e.type }));
  }, role);
}

async function addBoardsUntilCount(
  tutorPage: import("@playwright/test").Page,
  targetCount: number
): Promise<void> {
  const strip = tutorPage.getByTestId("wb-tutor-page-strip");
  for (;;) {
    const tabs = strip.getByRole("tab");
    const count = await tabs.count();
    if (count >= targetCount) break;
    await strip.getByRole("button", { name: "Add board" }).click();
    await expect(tabs).toHaveCount(count + 1, { timeout: 15_000 });
  }
}

test.describe("E2 PDF import — no anchor stroke leak onto new PDF board", () => {
  test.setTimeout(300_000);

  test(
    "board-3 strokes stay on board-3 after PDF import creates board-4+",
    { tag: [TAG.WB_STROKES, TAG.WB_ASSETS] },
    async ({ browser }) => {
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const pdfPath = path.join(__dirname, "../fixtures/e2e-two-pages.pdf");
      test.skip(!fs.existsSync(pdfPath), `Missing PDF fixture: ${pdfPath}`);

      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);

      try {
        await addBoardsUntilCount(peers.tutorPage, 3);
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");

        const board3StrokeId = `e2-b3-stroke-${Date.now()}`;
        await drawTestStrokeOnRole(
          peers.tutorPage,
          "tutor",
          board3StrokeId,
          80,
          80,
          200,
          200
        );
        await waitForElementOnPeer(
          peers.tutorPage,
          "tutor",
          board3StrokeId,
          15_000
        );

        // Snapshot the board-3 scene while it is still the live canvas.
        // Delivered later, after the PDF batch has switched pages.
        const board3Scene = await peers.tutorPage.evaluate(() => {
          const bridge = (window as WbE2TestWindow).__TN_WB_E2E__?.tutor;
          const els = bridge?.getElements?.() ?? [];
          return JSON.parse(JSON.stringify(els)) as unknown[];
        });
        expect(
          (board3Scene as Array<{ id?: string }>).map((e) => e.id)
        ).toContain(board3StrokeId);

        await peers.tutorPage.getByTestId("wb-insert-asset-btn").click();
        await expect(peers.tutorPage.getByTestId("wb-insert-dialog")).toBeVisible();
        await peers.tutorPage.getByTestId("wb-insert-pick-file").click();
        await peers.tutorPage
          .getByTestId("wb-insert-file-input")
          .setInputFiles(pdfPath);
        await expect(
          peers.tutorPage.getByTestId("wb-pdf-pick-continue")
        ).toBeVisible({ timeout: 30_000 });
        await peers.tutorPage.getByTestId("wb-pdf-pick-continue").click();
        await expect(
          peers.tutorPage.getByTestId("wb-insert-progress")
        ).toBeVisible({ timeout: 15_000 });
        await expect(
          peers.tutorPage.getByTestId("wb-insert-progress")
        ).toBeHidden({ timeout: 120_000 });

        const pdfTab = boardTab(
          peers.tutorPage,
          "tutor",
          e2eTwoPagePdfBoardTitle(1)
        );
        await expect(pdfTab).toBeVisible({ timeout: 60_000 });
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 15_000,
        });

        const pdfBoardSummary = await readSceneElementSummary(
          peers.tutorPage,
          "tutor"
        );
        expect(pdfBoardSummary.length).toBeGreaterThan(0);
        expect(pdfBoardSummary.every((e) => e.type === "image")).toBe(true);
        expect(pdfBoardSummary.map((e) => e.id)).not.toContain(board3StrokeId);

        const pdfPageId = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(pdfPageId).not.toBe("");
        const pdfBucketIds = await readPageDataBucketIds(
          peers.tutorPage,
          pdfPageId
        );
        expect(
          pdfBucketIds,
          "PDF page stored bucket must not contain the board-3 stroke"
        ).not.toContain(board3StrokeId);

        await waitForLateOnChangeWindow(peers.tutorPage, pdfPageId);

        const seamsAvailable = await peers.tutorPage.evaluate(() => ({
          injectHandleChange:
            typeof (window as WbE2TestWindow).__WBX_INJECT_HANDLE_CHANGE__ ===
            "function",
        }));
        expect(
          seamsAvailable.injectHandleChange,
          "__WBX_INJECT_HANDLE_CHANGE__ seam must be defined"
        ).toBe(true);

        await peers.tutorPage.evaluate((elements) => {
          (window as WbE2TestWindow).__WBX_INJECT_HANDLE_CHANGE__!(elements);
        }, board3Scene);

        const pdfBucketAfterLate = await readPageDataBucketIds(
          peers.tutorPage,
          pdfPageId
        );
        expect(
          pdfBucketAfterLate,
          "after the late board-3 onChange, the PDF page stored bucket must not contain the board-3 stroke"
        ).not.toContain(board3StrokeId);
        const pdfLiveAfterLate = await readSceneElementIds(
          peers.tutorPage,
          "tutor"
        );
        expect(
          pdfLiveAfterLate,
          "after the late board-3 onChange, the PDF page live scene must not contain the board-3 stroke"
        ).not.toContain(board3StrokeId);

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        await clickBoardPageTab(
          peers.tutorPage,
          "tutor",
          e2eTwoPagePdfBoardTitle(1)
        );
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 10_000,
        });
        const pdfLiveAfterRoundTrip = await readSceneElementIds(
          peers.tutorPage,
          "tutor"
        );
        expect(
          pdfLiveAfterRoundTrip,
          "PDF board live scene after leaving and returning must not contain the board-3 stroke"
        ).not.toContain(board3StrokeId);

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        const board3Ids = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(board3Ids).toContain(board3StrokeId);
      } finally {
        await peers.close();
      }
    }
  );
});
