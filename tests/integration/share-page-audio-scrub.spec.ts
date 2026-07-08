/**
 * P1-ID-4 — share-page audio scrub (browser contract over P1-J1 audio proxy).
 *
 * Meaning (a): seek/scrub on the tokenized public whiteboard share replay surface
 * (`/s/[token]/whiteboard/[sessionId]`) — parallels P1-WB-4 but on the SHARE
 * audience with `?token=` proxy URLs.
 *
 * Oracles:
 *   - Valid: audio element present with duration > 0; scrub lands at independent
 *     ratio×duration target; Range request on share audio proxy returns 206.
 *   - Deny: revoked token → page 404 + audio proxy 403; out-of-scope recording → 404.
 *
 * Run:
 *   npx playwright test tests/integration/share-page-audio-scrub.spec.ts --project=integration --workers=1
 */

import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import {
  resolveShareTokenForStudent,
  seedShareAudioDenyFixture,
} from "./share-page-audio-scrub.helpers";
import { TAG } from "../test-tags";

const SCRUB_RATIO = 0.45;
const NEAR_ZERO_AUDIO_SEC = 0.25;
const NEAR_ZERO_GLOBAL_MS = 500;

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

async function recordEndSessionOnWorkspace(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
  await page.waitForTimeout(5_000);

  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
}

async function openShareReplayAndWaitForAudioReady(
  page: import("@playwright/test").Page,
  shareToken: string,
  whiteboardSessionId: string
) {
  await muteReplayAudioWhenPresent(page);
  const response = await page.goto(
    `/s/${shareToken}/whiteboard/${whiteboardSessionId}`,
    { waitUntil: "domcontentloaded" }
  );
  expect(response?.status(), "valid share replay page").toBe(200);
  await expect(page.getByTestId("wb-replay")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("wb-replay-audio")).toBeAttached({
    timeout: 30_000,
  });

  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        '[data-testid="wb-replay-audio"]'
      ) as HTMLAudioElement | null;
      return el != null && Number.isFinite(el.duration) && el.duration > 0;
    },
    { timeout: 90_000 }
  );
}

type ShareReplayOracle = {
  audioCurrentTime: number;
  audioDuration: number;
  globalMs: number;
  totalMs: number;
  seekValueMs: number;
};

/** Share `/s/.../whiteboard/...` uses legacy WhiteboardReplay (not InFrame scrubber). */
async function readShareReplayOracle(
  page: import("@playwright/test").Page
): Promise<ShareReplayOracle> {
  return page.evaluate(() => {
    const parseClockLabel = (s: string) => {
      const bits = s.split(":").map(Number);
      if (bits.length === 3) return bits[0]! * 3600 + bits[1]! * 60 + bits[2]!;
      if (bits.length === 2) return bits[0]! * 60 + bits[1]!;
      return Number(bits[0]) || 0;
    };
    const el = document.querySelector(
      '[data-testid="wb-replay-audio"]'
    ) as HTMLAudioElement | null;
    const seek = document.querySelector(
      '[data-testid="wb-replay-global-seek"]'
    ) as HTMLInputElement | null;
    const bodyText = document.body.innerText;
    const spanMatch = bodyText.match(/Session log span · (\d+:\d+(?::\d+)?)/);
    const replayMatch = bodyText.match(/Replay time · t=(\d+:\d+(?::\d+)?)/);
    const totalMs = spanMatch
      ? parseClockLabel(spanMatch[1]!) * 1000
      : Math.max(Number(seek?.max ?? 0), (el?.duration ?? 0) * 1000);
    const globalMs = replayMatch
      ? parseClockLabel(replayMatch[1]!) * 1000
      : Math.round((el?.currentTime ?? 0) * 1000);
    return {
      audioCurrentTime: el?.currentTime ?? 0,
      audioDuration: el?.duration ?? 0,
      globalMs,
      totalMs: Math.max(totalMs, 1),
      seekValueMs: Number(seek?.value ?? 0),
    };
  });
}

async function scrubShareToRatio(
  page: import("@playwright/test").Page,
  ratio: number
) {
  const seek = page.getByTestId("wb-replay-global-seek");
  await expect(seek).toBeVisible();
  await seek.evaluate((el, r) => {
    const input = el as HTMLInputElement;
    const max = Number(input.max) || 1;
    const ms = Math.round(max * r);
    input.value = String(ms);
    input.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, ratio);
  await page.waitForTimeout(600);
}

test.describe("P1-ID-4 — share-page audio scrub", { tag: [TAG.WB_RECORDING] }, () => {
  test("valid share token: audio scrub/seek lands at independent target (Range→206)", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await recordEndSessionOnWorkspace(page, studentId, whiteboardSessionId);
    const shareToken = await resolveShareTokenForStudent(studentId);

    const rangeStatuses: number[] = [];
    page.on("response", (response) => {
      const req = response.request();
      const url = response.url();
      if (
        url.includes("/api/audio/") &&
        url.includes(`token=${encodeURIComponent(shareToken)}`) &&
        req.headers().range
      ) {
        rangeStatuses.push(response.status());
      }
    });

    await openShareReplayAndWaitForAudioReady(
      page,
      shareToken,
      whiteboardSessionId
    );

    const playBtn = page.getByTestId("wb-replay-play-toggle");
    if ((await playBtn.textContent())?.includes("Pause")) {
      await playBtn.click();
    }

    const baseline = await readShareReplayOracle(page);
    expect(
      baseline.audioDuration,
      "non-vacuous: share page must have audio to scrub"
    ).toBeGreaterThan(1);
    expect(
      baseline.totalMs,
      "session log span or seek max must define a scrubbable timeline"
    ).toBeGreaterThan(1_000);
    expect(baseline.globalMs).toBeLessThan(1_500);

    const targetGlobalMs = Math.round(baseline.totalMs * SCRUB_RATIO);
    const targetAudioSec = baseline.audioDuration * SCRUB_RATIO;
    const globalToleranceMs = Math.max(2_000, baseline.totalMs * 0.18);
    const audioToleranceSec = Math.max(2, baseline.audioDuration * 0.18);

    await scrubShareToRatio(page, SCRUB_RATIO);

    const oracle = await readShareReplayOracle(page);

    expect(
      oracle.globalMs,
      `share scrub ratio=${SCRUB_RATIO}: must NOT collapse to t≈0`
    ).toBeGreaterThan(NEAR_ZERO_GLOBAL_MS);
    expect(
      oracle.audioCurrentTime,
      `share scrub ratio=${SCRUB_RATIO}: audio must NOT park at t≈0`
    ).toBeGreaterThan(NEAR_ZERO_AUDIO_SEC);

    expect(
      Math.abs(oracle.globalMs - targetGlobalMs),
      `replay time global ms near independent target (observed=${oracle.globalMs}, target=${targetGlobalMs})`
    ).toBeLessThanOrEqual(globalToleranceMs);

    expect(
      Math.abs(oracle.seekValueMs - targetGlobalMs),
      `seek slider value near target ms (observed=${oracle.seekValueMs}, target=${targetGlobalMs})`
    ).toBeLessThanOrEqual(globalToleranceMs);

    expect(
      Math.abs(oracle.audioCurrentTime - targetAudioSec),
      `audio currentTime near ratio×duration (observed=${oracle.audioCurrentTime}s, target=${targetAudioSec}s)`
    ).toBeLessThanOrEqual(audioToleranceSec);

    expect(oracle.audioCurrentTime).toBeLessThan(oracle.audioDuration);

    expect(
      rangeStatuses.some((status) => status === 206),
      `share audio scrub should issue at least one Range→206 (seen statuses: ${rangeStatuses.join(",") || "none"})`
    ).toBe(true);
  });

  test("revoked share token: share replay page 404 and audio proxy 403", async ({
    page,
    request,
  }) => {
    const fixture = await seedShareAudioDenyFixture();

    const pageResp = await page.goto(
      `/s/${fixture.revokedShareToken}/whiteboard/${fixture.sessionId}`
    );
    expect(pageResp?.status(), "revoked share whiteboard replay").toBe(404);
    await expect(page.getByTestId("wb-replay-audio")).toHaveCount(0);

    const audioResp = await request.get(
      `/api/audio/${fixture.recordingId}?token=${encodeURIComponent(fixture.revokedShareToken)}`
    );
    expect(audioResp.status(), "revoked token audio proxy").toBe(403);
    const body = (await audioResp.json()) as { error?: string };
    expect(body.error).toMatch(/revoked|denied|access/i);
  });

  test("out-of-scope recording: share audio proxy returns 404 (no stream)", async ({
    request,
  }) => {
    const fixture = await seedShareAudioDenyFixture();

    const audioResp = await request.get(
      `/api/audio/${fixture.foreignRecordingId}?token=${encodeURIComponent(fixture.shareToken)}`
    );
    expect(audioResp.status(), "foreign recording with valid share token").toBe(404);
    const body = (await audioResp.json()) as { error?: string };
    expect(body.error).toMatch(/not found/i);
  });
});
