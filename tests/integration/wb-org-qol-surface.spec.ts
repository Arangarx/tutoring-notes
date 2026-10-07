/**
 * QoL surfaces that were built without a named Playwright oracle:
 * board rename, image-as-board, math keyboard vs backdrop, modifier hints,
 * graph y= entry, tutor tile name, chat once-per-line, laser not persisted.
 */
import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  injectStaleHandleChange,
  openTutorAndStudent,
  readActiveWhiteboardPageId,
  readGraphElementState,
  readPageDataBucketIds,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  waitForElementOnPeer,
  waitForTutorStudentConnected,
  waitUntilPageFingerprintClear,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { BOARD_TITLE_MAX_LENGTH } from "@/lib/whiteboard/board-title";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function openTutorBoard(page: import("@playwright/test").Page) {
  const session = await seedWbLiveSyncSession();
  await page.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
  return session;
}

test.describe("whiteboard QoL surfaces", () => {
  test("tutor can rename the current board", { tag: [TAG.WB_CHROME, TAG.WB_SYNC] }, async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await waitForTutorStudentConnected(peers.tutorPage);
      const boards = peers.tutorPage.getByRole("tablist", { name: "Boards" });
      await boards.getByRole("tab", { name: "Board 1" }).hover();
      await boards.getByRole("button", { name: "Rename Board 1" }).click();
      const nameField = boards.getByRole("textbox", { name: "Name for Board 1" });
      await expect(nameField).toHaveAttribute("maxLength", String(BOARD_TITLE_MAX_LENGTH));
      await nameField.evaluate((el) => el.removeAttribute("maxlength"));
      const oversize = "H".repeat(BOARD_TITLE_MAX_LENGTH + 20);
      await nameField.fill(oversize);
      await nameField.press("Enter");
      const capped = "H".repeat(BOARD_TITLE_MAX_LENGTH);
      await expect(boards.getByRole("tab", { name: capped })).toBeVisible();
      await expect(boards.getByRole("tab", { name: "Board 1" })).toHaveCount(0);
      await expect(
        peers.studentPage.getByRole("tab", { name: capped })
      ).toBeVisible({ timeout: 20_000 });
      await peers.tutorPage.reload({ waitUntil: "domcontentloaded" });
      await waitForWbE2eBridge(peers.tutorPage, "tutor");
      await expect(
        peers.tutorPage.getByRole("tab", { name: capped })
      ).toBeVisible({ timeout: 30_000 });
      await peers.studentPage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        peers.studentPage.getByRole("tab", { name: capped })
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await peers.close();
    }
  });

  test(
    "an image file becomes its own board and does not keep the anchor stroke",
    { tag: [TAG.WB_ASSETS, TAG.WB_CHROME, TAG.WB_SYNC, TAG.WB_STROKES] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForTutorStudentConnected(peers.tutorPage);
        const anchorStrokeId = `img-anchor-${Date.now()}`;
        await drawTestStrokeOnRole(
          peers.tutorPage,
          "tutor",
          anchorStrokeId,
          80,
          80,
          200,
          200
        );
        await waitForElementOnPeer(peers.tutorPage, "tutor", anchorStrokeId, 15_000);
        const anchorScene = await peers.tutorPage.evaluate(() => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<
                string,
                { getElements?: () => unknown[] }
              >;
            }
          ).__TN_WB_E2E__?.tutor;
          return JSON.parse(JSON.stringify(bridge?.getElements?.() ?? [])) as unknown[];
        });
        const anchorPageId = await readActiveWhiteboardPageId(peers.tutorPage);

        await peers.tutorPage.getByTestId("wb-insert-asset-btn").click();
        await peers.tutorPage.getByTestId("wb-insert-file-input").setInputFiles({
          name: "diagram.png",
          mimeType: "image/png",
          buffer: PNG_1X1,
        });
        await expect(
          peers.tutorPage.getByText("Inserted the image as a new board.")
        ).toBeVisible({ timeout: 60_000 });
        const imageTab = peers.tutorPage.getByRole("tab", { name: "diagram" });
        await expect(imageTab).toBeVisible();
        await expect(imageTab).toHaveAttribute("aria-selected", "true");
        await expect(peers.tutorPage.getByTestId("wb-board-tab-image-icon")).toBeVisible();

        const imagePageId = await readActiveWhiteboardPageId(peers.tutorPage);
        expect(imagePageId).not.toBe(anchorPageId);
        const imageSummary = await readSceneElementSummary(peers.tutorPage, "tutor");
        expect(imageSummary).toHaveLength(1);
        expect(imageSummary[0]?.type).toBe("image");
        expect(imageSummary.map((el) => el.id)).not.toContain(anchorStrokeId);
        const imageBucket = await readPageDataBucketIds(peers.tutorPage, imagePageId);
        expect(imageBucket).toEqual(imageSummary.map((el) => el.id));
        expect(imageBucket).not.toContain(anchorStrokeId);

        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        const anchorAfter = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(anchorAfter).toContain(anchorStrokeId);
        await clickBoardPageTab(peers.tutorPage, "tutor", "diagram");
        const imageAfterRoundTrip = await readSceneElementSummary(peers.tutorPage, "tutor");
        expect(imageAfterRoundTrip).toHaveLength(1);
        expect(imageAfterRoundTrip[0]?.type).toBe("image");
        expect(imageAfterRoundTrip.map((el) => el.id)).not.toContain(anchorStrokeId);

        await expect(
          peers.studentPage.getByRole("tab", { name: "diagram" })
        ).toBeVisible({ timeout: 20_000 });
        await expect
          .poll(async () => {
            const summary = await readSceneElementSummary(peers.studentPage, "student");
            return summary.map((el) => el.type);
          })
          .toEqual(["image"]);
        const studentIds = await readSceneElementIds(peers.studentPage, "student");
        expect(studentIds).not.toContain(anchorStrokeId);

        await waitUntilPageFingerprintClear(peers.tutorPage, imagePageId);
        await injectStaleHandleChange(peers.tutorPage, anchorScene);
        const bucketAfterStale = await readPageDataBucketIds(peers.tutorPage, imagePageId);
        expect(bucketAfterStale).not.toContain(anchorStrokeId);
        const liveAfterStale = await readSceneElementIds(peers.tutorPage, "tutor");
        expect(liveAfterStale).not.toContain(anchorStrokeId);
        expect(liveAfterStale).toHaveLength(1);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "the math keyboard does not dismiss the equation dialog; the backdrop does",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1400, height: 1200 });
      await openTutorBoard(page);
      await page.getByTestId("wb-insert-math-btn").click();
      const dialog = page.getByTestId("wb-math-dialog");
      await expect(dialog).toBeVisible();
      const mathField = page.locator("math-field");
      await expect(mathField).toBeVisible({ timeout: 30_000 });
      await mathField.locator(".ML__virtual-keyboard-toggle").click();
      const keyboard = page.locator("body > .ML__keyboard.is-visible");
      await expect(keyboard).toBeVisible({ timeout: 15_000 });
      const keyPoint = await page.evaluate(() => {
        const ih = window.innerHeight;
        const iw = window.innerWidth;
        for (let y = ih - 12; y > ih * 0.45; y -= 10) {
          for (let x = Math.floor(iw * 0.25); x < iw * 0.75; x += 16) {
            const hit = document.elementFromPoint(x, y);
            const key = hit?.closest(".MLK__keycap");
            if (!(key instanceof HTMLElement)) continue;
            const label = (key.getAttribute("aria-label") || "").trim();
            if (!/^[0-9]$/.test(label)) continue;
            const rect = key.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              label,
            };
          }
        }
        return null;
      });
      expect(keyPoint, "a digit key under the pointer on the real MathLive keyboard").not.toBeNull();
      await page.mouse.move(keyPoint!.x, keyPoint!.y);
      await page.mouse.down();
      await page.mouse.up();
      await expect(dialog).toBeVisible();
      await expect
        .poll(async () =>
          mathField.evaluate((el) => (el as { value?: string }).value ?? "")
        )
        .toContain(keyPoint!.label);

      const scrimPoint = await page.evaluate(() => {
        const scrim = document.querySelector('[aria-labelledby="wb-math-title"]');
        const dialogEl = document.querySelector('[data-testid="wb-math-dialog"]');
        const keyboardEl = document.querySelector("body > .ML__keyboard");
        if (!(scrim instanceof HTMLElement)) return null;
        const scrimBox = scrim.getBoundingClientRect();
        for (let y = scrimBox.top + 4; y < scrimBox.bottom; y += 12) {
          for (let x = scrimBox.left + 4; x < scrimBox.right; x += 12) {
            const hit = document.elementFromPoint(x, y);
            if (hit === scrim) {
              const inDialog = dialogEl?.contains(hit) ?? false;
              const inKeyboard = keyboardEl?.contains(hit) ?? false;
              if (!inDialog && !inKeyboard) return { x, y };
            }
          }
        }
        return null;
      });
      expect(scrimPoint, "a backdrop point outside the dialog and keyboard").not.toBeNull();
      await page.mouse.click(scrimPoint!.x, scrimPoint!.y);
      await expect(dialog).toBeHidden();
    }
  );

  test("modifier hints sit in the lower part of the board and name Shift and Space", {
    tag: [TAG.WB_CHROME],
  }, async ({ page }) => {
    test.setTimeout(120_000);
    await openTutorBoard(page);
    const hints = page.getByTestId("wb-modifier-hints");
    await expect(hints).toBeVisible();
    await expect(hints).toContainText("Shift");
    await expect(hints).toContainText("Square or circle");
    await expect(hints).toContainText("Space");
    await expect(hints).toContainText("Pan");
    const hintsBox = await hints.boundingBox();
    const canvas = await page.getByTestId("tutor-whiteboard-canvas-mount").boundingBox();
    expect(hintsBox).not.toBeNull();
    expect(canvas).not.toBeNull();
    const hintsMidY = hintsBox!.y + hintsBox!.height / 2;
    const canvasMidY = canvas!.y + canvas!.height / 2;
    expect(hintsMidY).toBeGreaterThan(canvasMidY);
    expect(hintsBox!.x).toBeGreaterThan(canvas!.x);
    expect(hintsBox!.x + hintsBox!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 8);
  });

  test("plotting y= stores that expression on the graph", { tag: [TAG.WB_GRAPH] }, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTutorBoard(page);
    const before = new Set(await readSceneElementIds(page, "tutor"));
    await page.getByTestId("wb-insert-graph").click();
    await page.getByRole("button", { name: "Plot expression" }).click();
    await expect(page.getByTestId("wb-graph-expr-y-prefix")).toHaveText("y=");
    await page.getByTestId("wb-graph-expr-input").fill("2*x+1");
    await page.getByTestId("wb-graph-insert").click();
    let graphId = "";
    await expect
      .poll(async () => {
        const ids = await readSceneElementIds(page, "tutor");
        graphId = ids.find((id) => !before.has(id)) ?? "";
        return graphId;
      })
      .not.toBe("");
    const state = await readGraphElementState(page, "tutor", graphId);
    expect(state?.expressions).toContain("2*x+1");
  });

  test(
    "the student's view of the tutor tile shows the tutor's name",
    { tag: [TAG.WB_AV, TAG.WB_PRESENCE] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const prisma = new PrismaClient();
      let tutorName = "";
      try {
        const admin = await prisma.adminUser.findUnique({
          where: { id: session.adminUserId },
          select: { displayName: true },
        });
        tutorName = admin?.displayName?.trim() ?? "";
      } finally {
        await prisma.$disconnect();
      }
      expect(tutorName.length).toBeGreaterThan(0);
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForTutorStudentConnected(peers.tutorPage);
        const tutorLabels = peers.studentPage.locator("[data-testid^='av-tile-label-']");
        await expect(tutorLabels.filter({ hasText: tutorName })).toHaveCount(1, {
          timeout: 60_000,
        });
        await expect(tutorLabels.filter({ hasText: /^Tutor$/ })).toHaveCount(0);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "a chat line shows once for the sender and once for the peer",
    { tag: [TAG.WB_SYNC, TAG.WB_PRESENCE] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForTutorStudentConnected(peers.tutorPage);
        const line = "bridge is up";
        const openChat = async (page: import("@playwright/test").Page) => {
          const toggle = page.getByTestId("wb-session-chat-toggle");
          await expect(toggle).toBeVisible();
          const box = await toggle.boundingBox();
          expect(box, "chat toggle box").not.toBeNull();
          const center = {
            x: box!.x + box!.width / 2,
            y: box!.y + box!.height / 2,
          };
          const topId = await page.evaluate(({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            return hit?.closest("[data-testid='wb-session-chat-toggle']")
              ? "wb-session-chat-toggle"
              : (hit?.tagName ?? "none");
          }, center);
          expect(topId, "chat toggle is the element under the pointer").toBe(
            "wb-session-chat-toggle"
          );
          await page.mouse.click(center.x, center.y);
          await expect(page.getByTestId("wb-session-chat-panel")).toBeVisible();
        };
        await openChat(peers.tutorPage);
        await peers.tutorPage.getByTestId("wb-session-chat-input").fill(line);
        await peers.tutorPage
          .getByTestId("wb-session-chat-panel")
          .getByRole("button", { name: "Send" })
          .click();
        const tutorLines = peers.tutorPage
          .locator(".mynk-wb-session-chat__msg")
          .filter({ hasText: line });
        await expect(tutorLines).toHaveCount(1);
        await openChat(peers.studentPage);
        const studentLines = peers.studentPage
          .locator(".mynk-wb-session-chat__msg")
          .filter({ hasText: line });
        await expect(studentLines).toHaveCount(1, { timeout: 20_000 });
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "a laser drag does not add a stroke to either scene",
    { tag: [TAG.WB_STROKES, TAG.WB_SYNC] },
    async ({ browser }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await waitForTutorStudentConnected(peers.tutorPage);
        const beforeTutor = await readSceneElementIds(peers.tutorPage, "tutor");
        const beforeStudent = await readSceneElementIds(peers.studentPage, "student");
        await peers.tutorPage.getByRole("button", { name: "Pointer wand (K)" }).click();
        const canvas = peers.tutorPage.getByTestId("tutor-whiteboard-canvas-mount");
        const box = await canvas.boundingBox();
        expect(box).not.toBeNull();
        await peers.tutorPage.mouse.move(box!.x + 90, box!.y + 90);
        await peers.tutorPage.mouse.down();
        await peers.tutorPage.mouse.move(box!.x + 220, box!.y + 160, { steps: 6 });
        await peers.tutorPage.mouse.up();
        await peers.tutorPage.waitForTimeout(800);
        const tutorTypes = await peers.tutorPage.evaluate(() => {
          const bridge = (
            window as Window & {
              __TN_WB_E2E__?: Record<string, { getElements?: () => { type?: string }[] }>;
            }
          ).__TN_WB_E2E__?.tutor;
          return bridge?.getElements?.().map((el) => el.type) ?? [];
        });
        expect(tutorTypes).not.toContain("laser");
        expect(await readSceneElementIds(peers.tutorPage, "tutor")).toEqual(beforeTutor);
        expect(await readSceneElementIds(peers.studentPage, "student")).toEqual(beforeStudent);
      } finally {
        await peers.close();
      }
    }
  );
});
