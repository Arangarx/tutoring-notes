/**
 * WS-X BUG-3 — applyRemoteToCanvas PDF stroke leak (fix a).
 *
 * Root cause: during the post-page-switch fingerprint window,
 * `applyRemoteToCanvas` read the transitional live canvas via
 * `getSceneElementsIncludingDeleted()` when `onTargetReadTime` was true,
 * merging board-N strokes into the clean PDF page bucket in `pageDataRef`.
 *
 * Oracle: after PDF import, a deterministic applyRemote during the
 * fingerprint window must NOT introduce foreign non-image elements onto
 * the PDF board — only PDF image element(s) remain.
 *
 * Red-before: without the fingerprint guard on `onTargetReadTime`, the
 * poisoned transitional live canvas becomes the merge local baseline.
 * Green-after: guard forces `pageDataRef[targetId]` (set by commitPdfBatch).
 *
 * Tags: @wb-strokes @wb-sync @wb-assets
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   npx playwright test --project=wb-regression tests/integration/wb-e2-apply-remote-pdf-stroke-leak.spec.ts
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

type WbxTestWindow = Window & {
  __WBX_INJECT_APPLY_REMOTE__?: (
    pageId: string,
    els: unknown
  ) => Promise<void>;
  __WBX_FORCE_LIVE_SCENE__?: (els: unknown) => void;
  __WBX_FINGERPRINT_HAS__?: (pageId: string) => boolean;
  __WBX_GET_ACTIVE_PAGE_ID__?: () => string;
  __WBX_ON_GUARD_RELEASE__?: (cb: (pageId: string) => void) => void;
  __TN_WB_E2E__?: Record<
    string,
    { getElements: () => Array<{ id: string; type?: string }> }
  >;
};

async function readSceneElementSummary(
  page: import("@playwright/test").Page,
  role: "tutor" | "student"
): Promise<SceneElementSummary[]> {
  return page.evaluate((r) => {
    const bridge = (window as WbxTestWindow).__TN_WB_E2E__?.[r];
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

test.describe("WS-X applyRemote PDF stroke leak — fingerprint guard", () => {
  test.setTimeout(300_000);

  test(
    "applyRemote during fingerprint window does not merge foreign board-3 stroke onto PDF board",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC, TAG.WB_ASSETS] },
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

        // Pre-arm the guard-release seam BEFORE starting the PDF import.
        // The callback fires synchronously inside selectTutorPage's releaseGuard
        // (when pageSwitchProgrammaticRef drops to 0 with the fingerprint still
        // active for the PDF page), injecting a stale board-3 stroke into the
        // live canvas at exactly the moment the applyRemote guard must defend.
        await peers.tutorPage.evaluate(
          ({ strokeId }) => {
            const win = window as WbxTestWindow;
            const now = Date.now();
            const staleLine = {
              id: strokeId,
              type: "line",
              x: 80,
              y: 80,
              width: 120,
              height: 120,
              angle: 0,
              strokeColor: "blue",
              backgroundColor: "transparent",
              fillStyle: "solid",
              strokeWidth: 2,
              strokeStyle: "solid",
              roughness: 1,
              opacity: 100,
              seed: (now + 1) % 2 ** 31,
              version: 1,
              versionNonce: now + 1,
              isDeleted: false,
              groupIds: [],
              frameId: null,
              roundness: null,
              boundElements: null,
              updated: now,
              link: null,
              locked: false,
              points: [
                [0, 0],
                [120, 120],
              ],
            };
            win.__WBX_ON_GUARD_RELEASE__?.((pageId) => {
              // Poison the live canvas so it carries the stale board-3 line.
              win.__WBX_FORCE_LIVE_SCENE__?.([staleLine]);
              // Trigger applyRemote during the fingerprint window; the empty
              // remote payload means any leak comes solely from the wrong
              // local merge baseline (live canvas vs. pageDataRef).
              void win.__WBX_INJECT_APPLY_REMOTE__?.(pageId, []);
            });
          },
          { strokeId: board3StrokeId }
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
          .getByRole("tab", { name: "Board 4" });
        await expect(pdfTab).toBeVisible({ timeout: 60_000 });
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 15_000,
        });

        // Allow the guard-release injection (2×rAF + setTimeout after
        // commitPdfBatch) and its async applyRemoteToCanvas to settle.
        // Using toPass so a slow initial reconcileElements dynamic import
        // doesn't cause a spurious failure while the guard IS blocking.
        await expect(async () => {
          const pdfBoardSummary = await readSceneElementSummary(
            peers.tutorPage,
            "tutor"
          );
          expect(pdfBoardSummary.length).toBeGreaterThan(0);
          expect(pdfBoardSummary.every((e) => e.type === "image")).toBe(true);
          expect(pdfBoardSummary.map((e) => e.id)).not.toContain(board3StrokeId);
        }).toPass({ timeout: 10_000 });

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        const board3Ids = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(board3Ids).toContain(board3StrokeId);
      } finally {
        await peers.close();
      }
    }
  );
});
