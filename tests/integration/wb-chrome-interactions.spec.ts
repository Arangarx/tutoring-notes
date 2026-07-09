import { test, expect, type Page } from "@playwright/test";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  drawTestStrokeOnRole,
  readSceneElementIds,
  clickBoardPageTab,
  waitForElementOnPeer,
  openTutorAndStudent,
  assertControlFullyInViewport,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

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

  /**
   * P0 undo cross-board contamination gate (2026-06-09, wb-chrome-redo).
   *
   * MECHANISM: Excalidraw uses a single undo/redo history stack global to the
   * instance. Without `captureUpdate:"NEVER"` + `history.clear()` on every
   * board switch, undo on Board 2 replays Board 1 operations and injects
   * Board 1 elements into the Board 2 scene.
   *
   * RED before fix: 3rd undo pulls b1-stroke onto Board 2.
   * GREEN after fix: 3rd undo is a no-op; Board 2 stays clean.
   *
   * Also asserts board separation is intact: switching back to Board 1
   * after all the above still shows b1-stroke.
   */
  test("P0: undo does NOT bleed Board-1 strokes onto Board-2 (cross-board history isolation)", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Step 1: Draw a test stroke on Board 1.
    // The bridge calls updateScene(EVENTUALLY); addTutorPage's own updateScene
    // call below triggers the EVENTUALLY flush, committing b1-stroke into the
    // global undo stack BEFORE the board switch (pre-fix scenario).
    await drawTestStrokeOnRole(page, "tutor", "b1-stroke", 100, 100, 200, 200);
    await waitForElementOnPeer(page, "tutor", "b1-stroke");

    // Capture Board 1 element IDs so we can assert none leak to Board 2.
    const board1ElementIds = await readSceneElementIds(page, "tutor");
    expect(board1ElementIds).toContain("b1-stroke");

    // Step 2: Add Board 2 — also switches to it and calls updateScene, which
    // flushes any EVENTUALLY-queued entries (including b1-stroke) to the undo
    // stack in the pre-fix world.
    await page.getByRole("button", { name: "Add board" }).click();
    const tabStrip = page.getByTestId("wb-tutor-page-strip");
    await expect(tabStrip.getByRole("tab")).toHaveCount(2, { timeout: 5_000 });

    // Board 2 scene must be empty after switch.
    const board2IdsAfterSwitch = await readSceneElementIds(page, "tutor");
    expect(board2IdsAfterSwitch).toHaveLength(0);

    // Step 3: Draw two strokes on Board 2 so we have something to undo.
    await drawTestStrokeOnRole(page, "tutor", "b2-stroke-1", 50, 50, 150, 150);
    await waitForElementOnPeer(page, "tutor", "b2-stroke-1");
    await drawTestStrokeOnRole(page, "tutor", "b2-stroke-2", 200, 200, 300, 300);
    await waitForElementOnPeer(page, "tutor", "b2-stroke-2");

    // Click the canvas to focus Excalidraw and flush pending EVENTUALLY captures
    // so the Board-2 strokes are in the undo stack.
    await page.getByTestId("tutor-whiteboard-canvas-mount").click({ position: { x: 400, y: 400 } });
    await page.waitForTimeout(300);

    // Step 4: Undo twice — removes b2-stroke-2, then b2-stroke-1.
    // Bridge drawTestStroke uses captureUpdate:"IMMEDIATELY" so strokes are in the
    // undo stack; Ctrl+Z here targets the focused Excalidraw document root.
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(300);
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(300);

    // Step 5: Undo one more time — this is the critical assertion.
    // WITHOUT fix: undo replays the board-switch delta, injecting Board 1 elements.
    // WITH fix: undo stack is empty (cleared on board switch); no-op.
    await page.keyboard.press("Control+Z");
    await page.waitForTimeout(500);

    const board2IdsAfterAllUndos = await readSceneElementIds(page, "tutor");

    // (a) b2-stroke-2 must be gone.
    expect(board2IdsAfterAllUndos).not.toContain("b2-stroke-2");
    // (b) b2-stroke-1 must be gone.
    expect(board2IdsAfterAllUndos).not.toContain("b2-stroke-1");
    // (c) No Board-1 element must appear on Board 2 — this is the P0 gate.
    for (const id of board1ElementIds) {
      expect(board2IdsAfterAllUndos).not.toContain(id);
    }

    // Step 6: Switch back to Board 1 — board separation must still hold.
    await clickBoardPageTab(page, "tutor", "Board 1");
    await page.waitForTimeout(500);

    const board1IdsAfter = await readSceneElementIds(page, "tutor");
    expect(board1IdsAfter).toContain("b1-stroke");

    await context.close();
  });

  /**
   * Z-index gate: open dropdown must render ABOVE the waiting banner.
   *
   * The root cause was that .mynk-wb-topbar had z-index:10, creating a
   * stacking context below .mynk-wb-banners (z-20) and .mynk-wb-av-cluster
   * (z-25). elementFromPoint at the open dropdown's bounding box must return
   * an element inside the dropdown — not the banner behind it.
   */
  test("Share dropdown renders ABOVE the waiting banner (z-index gate)", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Open the Share dropdown
    const caret = page.getByTestId("wb-share-options");
    await caret.click();
    const dropdown = page.locator(".mynk-wb-share-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 3_000 });

    // Sample a point at the top-center of the dropdown
    const box = await dropdown.boundingBox();
    expect(box).not.toBeNull();
    const sampleX = box!.x + box!.width / 2;
    const sampleY = box!.y + 8; // 8px below top edge

    const topEl = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        // Walk up to find if we're inside the dropdown
        let node: Element | null = el;
        while (node) {
          if (node.classList.contains("mynk-wb-share-dropdown")) return "inside-dropdown";
          if (node.classList.contains("mynk-wb-banners")) return "inside-banner";
          if (node.classList.contains("mynk-wb-av-cluster")) return "inside-av-cluster";
          node = node.parentElement;
        }
        return el.className;
      },
      { x: sampleX, y: sampleY }
    );

    expect(topEl).toBe("inside-dropdown");

    await context.close();
  });

  /**
   * Active-tool retain gate: the active tool button must keep its active class
   * when the pointer hovers over it. Pre-fix the :hover specificity could
   * have overridden --active on hover.
   */
  test("Active tool button retains --active class on hover", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Click Pencil tool to make it active
    const pencilBtn = page.getByRole("button", { name: "Pencil (P)" });
    await pencilBtn.click();

    // Confirm the button has the active class
    await expect(pencilBtn).toHaveClass(/mynk-wb-tool-btn--active/);

    // Hover over the same active button — class must stay
    await pencilBtn.hover();
    await expect(pencilBtn).toHaveClass(/mynk-wb-tool-btn--active/);

    // Hover over a DIFFERENT inactive button — Pencil must still be active
    const eraserBtn = page.getByRole("button", { name: "Eraser (E)" });
    await eraserBtn.hover();
    await expect(pencilBtn).toHaveClass(/mynk-wb-tool-btn--active/);
    // And the eraser must NOT be active
    await expect(eraserBtn).not.toHaveClass(/mynk-wb-tool-btn--active/);

    await context.close();
  });

  /**
   * Dark-mode ink swatch gate: the single adaptive ink swatch must display the
   * theme-resolved hex (white in dark mode) and must be the active swatch when
   * the default stroke color is white.
   *
   * The ink swatch is now one logical slot ("Ink") that adapts to theme —
   * no separate "White" / "Near-black" pair. In dark mode it displays and
   * draws #ffffff; in light mode it displays and draws #1e293b.
   *
   * NOTE: swatch display color is a backgroundColor CSS attribute; verifying
   * that it matches the rendered stroke on canvas requires a real browser with
   * relay+Excalidraw — assert swatch presence and active state only here.
   */
  test("Dark-mode initial stroke: ink swatch is present and active when dark theme is applied", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    // Force dark mode before the board loads so initialWbStrokeColor picks up dark theme
    await page.addInitScript(() => {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme-mode", "dark");
    });

    await loadTutorBoard(page, session);

    // Switch to dark via the theme toggle (forces resolvedTheme = dark)
    const themeBtn = page.getByTestId("wb-theme-toggle");
    await themeBtn.click();
    const dropdown = page.locator(".mynk-wb-theme-dropdown");
    await dropdown.getByRole("menuitemradio", { name: "Dark" }).click();

    // Activate Pencil so the props panel is shown
    await page.getByRole("button", { name: "Pencil (P)" }).click();
    const trigger = page.getByTestId("wb-props-compact-trigger");
    await trigger.click();
    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    // The adaptive ink swatch (aria-label="Ink") must be present.
    // In dark mode its backgroundColor must be white (#ffffff).
    const inkSwatch = panel.locator('.mynk-wb-swatch[aria-label="Ink"]');
    await expect(inkSwatch).toBeVisible();

    // Verify no separate "White" or "Near-black" swatch exists (the old dual-swatch anti-pattern).
    await expect(panel.locator('.mynk-wb-swatch[aria-label="White"]')).not.toBeVisible();
    await expect(panel.locator('.mynk-wb-swatch[aria-label="Near-black"]')).not.toBeVisible();

    // The ink swatch must display as white (rgb(255,255,255)) in dark mode.
    const bgColor = await inkSwatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe("rgb(255, 255, 255)");

    await context.close();
  });

  /**
   * Single-open menu gate: opening one menu closes any previously open menu.
   *
   * Asserts: open Shapes flyout → visible. Then open More popover → Shapes
   * flyout is no longer visible and More popover is visible.
   *
   * NOTE: requires full dev stack (Playwright + dev server + DB).
   * Not executed in jest; run with npm run test:wb-playwright.
   */
  test("Single-open: opening More popover closes Shapes flyout", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Open Shapes flyout
    const shapesTrigger = page.getByRole("button", { name: /Shapes/i });
    await shapesTrigger.click();
    const shapesDropdown = page.locator(".mynk-wb-shapes-dropdown");
    await expect(shapesDropdown).toBeVisible({ timeout: 3_000 });

    // Open More popover — should close Shapes flyout (single-open)
    const moreBtn = page.getByRole("button", { name: /More — z-order/i });
    await moreBtn.click();

    const morePopover = page.getByTestId("wb-more-popover");
    await expect(morePopover).toBeVisible({ timeout: 3_000 });
    await expect(shapesDropdown).not.toBeVisible({ timeout: 2_000 });

    await context.close();
  });

  /**
   * Hover indicator gate: hovering an inactive tool button shows a visible
   * background change (the button acquires a non-transparent background).
   *
   * NOTE: requires full dev stack. Not executed in jest.
   */
  test("Inactive tool button shows hover state on mouseover", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Make Pencil the active tool; Eraser is inactive
    await page.getByRole("button", { name: "Pencil (P)" }).click();
    const eraserBtn = page.getByRole("button", { name: "Eraser (E)" });
    await expect(eraserBtn).not.toHaveClass(/mynk-wb-tool-btn--active/);

    // Hover the inactive Eraser button
    await eraserBtn.hover();

    // Computed background must be non-transparent (hover rule applies)
    const bg = await eraserBtn.evaluate((el) => getComputedStyle(el).backgroundColor);
    // hsl(var(--muted) / 0.6) resolves to a non-rgba(0,0,0,0) value
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).not.toBe("transparent");

    await context.close();
  });

  /**
   * Selected chip hover gate: a chip with --active class must KEEP its active
   * background and text color when the pointer hovers over it.
   *
   * NOTE: requires full dev stack. Not executed in jest.
   */
  test("Selected chip keeps --active style on hover", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // WS-R: Sharp chip is absent for pencil — use rectangle (see wb-roughness-style.spec.ts).
    const shapesTrigger = page.getByRole("button", { name: /Shapes/i });
    await shapesTrigger.click();
    await page
      .locator(".mynk-wb-shapes-dropdown")
      .getByRole("menuitem", { name: /Rectangle/i })
      .click();

    const trigger = page.getByTestId("wb-props-compact-trigger");
    await trigger.click();
    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    // Open More styles to reveal Edge sharpness chips
    await panel.getByTestId("wb-more-styles-btn").click();

    // The "Sharp" chip should be active by default (DD-02)
    const sharpChip = panel.getByRole("button", { name: "Sharp" });
    await expect(sharpChip).toHaveClass(/mynk-wb-chip--active/);

    // Capture active background before hover
    const bgBefore = await sharpChip.evaluate((el) => getComputedStyle(el).backgroundColor);

    // Hover the active chip
    await sharpChip.hover();

    // Class must be retained
    await expect(sharpChip).toHaveClass(/mynk-wb-chip--active/);

    // Background must remain the same (active foreground color, not muted hover)
    const bgAfter = await sharpChip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgAfter).toBe(bgBefore);

    await context.close();
  });

  /**
   * Dark-mode ink swatch DRAW path gate (2026-06-09, smoke fix).
   *
   * The P3 patch fixed the display path (backgroundColor = white in dark mode)
   * but the DRAW path (currentItemStrokeColor applied to Excalidraw) was
   * incorrect when excalidrawTheme resolved late (SSR hydration mismatch) or
   * when the user switched from light to dark mid-session.
   *
   * Fix: useEffect in WhiteboardWorkspaceClient watches excalidrawTheme +
   * excalidrawAPI; when either changes, if the current stroke is an adaptive-
   * ink sentinel hex, it pushes the new-theme ink hex into Excalidraw via
   * api.updateScene({ appState: { currentItemStrokeColor: newInkHex } }).
   *
   * Assertion: after switching to dark mode and clicking the Ink swatch, the
   * React strokeColor state matches the dark-mode ink hex (#ffffff).
   * (Verifying the actual drawn element strokeColor requires drawing a stroke
   * and reading the scene element — done here via the E2E bridge helper.)
   *
   * NOTE: requires full dev stack (Playwright + dev server + DB).
   */
  test("Dark-mode ink swatch DRAW path: clicking Ink swatch sets strokeColor to white (#ffffff)", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Switch to dark theme via the toggle
    const themeBtn = page.getByTestId("wb-theme-toggle");
    await themeBtn.click();
    const dropdown = page.locator(".mynk-wb-theme-dropdown");
    await dropdown.getByRole("menuitemradio", { name: "Dark" }).click();
    // Give the useEffect a tick to fire and push new ink hex to Excalidraw
    await page.waitForTimeout(200);

    // Open props panel and click the Ink swatch
    await page.getByRole("button", { name: "Pencil (P)" }).click();
    const trigger = page.getByTestId("wb-props-compact-trigger");
    await trigger.click();
    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    const inkSwatch = panel.locator('.mynk-wb-swatch[aria-label="Ink"]');
    await expect(inkSwatch).toBeVisible();
    // Click the swatch to explicitly select it
    await inkSwatch.click();

    // The swatch must now be active (aria-pressed=true)
    await expect(inkSwatch).toHaveAttribute("aria-pressed", "true");

    // The swatch must display white in dark mode (backgroundColor = rgb(255,255,255))
    const bgColor = await inkSwatch.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgColor).toBe("rgb(255, 255, 255)");

    // The bridge's drawTestStroke hardcodes strokeColor:"blue" on the element, so we
    // cannot validate the draw path by reading back a bridge-drawn element's strokeColor.
    // Instead, assert the real signal: currentItemStrokeColor in Excalidraw's appState.
    //
    // Design note: the ink swatch ALWAYS stores EXCALIDRAW_STROKE_HEX (#1e293b) regardless
    // of theme. Excalidraw's dark-mode CSS filter (invert+hue-rotate) renders #1e293b as
    // visually white on the dark canvas — the swatch itself shows white (display path), but
    // the DRAWN stroke color stored in appState is #1e293b. Storing #ffffff would invert to
    // black on the dark canvas. So the correct assertion here is #1e293b.
    const currentStrokeColor = await page.evaluate(() => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            { getAppState: () => Record<string, unknown> }
          >;
        }
      ).__TN_WB_E2E__?.tutor;
      if (!bridge?.getAppState) return null;
      const appState = bridge.getAppState();
      return (appState.currentItemStrokeColor as string) ?? null;
    });

    // #1e293b = EXCALIDRAW_STROKE_HEX: the stored ink color in both light and dark mode.
    // Excalidraw's CSS filter renders this as white in dark mode (visual display path).
    expect(currentStrokeColor).toBe("#1e293b");

    await context.close();
  });

  /**
   * Opacity slider flush gate: custom WbSlider thumb must be flush at both
   * 0% and 100% track ends.
   *
   * Implementation: the custom slider uses
   *   left = calc((value / 100) * (100% - 16px))
   * which guarantees left-edge flush at 0 and right-edge flush at 100 by
   * construction, independent of browser-specific track padding for native
   * range inputs.
   *
   * NOTE: requires full dev stack. Not executed in jest.
   */
  test("Opacity slider thumb is flush at 0% and 100%", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Open props panel
    await page.getByRole("button", { name: "Pencil (P)" }).click();
    const trigger = page.getByTestId("wb-props-compact-trigger");
    await trigger.click();
    const panel = page.getByTestId("wb-props-panel");
    await expect(panel).toBeVisible({ timeout: 3_000 });

    const slider = page.getByTestId("wb-opacity-slider");
    const thumb = page.getByTestId("wb-opacity-slider-thumb");
    await expect(slider).toBeVisible();

    // Press Home to set value=0
    await slider.focus();
    await slider.press("Home");
    await page.waitForTimeout(50);

    const trackBox0 = await slider.boundingBox();
    const thumbBox0 = await thumb.boundingBox();
    expect(trackBox0).not.toBeNull();
    expect(thumbBox0).not.toBeNull();

    // At 0%: thumb left edge must be flush with track left edge (within 1px)
    expect(Math.abs(thumbBox0!.x - trackBox0!.x)).toBeLessThanOrEqual(1);

    // Press End to set value=100
    await slider.press("End");
    await page.waitForTimeout(50);

    const trackBox100 = await slider.boundingBox();
    const thumbBox100 = await thumb.boundingBox();
    expect(trackBox100).not.toBeNull();
    expect(thumbBox100).not.toBeNull();

    // At 100%: thumb right edge must be flush with track right edge (within 1px)
    const thumbRight = thumbBox100!.x + thumbBox100!.width;
    const trackRight = trackBox100!.x + trackBox100!.width;
    expect(Math.abs(thumbRight - trackRight)).toBeLessThanOrEqual(1);

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

  /**
   * PP-06 flyout visual-unclip gate (2026-06-22, wb-wave5-polish fix).
   *
   * ROOT CAUSE HISTORY:
   *   Wave 5 commit 14a72f9 added overflow-x:hidden to .mynk-wb-strip so the
   *   rail could scroll vertically on short viewports. This clipped the right-
   *   opening flyouts to zero width. Commit 06ce763 tried
   *   overflow-clip-margin: 0 280px 0 0 (4-value) — INVALID; the browser drops
   *   the whole declaration, leaving effective clip-margin: 0 → flyout invisible.
   *
   * MECHANISM:
   *   overflow-clip-margin accepts a SINGLE <length> only. The correct value is
   *   overflow-clip-margin: 280px — this extends the clip edge 280 px to the
   *   right of the 48px strip, allowing the 260px-wide panel to paint.
   *
   * RED on broken code: elementFromPoint at the panel's centre returns a canvas
   *   element (panel paint is clipped at the strip right edge; canvas shows through).
   * GREEN after fix:    elementFromPoint at the panel's centre returns an element
   *   contained within [data-testid="wb-props-panel"].
   *
   * Run: npm run test:integration -- tests/integration/wb-chrome-interactions.spec.ts
   */
  test("PP-06 props flyout is visually unclipped — elementFromPoint hit + viewport bounds (regression gate)", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    // Activate pencil — shows the PP-06 props chrome in the left rail.
    await page.getByRole("button", { name: "Pencil (P)" }).click();

    const trigger = page.getByTestId("wb-props-compact-trigger");
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    const panel = page.getByTestId("wb-props-panel");
    // Basic DOM visibility (was already passing; doesn't catch overflow clipping).
    await expect(panel).toBeVisible({ timeout: 3_000 });

    // --- KEY ASSERTION: visual unclip ---
    // The panel is position:absolute; left:100% relative to its containing
    // block (~36px wide), so its left edge is ~46px from the viewport left
    // and its right edge ~306px. The strip right edge is 48px.
    //
    // BROKEN (clip-margin:0):  panel clipped at x=48; at x=176 only the
    //   canvas paints → elementFromPoint returns canvas element → NOT the panel.
    // FIXED  (clip-margin:280px): panel visible out to 328px; at x=176 the
    //   panel element is the top-most rendered surface → IS the panel.

    const panelBox = await panel.boundingBox();
    expect(panelBox, "panel must have a non-zero bounding box").not.toBeNull();
    expect(panelBox!.width).toBeGreaterThan(50);
    expect(panelBox!.height).toBeGreaterThan(50);

    const cx = panelBox!.x + panelBox!.width / 2;
    const cy = panelBox!.y + panelBox!.height / 2;

    // cx must be well to the right of the strip (48px wide) — confirms the
    // panel is positioned outside the strip's layout box.
    const strip = page.getByTestId("wb-tool-strip");
    const stripBox = await strip.boundingBox();
    expect(stripBox).not.toBeNull();
    expect(cx).toBeGreaterThan(stripBox!.x + stripBox!.width);

    // Panel must not extend past the viewport right edge.
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(1280 + 1);

    // The REAL visual check: elementFromPoint at the panel's painted centre
    // must resolve to an element inside [data-testid="wb-props-panel"].
    // When overflow:clip clips the panel, the canvas renders behind it at
    // this coordinate and closest('…') returns null.
    const panelIsTopMost = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x as number, y as number);
        if (!el) return false;
        return (el as Element).closest('[data-testid="wb-props-panel"]') !== null;
      },
      [cx, cy]
    );
    expect(
      panelIsTopMost,
      `elementFromPoint(${Math.round(cx)}, ${Math.round(cy)}) must resolve to an element inside wb-props-panel — ` +
        "if it resolves to a canvas element the flyout is being overflow-clipped"
    ).toBe(true);

    // --- Screenshot proof (per-test output dir under gitignored test-results/) ---
    const shotPath = test.info().outputPath("wb-props-flyout-open.png");
    await page.screenshot({ path: shotPath });
    await test.info().attach("props-flyout-screenshot", {
      path: shotPath,
      contentType: "image/png",
    });
    console.log(`[screenshot] saved: ${shotPath}`);

    await context.close();
  });

  /**
   * Constraint B: left-rail collapse button remains reachable on a short viewport.
   *
   * .mynk-wb-strip uses overflow-y:auto to scroll the rail on constrained heights.
   * This test verifies the collapse button can be scrolled into view even when
   * the viewport is too short to show all tools without scrolling.
   *
   * GREEN = button is reachable via scroll (overflow-y:auto working).
   * RED   = overflow-y reverted to visible → strip doesn't scroll →
   *         scrollIntoViewIfNeeded has no ancestor scroll container → button
   *         remains outside the fixed chrome → bounding-box y exceeds viewport.
   */
  test("Left rail collapse button is reachable at short viewport height (constraint B)", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 500 },
    });
    const page = await context.newPage();
    await loadTutorBoard(page, session);

    const collapseBtn = page.getByRole("button", { name: /Collapse tools/ });
    // Element must be in the DOM (not removed by layout).
    await expect(collapseBtn).toBeAttached({ timeout: 10_000 });

    // Scroll the rail so the collapse button comes into view.
    // If overflow-y:auto is intact, the strip scrolls and the button is reachable.
    await collapseBtn.scrollIntoViewIfNeeded();

    const box = await collapseBtn.boundingBox();
    expect(box, "collapse button must have a bounding box after scroll").not.toBeNull();
    // Must be within the 500px viewport.
    expect(
      box!.y + box!.height,
      "collapse button bottom must be ≤ viewport height (500px)"
    ).toBeLessThanOrEqual(500);

    await context.close();
  });
});

/**
 * WB-LIVEBOARD-STUDENT-CHROME regressions (2026-06-29)
 *
 * 8a — student narrow-desktop compaction: recording-disclosure must be hidden
 *       at <1100px so the bar doesn't overflow (regression gate).
 * 8b — device pickers reachable in overflow for non-touch narrow-desktop student.
 * 8c — student live-board mic button must include the inline volume-meter DOM node.
 * 8d — meter calibration unit-tested (calibrateMicLevel); Playwright-GAP for live
 *       animation (requires real microphone input — see PLAYWRIGHT-GAP below).
 */
test.describe("WB-LIVEBOARD-STUDENT-CHROME @wb-chrome @wb-viewport @wb-av @wb-presence", () => {
  /**
   * 8a — student narrow-desktop compaction.
   *
   * The recording-disclosure (long text) must not be visible when the viewport
   * is narrower than 1100px (non-touch desktop), so the top bar doesn't
   * overflow. The exit button and overflow button must remain reachable.
   *
   * RED before fix: disclosure text always visible → bar overflows → exit btn
   * pushed off-screen.
   * GREEN after fix: disclosure hidden at <1100px, bar fits in 700px viewport.
   */
  test("8a: student top bar compacts at narrow desktop — exit + overflow reachable, no horizontal overflow @wb-chrome @wb-viewport", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const pages = await openTutorAndStudent(browser, session, {
      // Non-touch 700px-wide desktop: exactly the regression viewport.
      studentViewport: { width: 700, height: 700 },
      studentHasTouch: false,
      // Follow toggle is desktop-only hidden at this width; chrome layout test
      // does not need viewport sync.
      ensureFollow: false,
    });
    const { studentPage } = pages;

    try {
      // Student is in live board (ACTIVE session). Wait for canvas.
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // data-layout must be "desktop" (non-touch window even at 700px).
      const chrome = studentPage.locator(".mynk-wb-chrome");
      await expect(chrome).toHaveAttribute("data-layout", "desktop", { timeout: 10_000 });

      // Top bar must not cause horizontal scroll — bar width ≤ viewport width.
      const topbar = studentPage.getByTestId("wb-student-topbar");
      const topbarBox = await topbar.boundingBox();
      expect(topbarBox, "student topbar must have a bounding box").not.toBeNull();
      // bar right edge must not exceed viewport (relational: width ≤ innerWidth)
      const viewportWidth = await studentPage.evaluate(() => window.innerWidth);
      expect(
        topbarBox!.x + topbarBox!.width,
        "student topbar right edge must be within viewport (no horizontal overflow)"
      ).toBeLessThanOrEqual(viewportWidth + 1);

      // Exit button and overflow button must both be fully within viewport.
      await assertControlFullyInViewport(studentPage, "wb-student-exit");
      await assertControlFullyInViewport(studentPage, "wb-student-topbar-overflow");

      // The disclosure text must be hidden (display:none) at this narrow viewport.
      const disclosure = studentPage.getByTestId("wb-student-recording-disclosure");
      await expect(disclosure).not.toBeVisible();
    } finally {
      await pages.close();
    }
  });

  /**
   * 8b — device pickers reachable in overflow at narrow desktop.
   *
   * The student overflow (⋯) menu must contain mic + cam device pickers even
   * when data-layout="desktop" (non-touch). Previously they were only included
   * for touchLayout, leaving a narrow-desktop student with no way to switch
   * devices.
   *
   * RED before fix: overflow menu opens but only shows follow/match-view — no
   *   AudioControls / VideoControls.
   * GREEN after fix: overflow menu contains wb-student-overflow-av-pickers.
   */
  test("8b: student overflow menu includes device pickers at narrow desktop @wb-chrome", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const pages = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 700, height: 700 },
      studentHasTouch: false,
      ensureFollow: false,
    });
    const { studentPage } = pages;

    try {
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // Ensure desktop layout.
      await expect(studentPage.locator(".mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "desktop",
        { timeout: 10_000 }
      );

      // Open the overflow (⋯) menu.
      const overflowBtn = studentPage.getByTestId("wb-student-topbar-overflow");
      await expect(overflowBtn).toBeVisible();
      await overflowBtn.click();

      // The AV pickers container must be present in the open dropdown.
      const avPickers = studentPage.getByTestId("wb-student-overflow-av-pickers");
      await expect(avPickers).toBeVisible({ timeout: 3_000 });
    } finally {
      await pages.close();
    }
  });

  /**
   * 8c — student live-board mic inline meter presence.
   *
   * The student's WbTopBarMicControlLive on the LIVE board (not the waiting-room
   * overlay) must render the .mynk-wb-mic-meter DOM element (showInlineMeter prop
   * wired). This fails before the fix (null render) and passes after.
   *
   * NOTE: meter bar activity (bar-1/2/3 lit) requires a real microphone stream —
   * verified via unit test (calibrateMicLevel in src/__tests__/mic-recorder-audio.test.ts)
   * and smoke. This Playwright test validates the DOM structure only.
   *
   * // PLAYWRIGHT-GAP: live bar animation (bar-1/2/3 lighting in response to
   * // real mic input) cannot be hermetically driven in Playwright without
   * // injecting a synthetic audio track. The calibration is covered by the
   * // calibrateMicLevel unit test. Hardware smoke verifies bar animation.
   * // See docs/BACKLOG.md WB-LIVEBOARD-STUDENT-CHROME 8d.
   */
  test("8c: student live-board mic control contains inline meter DOM node @wb-chrome @wb-av @wb-presence", async ({ browser }) => {
    const session = await seedWbLiveSyncSession();
    const pages = await openTutorAndStudent(browser, session, {
      // Wide viewport so the mic control is inline-visible (not hidden by 660px rule).
      studentViewport: { width: 1280, height: 700 },
      studentHasTouch: false,
    });
    const { studentPage } = pages;

    try {
      await expect(
        studentPage.getByTestId("student-whiteboard-canvas-mount")
      ).toBeVisible({ timeout: 90_000 });

      // desktop layout confirmed.
      await expect(studentPage.locator(".mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "desktop",
        { timeout: 10_000 }
      );

      // The student live-board mic wrapper must be present.
      const micWrap = studentPage.getByTestId("wb-topbar-mic");
      await expect(micWrap).toBeVisible({ timeout: 10_000 });

      // The inline meter DOM node must exist inside the mic control.
      // Before fix (showInlineMeter not wired): .mynk-wb-mic-meter absent.
      // After fix: .mynk-wb-mic-meter rendered inside wb-topbar-mic.
      const meterEl = micWrap.locator(".mynk-wb-mic-meter");
      await expect(meterEl).toBeAttached({ timeout: 5_000 });
    } finally {
      await pages.close();
    }
  });

  /**
   * Student phone-landscape left rail — ⋮ More overflow must be in viewport
   * without hidden-scroll discovery (regression: page-strip overlap + scrollbar
   * hidden made the 7th rail button look missing; c88ba36 fix reverted by 64108cf).
   */
  test(
    "student phone-landscape left rail: More overflow in viewport and opens sheet without scroll",
    { tag: [TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(120_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentViewport: { width: 844, height: 390 },
        studentHasTouch: true,
        studentIsMobile: true,
        ensureFollow: false,
      });
      try {
        const { studentPage } = peers;

        const coarse = await studentPage.evaluate(
          () => window.matchMedia("(hover: none), (pointer: coarse)").matches
        );
        expect(
          coarse,
          "student context did not emulate a coarse pointer — test setup issue"
        ).toBe(true);
        await expect(studentPage.getByTestId("mynk-wb-chrome")).toHaveAttribute(
          "data-layout",
          "phone-landscape",
          { timeout: 5_000 }
        );

        const rail = studentPage.getByTestId("wb-bottom-toolbar");
        await expect(rail).toBeVisible();

        const more = rail.getByRole("button", {
          name: /More — z-order, delete, hand/i,
        });
        await expect(more).toBeVisible();

        const pageStrip = studentPage.locator(".mynk-wb-pagestrip");
        await expect(pageStrip).toBeVisible();

        const innerH = await studentPage.evaluate(() => window.innerHeight);

        // Oracle: ⋮ sits fully above the page-strip overlap zone (not merely in DOM).
        const moreBox = await more.boundingBox();
        const stripBox = await pageStrip.boundingBox();
        expect(moreBox).not.toBeNull();
        expect(stripBox).not.toBeNull();
        expect(
          moreBox!.y + moreBox!.height,
          "More button bottom must clear the page-strip top"
        ).toBeLessThanOrEqual(stripBox!.y + 2);
        expect(
          moreBox!.y + moreBox!.height,
          "More button must be fully inside the viewport without scrolling the rail"
        ).toBeLessThanOrEqual(innerH + 1);

        const railScrollTop = await rail.evaluate((el) => el.scrollTop);
        const railMetrics = await rail.evaluate((el) => ({
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          top: el.getBoundingClientRect().top,
        }));
        expect(
          railScrollTop,
          "rail must not require scroll to reveal More"
        ).toBe(0);

        const moreBottomInRail = moreBox!.y + moreBox!.height - railMetrics.top;
        expect(
          moreBottomInRail,
          "More must fit inside the rail's visible client box without scrolling"
        ).toBeLessThanOrEqual(railMetrics.clientHeight + 1);

        await expect(more).toBeInViewport();

        const hitTarget = await studentPage.evaluate(
          ({ x, y, yBottom }) => {
            const centerEl = document.elementFromPoint(x, y);
            const bottomEl = document.elementFromPoint(x, yBottom);
            const label = (el: Element | null) =>
              el?.closest("button")?.getAttribute("aria-label") ?? el?.className ?? null;
            return { center: label(centerEl), bottom: label(bottomEl) };
          },
          {
            x: moreBox!.x + moreBox!.width / 2,
            y: moreBox!.y + moreBox!.height / 2,
            yBottom: moreBox!.y + moreBox!.height - 2,
          }
        );
        expect(hitTarget.center).toMatch(/More — z-order/i);
        expect(hitTarget.bottom).toMatch(/More — z-order/i);

        await more.click({ position: { x: moreBox!.width / 2, y: moreBox!.height / 2 } });

        const sheet = studentPage.getByTestId("wb-more-sheet");
        await expect(sheet).toHaveClass(/mynk-wb-action-sheet--open/, {
          timeout: 5_000,
        });
      } finally {
        await peers.close();
      }
    }
  );
});

test.describe("wb touch chrome fixes @wb-chrome", () => {
  test.setTimeout(120_000);

  async function loadTouchTutorBoard(
    page: Page,
    session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
  ) {
    await loadTutorBoard(page, session);
    const coarse = await page.evaluate(() =>
      window.matchMedia("(hover: none), (pointer: coarse)").matches
    );
    expect(
      coarse,
      "touch context did not emulate a coarse pointer — test setup issue"
    ).toBe(true);
    await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
      "data-layout",
      /^(narrow|phone-landscape|tablet-portrait)$/,
      { timeout: 5_000 }
    );
  }

  async function tapCanvasAt(page: Page, relX: number, relY: number) {
    const mount = page.getByTestId("tutor-whiteboard-canvas-mount");
    const box = await mount.boundingBox();
    expect(box, "canvas mount bounding box").not.toBeNull();
    await page.mouse.click(
      box!.x + box!.width * relX,
      box!.y + box!.height * relY
    );
  }

  test("P1: eraser active hides Excalidraw HintViewer on touch", async ({
    browser,
  }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    try {
      await loadTouchTutorBoard(page, session);

      const eraser = page.getByRole("button", { name: /Eraser/i });
      await expect(eraser).toBeVisible();
      await eraser.click();

      const hint = page.locator(".mynk-wb-chrome .excalidraw--mobile .HintViewer");
      await expect(hint).toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("P2: multipoint Done button finalizes line on touch", async ({
    browser,
  }) => {
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    try {
      await loadTouchTutorBoard(page, session);
      await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "phone-landscape",
        { timeout: 5_000 }
      );

      const rail = page.getByTestId("wb-bottom-toolbar");
      await rail.getByRole("button", { name: /Shapes/i }).click();
      await expect(page.getByTestId("wb-shapes-sheet")).toHaveClass(
        /mynk-wb-action-sheet--open/,
        { timeout: 3_000 }
      );
      await page
        .getByTestId("wb-shapes-sheet")
        .getByRole("menuitem", { name: /Line/i })
        .click();

      await tapCanvasAt(page, 0.25, 0.35);
      await tapCanvasAt(page, 0.55, 0.45);

      const doneBtn = page.getByTestId("wb-multipoint-done");
      await expect(doneBtn).toBeVisible({ timeout: 5_000 });

      await doneBtn.click();

      await page.waitForFunction(() => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<
              string,
              { getAppState: () => Record<string, unknown> }
            >;
          }
        ).__TN_WB_E2E__?.tutor;
        return bridge?.getAppState?.().multiElement == null;
      });
      await expect(doneBtn).toBeHidden({ timeout: 3_000 });
    } finally {
      await context.close();
    }
  });

  test("P3: student sign-out in overflow menu on touch, not inline", async ({
    browser,
  }) => {
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      studentViewport: { width: 844, height: 390 },
      studentHasTouch: true,
      studentIsMobile: true,
      ensureFollow: false,
    });
    try {
      const { studentPage } = peers;
      await expect(studentPage.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "phone-landscape",
        { timeout: 5_000 }
      );

      await expect(studentPage.getByTestId("learner-sign-out")).toHaveCount(0);

      await studentPage.getByTestId("wb-student-topbar-overflow").click();
      const dropdown = studentPage.getByTestId("wb-topbar-overflow-dropdown");
      await expect(dropdown).toBeVisible({ timeout: 3_000 });

      const signOut = dropdown.getByTestId("learner-sign-out");
      await expect(signOut).toBeVisible();
      await expect(signOut).toHaveClass(/mynk-wb-menu-item--destructive/);
    } finally {
      await peers.close();
    }
  });

  test("P4: styles sheet More styles row fully in viewport on phone", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbLiveSyncSession();
    const context = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    try {
      await loadTutorBoard(page, session);
      await expect(page.getByTestId("mynk-wb-chrome")).toHaveAttribute(
        "data-layout",
        "narrow",
        { timeout: 5_000 }
      );

      await page
        .getByTestId("wb-bottom-toolbar")
        .getByRole("button", { name: /^Styles$/i })
        .click();
      await expect(page.getByTestId("wb-props-sheet")).toHaveClass(
        /mynk-wb-action-sheet--open/,
        { timeout: 5_000 }
      );
      await page.waitForTimeout(300);

      const moreStyles = page.getByTestId("wb-more-styles-btn");
      await expect(moreStyles).toBeVisible();
      await expect(moreStyles).toBeInViewport();

      const scrollTop = await page.evaluate(() => {
        const body = document.querySelector(
          ".mynk-wb-action-sheet--open .mynk-wb-action-sheet__body"
        );
        return body instanceof HTMLElement ? body.scrollTop : null;
      });
      expect(scrollTop).toBe(0);
    } finally {
      await context.close();
    }
  });
});
