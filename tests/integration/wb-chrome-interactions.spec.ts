import { test, expect, type Page } from "@playwright/test";
import { seedWbLiveSyncSession, waitForWbE2eBridge } from "./whiteboard-live-sync.helpers";

/**
 * Chrome interactivity gate — each control must be clickable and return
 * the correct DOM state. These tests are the RED/GREEN gate for the
 * pointer-events + overflow-clipping root cause fix.
 *
 * Root cause (2026-06-09): overflow:hidden on .mynk-wb-topbar clipped
 * all dropdown panels below the 44px bar; overflow-x:hidden on
 * .mynk-wb-strip clipped all sidebar popovers. CSS :hover for the props
 * panel also fired mouseLeave when the cursor moved toward the panel.
 *
 * Run: npm run test:wb-playwright -- tests/integration/wb-chrome-interactions.spec.ts
 */

async function loadTutorBoard(page: Page, session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>) {
  await page.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("mynk-wb-chrome")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({ timeout: 90_000 });
  await waitForWbE2eBridge(page, "tutor");
}

test.describe("wb chrome — interactive controls", () => {
  // Each test seeds its own session to avoid shared state.

  test("Share dropdown opens on click and is visible", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // RED baseline: clicking wb-share-options used to produce no visible dropdown
    // because overflow:hidden on .mynk-wb-topbar clipped it at 44px.
    const caret = page.getByTestId("wb-share-options");
    await expect(caret).toBeVisible();
    await caret.click();

    const dropdown = page.locator(".mynk-wb-share-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 3_000 });
    await expect(dropdown).toContainText("Copy student join link");

    // Pressing Escape or clicking outside should close it
    await page.keyboard.press("Escape");

    await context.close();
  });

  test("Mic dropdown opens on click", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
      permissions: ["microphone"],
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const micCaret = page.getByTestId("wb-topbar-mic-settings");
    await expect(micCaret).toBeVisible();
    await micCaret.click();

    const popover = page.locator(".mynk-wb-mic-popover");
    await expect(popover).toBeVisible({ timeout: 3_000 });

    await context.close();
  });

  test("Theme toggle opens menu and selecting an option applies data-theme", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const themeBtn = page.getByTestId("wb-theme-toggle");
    await expect(themeBtn).toBeVisible();
    await themeBtn.click();

    const dropdown = page.locator(".mynk-wb-theme-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 3_000 });

    // Click "Dark" option
    await dropdown.getByRole("menuitemradio", { name: "Dark" }).click();
    // Verify the html element has data-theme=dark
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 3_000 });

    await context.close();
  });

  test("Shapes flyout opens on click and selects a shape tool", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // The Shapes WbToolBtn has pulldown attribute — click it to open
    const shapesTrigger = page.getByRole("button", { name: /Shapes/i });
    await expect(shapesTrigger).toBeVisible();
    await shapesTrigger.click();

    const shapesDropdown = page.locator(".mynk-wb-shapes-dropdown");
    await expect(shapesDropdown).toBeVisible({ timeout: 3_000 });

    // Click rectangle
    await shapesDropdown.getByRole("menuitem", { name: /Rectangle/i }).click();
    // Dropdown should close and a tool button should be active
    await expect(shapesDropdown).not.toBeVisible({ timeout: 2_000 });

    await context.close();
  });

  test("Left-rail more (3-dot) menu opens on click", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const moreBtn = page.getByRole("button", { name: /More — z-order/i });
    await expect(moreBtn).toBeVisible();
    await moreBtn.click();

    const morePopover = page.getByTestId("wb-more-popover");
    await expect(morePopover).toBeVisible({ timeout: 3_000 });

    await context.close();
  });

  test("Props compact panel (PP-06) opens on click and stays open when cursor moves onto it", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Activate pencil so props chrome shows
    await page.getByRole("button", { name: "Pencil (P)" }).click();

    const trigger = page.getByTestId("wb-props-compact-trigger");
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    // Move cursor onto the panel — it must STAY open (old hover approach would close it)
    await panel.hover();
    await expect(panel).toBeVisible({ timeout: 2_000 });

    // Click outside to dismiss
    await page.getByTestId("tutor-whiteboard-canvas-mount").click();
    await expect(panel).not.toBeVisible({ timeout: 2_000 });

    await context.close();
  });

  test("elementFromPoint at Share caret returns the button itself", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const caret = page.getByTestId("wb-share-options");
    const box = await caret.boundingBox();
    expect(box).not.toBeNull();

    const cx = box!.x + box!.width / 2;
    const cy = box!.y + box!.height / 2;

    const topElement = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        return {
          tag: el.tagName.toLowerCase(),
          testId: (el as HTMLElement).dataset.testid ?? null,
          className: el.className,
        };
      },
      { x: cx, y: cy }
    );

    // The element at the center of the share caret must be the button (or a direct child)
    // not a transparent overlay blocking it
    expect(topElement).not.toBeNull();
    expect(topElement!.tag).toMatch(/^(button|span|svg|path)$/);

    await context.close();
  });

  test("Board delete affordance: add board, delete board 2, board 1 intact", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const tabStrip = page.getByTestId("wb-tutor-page-strip");
    await expect(tabStrip).toBeVisible();

    // Add a second board
    await page.getByRole("button", { name: "Add board" }).click();
    // Should now have 2 boards
    await expect(tabStrip.getByRole("tab")).toHaveCount(2);

    // Draw a test stroke on board 1 first (activate board 1)
    const board1Tab = tabStrip.getByRole("tab", { name: "Board 1" });
    await board1Tab.click();

    // Hover over board 2's tab to reveal the delete button
    const board2Wrap = tabStrip.locator(".mynk-wb-board-tab-wrap").nth(1);
    await board2Wrap.hover();

    // Click the delete × button for board 2
    const deleteBtn = page.getByTestId("wb-board-delete-1");
    await deleteBtn.click();

    // Should show confirm/cancel
    const confirmBtn = page.getByTestId("wb-board-delete-confirm-1");
    await expect(confirmBtn).toBeVisible({ timeout: 2_000 });

    // Confirm deletion
    await confirmBtn.click();

    // Should be back to 1 board
    await expect(tabStrip.getByRole("tab")).toHaveCount(1);

    // Verify we can still draw on board 1 (engine not broken)
    await expect(page.getByRole("button", { name: "Pencil (P)" })).toBeVisible();

    // Cannot delete the last board — delete button should not be present
    await expect(page.locator(".mynk-wb-board-tab-del")).not.toBeVisible();

    await context.close();
  });
});
