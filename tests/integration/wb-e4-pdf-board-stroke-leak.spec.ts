/**
 * E4 — PDF board switch stroke-bleed regression (post-fingerprint stale onChange).
 *
 * Root cause: after PDF import, `commitPdfBatch` → `selectTutorPage` sets
 * `pageSceneSetFingerprintRef` from PDF image id(s). The fingerprint clears on
 * the first legitimate PDF onChange. `blankBoardForbiddenIdsRef` was only armed
 * for blank targets (next.length === 0), so a debounced stale onChange from the
 * anchor board (Board 3) could write into `pageDataRef[board4Id]` after the
 * fingerprint dropped.
 *
 * Oracle (independent requirement check, directly on pageDataRef + round-trip):
 *   After tutor draws on Board 3, imports a PDF (Board 4+), waits for the
 *   fingerprint cycle to complete, then injects a synthetic stale Board-3
 *   onChange, Board-3 stroke IDs MUST NOT appear in pageDataRef[board4] nor
 *   on Board 4's live scene after round-trip. Board 3 must retain its stroke.
 *
 * Red-before (9fbe3ce): fingerprint clears → no secondary guard on PDF target →
 *   injected stale onChange accepted into pageDataRef[board4].
 * Green-after: pageForeignGuardRef rejects stale onChange after fingerprint
 *   clears; settledIds prevents PDF-image-only onChange from clearing the guard.
 *
 * Tags: @wb-strokes @wb-assets @wb-sync
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   node scripts/free-wb-dev-server-ports.cjs && npx playwright test --project=wb-regression tests/integration/wb-e4-pdf-board-stroke-leak.spec.ts --workers=1 --reporter=line --no-deps
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

type WbE4TestWindow = Window & {
  __TN_WB_E2E__?: Record<
    string,
    { getElements: () => Array<{ id: string; type?: string }> }
  >;
  __WBX_INJECT_HANDLE_CHANGE__?: (els: unknown) => void;
  __WBX_GET_PAGE_DATA_IDS__?: (pageId: string) => string[];
  __WBX_GET_ACTIVE_PAGE_ID__?: () => string;
  __WBX_FINGERPRINT_HAS__?: (pageId: string) => boolean;
};

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

async function readSceneElementsFull(
  page: import("@playwright/test").Page,
  role: "tutor" | "student"
): Promise<Array<{ id: string; type?: string }>> {
  return page.evaluate((r) => {
    const bridge = (window as WbE4TestWindow).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return [];
    return bridge.getElements().map((e) => ({ id: e.id, type: e.type }));
  }, role);
}

async function readPageDataBucketIds(
  page: import("@playwright/test").Page,
  pageId: string
): Promise<string[]> {
  return page.evaluate((id) => {
    const win = window as WbE4TestWindow;
    return win.__WBX_GET_PAGE_DATA_IDS__?.(id) ?? [];
  }, pageId);
}

async function getActivePageId(
  page: import("@playwright/test").Page
): Promise<string> {
  return page.evaluate(() => {
    const win = window as WbE4TestWindow;
    return win.__WBX_GET_ACTIVE_PAGE_ID__?.() ?? "";
  });
}

async function waitForPdfFingerprintCycle(
  page: import("@playwright/test").Page,
  board4PageId: string
): Promise<void> {
  // Post-import settle: selectTutorPage guard tail (2×rAF + timeout) + PDF onChange.
  await page.waitForTimeout(500);

  // Wait for fingerprint to clear — legitimate PDF onChange passed the anchor guard.
  await expect(async () => {
    const fingerprintActive = await page.evaluate((pageId) => {
      const win = window as WbE4TestWindow;
      return win.__WBX_FINGERPRINT_HAS__?.(pageId) ?? false;
    }, board4PageId);
    expect(fingerprintActive).toBe(false);
  }).toPass({ timeout: 30_000 });

  // Margin after fingerprint clears — stale onChange injection window.
  await page.waitForTimeout(200);
}

test.describe("E4 PDF board switch — stale-onChange must not bleed into PDF board's pageDataRef bucket", () => {
  test.setTimeout(300_000);

  test(
    "post-fingerprint stale Board-3 onChange rejected; pageDataRef[board4] stays PDF-only",
    { tag: [TAG.WB_STROKES, TAG.WB_ASSETS, TAG.WB_SYNC] },
    async ({ browser }) => {
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const pdfPath = path.join(__dirname, "../fixtures/e2e-two-pages.pdf");
      test.skip(!fs.existsSync(pdfPath), `Missing PDF fixture: ${pdfPath}`);

      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);

      try {
        await addBoardsUntilCount(peers.tutorPage, 3);
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");

        const board3StrokeId = `e4-b3-stroke-${Date.now()}`;
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

        const board3Elements = await readSceneElementsFull(peers.tutorPage, "tutor");
        expect(board3Elements.map((e) => e.id)).toContain(board3StrokeId);

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

        const strip = peers.tutorPage.getByTestId("wb-tutor-page-strip");
        const pdfTab = strip.getByRole("tab", { name: "Board 4" });
        await expect(pdfTab).toBeVisible({ timeout: 60_000 });
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 15_000,
        });

        const board4PageId = await getActivePageId(peers.tutorPage);
        expect(board4PageId).not.toBe("");

        await waitForPdfFingerprintCycle(peers.tutorPage, board4PageId);

        // Pre-injection baseline: pageDataRef must not already carry Board-3 stroke.
        const board4BucketPreInject = await readPageDataBucketIds(
          peers.tutorPage,
          board4PageId
        );
        expect(
          board4BucketPreInject,
          `pageDataRef[${board4PageId}] pre-injection must not contain Board-3 stroke`
        ).not.toContain(board3StrokeId);

        const seamsAvailable = await peers.tutorPage.evaluate(() => ({
          injectHandleChange:
            typeof (window as WbE4TestWindow).__WBX_INJECT_HANDLE_CHANGE__ ===
            "function",
          getPageDataIds:
            typeof (window as WbE4TestWindow).__WBX_GET_PAGE_DATA_IDS__ ===
            "function",
        }));
        expect(
          seamsAvailable.injectHandleChange,
          "__WBX_INJECT_HANDLE_CHANGE__ seam must be defined"
        ).toBe(true);
        expect(
          seamsAvailable.getPageDataIds,
          "__WBX_GET_PAGE_DATA_IDS__ seam must be defined"
        ).toBe(true);

        await peers.tutorPage.evaluate(
          ({ elements }) => {
            const win = window as WbE4TestWindow;
            win.__WBX_INJECT_HANDLE_CHANGE__!(elements);
          },
          { elements: board3Elements as unknown[] }
        );
        await peers.tutorPage.waitForTimeout(50);

        // Oracle A: pageDataRef[board4] must NOT contain Board-3 stroke ids.
        const board4BucketIds = await readPageDataBucketIds(
          peers.tutorPage,
          board4PageId
        );
        expect(
          board4BucketIds,
          `pageDataRef[${board4PageId}] MUST NOT contain Board-3 stroke (PDF-board bleed)`
        ).not.toContain(board3StrokeId);

        // Oracle B: round-trip Board 3 → Board 4 — pageDataRef must stay PDF-only
        // (authoritative; selectTutorPage hydrates live scene from pageDataRef).
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        await peers.tutorPage.waitForTimeout(200);
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 4");
        await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
          timeout: 10_000,
        });
        await peers.tutorPage.waitForTimeout(200);

        const board4BucketAfterRoundTrip = await readPageDataBucketIds(
          peers.tutorPage,
          board4PageId
        );
        expect(
          board4BucketAfterRoundTrip,
          "pageDataRef[board4] after round-trip must NOT contain Board-3 stroke"
        ).not.toContain(board3StrokeId);

        // Oracle C: Board 3 still contains its stroke.
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        await peers.tutorPage.waitForTimeout(200);
        const board3LiveIds = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(
          board3LiveIds,
          "Board-3 stroke must still be present"
        ).toContain(board3StrokeId);
      } finally {
        await peers.close();
      }
    }
  );
});
