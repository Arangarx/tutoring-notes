/**
 * E2 / BUG-3 — dup-stroke on board-4 after PDF import.
 *
 * Root cause: commitPdfBatch raised pageSwitchProgrammaticRef only at step 7
 * (navigation), leaving steps 3–4 bucket writes unguarded. Stale
 * handleExcalidrawChange from the anchor board could stamp board-3 strokes
 * into the new PDF page bucket / live scene.
 *
 * WS-X fix (2nd attempt): content-identity fingerprint. After selectTutorPage
 * calls updateScene with the PDF page elements, the anchor element IDs are
 * recorded in pageSceneSetFingerprintRef. An incoming onChange that does NOT
 * contain all anchor IDs is dropped as a stale foreign scene. The fingerprint
 * is cleared on the first confirmed legitimate onChange so steady-state editing
 * (including deletes of anchor elements) is unaffected.
 *
 * Oracle (offset-invariant): after PDF import, the first PDF board's scene
 * contains ONLY its PDF image element(s) — none of the anchor board's stroke ids.
 *
 * Deterministic race injection: the spec uses window.__WBX_INJECT_STALE_ONCHANGE__
 * to force-inject board-3 elements as a stale onChange at the exact moment
 * pageSwitchProgrammaticRef drops to 0 (the vulnerable window).
 *
 * Red-before: without the fingerprint fix, the injection stamps board-3 strokes
 *   into the PDF page bucket deterministically.
 * Green-after: the fingerprint guard rejects the stale onChange 3/3.
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

/**
 * Force-inject `elements` as a stale onChange into the tutor's
 * handleExcalidrawChange, waiting for pageSwitchProgrammaticRef to drop
 * to 0 first (the vulnerable window). Requires NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1.
 */
async function injectStaleOnChange(
  page: import("@playwright/test").Page,
  elements: Array<{ id: string; type?: string }>
): Promise<void> {
  await page.evaluate((els) => {
    const win = window as Window & {
      __WBX_INJECT_STALE_ONCHANGE__?: (els: unknown) => void;
    };
    if (!win.__WBX_INJECT_STALE_ONCHANGE__) {
      throw new Error("__WBX_INJECT_STALE_ONCHANGE__ seam not registered");
    }
    win.__WBX_INJECT_STALE_ONCHANGE__(els);
  }, elements);
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
    "board-3 strokes stay on board-3 after PDF import creates board-4+ (deterministic)",
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

        // Capture board-3 elements NOW (before PDF import) so we can
        // inject them deterministically as a stale onChange later.
        const board3ElementsSnapshot = await readSceneElementSummary(
          peers.tutorPage,
          "tutor"
        );
        // Sanity: board-3 snapshot must include our stroke.
        expect(board3ElementsSnapshot.map((e) => e.id)).toContain(board3StrokeId);

        // PRE-CONFIGURE the stale injection BEFORE the PDF import begins.
        // window.__WBX_INJECT_STALE_ONCHANGE__ stores the elements in
        // pendingStaleInjectionRef. The component's releaseGuard consumes it
        // synchronously when pageSwitchProgrammaticRef drops to 0 (inside
        // selectTutorPage triggered by commitPdfBatch). This eliminates the
        // IPC-timing race where a post-switch page.evaluate call might arrive
        // after Excalidraw's own onChange has already cleared the fingerprint.
        await injectStaleOnChange(peers.tutorPage, board3ElementsSnapshot);

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
          .getByRole("tab", { name: "Board 4" });
        await expect(pdfTab).toBeVisible({ timeout: 60_000 });
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 15_000,
        });

        // Allow the guard-release injection (fired inside releaseGuard) and
        // any async sync paths to settle.
        await peers.tutorPage.waitForTimeout(200);

        // --- Oracle: live Excalidraw scene (what the tutor actually sees) --
        // api.getSceneElements() returns only non-deleted elements; this is
        // the correct observable: after PDF import, the tutor should see ONLY
        // PDF image elements on the PDF board (no strokes from other boards).
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
