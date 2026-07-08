import { test, expect } from "./fixtures";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * WS-I — tutor self-mute must silence the tutor mic in the recording mixdown
 * (recording-branch gain gate) without affecting consented remote/learner audio.
 *
 * Oracle: test-only readback seams on the Web Audio graph (real browser —
 * jsdom has no Web Audio). Human replay verification stays smokebook item 24.
 */

type RecordingGainTestWindow = {
  __VAD_TEST_TUTOR_RECORDING_MUTE_GAIN__?: number;
  __VAD_TEST_REMOTE_RECORDING_GAINS__?: Record<string, number>;
};

async function readTutorRecordingMuteGain(
  page: import("@playwright/test").Page
): Promise<number | undefined> {
  return page.evaluate(() => {
    const w = window as unknown as RecordingGainTestWindow;
    return w.__VAD_TEST_TUTOR_RECORDING_MUTE_GAIN__;
  });
}

async function readRemoteRecordingGains(
  page: import("@playwright/test").Page
): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const w = window as unknown as RecordingGainTestWindow;
    return { ...(w.__VAD_TEST_REMOTE_RECORDING_GAINS__ ?? {}) };
  });
}

async function waitForTutorRecordingGraphReady(
  page: import("@playwright/test").Page
) {
  await expect
    .poll(() => readTutorRecordingMuteGain(page), {
      timeout: 90_000,
      message: "tutor recording mute gain seam never initialized (graph not ready)",
    })
    .toBe(1);
}

/** Poll until the test seam exists (graph built); value may be 0 or 1. */
async function waitForTutorRecordingGraphInitialized(
  page: import("@playwright/test").Page
) {
  await expect
    .poll(
      async () => {
        const gain = await readTutorRecordingMuteGain(page);
        return typeof gain === "number" ? gain : null;
      },
      {
        timeout: 90_000,
        message: "tutor recording mute gain seam never initialized (graph not ready)",
      }
    )
    .not.toBeNull();
}

test.describe("WS-I tutor recording-branch mute gate", { tag: [TAG.WB_RECORDING] }, () => {
  test("solo tutor: mute before graph ready → recording gain 0 at init", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    const micToggle = page.getByTestId("wb-topbar-mic-toggle");
    // Race: mute before the recording graph test seam exists (Andrew's repro).
    await expect
      .poll(
        async () => {
          const gain = await readTutorRecordingMuteGain(page);
          if (typeof gain === "number") return "graph-ready";
          if (await micToggle.isVisible().catch(() => false)) {
            await micToggle.click();
            return "muted-early";
          }
          return "waiting";
        },
        {
          timeout: 90_000,
          message: "could not mute before recording graph initialized",
        }
      )
      .toBe("muted-early");

    await waitForTutorRecordingGraphInitialized(page);
    await expect
      .poll(() => readTutorRecordingMuteGain(page), {
        timeout: 10_000,
        message:
          "mute before session start should initialize recording-branch gain to 0",
      })
      .toBe(0);
  });

  test("solo tutor: mute toggle drives recording-branch gain 1→0→1", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await waitForTutorRecordingGraphReady(page);

    const micToggle = page.getByTestId("wb-topbar-mic-toggle");
    await expect(micToggle).toBeVisible({ timeout: 30_000 });

    await micToggle.click();
    await expect
      .poll(() => readTutorRecordingMuteGain(page), {
        timeout: 10_000,
        message: "tutor mute should set recording-branch gain to 0",
      })
      .toBe(0);

    await micToggle.click();
    await expect
      .poll(() => readTutorRecordingMuteGain(page), {
        timeout: 10_000,
        message: "tutor unmute should restore recording-branch gain to 1",
      })
      .toBe(1);
  });

  test("two-party: tutor mute does not change remote recording gain", {
    tag: [TAG.WB_PRESENCE, TAG.WB_AV],
  }, async ({ browser }) => {
    test.setTimeout(180_000);

    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
    });
    try {
      await waitForTutorStudentConnected(peers.tutorPage);

      await waitForTutorRecordingGraphReady(peers.tutorPage);

      await expect
        .poll(
          async () => {
            const gains = await readRemoteRecordingGains(peers.tutorPage);
            return Object.keys(gains).length;
          },
          {
            timeout: 90_000,
            message: "remote participant never attached to recording mixdown",
          }
        )
        .toBeGreaterThan(0);

      const remoteBefore = await readRemoteRecordingGains(peers.tutorPage);

      const micToggle = peers.tutorPage.getByTestId("wb-topbar-mic-toggle");
      await expect(micToggle).toBeVisible({ timeout: 30_000 });
      await micToggle.click();

      await expect
        .poll(() => readTutorRecordingMuteGain(peers.tutorPage), {
          timeout: 10_000,
        })
        .toBe(0);

      const remoteAfterMute = await readRemoteRecordingGains(peers.tutorPage);
      expect(remoteAfterMute).toEqual(remoteBefore);

      await micToggle.click();
      await expect
        .poll(() => readTutorRecordingMuteGain(peers.tutorPage), {
          timeout: 10_000,
        })
        .toBe(1);

      const remoteAfterUnmute = await readRemoteRecordingGains(peers.tutorPage);
      expect(remoteAfterUnmute).toEqual(remoteBefore);
    } finally {
      await peers.close();
    }
  });
});
