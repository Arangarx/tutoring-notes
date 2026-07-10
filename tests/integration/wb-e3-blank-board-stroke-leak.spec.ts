/**
 * E3 — blank-board switch stroke-bleed regression.
 *
 * Root cause: pageSceneSetFingerprintRef is NOT set when switching to a blank
 * board (selectTutorPage / addTutorPage, next.length === 0). A stale debounced
 * Excalidraw onChange from the leaving board fires after pageSwitchProgrammaticRef
 * drops to 0 and writes the leaving board's elements into the new blank board's
 * pageDataRef bucket — because there is no secondary fingerprint guard to reject it.
 *
 * Oracle (independent requirement check, directly on pageDataRef):
 *   After tutor draws strokes on Board 2 then navigates to a NEW/EMPTY Board 3,
 *   a synthetic stale-onChange injection (simulating Excalidraw's debounced
 *   onChange firing late) MUST NOT write Board-2 element IDs into
 *   pageDataRef[board3Id]. We read pageDataRef directly via the
 *   `__WBX_GET_PAGE_DATA_IDS__` oracle seam — handleExcalidrawChange only writes
 *   pageDataRef, not the live Excalidraw scene, so live-scene reads are insufficient.
 *
 * Red-before (25290cd):
 *   blank-board guard absent → injected stale onChange accepted into
 *   pageDataRef[board3] → Board-2 stroke ID found in Board-3's bucket.
 * Green-after (this fix):
 *   blankBoardForbiddenIdsRef rejects the stale onChange →
 *   pageDataRef[board3] stays empty.
 *
 * The synthetic injection uses `window.__WBX_INJECT_HANDLE_CHANGE__` (E3 test
 * seam, NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1) to call handleExcalidrawChange directly,
 * bypassing Excalidraw's debounce and the pageSwitchProgrammaticRef guard window —
 * reproducing the exact post-guard stale-onChange race deterministically.
 *
 * Tags: @wb-strokes @wb-sync
 * Gate: npm run test:wb-sync (relay) or targeted:
 *   node scripts/free-wb-dev-server-ports.cjs && npx playwright test --project=wb-regression tests/integration/wb-e3-blank-board-stroke-leak.spec.ts --workers=1 --reporter=line --no-deps
 */

import { test, expect } from "./fixtures";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  openTutorAndStudent,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

type WbE3TestWindow = Window & {
  __TN_WB_E2E__?: Record<
    string,
    { getElements: () => Array<{ id: string; type?: string }> }
  >;
  /** E3 seam: inject a synthetic stale onChange into handleExcalidrawChange. */
  __WBX_INJECT_HANDLE_CHANGE__?: (els: unknown) => void;
  /** E3 oracle seam: read element IDs from pageDataRef[pageId] directly. */
  __WBX_GET_PAGE_DATA_IDS__?: (pageId: string) => string[];
  __WBX_GET_ACTIVE_PAGE_ID__?: () => string;
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

/**
 * Read the full element array (id + type) from the live Excalidraw scene
 * via the E2E bridge.
 */
async function readSceneElementsFull(
  page: import("@playwright/test").Page,
  role: "tutor" | "student"
): Promise<Array<{ id: string; type?: string }>> {
  return page.evaluate((r) => {
    const bridge = (window as WbE3TestWindow).__TN_WB_E2E__?.[r];
    if (!bridge?.getElements) return [];
    return bridge.getElements().map((e) => ({ id: e.id, type: e.type }));
  }, role);
}

/**
 * Read element IDs directly from pageDataRef[pageId] via the oracle seam.
 * This is the authoritative check: handleExcalidrawChange only writes
 * pageDataRef, not the live scene, so live-scene reads are insufficient.
 */
async function readPageDataBucketIds(
  page: import("@playwright/test").Page,
  pageId: string
): Promise<string[]> {
  return page.evaluate((id) => {
    const win = window as WbE3TestWindow;
    return win.__WBX_GET_PAGE_DATA_IDS__?.(id) ?? [];
  }, pageId);
}

/**
 * Get the active page ID from the component via the oracle seam.
 */
async function getActivePageId(
  page: import("@playwright/test").Page
): Promise<string> {
  return page.evaluate(() => {
    const win = window as WbE3TestWindow;
    return win.__WBX_GET_ACTIVE_PAGE_ID__?.() ?? "";
  });
}

test.describe("E3 blank-board switch — stale-onChange must not bleed into empty board's pageDataRef bucket", () => {
  test.setTimeout(300_000);

  test(
    "addTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);

      try {
        // ── Step 1: navigate to Board 2 and draw a distinct stroke ──
        await addBoardsUntilCount(peers.tutorPage, 2);
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 2");

        const board2StrokeId = `e3-add-b2-${Date.now()}`;
        await drawTestStrokeOnRole(
          peers.tutorPage,
          "tutor",
          board2StrokeId,
          80,
          80,
          200,
          200
        );
        await waitForElementOnPeer(peers.tutorPage, "tutor", board2StrokeId, 15_000);

        // Capture Board 2's elements — these are the stale payload.
        const board2Elements = await readSceneElementsFull(peers.tutorPage, "tutor");
        expect(board2Elements.map((e) => e.id)).toContain(board2StrokeId);

        // ── Step 2: add Board 3 (addTutorPage path → empty board) ──
        const strip = peers.tutorPage.getByTestId("wb-tutor-page-strip");
        const tabsBefore = await strip.getByRole("tab").count();
        await strip.getByRole("button", { name: "Add board" }).click();
        await expect(strip.getByRole("tab")).toHaveCount(tabsBefore + 1, {
          timeout: 15_000,
        });
        await expect(
          strip.getByRole("tab", { name: "Board 3", exact: true })
        ).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });

        // Capture the new board's page ID before the injection.
        const board3PageId = await getActivePageId(peers.tutorPage);
        expect(board3PageId).not.toBe("");

        // ── Step 3: wait for pageSwitchProgrammaticRef guard to drop ──
        // Guard releases after 2×rAF + setTimeout(0) ≈ ~50 ms.
        // 200 ms gives comfortable margin to be firmly post-guard.
        await peers.tutorPage.waitForTimeout(200);

        // Verify test seams are available before injecting.
        const seamsAvailable = await peers.tutorPage.evaluate(() => ({
          injectHandleChange:
            typeof (window as WbE3TestWindow).__WBX_INJECT_HANDLE_CHANGE__ === "function",
          getPageDataIds:
            typeof (window as WbE3TestWindow).__WBX_GET_PAGE_DATA_IDS__ === "function",
        }));
        expect(
          seamsAvailable.injectHandleChange,
          "__WBX_INJECT_HANDLE_CHANGE__ seam must be defined (NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1)"
        ).toBe(true);
        expect(
          seamsAvailable.getPageDataIds,
          "__WBX_GET_PAGE_DATA_IDS__ seam must be defined"
        ).toBe(true);

        // ── Step 4: inject synthetic stale onChange with Board-2 elements ──
        // Simulates Excalidraw's debounced onChange firing post-guard with
        // Board-2's snapshot. Before fix: accepted → pageDataRef contaminated.
        // After fix: rejected by blankBoardForbiddenIdsRef.
        await peers.tutorPage.evaluate(
          ({ elements }) => {
            const win = window as WbE3TestWindow;
            // Direct call — seam is verified above so no ?. needed.
            win.__WBX_INJECT_HANDLE_CHANGE__!(elements);
          },
          { elements: board2Elements as unknown[] }
        );

        // Small settle for any downstream async paths (broadcast scheduling, etc.)
        await peers.tutorPage.waitForTimeout(50);

        // ── Oracle: pageDataRef[board3] must NOT contain Board-2 IDs ──
        // This is the direct requirement: the stale onChange must not write
        // Board-2 element IDs into Board-3's data bucket.
        const board3BucketIds = await readPageDataBucketIds(
          peers.tutorPage,
          board3PageId
        );
        expect(
          board3BucketIds,
          `pageDataRef[${board3PageId}] MUST NOT contain Board-2 stroke (blank-board bleed via addTutorPage)`
        ).not.toContain(board2StrokeId);
        expect(
          board3BucketIds.length,
          "Board-3 data bucket must be empty after stale-onChange rejection"
        ).toBe(0);

      } finally {
        await peers.close();
      }
    }
  );

  test(
    "selectTutorPage path: injected stale Board-2 onChange rejected; pageDataRef[board3] stays empty",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);

      try {
        // Create all 3 boards upfront; Board 3 is and stays empty.
        await addBoardsUntilCount(peers.tutorPage, 3);

        // Capture Board 3's page ID while we're still navigating boards.
        // After addBoardsUntilCount the tutor is on the last-added board (Board 3).
        const board3PageId = await getActivePageId(peers.tutorPage);
        expect(board3PageId).not.toBe("");

        // Draw on Board 2.
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 2");
        const board2StrokeId = `e3-sel-b2-${Date.now()}`;
        await drawTestStrokeOnRole(
          peers.tutorPage,
          "tutor",
          board2StrokeId,
          60,
          60,
          180,
          180
        );
        await waitForElementOnPeer(peers.tutorPage, "tutor", board2StrokeId, 15_000);

        const board2Elements = await readSceneElementsFull(peers.tutorPage, "tutor");
        expect(board2Elements.map((e) => e.id)).toContain(board2StrokeId);

        // Navigate to pre-existing empty Board 3 (selectTutorPage path).
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        const strip = peers.tutorPage.getByTestId("wb-tutor-page-strip");
        await expect(
          strip.getByRole("tab", { name: "Board 3", exact: true })
        ).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });

        // Wait for guard to drop.
        await peers.tutorPage.waitForTimeout(200);

        // Verify seams before injecting.
        const seams2 = await peers.tutorPage.evaluate(() => ({
          injectHandleChange:
            typeof (window as WbE3TestWindow).__WBX_INJECT_HANDLE_CHANGE__ === "function",
          getPageDataIds:
            typeof (window as WbE3TestWindow).__WBX_GET_PAGE_DATA_IDS__ === "function",
        }));
        expect(seams2.injectHandleChange, "__WBX_INJECT_HANDLE_CHANGE__ seam (selectTutorPage test)").toBe(true);
        expect(seams2.getPageDataIds, "__WBX_GET_PAGE_DATA_IDS__ seam (selectTutorPage test)").toBe(true);

        // Inject stale Board-2 onChange.
        await peers.tutorPage.evaluate(
          ({ elements }) => {
            const win = window as WbE3TestWindow;
            win.__WBX_INJECT_HANDLE_CHANGE__!(elements);
          },
          { elements: board2Elements as unknown[] }
        );
        await peers.tutorPage.waitForTimeout(50);

        // Oracle: pageDataRef[board3] must be empty.
        const board3BucketIds = await readPageDataBucketIds(
          peers.tutorPage,
          board3PageId
        );
        expect(
          board3BucketIds,
          `pageDataRef[${board3PageId}] MUST NOT contain Board-2 stroke (blank-board bleed via selectTutorPage)`
        ).not.toContain(board2StrokeId);
        expect(board3BucketIds.length, "Board-3 bucket must be empty").toBe(0);

        // Extra oracle: navigate away and back; Board 3 live scene must stay empty.
        // (selectTutorPage reads pageDataRef on every navigation, so if the bucket
        // was clean, the live scene will also be clean on return.)
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 2");
        await peers.tutorPage.waitForTimeout(200);
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 3");
        await expect(
          strip.getByRole("tab", { name: "Board 3", exact: true })
        ).toHaveAttribute("aria-selected", "true", { timeout: 10_000 });
        await peers.tutorPage.waitForTimeout(200);

        const board3LiveIds = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(
          board3LiveIds,
          "Board-3 live scene must be empty after round-trip (pageDataRef was clean)"
        ).not.toContain(board2StrokeId);
        expect(board3LiveIds.length, "Board-3 live scene must be empty").toBe(0);

        // Board 2 live scene intact.
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 2");
        await peers.tutorPage.waitForTimeout(200);
        const board2LiveIds = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(
          board2LiveIds,
          "Board-2 stroke must still be present"
        ).toContain(board2StrokeId);
      } finally {
        await peers.close();
      }
    }
  );
});
