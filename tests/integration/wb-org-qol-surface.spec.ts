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
  insertGraphOnRole,
  openTutorAndStudent,
  readActiveWhiteboardPageId,
  addGraphExpressionViaUI,
  readGraphElementState,
  readMountedGraphInk,
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
import type { Page } from "@playwright/test";
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

/**
 * Every finite sample of the plotted curve vs Math at that sample's own x.
 * Tolerance scales with |Math y|. Samples near a vertical asymptote (huge Math y)
 * are skipped — tan spikes there and the library's finite sample is not the oracle.
 */
function expectCurveMatchesMath(
  pts: [number, number][],
  oracleAt: (x: number) => number,
  label: string,
  domain?: readonly [number, number],
  skipAt?: (x: number) => boolean
) {
  let compared = 0;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (domain && (x < domain[0] || x > domain[1])) continue;
    // Step functions: a sample on a jump is not a stable oracle comparison.
    if (skipAt?.(x)) continue;
    const oracle = oracleAt(x);
    if (!Number.isFinite(oracle) || Math.abs(oracle) > 1e6) continue;
    compared += 1;
    const scale = Math.max(1, Math.abs(oracle));
    expect(
      Math.abs(y - oracle),
      `${label} at x=${x}: curve y=${y}, Math y=${oracle}`
    ).toBeLessThanOrEqual(1e-4 * scale);
  }
  expect(compared, `${label} has a finite sample inside its domain`).toBeGreaterThan(0);
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
    "on-graph expression entry shows y= beside the input and keeps the notation helper",
    { tag: [TAG.WB_GRAPH] },
    async ({ page }) => {
      test.setTimeout(180_000);
      await openTutorBoard(page);
      await page.getByTestId("wb-insert-graph").click();
      await page.getByRole("button", { name: "Plot expression" }).click();
      const dialogInput = page.getByTestId("wb-graph-expr-input");
      await expect(dialogInput).toHaveAttribute("aria-label", "Expression, y equals");
      const dialogFontPx = await dialogInput.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize)
      );
      await page.getByRole("button", { name: "Cancel" }).click();

      await page.getByTestId("wb-insert-graph").click();
      await page.getByTestId("wb-graph-insert").click();
      const host = page.getByTestId("wb-graph-embed-host").first();
      await expect(host).toBeVisible({ timeout: 30_000 });
      await host.scrollIntoViewIfNeeded();

      const panel = page.getByTestId("wb-graph-expr-panel");
      const input = page.getByTestId("wb-graph-expr-new");
      const prefix = page.getByTestId("wb-graph-expr-new-prefix");
      await expect(panel).toBeVisible();
      await expect(input).toHaveAttribute("aria-label", "Expression, y equals");
      const onGraphFontPx = await input.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize)
      );
      expect(
        dialogFontPx,
        "insert-dialog expression text is larger than the on-graph entry"
      ).toBeGreaterThan(onGraphFontPx);
      await expect(prefix).toHaveText("y=");
      await expect(input).toHaveAttribute("placeholder", "2x+1");
      const help = "Uses standard function notation (x as the variable).";
      await expect(panel.getByText(help)).toBeVisible();

      // y= sits on the same line, immediately left of the expression input.
      const prefixBox = await prefix.boundingBox();
      const inputBox = await input.boundingBox();
      const panelBox = await panel.boundingBox();
      expect(prefixBox, "y= prefix box").not.toBeNull();
      expect(inputBox, "expression input box").not.toBeNull();
      expect(panelBox, "expression panel box").not.toBeNull();
      const prefixRight = prefixBox!.x + prefixBox!.width;
      const inputLeft = inputBox!.x;
      expect(prefixRight, "y= right edge is left of the input").toBeLessThanOrEqual(
        inputLeft + 1
      );
      expect(inputLeft - prefixRight, "y= sits immediately left of the input").toBeLessThanOrEqual(
        16
      );
      const prefixMid = prefixBox!.y + prefixBox!.height / 2;
      const inputMid = inputBox!.y + inputBox!.height / 2;
      expect(
        Math.abs(prefixMid - inputMid),
        "y= midline aligns with the input"
      ).toBeLessThanOrEqual(4);
      const addBox = await page.getByTestId("wb-graph-expr-add").boundingBox();
      expect(addBox, "add button box").not.toBeNull();
      expect(prefixBox!.x, "y= stays inside the panel").toBeGreaterThanOrEqual(panelBox!.x - 1);
      expect(
        addBox!.x + addBox!.width,
        "y=, input, and Add stay inside the panel"
      ).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);

      await addGraphExpressionViaUI(page, "2*x+1");
      await expect(panel.getByText(help)).toBeVisible();
      const displayed = page.getByTestId("wb-graph-expr-display-0");
      await expect(displayed).toContainText("y=");
      await expect(displayed).toContainText("2*x+1");
    }
  );

  test(
    "plotted log and trig expressions match Math at a sampled x",
    { tag: [TAG.WB_GRAPH] },
    async ({ page }) => {
      test.setTimeout(180_000);
      await openTutorBoard(page);
      await page.getByTestId("wb-insert-graph").click();
      await page.getByTestId("wb-graph-insert").click();
      const host = page.getByTestId("wb-graph-embed-host").first();
      await expect(host).toBeVisible({ timeout: 30_000 });
      await host.scrollIntoViewIfNeeded();

      const samples: Array<{
        expr: string;
        oracleAt: (x: number) => number;
        domain?: readonly [number, number];
        skipAt?: (x: number) => boolean;
      }> = [
        { expr: "2sin(x)", oracleAt: (x) => 2 * Math.sin(x) },
        { expr: "log10(x)", oracleAt: (x) => Math.log10(x) },
        { expr: "sin x", oracleAt: (x) => Math.sin(x) },
        { expr: "ln x", oracleAt: (x) => Math.log(x) },
        { expr: "sinx", oracleAt: (x) => Math.sin(x) },
        { expr: "sin 2x", oracleAt: (x) => Math.sin(2 * x) },
        { expr: "3 sin 2x", oracleAt: (x) => 3 * Math.sin(2 * x) },
        { expr: "sin x^2", oracleAt: (x) => Math.sin(x * x) },
        { expr: "sin^2 x", oracleAt: (x) => Math.sin(x) ** 2 },
        { expr: "pi x", oracleAt: (x) => Math.PI * x },
        { expr: "e^x", oracleAt: (x) => Math.exp(x) },
        { expr: "sinh(x)", oracleAt: (x) => Math.sinh(x) },
        { expr: "asin(x)", oracleAt: (x) => Math.asin(x), domain: [-1, 1] },
        // Names stored boards could call before the rewriter existed.
        {
          expr: "floor(x)",
          oracleAt: (x) => Math.floor(x),
          skipAt: (x) => Math.abs(x - Math.round(x)) < 1e-6,
        },
        // Two-argument call: must stay atan2(x, 1), not become atan(2*(x,1)).
        { expr: "atan2(x,1)", oracleAt: (x) => Math.atan2(x, 1) },
        { expr: "min(x,2)", oracleAt: (x) => Math.min(x, 2) },
        { expr: ".5x", oracleAt: (x) => 0.5 * x },
        { expr: "2πx", oracleAt: (x) => 2 * Math.PI * x },
      ];

      let plotted = 0;
      for (const sample of samples) {
        plotted += 1;
        await addGraphExpressionViaUI(page, sample.expr);
        await expect(page.locator("[data-testid^='wb-graph-expr-error-']")).toHaveCount(0);
        let pts: [number, number][] = [];
        await expect
          .poll(async () => {
            const curves = (await readMountedGraphInk(page)).functionGraphs;
            if (curves.length !== plotted) return 0;
            pts = curves[curves.length - 1]!.pts;
            return pts.length;
          }, { timeout: 15_000 })
          .toBeGreaterThan(0);
        expectCurveMatchesMath(pts, sample.oracleAt, sample.expr, sample.domain, sample.skipAt);
      }
    }
  );

  test(
    "unreadable expressions show the error state and draw no curve",
    { tag: [TAG.WB_GRAPH] },
    async ({ page }) => {
      test.setTimeout(180_000);
      await openTutorBoard(page);
      await page.getByTestId("wb-insert-graph").click();
      await page.getByTestId("wb-graph-insert").click();
      const host = page.getByTestId("wb-graph-embed-host").first();
      await expect(host).toBeVisible({ timeout: 30_000 });
      await host.scrollIntoViewIfNeeded();

      // Each of these used to reach JessieCode as a bare identifier, a wrong call,
      // or an allowlisted function that hangs or plots the wrong curve, with no message.
      const unreadable = ["sec x", "atan2x", "sin2pix", "arcsin x", "(x,1)", "gcd(x,2)", "trunc(x)"];
      for (let index = 0; index < unreadable.length; index += 1) {
        await addGraphExpressionViaUI(page, unreadable[index]!);
        await expect(page.getByTestId(`wb-graph-expr-error-${index}`)).toBeVisible();
      }
      await expect
        .poll(async () => (await readMountedGraphInk(page)).functionGraphs.length)
        .toBe(0);

      // Control: the harness does see a curve when the expression is readable.
      await addGraphExpressionViaUI(page, "atan2(x,1)");
      await expect
        .poll(async () => (await readMountedGraphInk(page)).functionGraphs.length, {
          timeout: 15_000,
        })
        .toBe(1);
      await expect(page.getByTestId(`wb-graph-expr-error-${unreadable.length}`)).toHaveCount(0);
    }
  );

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

      // Wide desktop: session controls stay on the bar. The overflow button
      // (sliders) is only for the narrower bar.
      await page.setViewportSize({ width: 1280, height: 900 });
      const sessionBtn = page.getByRole("button", { name: "More session options" });
      await expect(sessionBtn).not.toBeVisible();
      await expect(page.getByTestId("wb-copy-student-link")).toBeVisible();
      await expect(page.getByTestId("wb-topbar-mic")).toBeVisible();
      await expect(page.getByTestId("wb-grid-toggle")).toBeVisible();
      await expect(page.getByTestId("wb-recenter-view")).toBeVisible();

      await page.setViewportSize({ width: 1000, height: 800 });
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

  /**
   * PLAYWRIGHT-GAP: iOS soft keyboard covering the phone expression tray.
   * Playwright cannot show the iOS keyboard or shrink visualViewport the way
   * Safari does, so tray-vs-keyboard occlusion is hardware-only.
   * See docs/BACKLOG.md — PLAYWRIGHT-GAP graph expression tray iOS keyboard.
   */
  test(
    "phone expression editing opens a bottom tray inside the viewport and plots on both peers",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        const studentHost = peers.studentPage.getByTestId("wb-graph-embed-host").first();
        await expect(studentHost).toBeVisible({ timeout: 30_000 });

        // The inserted graph is larger than the phone, so a control painted
        // inside the scaled graph is off-screen. The launcher is viewport chrome.
        expect(
          (await graphHostContainedInStudentView(peers.studentPage)).contained,
          "graph is larger than the phone view"
        ).toBe(false);

        const launcher = peers.studentPage.getByTestId("wb-graph-phone-expr-launcher");
        // Fully inside the visual viewport, unscaled, and clear of the bottom toolbar.
        await expect
          .poll(() => phoneChromeLauncherGeometry(peers.studentPage), { timeout: 20_000 })
          .toEqual({
            present: true,
            inViewport: true,
            clearOfToolbar: true,
            outsideGraph: true,
            hitOk: true,
            unscaled: true,
          });
        await launcher.tap();

        const tray = peers.studentPage.getByTestId("wb-graph-expr-tray");
        await expect(tray).toBeVisible();
        await expect(tray.getByTestId("wb-graph-expr-picker")).toHaveCount(0);
        const insideHost = await tray.evaluate(
          (el) => !!el.closest("[data-testid='wb-graph-embed-host']")
        );
        expect(insideHost, "phone tray is screen-space, outside the graph box").toBe(
          false
        );
        await expect(studentHost.getByTestId("wb-graph-expr-panel")).toHaveCount(0);

        const input = tray.getByTestId("wb-graph-expr-new");
        await expect(input).toBeVisible();
        await expect
          .poll(
            () =>
              input.evaluate((el) => {
                const rect = el.getBoundingClientRect();
                const vv = window.visualViewport;
                const viewLeft = vv ? vv.offsetLeft : 0;
                const viewTop = vv ? vv.offsetTop : 0;
                const viewRight = viewLeft + (vv ? vv.width : window.innerWidth);
                const viewBottom = viewTop + (vv ? vv.height : window.innerHeight);
                const slack = 2;
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const hit = document.elementFromPoint(centerX, centerY);
                const scale =
                  el instanceof HTMLElement && el.offsetHeight > 0
                    ? rect.height / el.offsetHeight
                    : 0;
                return {
                  inView:
                    rect.width > 8 &&
                    rect.height > 8 &&
                    rect.left >= viewLeft - slack &&
                    rect.top >= viewTop - slack &&
                    rect.right <= viewRight + slack &&
                    rect.bottom <= viewBottom + slack,
                  hitOk: !!hit && (hit === el || el.contains(hit)),
                  scaleOk: scale > 0.9 && scale < 1.1,
                };
              }),
            { timeout: 10_000 }
          )
          .toEqual({ inView: true, hitOk: true, scaleOk: true });

        await input.fill("2x+1");
        await input.press("Enter");

        await expect
          .poll(
            async () => {
              const tutor = await readMountedGraphInk(peers.tutorPage);
              const student = await readMountedGraphInk(peers.studentPage);
              return (
                (tutor.functionGraphs[0]?.pts.length ?? 0) > 0 &&
                (student.functionGraphs[0]?.pts.length ?? 0) > 0
              );
            },
            { timeout: 20_000 }
          )
          .toBe(true);

        const tutorInk = await readMountedGraphInk(peers.tutorPage);
        const studentInk = await readMountedGraphInk(peers.studentPage);
        expect(tutorInk.functionGraphs.length).toBeGreaterThan(0);
        expect(studentInk.functionGraphs.length).toBeGreaterThan(0);
        expectCurveMatchesMath(
          tutorInk.functionGraphs[0].pts,
          (x) => 2 * x + 1,
          "tutor phone-entered line"
        );
        expectCurveMatchesMath(
          studentInk.functionGraphs[0].pts,
          (x) => 2 * x + 1,
          "student phone-entered line"
        );
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "desktop and tablet keep the inline graph expression panel",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentViewport: { width: 768, height: 1024 },
        studentHasTouch: true,
        studentIsMobile: true,
        ensureFollow: false,
      });
      try {
        const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        await expect(peers.tutorPage.getByTestId("wb-graph-embed-host").first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(peers.studentPage.getByTestId("wb-graph-embed-host").first()).toBeVisible({
          timeout: 30_000,
        });

        const tutorHost = peers.tutorPage.getByTestId("wb-graph-embed-host").first();
        const tabletHost = peers.studentPage.getByTestId("wb-graph-embed-host").first();
        await expect(tutorHost.getByTestId("wb-graph-expr-panel")).toBeVisible();
        await expect(tabletHost.getByTestId("wb-graph-expr-panel")).toBeVisible();
        await expect(peers.tutorPage.getByTestId("wb-graph-expr-tray")).toHaveCount(0);
        await expect(peers.studentPage.getByTestId("wb-graph-expr-tray")).toHaveCount(0);
        await expect(peers.tutorPage.getByTestId("wb-graph-phone-expr-launcher")).toHaveCount(0);
        await expect(peers.studentPage.getByTestId("wb-graph-phone-expr-launcher")).toHaveCount(0);
        const tutorInside = await tutorHost
          .getByTestId("wb-graph-expr-panel")
          .evaluate((el) => !!el.closest("[data-testid='wb-graph-embed-host']"));
        const tabletInside = await tabletHost
          .getByTestId("wb-graph-expr-panel")
          .evaluate((el) => !!el.closest("[data-testid='wb-graph-embed-host']"));
        expect(tutorInside, "desktop panel stays on the graph").toBe(true);
        expect(tabletInside, "tablet panel stays on the graph").toBe(true);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "tutor fit places the graph inside the student's visible view",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME, TAG.WB_VIEWPORT] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, ["x"]);
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        await expect(peers.studentPage.getByTestId("wb-graph-embed-host").first()).toBeVisible({
          timeout: 30_000,
        });

        const before = await graphHostContainedInStudentView(peers.studentPage);
        expect(before.contained, "inserted graph overflows the phone before fit").toBe(
          false
        );

        const fit = peers.tutorPage.getByTestId("wb-graph-fit-student-screen");
        await expect(fit).toBeEnabled({ timeout: 20_000 });
        await fit.click();

        await expect
          .poll(async () => (await graphHostContainedInStudentView(peers.studentPage)).contained, {
            timeout: 20_000,
          })
          .toBe(true);

        await expect
          .poll(async () => {
            const tutor = await readEmbedSceneBox(peers.tutorPage, "tutor", graphId);
            const student = await readEmbedSceneBox(peers.studentPage, "student", graphId);
            if (!tutor || !student) return false;
            return sceneBoxesMatch(tutor, student);
          }, { timeout: 20_000 })
          .toBe(true);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "Ctrl+Z after fit restores the graph box on tutor and student",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME, TAG.WB_VIEWPORT] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, ["x"]);
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        await expect(peers.tutorPage.getByTestId("wb-graph-embed-host").first()).toBeVisible({
          timeout: 30_000,
        });
        // Selecting the graph commits the current scene (Excalidraw pointer-up),
        // so the following Fit is its own undo entry rather than bundled with insert.
        // mouse.click hit-tests through the embed (pointer-events none until active);
        // locator.click on the host waits forever because it is not the hit target.
        const tutorBoard = peers.tutorPage
          .getByTestId("wb-graph-embed-host")
          .first()
          .locator(".wb-graph-board-host");
        const tutorBoardBox = await tutorBoard.boundingBox();
        expect(tutorBoardBox, "tutor graph board").not.toBeNull();
        await peers.tutorPage.mouse.click(
          tutorBoardBox!.x + 48,
          tutorBoardBox!.y + 48
        );

        const before = await readEmbedSceneBox(peers.tutorPage, "tutor", graphId);
        expect(before, "graph box before fit").not.toBeNull();

        const fit = peers.tutorPage.getByTestId("wb-graph-fit-student-screen");
        await expect(fit).toBeEnabled({ timeout: 20_000 });
        await fit.click();

        await expect
          .poll(async () => {
            const fitted = await readEmbedSceneBox(peers.tutorPage, "tutor", graphId);
            return Boolean(fitted && before && !sceneBoxesMatch(fitted, before));
          }, { timeout: 20_000 })
          .toBe(true);

        await peers.tutorPage.evaluate(() => {
          const target = document.querySelector(".excalidraw");
          if (!(target instanceof HTMLElement)) return;
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.focus();
        });
        await peers.tutorPage.keyboard.press("Control+z");

        await expect
          .poll(async () => {
            const tutor = await readEmbedSceneBox(peers.tutorPage, "tutor", graphId);
            const student = await readEmbedSceneBox(peers.studentPage, "student", graphId);
            if (!tutor || !student || !before) return false;
            return sceneBoxesMatch(tutor, before) && sceneBoxesMatch(student, before);
          }, { timeout: 20_000 })
          .toBe(true);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "phone tray picker edits only the chosen graph",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graph1 = await insertGraphOnRole(peers.tutorPage, "tutor", session, ["x"]);
        const graph2 = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
        await waitForElementOnPeer(peers.studentPage, "student", graph1, 30_000);
        await waitForElementOnPeer(peers.studentPage, "student", graph2, 30_000);
        await expect(peers.tutorPage.getByTestId("wb-graph-embed-host")).toHaveCount(2);

        // Under 400px the tutor is phone chrome even with a mouse pointer.
        await peers.tutorPage.setViewportSize({ width: 390, height: 844 });
        await openPhoneGraphPickerOn(peers.tutorPage, "Graph 2");
        const input = peers.tutorPage.getByTestId("wb-graph-expr-tray").getByTestId("wb-graph-expr-new");
        await input.fill("x^2");
        await input.press("Enter");
        await expectOnlyGraph2Changed(peers, graph1, graph2);
      } finally {
        await peers.close();
      }
    }
  );

  // Blocked by WB-STUDENT-APPLY-RACE (docs/BACKLOG.md): a student edit made while a tutor apply is in flight is overwritten; ~20% red. Unfixme with that fix.
  test.fixme(
    "phone student tray picker edits only the chosen graph",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graph1 = await insertGraphOnRole(peers.tutorPage, "tutor", session, ["x"]);
        const graph2 = await insertGraphOnRole(peers.tutorPage, "tutor", session, []);
        await waitForElementOnPeer(peers.studentPage, "student", graph1, 30_000);
        await waitForElementOnPeer(peers.studentPage, "student", graph2, 30_000);
        await expect(peers.studentPage.getByTestId("wb-graph-embed-host")).toHaveCount(2);

        await openPhoneGraphPickerOn(peers.studentPage, "Graph 2");
        const input = peers.studentPage
          .getByTestId("wb-graph-expr-tray")
          .getByTestId("wb-graph-expr-new");
        await input.fill("x^2");
        await input.press("Enter");
        await expectOnlyGraph2Changed(peers, graph1, graph2);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "Escape in an expression field cancels the edit and the next Escape closes the tray",
    { tag: [TAG.WB_GRAPH, TAG.WB_CHROME] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        studentBrowser: "webkit",
      });
      try {
        const graphId = await insertGraphOnRole(peers.tutorPage, "tutor", session, ["x^2"]);
        await waitForElementOnPeer(peers.studentPage, "student", graphId, 30_000);
        const launcher = peers.studentPage.getByTestId("wb-graph-phone-expr-launcher");
        await expect(launcher).toBeVisible({ timeout: 20_000 });
        await launcher.tap();

        const tray = peers.studentPage.getByTestId("wb-graph-expr-tray");
        await expect(tray).toBeVisible();
        await tray.getByTestId("wb-graph-expr-display-0").click();
        const edit = tray.getByTestId("wb-graph-expr-edit-0");
        await expect(edit).toBeVisible();
        await edit.fill("999*x");
        await edit.press("Escape");

        await expect(tray).toBeVisible();
        await expect(tray.getByTestId("wb-graph-expr-display-0")).toContainText("x^2");
        await expect(tray.getByTestId("wb-graph-expr-display-0")).not.toContainText("999");
        await expect
          .poll(async () => {
            const state = await readGraphElementState(peers.studentPage, "student", graphId);
            return state?.expressions.join("|") ?? "";
          }, { timeout: 5_000 })
          .toBe("x^2");

        await peers.studentPage.keyboard.press("Escape");
        await expect(tray).toBeHidden();
        await expect(launcher).toBeFocused();
      } finally {
        await peers.close();
      }
    }
  );
});

type EmbedSceneBox = { x: number; y: number; width: number; height: number };

function sceneBoxesMatch(a: EmbedSceneBox, b: EmbedSceneBox): boolean {
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  );
}

/** Viewport-fixed phone launcher: inside the visual viewport, unscaled, clear of the toolbar. */
async function phoneChromeLauncherGeometry(page: Page): Promise<{
  present: boolean;
  inViewport: boolean;
  clearOfToolbar: boolean;
  outsideGraph: boolean;
  hitOk: boolean;
  unscaled: boolean;
}> {
  return page.evaluate(() => {
    const btn = document.querySelector("[data-testid='wb-graph-phone-expr-launcher']");
    if (!(btn instanceof HTMLElement)) {
      return {
        present: false,
        inViewport: false,
        clearOfToolbar: false,
        outsideGraph: false,
        hitOk: false,
        unscaled: false,
      };
    }
    const r = btn.getBoundingClientRect();
    const vv = window.visualViewport;
    const vLeft = vv ? vv.offsetLeft : 0;
    const vTop = vv ? vv.offsetTop : 0;
    const vRight = vLeft + (vv ? vv.width : window.innerWidth);
    const vBottom = vTop + (vv ? vv.height : window.innerHeight);
    const slack = 2;
    const inViewport =
      r.width > 8 &&
      r.height > 8 &&
      r.left >= vLeft - slack &&
      r.top >= vTop - slack &&
      r.right <= vRight + slack &&
      r.bottom <= vBottom + slack;
    const toolbar = document
      .querySelector("[data-testid='wb-bottom-toolbar']")
      ?.getBoundingClientRect();
    const clearOfToolbar =
      !toolbar ||
      toolbar.width < 1 ||
      toolbar.height < 1 ||
      r.right <= toolbar.left + slack ||
      r.left >= toolbar.right - slack ||
      r.bottom <= toolbar.top + slack ||
      r.top >= toolbar.bottom - slack;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const scale = btn.offsetHeight > 0 ? r.height / btn.offsetHeight : 0;
    return {
      present: r.width > 8 && r.height > 8,
      inViewport,
      clearOfToolbar,
      outsideGraph: !btn.closest("[data-testid='wb-graph-embed-host']"),
      hitOk: !!hit && (hit === btn || btn.contains(hit)),
      unscaled: scale > 0.9 && scale < 1.1,
    };
  });
}

async function openPhoneGraphPickerOn(page: Page, graphLabel: string) {
  const launcher = page.getByTestId("wb-graph-phone-expr-launcher");
  await expect(launcher).toBeVisible({ timeout: 20_000 });
  await launcher.click();
  const tray = page.getByTestId("wb-graph-expr-tray");
  await expect(tray).toBeVisible();
  await expect(tray.getByTestId("wb-graph-expr-picker")).toBeVisible();
  await tray.getByRole("tab", { name: graphLabel }).click();
}

async function expectOnlyGraph2Changed(
  peers: { tutorPage: Page; studentPage: Page },
  graph1: string,
  graph2: string
) {
  for (const [label, page, role] of [
    ["student", peers.studentPage, "student"],
    ["tutor", peers.tutorPage, "tutor"],
  ] as const) {
    await expect
      .poll(
        async () => {
          const first = (await readMountedGraphInk(page, graph1)).functionGraphs.map((g) => g.pts);
          const second = (await readMountedGraphInk(page, graph2)).functionGraphs.map((g) => g.pts);
          const s1 = await readGraphElementState(page, role, graph1);
          const s2 = await readGraphElementState(page, role, graph2);
          return {
            graph1Curve:
              first.length === 1 &&
              curveMatches((x) => x, first[0]) &&
              !curveMatches((x) => x * x, first[0]),
            graph2Curve: second.length > 0 && curveMatches((x) => x * x, second[0]),
            graph1Expressions: s1?.expressions.join("|"),
            graph2Expressions: s2?.expressions.join("|"),
          };
        },
        { timeout: 20_000, message: `${label} sees graph 2 edited, graph 1 unchanged` }
      )
      .toEqual({
        graph1Curve: true,
        graph2Curve: true,
        graph1Expressions: "x",
        graph2Expressions: "x^2",
      });
  }
}

async function selectedElementIds(
  page: Page,
  role: "tutor" | "student"
): Promise<string[]> {
  return page.evaluate((r) => {
    const bridge = (
      window as Window & {
        __TN_WB_E2E__?: Record<string, { getAppState: () => Record<string, unknown> }>;
      }
    ).__TN_WB_E2E__?.[r];
    const selected = bridge?.getAppState()?.selectedElementIds;
    if (!selected || typeof selected !== "object") return [];
    return Object.entries(selected as Record<string, boolean>)
      .filter(([, on]) => on)
      .map(([id]) => id);
  }, role);
}

function curveMatches(
  fn: (x: number) => number,
  pts: Array<[number, number]>
): boolean {
  let compared = 0;
  for (const [x, y] of pts) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const oracle = fn(x);
    if (!Number.isFinite(oracle)) continue;
    compared += 1;
    const scale = Math.max(1, Math.abs(oracle));
    if (Math.abs(y - oracle) > 1e-4 * scale) return false;
  }
  return compared > 0;
}

async function readEmbedSceneBox(
  page: Page,
  role: "tutor" | "student",
  elementId: string
): Promise<EmbedSceneBox | null> {
  return page.evaluate(
    ({ r, id }) => {
      const bridge = (
        window as Window & {
          __TN_WB_E2E__?: Record<
            string,
            {
              getElements: () => Array<{
                id?: string;
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              }>;
            }
          >;
        }
      ).__TN_WB_E2E__?.[r];
      const el = bridge?.getElements().find((entry) => entry.id === id);
      if (
        !el ||
        typeof el.x !== "number" ||
        typeof el.y !== "number" ||
        typeof el.width !== "number" ||
        typeof el.height !== "number"
      ) {
        return null;
      }
      return { x: el.x, y: el.y, width: el.width, height: el.height };
    },
    { r: role, id: elementId }
  );
}

/** Graph host box vs the student's on-screen visible board (mount ∩ chrome ∩ visualViewport). */
async function graphHostContainedInStudentView(page: Page): Promise<{ contained: boolean }> {
  return page.evaluate(() => {
    const host = document
      .querySelector("[data-testid='wb-graph-embed-host']")
      ?.getBoundingClientRect();
    const mount = document
      .querySelector("[data-testid='student-whiteboard-canvas-mount']")
      ?.getBoundingClientRect();
    if (!host || !mount || !(host.width > 0) || !(mount.width > 0)) {
      return { contained: false };
    }
    let left = mount.left;
    let top = mount.top;
    let right = mount.right;
    let bottom = mount.bottom;
    const topbar = document.querySelector("header.mynk-wb-topbar")?.getBoundingClientRect();
    if (topbar && topbar.height > 0) top = Math.max(top, topbar.bottom);
    const bottomBar = document.querySelector("nav.mynk-wb-bottom-toolbar")?.getBoundingClientRect();
    if (bottomBar && bottomBar.height > 0 && bottomBar.width > 0) {
      const midX = (mount.left + mount.right) / 2;
      const leftRail = bottomBar.height > bottomBar.width && bottomBar.right <= midX;
      if (leftRail) left = Math.max(left, bottomBar.right);
      else bottom = Math.min(bottom, bottomBar.top);
    }
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0) {
      left = Math.max(left, vv.offsetLeft);
      top = Math.max(top, vv.offsetTop);
      right = Math.min(right, vv.offsetLeft + vv.width);
      bottom = Math.min(bottom, vv.offsetTop + vv.height);
    }
    const slack = 6;
    const contained =
      host.left >= left - slack &&
      host.top >= top - slack &&
      host.right <= right + slack &&
      host.bottom <= bottom + slack;
    return { contained };
  });
}
