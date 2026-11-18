/**
 * Shared "record a real session, end it, land in review" helpers for the
 * replay specs (scrub-seek, start-position). One implementation of the VAD
 * override harness and the End flow, so a change to either is made once.
 */

import { expect, type Page } from "@playwright/test";
import { withPrisma } from "../helpers/consent-db-oracle";
import { driveTwoVadSilenceCuts, injectVadOverrides } from "../helpers/vad-test-meter";
import { seedWbLiveSyncSession, waitForWbE2eBridge } from "./whiteboard-live-sync.helpers";
import { uploadHarnessBlob, uploadReplayEvents } from "./wb-replay-harness.helpers";

/**
 * Mute wb-replay-audio the moment it mounts. Headless Chrome can refuse
 * autoplay for unmuted media; position and time assertions stay real.
 */
export async function muteReplayAudioWhenPresent(page: Page) {
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

/**
 * Open the workspace, record for a while, End the session, and wait for the
 * in-shell review's Replay button. `soloMs` is the idle recording time when
 * `multiSegment` is off.
 */
export async function recordEndEnterReplay(
  page: Page,
  studentId: string,
  whiteboardSessionId: string,
  opts?: { multiSegment?: boolean; soloMs?: number }
) {
  if (opts?.multiSegment) {
    await injectVadOverrides(page);
  }
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");

  if (opts?.multiSegment) {
    await driveTwoVadSilenceCuts(page);
  } else {
    await page.waitForTimeout(opts?.soloMs ?? 5_000);
  }

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
}

/**
 * Seed an ENDED session with one tutor:mic recording whose bytes the test supplies,
 * stored as a real harness blob so the app's audio proxy serves it (Range and all).
 * `payload: "concat"` also points the session's concat master at the same blob.
 * Returns the session; open its workspace URL to land in the in-shell review.
 */
export async function seedEndedSessionWithAudioClip(
  page: Page,
  opts: {
    clip: Buffer;
    contentType: string;
    fileExt: string;
    /** Real length in seconds; the DB columns are whole seconds, like production. */
    clipSec: number;
    payload: "segments" | "concat";
  }
) {
  const session = await seedWbLiveSyncSession();
  const clipUrl = await uploadHarnessBlob({
    request: page.request,
    pathname: `audio/${session.adminUserId}/${session.studentId}/pw-replay-clip-${Date.now()}.${opts.fileExt}`,
    body: opts.clip,
    contentType: opts.contentType,
    clientPayload: { kind: "audio", studentId: session.studentId },
  });
  await withPrisma(async (p) => {
    await p.whiteboardSession.update({
      where: { id: session.whiteboardSessionId },
      data: {
        endedAt: new Date("2026-10-11T18:30:00.000Z"),
        concatBlobUrl: opts.payload === "concat" ? clipUrl : null,
        concatDurationSeconds: opts.payload === "concat" ? Math.round(opts.clipSec) : null,
        durationSeconds: Math.max(8, Math.ceil(opts.clipSec)),
      },
    });
    await p.sessionRecording.create({
      data: {
        adminUserId: session.adminUserId,
        studentId: session.studentId,
        whiteboardSessionId: session.whiteboardSessionId,
        blobUrl: clipUrl,
        mimeType: opts.contentType,
        sizeBytes: opts.clip.length,
        durationSeconds: Math.round(opts.clipSec),
        orderIndex: 0,
        streamId: "tutor:mic",
      },
    });
  });
  await uploadReplayEvents({
    request: page.request,
    adminUserId: session.adminUserId,
    studentId: session.studentId,
    whiteboardSessionId: session.whiteboardSessionId,
  });
  return session;
}

/** Total seconds of recorded audio for a session, straight from the DB (independent of the replay UI). */
export async function recordedSecondsInDb(whiteboardSessionId: string): Promise<number> {
  const agg = await withPrisma((p) =>
    p.sessionRecording.aggregate({
      where: { whiteboardSessionId },
      _sum: { durationSeconds: true },
    })
  );
  return agg._sum.durationSeconds ?? 0;
}
