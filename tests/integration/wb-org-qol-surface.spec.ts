/**
 * QoL surfaces that were built without a named Playwright oracle:
 * board rename, image-as-board, math keyboard vs backdrop, modifier hints,
 * graph y= entry, tutor tile name, chat once-per-line, laser not persisted.
 */
import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  openTutorAndStudent,
  readGraphElementState,
  readSceneElementIds,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";

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
  test("tutor can rename the current board", { tag: [TAG.WB_CHROME] }, async ({ page }) => {
    test.setTimeout(120_000);
    await openTutorBoard(page);
    await page.locator("nextjs-portal").evaluateAll((nodes) => {
      for (const node of nodes) (node as HTMLElement).style.pointerEvents = "none";
    });
    const boards = page.getByRole("tablist", { name: "Boards" });
    await boards.getByRole("tab", { name: "Board 1" }).hover();
    await boards.getByRole("button", { name: "Rename Board 1" }).click();
    const nameField = boards.getByRole("textbox", { name: "Name for Board 1" });
    await nameField.fill("Homework");
    await nameField.press("Enter");
    await expect(boards.getByRole("tab", { name: "Homework" })).toBeVisible();
    await expect(boards.getByRole("tab", { name: "Board 1" })).toHaveCount(0);
  });

  test("an image file becomes its own board", { tag: [TAG.WB_ASSETS, TAG.WB_CHROME] }, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTutorBoard(page);
    await page.getByTestId("wb-insert-asset-btn").click();
    await page.getByTestId("wb-insert-file-input").setInputFiles({
      name: "diagram.png",
      mimeType: "image/png",
      buffer: PNG_1X1,
    });
    await expect(page.getByText("Inserted the image as a new board.")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("tab", { name: "diagram" })).toBeVisible();
    await expect(page.getByTestId("wb-board-tab-image-icon")).toBeVisible();
  });

  test(
    "the math keyboard does not dismiss the equation dialog; the backdrop does",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await openTutorBoard(page);
      await page.getByTestId("wb-insert-math-btn").click();
      const dialog = page.getByTestId("wb-math-dialog");
      await expect(dialog).toBeVisible();
      await page.evaluate(() => {
        const scrim = document.querySelector('[aria-labelledby="wb-math-title"]');
        const key = document.createElement("div");
        key.className = "ML__keyboard";
        key.dataset.testid = "fake-math-keyboard";
        key.textContent = "keyboard";
        key.style.width = "180px";
        key.style.height = "64px";
        scrim?.appendChild(key);
      });
      await page.getByTestId("fake-math-keyboard").dispatchEvent("mousedown");
      await expect(dialog).toBeVisible();
      const scrim = page.locator('[aria-labelledby="wb-math-title"]');
      await scrim.click({ position: { x: 8, y: 8 } });
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
        // The Chat control sits on the bottom corner of the canvas. A coordinate
        // click is swallowed by overlapping board chrome (same as board tabs);
        // dispatching click on the button is the press a user makes on "Chat".
        const openChat = async (page: import("@playwright/test").Page) => {
          const toggle = page.getByRole("button", { name: "Chat", exact: true });
          await expect(toggle).toBeVisible();
          await toggle.evaluate((el) => (el as HTMLButtonElement).click());
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
