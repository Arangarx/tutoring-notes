/**
 * P1-WB-4 / WS-E E4 (BUG-5) — replay board tab strip reflects which board was
 * active at the scrubbed timeline position (page-switch WBEvents).
 *
 * Independent oracle: page-switch event timestamps from GET /events API;
 * scrub ratio = targetMs / durationMs computed before scrub — NOT from replay hook.
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-active-board-tab.spec.ts --project=wb-regression --workers=1
 */

import { test, expect } from "./fixtures";
import {
  clickBoardPageTab,
  drawTestStrokeOnRole,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { TAG } from "../test-tags";

type PageSwitchEvent = {
  t: number;
  type: string;
  pageId?: string;
  title?: string;
};

type EventsBody = {
  events?: PageSwitchEvent[];
  durationMs?: number;
};

async function muteReplayAudioWhenPresent(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const muteIfPresent = () => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      if (el && !el.dataset.mutedByTest) {
        el.muted = true;
        el.dataset.mutedByTest = "1";
      }
    };
    const obs = new MutationObserver(muteIfPresent);
    obs.observe(document.body, { childList: true, subtree: true });
    muteIfPresent();
  });
}

/** Drag scrubber to `ratio` ∈ (0,1) — same contract as wb-replay-scrub-seek.spec.ts. */
async function scrubToRatio(
  page: import("@playwright/test").Page,
  ratio: number
) {
  const track = page.getByTestId("wb-replay-global-seek");
  await expect(track).toBeVisible();
  const box = await track.boundingBox();
  expect(box).not.toBeNull();
  const thumbRadius = 8;
  const travel = Math.max(box!.width - thumbRadius * 2, 1);
  const x = box!.x + thumbRadius + travel * ratio;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y);
  await page.mouse.up();
  await page.waitForTimeout(600);
}

/** Read scrubber total from replay UI — same oracle as wb-replay-scrub-seek.spec.ts. */
async function readReplayScrubberMaxMs(
  page: import("@playwright/test").Page
): Promise<number> {
  const elapsedLabel = await page
    .locator(".mynk-wb-replay-timeline__elapsed")
    .textContent();
  const parts = (elapsedLabel ?? "").split("/").map((s) => s.trim());
  expect(parts.length, `elapsed label must be "cur / total" (${elapsedLabel})`).toBe(
    2
  );
  const parseClock = (s: string) => {
    const bits = s.split(":").map(Number);
    if (bits.length === 3) return bits[0]! * 3600 + bits[1]! * 60 + bits[2]!;
    if (bits.length === 2) return bits[0]! * 60 + bits[1]!;
    return Number(bits[0]) || 0;
  };
  const totalMs = parseClock(parts[1]!) * 1000;
  expect(
    totalMs,
    `scrubber total must be resolved before mid-timeline seeks (label=${elapsedLabel})`
  ).toBeGreaterThan(1_000);
  return totalMs;
}

/** Default first board id — matches event-log REPLAY_DEFAULT_FIRST_PAGE / workspace p1. */
const BOARD1_PAGE_ID = "p1";

/**
 * Independent oracle: ms shortly after the explicit switch TO board 1 (p1),
 * still before the next page-switch (usually back to p2).
 */
function computeTargetMsWhileBoard1Active(
  switches: PageSwitchEvent[]
): number {
  const toBoard1Idx = switches.findIndex((s) => s.pageId === BOARD1_PAGE_ID);
  expect(
    toBoard1Idx,
    "session must record a page-switch to p1 (tutor clicked Board 1 tab)"
  ).toBeGreaterThanOrEqual(0);
  const board1StartT = switches[toBoard1Idx]!.t;
  const nextSwitchT = switches[toBoard1Idx + 1]?.t;
  const board1EndT = nextSwitchT ?? board1StartT + 2_000;
  const target = board1StartT + 400;
  expect(
    target,
    `Board 1 window too narrow (start=${board1StartT} end=${board1EndT})`
  ).toBeLessThan(board1EndT - 100);
  return target;
}

async function assertReplayBoardTabSelected(
  page: import("@playwright/test").Page,
  boardLabel: string,
  selected: boolean
) {
  const tab = page
    .getByTestId("wb-replay-board-tabs")
    .getByRole("tab", { name: boardLabel, exact: true });
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await expect(tab).toHaveAttribute(
    "aria-selected",
    selected ? "true" : "false"
  );
}

test.describe("WS-E E4 replay active board tab", { tag: [TAG.WB_RECORDING] }, () => {
  test("scrub timeline updates active replay board tab (2 boards)", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });
    await waitForWbE2eBridge(page, "tutor");

    await page.waitForTimeout(2_000);

    const board1Stroke = `e4-b1-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", board1Stroke, 40, 40, 120, 120);

    await page.waitForTimeout(1_500);

    await page
      .getByTestId("wb-tutor-page-strip")
      .getByRole("button", { name: "Add board" })
      .click();
    await expect(
      page
        .getByTestId("wb-tutor-page-strip")
        .getByRole("tab", { name: "Board 2", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    await page.waitForTimeout(1_500);

    const board2Stroke = `e4-b2-${Date.now()}`;
    await drawTestStrokeOnRole(page, "tutor", board2Stroke, 180, 180, 280, 280);

    await page.waitForTimeout(1_500);

    await clickBoardPageTab(page, "tutor", "Board 1");
    await page.waitForTimeout(1_500);
    await clickBoardPageTab(page, "tutor", "Board 2");
    await page.waitForTimeout(1_500);

    await page.getByTestId("wb-end-session").click();
    const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
    if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByTestId("wb-review-enter-replay")).toBeVisible({
      timeout: 60_000,
    });

    const eventsRes = await page.request.get(
      `/api/whiteboard/${whiteboardSessionId}/events`
    );
    expect(eventsRes.ok(), await eventsRes.text()).toBeTruthy();
    const eventsBody = (await eventsRes.json()) as EventsBody;
    const switches = (eventsBody.events ?? []).filter(
      (e): e is PageSwitchEvent => e.type === "page-switch"
    );
    expect(switches.length).toBeGreaterThanOrEqual(2);

    const lastSwitchT = switches[switches.length - 1]!.t;
    // Recorded titles are "Page N"; BoardTabStrip renders "Board N" by index.
    expect(switches[switches.length - 1]!.pageId).not.toBe(BOARD1_PAGE_ID);

    await muteReplayAudioWhenPresent(page);
    await page.getByTestId("wb-review-enter-replay").click();
    await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("wb-replay-board-tabs")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page
        .getByTestId("wb-replay-board-tabs")
        .getByRole("tab", { name: "Board 2", exact: true })
    ).toBeVisible();

    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="wb-replay-audio"]'
        ) as HTMLAudioElement | null;
        return el != null && Number.isFinite(el.duration) && el.duration > 0;
      },
      { timeout: 90_000 }
    );

    const playBtn = page.getByTestId("wb-replay-play-toggle");
    if ((await playBtn.textContent())?.includes("Pause")) {
      await playBtn.click();
    }

    const seekSlider = page.getByTestId("wb-replay-global-seek");
    await expect(seekSlider).toBeVisible();

    // ── Boundary seeks (Home / End) ─────────────────────────────────────────
    await seekSlider.focus();
    await page.keyboard.press("Home");
    await page.waitForTimeout(400);
    await assertReplayBoardTabSelected(page, "Board 1", true);
    await assertReplayBoardTabSelected(page, "Board 2", false);

    await seekSlider.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(400);
    await assertReplayBoardTabSelected(page, "Board 2", true);
    await assertReplayBoardTabSelected(page, "Board 1", false);

    // ── Mid-timeline scrub seeks (independent event-timestamp oracle) ─────────
    // Ratios must use the replay scrubber total (audio-driven scrubberMax), NOT
    // events API durationMs — page-switch timestamps live on the event clock but
    // the scrubber maps position ∝ scrubberMax (see wb-replay-scrub-seek.spec.ts).
    const scrubberMaxMs = await readReplayScrubberMaxMs(page);
    const targetBoard1Ms = computeTargetMsWhileBoard1Active(switches);
    const targetBoard2Ms = lastSwitchT + 400;
    const ratioBoard1 = targetBoard1Ms / scrubberMaxMs;
    const ratioBoard2 = targetBoard2Ms / scrubberMaxMs;

    expect(ratioBoard1).toBeGreaterThan(0);
    expect(ratioBoard2).toBeLessThan(1);
    expect(ratioBoard1).toBeLessThan(ratioBoard2);

    await scrubToRatio(page, ratioBoard1);
    await assertReplayBoardTabSelected(page, "Board 1", true);
    await assertReplayBoardTabSelected(page, "Board 2", false);

    await scrubToRatio(page, ratioBoard2);
    await assertReplayBoardTabSelected(page, "Board 2", true);
    await assertReplayBoardTabSelected(page, "Board 1", false);
  });
});
