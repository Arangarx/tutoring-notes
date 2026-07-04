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
 *
 * Red-before: without the entry guard, board-3 stroke ids appear on the PDF board.
 * Green-after: entry guard + tutorSwitchTokenRef bump closes the race.
 *
 * Tags: @wb-strokes @wb-sync @wb-assets
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   npm run test:wb-playwright -- tests/integration/wb-e2-pdf-stroke-leak.spec.ts
 */

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { readLocalEnv } from "../utils/read-dotenv";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  openTutorAndStudent,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

type SceneElementSummary = { id: string; type?: string };

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
      const env = readLocalEnv();
      test.skip(
        !env.BLOB_READ_WRITE_TOKEN?.trim(),
        "Set BLOB_READ_WRITE_TOKEN in .env for PDF upload in this harness."
      );

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

        const pdfTab = peers.tutorPage
          .getByTestId("wb-tutor-page-strip")
          .getByRole("tab", { name: /e2e-two-pages p\.1/i });
        await expect(pdfTab).toBeVisible({ timeout: 60_000 });
        await expect(pdfTab).toHaveAttribute("aria-current", "page", {
          timeout: 15_000,
        });

        const pdfBoardSummary = await readSceneElementSummary(
          peers.tutorPage,
          "tutor"
        );
        expect(pdfBoardSummary.length).toBeGreaterThan(0);
        expect(pdfBoardSummary.every((e) => e.type === "image")).toBe(true);
        expect(pdfBoardSummary.map((e) => e.id)).not.toContain(board3StrokeId);

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        const board3Ids = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(board3Ids).toContain(board3StrokeId);
      } finally {
        await peers.close();
      }
    }
  );
});
