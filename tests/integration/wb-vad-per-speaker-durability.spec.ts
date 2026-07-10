import { test, expect } from "./fixtures";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { TAG } from "../test-tags";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  waitForTutorStudentConnected,
} from "./whiteboard-live-sync.helpers";

/**
 * WS-A — VAD + per-speaker transcription lanes + replay-mix invariant.
 * Steps 1–2 + red-before cases: solo tutor path (Part 1).
 * Steps 3, 5, 5b: hermetic relay two-party (Part 2 A3+A4).
 */

const TEST_SECRET = process.env.PLAYWRIGHT_TEST_SECRET ?? "playwright-test-secret";

/** Above injectVadOverrides threshold (0.15) — forces "speech" in VAD tick. */
const VAD_METER_HIGH = 0.5;
/** Below threshold — forces silence accumulation toward a boundary cut. */
const VAD_METER_LOW = 0;

async function injectVadOverrides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number;
      __VAD_SILENCE_HOLD_MS_OVERRIDE?: number;
      __VAD_SILENCE_RMS_THRESHOLD_OVERRIDE?: number;
      __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number;
      __VAD_CUT_DISABLED?: boolean;
      __VAD_TEST_METER_LEVEL__?: number;
    };
    w.__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    w.__VAD_SILENCE_HOLD_MS_OVERRIDE = 800;
    w.__VAD_SILENCE_RMS_THRESHOLD_OVERRIDE = 0.15;
    w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 120;
    w.__VAD_TEST_METER_LEVEL__ = 0.5;
  });
}

async function setVadTestMeterLevel(
  page: import("@playwright/test").Page,
  level: number
) {
  await page.evaluate((lvl) => {
    (window as unknown as { __VAD_TEST_METER_LEVEL__?: number }).__VAD_TEST_METER_LEVEL__ =
      lvl;
  }, level);
}

/**
 * Drive speak → silence → speak → silence via the test-only meter seam so
 * ≥2 VAD boundary cuts fire (VAD_MIN=1s, SILENCE_HOLD=800ms in overrides).
 */
async function driveTwoVadSilenceCuts(page: import("@playwright/test").Page) {
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
  await setVadTestMeterLevel(page, VAD_METER_HIGH);
  await page.waitForTimeout(1_200);
  await setVadTestMeterLevel(page, VAD_METER_LOW);
  await page.waitForTimeout(1_000);
}

async function fetchRecordingCount(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/recording-count`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { count: number; byStream: Record<string, number> };
}

async function fetchTranscriptChunks(
  page: import("@playwright/test").Page,
  sessionId: string
) {
  const res = await page.request.get(
    `/api/test/whiteboard/${sessionId}/transcript-chunks`,
    { headers: { Authorization: `Bearer ${TEST_SECRET}` } }
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as {
    count: number;
    byStream: Record<string, number>;
    rows: Array<{ streamId: string; speakerId: string | null; status: string }>;
    tutorNoteStatus: string | null;
  };
}

type OutboxRowSnapshot = {
  streamId: string;
  transcriptionOnly?: boolean;
  blobRemoteUrl: string | null;
};

async function listOutboxRowsForSession(
  page: import("@playwright/test").Page,
  sessionId: string
): Promise<OutboxRowSnapshot[]> {
  return page.evaluate(async (wbsid) => {
    const DB_NAME = "tutoring-notes-upload-outbox";
    const STORE = "rows";
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const all = await new Promise<OutboxRowSnapshot[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as OutboxRowSnapshot[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.filter((r) => (r as { sessionId?: string }).sessionId === wbsid);
  }, sessionId);
}

/** WS-N seam — same stub as wb-tab-kill-audio-durability.spec.ts `installControllableUploadStub`. */
function installControllableUploadStub(
  context: import("@playwright/test").BrowserContext,
  opts: { block: boolean; delayMs: number }
) {
  let uploadSeq = 0;
  return context.route("**/api/upload/blob**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    if (opts.block) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "upload blocked for tab-kill test" }),
      });
      return;
    }
    if (opts.delayMs > 0) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }
    uploadSeq += 1;
    try {
      await route.continue();
    } catch {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: `https://test.public.blob.vercel-storage.com/wb-tab-kill-${uploadSeq}.webm`,
        }),
      });
    }
  });
}

test.describe(
  "wb VAD + incremental SessionRecording (WS-A A1+A2)",
  { tag: [TAG.WB_RECORDING] },
  () => {
  test("speak → silence → speak yields ≥2 mixdown uploads and mid-session DB rows", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await injectVadOverrides(page);

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    // Let recording + meter RAF start, then drive two silence-boundary cuts.
    await page.waitForTimeout(2_000);
    await driveTwoVadSilenceCuts(page);

    await expect
      .poll(
        async () => {
          const mid = await fetchRecordingCount(page, whiteboardSessionId);
          return mid.count;
        },
        { timeout: 120_000, intervals: [500, 1000, 2000] }
      )
      .toBeGreaterThanOrEqual(2);

    const mid = await fetchRecordingCount(page, whiteboardSessionId);
    expect(mid.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("red-before: VAD cut disabled → recording count stays below 2", async ({ page }) => {
    test.setTimeout(180_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.addInitScript(() => {
      const w = window as unknown as {
        __VAD_CUT_DISABLED?: boolean;
        __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number;
        __VAD_TEST_METER_LEVEL__?: number;
      };
      w.__VAD_CUT_DISABLED = true;
      w.__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 9999;
      w.__VAD_TEST_METER_LEVEL__ = 0.5;
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.waitForTimeout(2_000);
    await driveTwoVadSilenceCuts(page);
    await page.waitForTimeout(5_000);

    const mid = await fetchRecordingCount(page, whiteboardSessionId);
    expect(mid.count).toBeLessThan(2);
  });

  test("red-before: SESSION_SAFETY_MAX_SECONDS override still hard-stops", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
    await page.addInitScript(() => {
      (
        window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number }
      ).__SESSION_SAFETY_MAX_SECONDS_OVERRIDE = 8;
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
      timeout: 90_000,
    });

    await page.waitForTimeout(12_000);

    const panelHidden = await page
      .getByTestId("audio-record-controls")
      .isHidden()
      .catch(() => true);
    const reviewVisible = await page
      .getByTestId("wb-session-review-mode")
      .isVisible()
      .catch(() => false);
    expect(panelHidden || reviewVisible).toBeTruthy();
  });
  }
);

test.describe(
  "wb per-speaker transcription + replay-mix (WS-A A3+A4)",
  { tag: [TAG.WB_RECORDING] },
  () => {
  test("student speaks → transcriptionOnly upload; End → chunks + replay is mixdown-only", async ({
    browser,
  }) => {
    test.setTimeout(420_000);

    test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await injectVadOverrides(peers.tutorPage);
      await injectVadOverrides(peers.studentPage);

      await peers.tutorPage.waitForTimeout(2_000);
      await driveTwoVadSilenceCuts(peers.tutorPage);

      await expect
        .poll(
          async () => {
            const mid = await fetchRecordingCount(
              peers.tutorPage,
              session.whiteboardSessionId
            );
            return mid.byStream["tutor:mic"] ?? 0;
          },
          { timeout: 120_000, intervals: [500, 1000, 2000] }
        )
        .toBeGreaterThanOrEqual(1);

      const midMixdown = await fetchRecordingCount(
        peers.tutorPage,
        session.whiteboardSessionId
      );

      await peers.studentPage.waitForTimeout(5_000);
      await peers.tutorPage.waitForTimeout(3_000);

      const outboxRows = await listOutboxRowsForSession(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      const studentTxRows = outboxRows.filter(
        (r) =>
          r.transcriptionOnly === true &&
          /^student:peer-.+:mic$/.test(r.streamId) &&
          typeof r.blobRemoteUrl === "string" &&
          r.blobRemoteUrl.length > 0
      );
      expect(studentTxRows.length).toBeGreaterThanOrEqual(1);

      const mixdownUploadCount = midMixdown.byStream["tutor:mic"] ?? 0;

      await peers.tutorPage.getByTestId("wb-end-session").click();
      const confirmBtn = peers.tutorPage.getByTestId("wb-end-session-confirm-yes");
      if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await expect(peers.tutorPage.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 180_000,
      });

      await expect
        .poll(
          async () => {
            const tx = await fetchTranscriptChunks(
              peers.tutorPage,
              session.whiteboardSessionId
            );
            return tx.tutorNoteStatus;
          },
          { timeout: 240_000 }
        )
        .toMatch(/^(done|partial)$/);

      const tx = await fetchTranscriptChunks(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      expect(tx.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(1);
      // [human-only] Fake-mic synthetic WebM cannot be transcribed by Whisper (400 /
      // ffmpeg corrupt); per-speaker upload+enqueue path is proven (WS-A outbox 5-axis
      // review); transcript E2E requires real audio hardware.
      if (process.env.HUMAN_ONLY_AUDIO) {
        const perSpeakerStreamIds = Object.keys(tx.byStream).filter((id) =>
          id.startsWith("speaker:")
        );
        expect(perSpeakerStreamIds.length).toBeGreaterThanOrEqual(1);
      }

      const replay = await fetchRecordingCount(
        peers.tutorPage,
        session.whiteboardSessionId
      );
      // Replay set is mixdown-only; count may grow between mid-session snapshot and End.
      expect(replay.count).toBeGreaterThanOrEqual(mixdownUploadCount);
      expect(replay.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(mixdownUploadCount);
      for (const streamId of Object.keys(replay.byStream)) {
        expect(streamId).toBe("tutor:mic");
      }
    } finally {
      await peers.close();
    }
  });
  }
);

test.describe(
  "wb VAD durability through tutor tab-kill (WS-A + WS-N)",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("two-party VAD backlog survives tab-kill → End preserves mixdown replay set", async ({
      browser,
    }) => {
      /**
       * Oracle: `/api/test/whiteboard/{id}/recording-count` — persisted
       * SessionRecording rows grouped by streamId (same contract as P1-WB-1 /
       * wb-session-lifecycle REPLAY-MIX). Independent of outbox hooks or VAD internals.
       *
       * Red-before (2026-07-05): reversing `final.count >= preKillCount` or allowing
       * non-tutor:mic streams in byStream fails when kill drops durable segments.
       */
      test.setTimeout(420_000);

      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const session = await seedWbLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session);
      try {
        await injectVadOverrides(peers.tutorPage);
        await injectVadOverrides(peers.studentPage);

        const stubOpts = { block: false, delayMs: 0 };
        await installControllableUploadStub(peers.tutorContext, stubOpts);

        await peers.tutorPage.waitForTimeout(2_000);
        await driveTwoVadSilenceCuts(peers.tutorPage);

        await expect
          .poll(
            async () => {
              const mid = await fetchRecordingCount(
                peers.tutorPage,
                session.whiteboardSessionId
              );
              return mid.byStream["tutor:mic"] ?? 0;
            },
            { timeout: 120_000, intervals: [500, 1000, 2000] }
          )
          .toBeGreaterThanOrEqual(1);

        const preKill = await fetchRecordingCount(
          peers.tutorPage,
          session.whiteboardSessionId
        );
        const preKillCount = preKill.count;
        expect(preKillCount).toBeGreaterThanOrEqual(1);

        // Mid-backlog: block tutor uploads while per-speaker lanes keep running.
        stubOpts.block = true;
        await driveTwoVadSilenceCuts(peers.tutorPage);
        await peers.studentPage.waitForTimeout(4_000);
        await peers.tutorPage.waitForTimeout(1_500);

        // WS-N tab-kill seam: close tutor page only — same BrowserContext keeps IDB.
        await peers.tutorPage.close();

        const resumePage = await peers.tutorContext.newPage();
        await injectVadOverrides(resumePage);
        stubOpts.block = false;
        stubOpts.delayMs = 50;

        await resumePage.goto(
          `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
          { waitUntil: "domcontentloaded" }
        );
        await expect(resumePage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(resumePage, "tutor");
        await waitForTutorStudentConnected(resumePage);

        // WS-N seam — let blocked segments drain before End (same poll shape as tab-kill spec).
        await expect
          .poll(
            async () => {
              const rows = await listOutboxRowsForSession(
                resumePage,
                session.whiteboardSessionId
              );
              return rows.filter(
                (r) =>
                  r.streamId === "tutor:mic" &&
                  r.transcriptionOnly !== true &&
                  r.blobRemoteUrl
              ).length;
            },
            { timeout: 60_000, intervals: [500, 1000, 2000] }
          )
          .toBeGreaterThanOrEqual(1);

        const endBtn = resumePage.getByTestId("wb-end-session");
        await expect(endBtn).toBeEnabled();
        await endBtn.click();
        await expect(resumePage.getByTestId("wb-end-session-confirm")).toBeVisible({
          timeout: 15_000,
        });
        await resumePage.getByTestId("wb-end-session-confirm-yes").click();

        await expect(resumePage.getByTestId("wb-session-review-mode")).toBeVisible({
          timeout: 180_000,
        });

        await expect
          .poll(
            async () => {
              const replay = await fetchRecordingCount(
                resumePage,
                session.whiteboardSessionId
              );
              return replay.count;
            },
            { timeout: 180_000, intervals: [1000, 2000, 3000] }
          )
          .toBeGreaterThanOrEqual(preKillCount);

        const replay = await fetchRecordingCount(
          resumePage,
          session.whiteboardSessionId
        );
        expect(replay.count).toBeGreaterThanOrEqual(preKillCount);
        expect(replay.byStream["tutor:mic"] ?? 0).toBeGreaterThanOrEqual(preKillCount);
        for (const streamId of Object.keys(replay.byStream)) {
          expect(
            streamId,
            "REPLAY-MIX: replay rows must be tutor:mic mixdown only after tab-kill"
          ).toBe("tutor:mic");
        }
      } finally {
        await peers.close();
      }
    });
  }
);
