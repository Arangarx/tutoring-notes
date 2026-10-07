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
  readImageElementState,
  readPageDataBucketIds,
  readSceneElementIds,
  readSceneElementSummary,
  seedWbLiveSyncSession,
  startSessionAsTutor,
  waitForElementOnPeer,
  waitForTutorStudentConnected,
  waitUntilPageFingerprintClear,
  waitForWbE2eBridge,
  readViewportSnapshot,
} from "./whiteboard-live-sync.helpers";
import { viewportCoordsToSceneCoords } from "@/lib/whiteboard/excalidraw-viewport-coords";
import { BOARD_TITLE_MAX_LENGTH } from "@/lib/whiteboard/board-title";
import {
  createEmptyEventLog,
  findActiveReplayPageIdAt,
  type WBEvent,
} from "@/lib/whiteboard/event-log";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Chat toggle must be the hit target, and the hint box must not cover it. */
async function expectChatToggleClearOfModifierHints(
  page: import("@playwright/test").Page
) {
  const hints = page.getByTestId("wb-modifier-hints");
  const toggle = page.getByTestId("wb-session-chat-toggle");
  await expect(hints).toBeVisible();
  await expect(toggle).toBeVisible();
  const hintsBox = await hints.boundingBox();
  const toggleBox = await toggle.boundingBox();
  expect(hintsBox, "modifier hint box").not.toBeNull();
  expect(toggleBox, "chat toggle box").not.toBeNull();
  const separated =
    hintsBox!.x + hintsBox!.width <= toggleBox!.x + 1 ||
    toggleBox!.x + toggleBox!.width <= hintsBox!.x + 1 ||
    hintsBox!.y + hintsBox!.height <= toggleBox!.y + 1 ||
    toggleBox!.y + toggleBox!.height <= hintsBox!.y + 1;
  expect(separated, "modifier hints must not intersect the chat toggle").toBe(true);
  const center = {
    x: toggleBox!.x + toggleBox!.width / 2,
    y: toggleBox!.y + toggleBox!.height / 2,
  };
  const topId = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest("[data-testid='wb-session-chat-toggle']")) {
      return "wb-session-chat-toggle";
    }
    const testId = hit?.getAttribute?.("data-testid");
    return testId ? `${hit?.tagName}#${testId}` : (hit?.tagName ?? "none");
  }, center);
  expect(topId, "chat toggle is the element under the pointer").toBe(
    "wb-session-chat-toggle"
  );
}

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
      // Reload persistence is WB-RENAME-PERSIST. The live strip is what this covers.
    } finally {
      await peers.close();
    }
  });

  test(
    "a rename does not drop a board added in the same moment",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await openTutorBoard(page);
      const boards = page.getByRole("tablist", { name: "Boards" });
      await boards.getByRole("tab", { name: "Board 1" }).hover();
      await boards.getByRole("button", { name: "Rename Board 1" }).click();
      const nameField = boards.getByRole("textbox", { name: "Name for Board 1" });
      await nameField.fill("Algebra");
      await nameField.press("Enter");
      await expect(nameField).toBeHidden();
      await boards.getByRole("button", { name: "Add board" }).click();
      await expect(boards.getByRole("tab", { name: "Algebra" })).toBeVisible();
      await expect(boards.getByRole("tab", { name: "Board 2", exact: true })).toBeVisible();
    }
  );

  test(
    "a renamed board title survives reload after a later stroke batch",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(180_000);
      const session = await openTutorBoard(page);
      const boards = page.getByRole("tablist", { name: "Boards" });
      await boards.getByRole("tab", { name: "Board 1" }).hover();
      await boards.getByRole("button", { name: "Rename Board 1" }).click();
      const nameField = boards.getByRole("textbox", { name: "Name for Board 1" });
      await nameField.fill("Algebra");
      await nameField.press("Enter");
      await expect(boards.getByRole("tab", { name: "Algebra" })).toBeVisible();

      await drawTestStrokeOnRole(page, "tutor", "rename-persist-stroke", 80, 80, 180, 160);

      const prisma = new PrismaClient();
      try {
        await expect
          .poll(
            async () => {
              const latest = await prisma.whiteboardEventBatch.findFirst({
                where: { whiteboardSessionId: session.whiteboardSessionId },
                orderBy: { batchSeq: "desc" },
                select: { boardDocumentJson: true },
              });
              const doc = latest?.boardDocumentJson as {
                pageList?: Array<{ title?: string }>;
              } | null;
              return doc?.pageList?.some((entry) => entry.title === "Algebra") ?? false;
            },
            { timeout: 30_000 }
          )
          .toBe(true);
      } finally {
        await prisma.$disconnect();
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await expect(page.getByRole("tab", { name: "Algebra" })).toBeVisible({
        timeout: 20_000,
      });
    }
  );

  test(
    "renaming a board before Start does not change the replay active page",
    { tag: [TAG.WB_CHROME, TAG.WB_RECORDING] },
    async ({ page }) => {
      test.setTimeout(180_000);
      const session = await seedWbLiveSyncSession({
        sessionPhase: "PENDING",
        sessionMode: "IN_PERSON",
      });
      const hydrationErrors: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        if (
          text.includes("hydrated but some attributes") ||
          text.includes("hydration-mismatch")
        ) {
          hydrationErrors.push(text);
        }
      });
      await page.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      const boards = page.getByRole("tablist", { name: "Boards" });
      // The waiting room covers the strip until Start. Hide it only so the
      // rename can be clicked; phase stays pending and recording stays off.
      // Cancel stays disabled until the workspace hydration latch flips, so
      // this wait is "React is listening." Writing display:none before that
      // mismatches the SSR overlay and the dev error overlay eats the click.
      await expect(page.getByTestId("wb-waiting-cancel")).toBeEnabled({
        timeout: 30_000,
      });
      await page.evaluate(() => {
        const overlay = document.querySelector('[data-testid="wb-waiting-overlay"]');
        if (overlay instanceof HTMLElement) overlay.style.display = "none";
      });
      await boards.getByRole("tab", { name: "Board 1" }).hover();
      await boards.getByRole("button", { name: "Rename Board 1" }).click();
      const nameField = boards.getByRole("textbox", { name: "Name for Board 1" });
      await nameField.fill("Algebra");
      await nameField.press("Enter");
      await expect(boards.getByRole("tab", { name: "Algebra" })).toBeVisible();
      expect(hydrationErrors).toEqual([]);
      await page.evaluate(() => {
        const overlay = document.querySelector('[data-testid="wb-waiting-overlay"]');
        if (overlay instanceof HTMLElement) overlay.style.display = "";
      });
      await startSessionAsTutor(page);
      const prisma = new PrismaClient();
      try {

        let events: Array<{ type?: string; t?: number }> = [];
        await expect
          .poll(
            async () => {
              const rows = await prisma.whiteboardEventBatch.findMany({
                where: { whiteboardSessionId: session.whiteboardSessionId },
                orderBy: { fromEventIndex: "asc" },
                select: { eventsJson: true },
              });
              events = rows.flatMap((row) => {
                const parsed = row.eventsJson;
                return Array.isArray(parsed)
                  ? (parsed as Array<{ type?: string; t?: number }>)
                  : [];
              });
              return events.filter((event) => event.type === "snapshot").length;
            },
            { timeout: 20_000 }
          )
          .toBeGreaterThan(0);

        expect(events.filter((event) => event.type === "page-switch")).toEqual([]);
        expect(events.filter((event) => event.type === "resume")).toEqual([]);
        const log = createEmptyEventLog();
        log.events = events as WBEvent[];
        const untilT = events.reduce((max, event) => Math.max(max, event.t ?? 0), 0);
        expect(findActiveReplayPageIdAt(log, untilT)).toBeNull();
      } finally {
        await prisma.$disconnect();
      }
    }
  );

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
        const imageFile = await readImageElementState(
          peers.tutorPage,
          "tutor",
          imageSummary[0]!.id
        );
        expect(imageFile?.fileId).toBeTruthy();
        expect(imageFile?.hasBinary).toBe(true);
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
          .poll(
            async () => {
              const summary = await readSceneElementSummary(peers.studentPage, "student");
              return summary.map((el) => el.type);
            },
            { timeout: 20_000 }
          )
          .toEqual(["image"]);
        const studentIds = await readSceneElementIds(peers.studentPage, "student");
        expect(studentIds).not.toContain(anchorStrokeId);

        // Leaving and returning loads the student's stored page bucket.
        await clickBoardPageTab(peers.tutorPage, "tutor", "Board 1");
        await expect
          .poll(async () => readSceneElementIds(peers.studentPage, "student"), {
            timeout: 20_000,
          })
          .toContain(anchorStrokeId);
        await clickBoardPageTab(peers.tutorPage, "tutor", "diagram");
        await expect
          .poll(
            async () => {
              const summary = await readSceneElementSummary(peers.studentPage, "student");
              return summary.map((el) => el.type);
            },
            { timeout: 20_000 }
          )
          .toEqual(["image"]);
        const studentAfterRoundTrip = await readSceneElementIds(peers.studentPage, "student");
        expect(studentAfterRoundTrip).not.toContain(anchorStrokeId);

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
      // The keyboard slides in. Measuring during that animation places the
      // digit row below the viewport (top > innerHeight), and the click hits
      // the scrim. Keycaps live in the keyboard's shadow tree. Wait until two
      // digit keys are stable across two frames, then use their centers.
      const digitKeys = await keyboard.evaluate((el) => {
        const digitLabel = (node: HTMLElement): string => {
          const aria = (node.getAttribute("aria-label") || "").trim();
          if (/^[0-9]$/.test(aria)) return aria;
          const text = (node.textContent || "").replace(/\s+/g, "");
          return /^[0-9]$/.test(text) ? text : "";
        };
        const collect = (root: ParentNode): HTMLElement[] => {
          const found: HTMLElement[] = [];
          const walk = (node: ParentNode) => {
            if (node instanceof Element && node.shadowRoot) walk(node.shadowRoot);
            const kids = Array.from(node.children ?? []);
            for (const child of kids) {
              if (
                child instanceof HTMLElement &&
                child.classList.contains("MLK__keycap")
              ) {
                found.push(child);
              }
              walk(child);
            }
          };
          walk(root);
          return found;
        };
        const visibleDigits = () => {
          const out: { x: number; y: number; label: string }[] = [];
          const seen = new Set<string>();
          for (const key of collect(el)) {
            const label = digitLabel(key);
            if (!label || seen.has(label)) continue;
            const rect = key.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            if (rect.width < 4 || rect.height < 4) continue;
            if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
              continue;
            }
            seen.add(label);
            out.push({ x: cx, y: cy, label });
          }
          return out;
        };
        return new Promise<{ x: number; y: number; label: string }[]>((resolve, reject) => {
          let last = "";
          let stable = 0;
          let frames = 0;
          const step = () => {
            frames += 1;
            const keys = visibleDigits();
            const sig = keys
              .map((key) => `${key.label}:${key.x.toFixed(1)}:${key.y.toFixed(1)}`)
              .join("|");
            const box = el.getBoundingClientRect();
            const hostSettled =
              box.height > 40 &&
              box.top < window.innerHeight &&
              box.bottom <= window.innerHeight + 1;
            if (keys.length >= 2 && hostSettled && sig === last && sig.length > 0) {
              stable += 1;
            } else {
              stable = 0;
            }
            last = sig;
            if (stable >= 2) {
              resolve(keys.slice(0, 2));
              return;
            }
            if (frames > 180) {
              const shadowKids =
                el.shadowRoot?.querySelectorAll("*").length ?? "no-shadow";
              const sample = Array.from(el.querySelectorAll("[class]"))
                .slice(0, 6)
                .map((node) => node.className)
                .join(",");
              reject(
                new Error(
                  `keyboard digits did not settle count=${keys.length} top=${box.top} bottom=${box.bottom} innerHeight=${window.innerHeight} shadowNodes=${shadowKids} sample=${sample}`
                )
              );
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });
      });
      expect(digitKeys, "two digit keys on the settled MathLive keyboard").toHaveLength(2);
      const keyHitsKeyboard = async (key: { x: number; y: number }) => {
        const inside = await page.evaluate(({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          const keyboard = document.querySelector("body > .ML__keyboard");
          if (!(hit instanceof Element) || !(keyboard instanceof Element)) return false;
          let node: Node | null = hit;
          while (node) {
            if (node === keyboard) return true;
            if (node instanceof Element && node.parentElement) {
              node = node.parentElement;
              continue;
            }
            const root = node.getRootNode();
            if (root instanceof ShadowRoot) {
              node = root.host;
              continue;
            }
            node = null;
          }
          return false;
        }, key);
        expect(inside, "key center resolves inside .ML__keyboard").toBe(true);
      };
      const fieldValue = () =>
        mathField.evaluate((el) => (el as { value?: string }).value ?? "");
      await keyHitsKeyboard(digitKeys[0]!);
      await page.mouse.click(digitKeys[0]!.x, digitKeys[0]!.y);
      await expect(dialog).toBeVisible();
      await expect.poll(fieldValue).toBe(digitKeys[0]!.label);
      await keyHitsKeyboard(digitKeys[1]!);
      await page.mouse.click(digitKeys[1]!.x, digitKeys[1]!.y);
      await expect(dialog).toBeVisible();
      await expect.poll(fieldValue).toBe(`${digitKeys[0]!.label}${digitKeys[1]!.label}`);

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

  test("modifier hints sit in the lower part of the board and name Space pan", {
    tag: [TAG.WB_CHROME],
  }, async ({ page }) => {
    test.setTimeout(120_000);
    await openTutorBoard(page);
    const hints = page.getByTestId("wb-modifier-hints");
    await expect(hints).toBeVisible();
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
    await expectChatToggleClearOfModifierHints(page);
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
          await expectChatToggleClearOfModifierHints(page);
          const box = await page.getByTestId("wb-session-chat-toggle").boundingBox();
          expect(box, "chat toggle box").not.toBeNull();
          await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
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

  test(
    "plain wheel zooms, modifier wheel pans, space still pans",
    { tag: [TAG.WB_VIEWPORT] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await openTutorBoard(page);
      const canvas = page
        .locator('[data-testid="tutor-whiteboard-canvas-mount"] .excalidraw')
        .first();
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      const cx = box!.x + box!.width / 2;
      const cy = box!.y + box!.height / 2;
      await page.mouse.click(cx, cy);

      const sceneUnderPointer = async () => {
        const frame = await canvas.boundingBox();
        const vp = await readViewportSnapshot(page, "tutor");
        const offsets = await page.evaluate(() => {
          const st = (
            window as Window & {
              __TN_WB_E2E__?: Record<string, { getAppState: () => Record<string, unknown> }>;
            }
          ).__TN_WB_E2E__?.tutor?.getAppState?.();
          return {
            offsetLeft: Number(st?.offsetLeft) || 0,
            offsetTop: Number(st?.offsetTop) || 0,
          };
        });
        return viewportCoordsToSceneCoords(
          { clientX: cx - frame!.x, clientY: cy - frame!.y },
          {
            zoom: { value: vp.zoom },
            offsetLeft: offsets.offsetLeft,
            offsetTop: offsets.offsetTop,
            scrollX: vp.scrollX,
            scrollY: vp.scrollY,
          }
        );
      };

      const before = await readViewportSnapshot(page, "tutor");
      const beforePoint = await sceneUnderPointer();
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(250);
      const zoomed = await readViewportSnapshot(page, "tutor");
      const zoomedPoint = await sceneUnderPointer();
      expect(Math.abs(zoomed.zoom - before.zoom)).toBeGreaterThan(0.05);
      expect(Math.abs(zoomedPoint.x - beforePoint.x)).toBeLessThanOrEqual(8);
      expect(Math.abs(zoomedPoint.y - beforePoint.y)).toBeLessThanOrEqual(8);

      const panBefore = await readViewportSnapshot(page, "tutor");
      const panBeforePoint = await sceneUnderPointer();
      await page.keyboard.down("Control");
      await page.mouse.wheel(0, 280);
      await page.keyboard.up("Control");
      await page.waitForTimeout(250);
      const panned = await readViewportSnapshot(page, "tutor");
      const pannedPoint = await sceneUnderPointer();
      expect(Math.abs(panned.zoom - panBefore.zoom)).toBeLessThanOrEqual(0.02);
      const moved =
        Math.abs(pannedPoint.x - panBeforePoint.x) +
        Math.abs(pannedPoint.y - panBeforePoint.y);
      expect(moved).toBeGreaterThan(12);

      const spaceBefore = await readViewportSnapshot(page, "tutor");
      await page.keyboard.down("Space");
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 90, cy + 40, { steps: 8 });
      await page.mouse.up();
      await page.keyboard.up("Space");
      await page.waitForTimeout(200);
      const spaced = await readViewportSnapshot(page, "tutor");
      expect(Math.abs(spaced.zoom - spaceBefore.zoom)).toBeLessThanOrEqual(0.02);
      const spaceMoved =
        Math.abs(spaced.scrollX - spaceBefore.scrollX) +
        Math.abs(spaced.scrollY - spaceBefore.scrollY);
      expect(spaceMoved).toBeGreaterThan(8);
    }
  );

  test(
    "modifier hints follow the selected shape and the help list names wheel zoom",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await openTutorBoard(page);
      const hints = page.getByTestId("wb-modifier-hints");
      await expect(hints).toBeVisible();
      await expect(hints).toContainText("Space");
      await expect(hints).toContainText("Pan");

      await page.locator('[aria-label="Open shape picker"]').click();
      await page.getByRole("menuitem", { name: "Rectangle (R)" }).click();
      await expect(hints).toContainText("Square");
      await expect(hints).not.toContainText("Circle");

      await page.locator('[aria-label="Open shape picker"]').click();
      await page.getByRole("menuitem", { name: "Ellipse (O)" }).click();
      await expect(hints).toContainText("Circle");
      await expect(hints).not.toContainText("Square");
      await expect(hints).toContainText("Space");
      await expect(hints).toContainText("Pan");

      await page.getByTestId("wb-shortcut-help").click();
      const help = page.getByTestId("wb-shortcut-help-panel");
      await expect(help).toBeVisible();
      await expect(help).toContainText(/wheel/i);
      await expect(help).toContainText(/zoom/i);
      await expect(help).toContainText("Space");
      await expect(help).toContainText("Pan");

      await page.setViewportSize({ width: 380, height: 700 });
      const toolbar = page.getByTestId("wb-bottom-toolbar");
      await expect(toolbar).toBeVisible();
      const hintsBox = await hints.boundingBox();
      const toolbarBox = await toolbar.boundingBox();
      expect(hintsBox).not.toBeNull();
      expect(toolbarBox).not.toBeNull();
      const overlaps =
        hintsBox!.x < toolbarBox!.x + toolbarBox!.width &&
        hintsBox!.x + hintsBox!.width > toolbarBox!.x &&
        hintsBox!.y < toolbarBox!.y + toolbarBox!.height &&
        hintsBox!.y + hintsBox!.height > toolbarBox!.y;
      expect(overlaps, "hints must not sit in the bottom tool bar").toBe(false);
    }
  );

  test(
    "session menu and drawing menu use different icons and a more-below cue",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      await openTutorBoard(page);
      await page.setViewportSize({ width: 1000, height: 800 });
      const sessionBtn = page.getByRole("button", { name: "More session options" });
      const drawBtn = page.getByRole("button", { name: "More — z-order, delete, hand" });
      await expect(sessionBtn).toBeVisible();
      await expect(drawBtn).toBeVisible();
      const sessionIcon = await sessionBtn.locator("svg").innerHTML();
      const drawIcon = await drawBtn.locator("svg").innerHTML();
      expect(sessionIcon).not.toBe(drawIcon);

      await page.setViewportSize({ width: 1000, height: 480 });
      await sessionBtn.click();
      const scroll = page.locator(".mynk-wb-topbar-overflow-dropdown__scroll");
      await expect(scroll).toBeVisible();
      const overflow = await scroll.evaluate((el) => el.scrollHeight - el.clientHeight);
      expect(overflow).toBeGreaterThan(8);
      const cue = page.getByTestId("wb-session-menu-more-below");
      await expect(cue).toBeVisible();
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(cue).toHaveCount(0);

      await page.setViewportSize({ width: 1000, height: 1400 });
      await expect(sessionBtn).toBeVisible();
      if (!(await page.getByTestId("wb-topbar-overflow-dropdown").isVisible())) {
        await sessionBtn.click();
      }
      await expect(scroll).toBeVisible();
      const fits = await scroll.evaluate((el) => el.scrollHeight - el.clientHeight <= 4);
      expect(fits).toBe(true);
      await expect(page.getByTestId("wb-session-menu-more-below")).toHaveCount(0);
    }
  );
});
