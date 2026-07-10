/**
 * E5 — PDF import stroke-bleed from initial Board 1 (E4 guard window).
 *
 * Root cause: E4 added `pageForeignGuardRef` (forbiddenIds + settledIds) to
 * block stale anchor-board onChange after fingerprint cleared. However the
 * guard was cleared as soon as any onChange arrived that contained a NEW
 * element ID not in forbiddenIds or settledIds (`hasNewUserElement` branch,
 * now removed in E5 fix). Excalidraw can fire exactly such an onChange during
 * image loading / file hydration (status "saved"→"loaded" transitions, or
 * internal element normalization), opening a window before the debounced stale
 * Board-1 onChange fires.
 *
 * E4 missed this because:
 *   - E4 used Board 3 as the anchor (not the initial Board 1)
 *   - E4 injected the stale onChange AFTER waiting for fingerprint to clear,
 *     but did NOT simulate the intermediate "new-element" onChange that
 *     pre-maturely clears the guard
 *
 * This spec reproduces the EXACT hardware failure:
 *   1. Draw on Board 1 (initial page, no prior selectTutorPage call)
 *   2. Import PDF → navigate to Board 2 (first PDF page)
 *   3. Wait for fingerprint cycle
 *   4. Inject synthetic "clearing" onChange: pdfImage + NEW element with id
 *      not in forbiddenIds/settledIds — simulates the Excalidraw image-loading
 *      onChange that fires after status transition
 *   5. Inject stale Board-1 onChange
 *
 * Red-before (E4 fix present, E5 guard-clearing fix absent):
 *   Step 4 sets hasNewUserElement=true → guard deleted → step 5 is accepted
 *   into pageDataRef[board2] → board2 bucket contaminated.
 *
 * Green-after (E5 fix: hasNewUserElement clearing removed):
 *   Guard survives step 4; step 5 sees hasForeignElement=true → rejected;
 *   board2 bucket clean.
 *
 * Tags: @wb-strokes @wb-assets @wb-sync
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   node scripts/free-wb-dev-server-ports.cjs && npx playwright test --project=wb-regression tests/integration/wb-e5-pdf-board-stroke-bleed-initial-board.spec.ts --workers=1 --reporter=line --no-deps
 */

import { test, expect } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  drawTestStrokeOnRole,
  openTutorAndStudent,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

type WbE5TestWindow = Window & {
  __TN_WB_E2E__?: Record<
    string,
    { getElements: () => Array<{ id: string; type?: string }> }
  >;
  __WBX_INJECT_HANDLE_CHANGE__?: (els: unknown) => void;
  __WBX_GET_PAGE_DATA_IDS__?: (pageId: string) => string[];
  __WBX_GET_ACTIVE_PAGE_ID__?: () => string;
  __WBX_FINGERPRINT_HAS__?: (pageId: string) => boolean;
};

async function getActivePageId(
  page: import("@playwright/test").Page
): Promise<string> {
  return page.evaluate(() => {
    const win = window as WbE5TestWindow;
    return win.__WBX_GET_ACTIVE_PAGE_ID__?.() ?? "";
  });
}

async function readPageDataBucketIds(
  page: import("@playwright/test").Page,
  pageId: string
): Promise<string[]> {
  return page.evaluate((id) => {
    const win = window as WbE5TestWindow;
    return win.__WBX_GET_PAGE_DATA_IDS__?.(id) ?? [];
  }, pageId);
}

async function readSceneElementsFull(
  page: import("@playwright/test").Page,
  role: "tutor" | "student"
): Promise<Array<{ id: string; type?: string }>> {
  return page.evaluate((r) => {
    const bridge = (window as WbE5TestWindow).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return [];
    return bridge.getElements().map((e) => ({ id: e.id, type: e.type }));
  }, role);
}

async function waitForPdfFingerprintCycle(
  page: import("@playwright/test").Page,
  pdfPageId: string
): Promise<void> {
  // Post-import settle: selectTutorPage guard tail (2×rAF + timeout) + PDF onChange.
  await page.waitForTimeout(500);

  // Wait for fingerprint to clear — legitimate PDF onChange has passed.
  await expect(async () => {
    const active = await page.evaluate((pageId) => {
      const win = window as WbE5TestWindow;
      return win.__WBX_FINGERPRINT_HAS__?.(pageId) ?? false;
    }, pdfPageId);
    expect(active).toBe(false);
  }).toPass({ timeout: 30_000 });

  // Margin after fingerprint clears.
  await page.waitForTimeout(200);
}

test.describe(
  "E5 — PDF import from initial Board-1 must not bleed strokes onto first PDF page",
  () => {
    test.setTimeout(300_000);

    test(
      "guard-clearing onChange + stale Board-1 onChange rejected; pageDataRef[board2] stays PDF-only",
      { tag: [TAG.WB_STROKES, TAG.WB_ASSETS, TAG.WB_SYNC] },
      async ({ browser }) => {
        test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

        const pdfPath = path.join(__dirname, "../fixtures/e2e-two-pages.pdf");
        test.skip(
          !fs.existsSync(pdfPath),
          `Missing PDF fixture: ${pdfPath}`
        );

        const session = await seedWbLiveSyncSession();
        const peers = await openTutorAndStudent(browser, session);

        try {
          // ── Step 1: draw on Board 1 (initial page, no prior selectTutorPage) ──
          // This is the "non-PDF anchor board" in Andrew's repro.
          const board1StrokeId = `e5-b1-stroke-${Date.now()}`;
          await drawTestStrokeOnRole(
            peers.tutorPage,
            "tutor",
            board1StrokeId,
            80,
            80,
            200,
            200
          );
          await waitForElementOnPeer(
            peers.tutorPage,
            "tutor",
            board1StrokeId,
            15_000
          );

          // Capture Board 1's full element snapshot — this is the stale payload.
          const board1Elements = await readSceneElementsFull(
            peers.tutorPage,
            "tutor"
          );
          expect(board1Elements.map((e) => e.id)).toContain(board1StrokeId);

          // ── Step 2: import PDF from Board 1 ──
          await peers.tutorPage.getByTestId("wb-insert-asset-btn").click();
          await expect(
            peers.tutorPage.getByTestId("wb-insert-dialog")
          ).toBeVisible();
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

          // Board 2 tab must be selected (auto-navigation).
          const strip = peers.tutorPage.getByTestId("wb-tutor-page-strip");
          const pdfTab = strip.getByRole("tab", { name: "Board 2" });
          await expect(pdfTab).toBeVisible({ timeout: 60_000 });
          await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
            timeout: 15_000,
          });

          const board2PageId = await getActivePageId(peers.tutorPage);
          expect(board2PageId).not.toBe("");

          // ── Step 3: wait for the fingerprint guard cycle ──
          await waitForPdfFingerprintCycle(peers.tutorPage, board2PageId);

          // Pre-injection baseline: guard must not already be contaminated.
          const board2PreInject = await readPageDataBucketIds(
            peers.tutorPage,
            board2PageId
          );
          expect(
            board2PreInject,
            `pageDataRef[board2] pre-injection must not contain Board-1 stroke`
          ).not.toContain(board1StrokeId);

          const seamsAvailable = await peers.tutorPage.evaluate(() => ({
            injectHandleChange:
              typeof (window as WbE5TestWindow).__WBX_INJECT_HANDLE_CHANGE__ ===
              "function",
            getPageDataIds:
              typeof (window as WbE5TestWindow).__WBX_GET_PAGE_DATA_IDS__ ===
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

          // ── Step 4: inject a synthetic "guard-clearing" onChange ──
          // Simulates the Excalidraw image-loading callback that fires an
          // onChange containing a NEW element ID not in forbiddenIds or
          // settledIds. Pre-fix this sets hasNewUserElement=true and deletes
          // the pageForeignGuardRef entry, opening the bleed window.
          // Post-fix (E5) the clearing logic is removed — guard survives.
          const clearingElementId = `e5-clearing-${Date.now()}`;

          // Retrieve the current Board-2 live-scene elements so we can include
          // the PDF image alongside the synthetic new element.
          const board2LiveElements = await readSceneElementsFull(
            peers.tutorPage,
            "tutor"
          );

          const clearingPayload = [
            ...board2LiveElements,
            {
              id: clearingElementId,
              type: "freedraw",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              points: [[0, 0]],
              pressures: [],
              angle: 0,
              strokeColor: "#000000",
              backgroundColor: "transparent",
              fillStyle: "solid",
              strokeWidth: 1,
              strokeStyle: "solid",
              roughness: 0,
              opacity: 100,
              seed: 1,
              version: 1,
              versionNonce: 1,
              isDeleted: false,
              boundElements: null,
              updated: Date.now(),
              link: null,
              locked: false,
              groupIds: [],
              frameId: null,
              roundness: null,
              simulatePressure: true,
            },
          ];

          await peers.tutorPage.evaluate(
            ({ elements }) => {
              const win = window as WbE5TestWindow;
              win.__WBX_INJECT_HANDLE_CHANGE__!(elements);
            },
            { elements: clearingPayload as unknown[] }
          );
          await peers.tutorPage.waitForTimeout(50);

          // ── Step 5: inject the stale Board-1 onChange ──
          // Pre-fix: guard was deleted in step 4 → accepted → FAIL.
          // Post-fix: guard still active → hasForeignElement=true → rejected → PASS.
          await peers.tutorPage.evaluate(
            ({ elements }) => {
              const win = window as WbE5TestWindow;
              win.__WBX_INJECT_HANDLE_CHANGE__!(elements);
            },
            { elements: board1Elements as unknown[] }
          );
          await peers.tutorPage.waitForTimeout(50);

          // ── Oracle A: pageDataRef[board2] must NOT contain Board-1 stroke ──
          const board2BucketIds = await readPageDataBucketIds(
            peers.tutorPage,
            board2PageId
          );
          expect(
            board2BucketIds,
            `pageDataRef[board2] MUST NOT contain Board-1 stroke (PDF-board bleed via guard-clearing window)`
          ).not.toContain(board1StrokeId);

          // ── Oracle B: round-trip Board 1 → Board 2 stays clean ──
          // selectTutorPage uses pageDataRef as the source of truth;
          // contamination there would paint strokes on the live canvas.
          const board1Tab = strip.getByRole("tab", { name: "Board 1" });
          await board1Tab.click();
          await expect(board1Tab).toHaveAttribute("aria-selected", "true", {
            timeout: 10_000,
          });
          await peers.tutorPage.waitForTimeout(200);
          await pdfTab.click();
          await expect(pdfTab).toHaveAttribute("aria-selected", "true", {
            timeout: 10_000,
          });
          await peers.tutorPage.waitForTimeout(200);

          const board2BucketAfterRoundTrip = await readPageDataBucketIds(
            peers.tutorPage,
            board2PageId
          );
          expect(
            board2BucketAfterRoundTrip,
            "pageDataRef[board2] after round-trip must NOT contain Board-1 stroke"
          ).not.toContain(board1StrokeId);

          // ── Oracle C: Board 1 still has its stroke ──
          const board1Tab2 = strip.getByRole("tab", { name: "Board 1" });
          await board1Tab2.click();
          await peers.tutorPage.waitForTimeout(200);
          const board1LiveIds = await readSceneElementIds(
            peers.tutorPage,
            "tutor"
          );
          expect(
            board1LiveIds,
            "Board-1 stroke must still be present after PDF import"
          ).toContain(board1StrokeId);
        } finally {
          await peers.close();
        }
      }
    );
  }
);
