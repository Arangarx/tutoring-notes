/**
 * Consent wave — fake-media mic rows (spy on getUserMedia injected before load).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-mic.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test, expect, webkit, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { installGetUserMediaSpy, readGetUserMediaSpy } from "../helpers/get-user-media-spy";
import { openTutorAndStudent } from "./whiteboard-live-sync.helpers";
import {
  audioRequests,
  chooseMode,
  endFromWorkspace,
  laneCreateLines,
  micBlockedLines,
  openTutorRoom,
  seedConsentSession,
  startFromWaitingRoom,
  type ConsentRoomSession,
  type TutorRoom,
} from "../helpers/consent-tutor-room";

const AUDIO_OFF = { allowAudioRecording: false } as const;

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Every segment the server stored for the session, by lane (the outbox's end of the pipe). */
const segmentLanes = async (id: string) =>
  (await prisma.sessionRecording.findMany({ where: { whiteboardSessionId: id }, select: { streamId: true } })).map(
    (r) => r.streamId
  );

const overlay = (page: Page) => page.getByTestId("wb-waiting-overlay");

/** The camera comes on by itself when permission is already granted; otherwise the tutor taps the camera chip. */
async function ensureCameraRequested(page: Page) {
  const asked = async () => (await readGetUserMediaSpy(page)).videoCalls;
  try {
    await expect.poll(asked, { timeout: 8_000 }).toBeGreaterThan(0);
  } catch {
    await overlay(page).getByTestId("wb-topbar-cam-toggle").click();
    await expect.poll(asked, { timeout: 20_000 }).toBeGreaterThan(0);
  }
}

/** Run `body` against a fresh tutor room; always closes the browser context and drops the extra consent versions. */
async function withTutorRoom(
  browser: import("@playwright/test").Browser,
  seed: Parameters<typeof seedConsentSession>[0],
  body: (room: TutorRoom, s: ConsentRoomSession) => Promise<void>
) {
  const s = await seedConsentSession(seed);
  const room = await openTutorRoom(browser, s);
  try {
    await body(room, s);
  } finally {
    await room.close();
    await s.cleanup();
  }
}

// Setup (BL1): WebKit rows M6 (spy-only), M10, M13 run the student on `devices["iPhone 13"]` via openTutorAndStudent({ studentBrowser: "webkit" })
// with `installGetUserMediaSpy(context, "stub")`. M11/M12 (and M14-M16) run on Chromium with `studentHasTouch: true` and the project's fake-media
// flags, spy in "passthrough" mode, because M12's oracle (inbound RTP at the tutor) needs real tracks. Both setups are proven in
// wb-consent-harness-selftest.spec.ts.

// ---------------------------------------------------------------------------
// 6d. Mic openers (B4, D7)
// ---------------------------------------------------------------------------
test.describe("consent 6d: Mic openers (B4, D7)", {
  tag: [TAG.WB_CONSENT, TAG.WB_AV, TAG.WB_RECORDING],
}, () => {
  // Oracle: Spy count = 0
  test(
    "M1: in person, audio off: zero audio getUserMedia calls from waiting room through End",
    async ({ browser }) => {
      test.setTimeout(240_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }, s) => {
        await page.waitForTimeout(3_000);
        await chooseMode(page, "IN_PERSON");
        await page.waitForTimeout(2_000);
        await startFromWaitingRoom(page);
        await page.waitForTimeout(3_000);
        await endFromWorkspace(page);
        expect(await audioRequests(page)).toBe(0);
        expect(await segmentLanes(s.whiteboardSessionId)).toEqual([]);
      });
    }
  );
  // Oracle: Spy count = 0 after click
  test(
    "M2: in person, audio off: the top-bar mic control does not open the mic",
    async ({ browser }) => {
      test.setTimeout(180_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await chooseMode(page, "IN_PERSON");
        await startFromWaitingRoom(page);
        const toggle = page.getByTestId("wb-topbar-mic-toggle");
        await expect(toggle).toBeVisible();
        await expect(toggle).toBeDisabled();
        await toggle.click({ force: true });
        await page.waitForTimeout(1_500);
        expect(await audioRequests(page)).toBe(0);
      });
    }
  );
  // Oracle: Spy count = 0
  // The tutor's permission-request surface is the waiting room's mic chip (the tutor shell renders no AVPermissionsPrompt).
  test(
    "M3: in person, audio off: the A/V permission prompt does not request the mic",
    async ({ browser }) => {
      test.setTimeout(180_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await chooseMode(page, "IN_PERSON");
        const micChip = overlay(page).getByTestId("wb-topbar-mic-toggle");
        await expect(micChip).toBeDisabled();
        await micChip.click({ force: true });
        await page.waitForTimeout(1_500);
        expect(await audioRequests(page)).toBe(0);
      });
    }
  );
  // Oracle: Spy count = 0
  test(
    "M4: in person, audio off: the device picker and device swap do not open the mic",
    async ({ browser }) => {
      test.setTimeout(180_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page, consoleLines }) => {
        await chooseMode(page, "IN_PERSON");
        const picker = overlay(page).getByTestId("audio-device-select");
        await expect(picker).toBeVisible();
        await expect.poll(() => picker.locator("option").count(), { timeout: 15_000 }).toBeGreaterThan(1);
        await expect(picker).toBeEnabled();
        const before = micBlockedLines(consoleLines).length;
        await picker.selectOption({ index: 1 });
        await expect.poll(() => micBlockedLines(consoleLines).length, { timeout: 5_000 }).toBeGreaterThan(before);
        await page.waitForTimeout(1_000);
        expect(await audioRequests(page)).toBe(0);
      });
    }
  );
  // Oracle: Track 'readyState === "ended"'; meter stopped
  test(
    "M5: flip to in person after the mic was open (online selected): the mic is released before Start",
    async ({ browser }) => {
      test.setTimeout(180_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await chooseMode(page, "LIVE");
        const liveAudio = async () =>
          (await readGetUserMediaSpy(page)).tracks.filter((t) => t.kind === "audio" && t.readyState === "live").length;
        await expect.poll(liveAudio, { timeout: 20_000 }).toBeGreaterThan(0);
        await expect(overlay(page).getByTestId("wb-topbar-mic-toggle")).toBeEnabled();

        await chooseMode(page, "IN_PERSON");
        await expect.poll(liveAudio, { timeout: 10_000 }).toBe(0);
        const audioTracks = (await readGetUserMediaSpy(page)).tracks.filter((t) => t.kind === "audio");
        expect(audioTracks.length).toBeGreaterThan(0);
        for (const t of audioTracks) expect(t.readyState).toBe("ended");
        // The level meter has no stream to read: the chip is back to its no-mic state.
        await expect(overlay(page).getByTestId("wb-topbar-mic-toggle")).toBeDisabled();
        await expect(overlay(page)).toBeVisible();
      });
    }
  );
  // Oracle: Video track live and audio track absent; 'micAcquireSettled' true. Chromium (fake media) for the live-track assertion; a WebKit variant is spy-only (no fake media there, BL1): the 'video' constraint is requested and no a …
  // `micAcquireSettled` is not exposed; the tutor's camera request waits on it (useLiveAvCoordinator), so a camera that
  // arrives proves it settled.
  test(
    "M6: camera still works after a skipped mic",
    async ({ browser }) => {
      test.setTimeout(180_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await chooseMode(page, "IN_PERSON");
        await ensureCameraRequested(page);
        const liveVideo = async () =>
          (await readGetUserMediaSpy(page)).tracks.filter((t) => t.kind === "video" && t.readyState === "live").length;
        await expect.poll(liveVideo, { timeout: 30_000 }).toBeGreaterThan(0);
        const spy = await readGetUserMediaSpy(page);
        expect(spy.audioCalls).toBe(0);
        expect(spy.tracks.filter((t) => t.kind === "audio")).toEqual([]);
      });
    }
  );
  test(
    "M6 (WebKit, spy-only): camera still works after a skipped mic",
    async () => {
      test.setTimeout(240_000);
      const s = await seedConsentSession({ switches: AUDIO_OFF });
      const wk = await webkit.launch();
      try {
        const room = await openTutorRoom(wk, s, { spy: "stub", permissions: [] });
        try {
          await chooseMode(room.page, "IN_PERSON");
          await ensureCameraRequested(room.page);
          expect((await readGetUserMediaSpy(room.page)).audioCalls).toBe(0);
        } finally {
          await room.close();
        }
      } finally {
        await wk.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Learner spy count of audio constraints = 0; camera acquired
  test.fixme(
    "M7: in person, audio off: the learner-side bootstrap opens no audio",
    async () => {
      // pending: wave that owns M7
    }
  );
  // Oracle: Positive control: spy count ≥ 1; no segments
  // CHARACTERIZATION on the tutor (green before C3b: the tutor mic was always acquired). Online with audio off is
  // `tutor_only`: the tutor's own mic is acquired and is the only lane; no learner-lane segment is ever stored.
  test(
    "M8: online, audio off: the mic is still acquired for the live conversation but never recorded",
    async ({ browser }) => {
      test.setTimeout(240_000);
      const s = await seedConsentSession({ switches: AUDIO_OFF });
      const pair = await openTutorAndStudent(browser, s, {
        ensureFollow: false,
        prepareContext: (ctx) => installGetUserMediaSpy(ctx, "passthrough"),
      });
      const tutorLines: string[] = [];
      pair.tutorPage.on("console", (m) => tutorLines.push(m.text()));
      try {
        const page = pair.tutorPage;
        await chooseMode(page, "LIVE");
        await expect.poll(() => audioRequests(page), { timeout: 20_000 }).toBeGreaterThan(0);
        await expect(overlay(page).getByTestId("wb-topbar-mic-toggle")).toBeEnabled();
        await startFromWaitingRoom(page);
        await page.waitForTimeout(5_000);
        await endFromWorkspace(page);
        expect(laneCreateLines(tutorLines)).toEqual([]);
        for (const lane of await segmentLanes(s.whiteboardSessionId)) expect(lane).toBe("tutor:mic");
      } finally {
        await pair.close();
        await s.cleanup();
      }
    }
  );
  // Oracle: Spy count = 0 until mode selected; then ≥ 1 for online, 0 for in person
  test(
    "M9: audio off, mode not yet chosen: mic acquisition is deferred",
    async ({ browser }) => {
      test.setTimeout(240_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await page.waitForTimeout(4_000);
        expect(await audioRequests(page)).toBe(0);
        await chooseMode(page, "LIVE");
        await expect.poll(() => audioRequests(page), { timeout: 20_000 }).toBeGreaterThan(0);
      });
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await page.waitForTimeout(4_000);
        expect(await audioRequests(page)).toBe(0);
        await chooseMode(page, "IN_PERSON");
        await page.waitForTimeout(3_000);
        expect(await audioRequests(page)).toBe(0);
      });
    }
  );
  // Oracle: Spy-only (BL1). Stubbed 'getUserMedia' on the WebKit project records the constraints; no real tracks exist there (the fake-media flags are Chromium-only, 'playwright.config.ts' 41–45), so the oracle is the count of audio …
  test.fixme(
    "M10: WebKit (iPhone 13) student: no audio request in an in-person audio-off session",
    async () => {
      // pending: wave that owns M10
    }
  );
  // Oracle: B4, C3c; red today. Chromium with 'hasTouch: true' and the fake-media flags, in 'wb-regression' (BL1, re-review 3; not WebKit: no fake media there). The learner is a touch-primary device ('isTouchPrimaryDevice()', 'useLi …
  test.fixme(
    "M11: learner, audio off, mode not yet known (PENDING): the touch bundle requests video only, then audio after Start says online",
    async () => {
      // pending: wave that owns M11
    }
  );
  // Oracle: B4; the risk the deferral creates. Same Chromium + 'hasTouch' + fake-media setup as M11 (BL1), with the same 10 s 'expect.poll' window (SF-I), because inbound RTP bytes need real tracks that WebKit cannot supply here. Th …
  test.fixme(
    "M12: learner: after a deferred mic acquire the tutor actually hears the learner",
    async () => {
      // pending: wave that owns M12
    }
  );
  // Oracle: B4. Spy-only on WebKit (BL1): stubbed 'getUserMedia', count of audio constraints, no track bytes; the same assertion also runs on the Chromium 'hasTouch' setup of M11, with the 10 s poll window (SF-I). The learner is con …
  test.fixme(
    "M13: learner, audio off, in person: zero audio getUserMedia calls across PENDING, Start, ACTIVE and End",
    async () => {
      // pending: wave that owns M13
    }
  );
  // Oracle: B4 (d). After Start, reload the learner. The shell's first render already has the right mode and capabilities (DOM 'data-' attributes the shell exposes, and the same A/V decision: no extra audio call for in-person audio- …
  test.fixme(
    "M14: learner reloads or opens /join after Start: mode and capabilities arrive in the first render",
    async () => {
      // pending: wave that owns M14
    }
  );
  // Oracle: B4 control. On touch, audio recording on: exactly one 'getUserMedia' call carrying both kinds, issued at connect, before Start (as today, 'useLiveAV.ts' 1494–1497). Proves the 'wantAudio' split does not touch the path th …
  test.fixme(
    "M15: learner, audio on: behavior is unchanged — one bundled call carrying audio and video at connect",
    async () => {
      // pending: wave that owns M15
    }
  );
  // Oracle: SF-D, re-review 3; red today, both roles. Learner on Chromium with 'hasTouch' (M11's setup), audio off. Click every manual acquire path by the real control: the top-bar mic button ('handleTopBarMic'), the 'AVPermissionsP …
  test.fixme(
    "M16: learner, audio off, mode not yet known or in person: the manual mic controls cannot acquire a mic",
    async () => {
      // pending: C3c owns the learner arms (mode PENDING = defer, in person = no). The tutor arm is live below (C3b).
    }
  );
  // M16 tutor arm (C3b): the gate is symmetric (§ 4.1 item 2). In-person audio-off session: every manual tutor mic
  // control renders disabled, clicking it opens nothing, and the blocked request is logged. Control: online with audio
  // off, the same control is enabled and the mic is acquired (the mic is still used live, M8).
  test(
    "M16 (tutor arm): in person, audio off: the tutor's manual mic controls cannot acquire a mic; online audio off still can",
    async ({ browser }) => {
      test.setTimeout(240_000);
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page, consoleLines }) => {
        await chooseMode(page, "IN_PERSON");
        await expect(overlay(page).getByTestId("wb-topbar-mic-toggle")).toBeDisabled();
        await startFromWaitingRoom(page);
        await expect(page.getByTestId("wb-topbar-mic-toggle")).toBeDisabled();
        await expect(page.getByTestId("wb-topbar-mic-settings")).toBeDisabled();
        await page.getByTestId("wb-topbar-mic-toggle").click({ force: true });
        await page.waitForTimeout(1_500);
        expect(await audioRequests(page)).toBe(0);
        // A disabled control dispatches no click, so nothing reaches the hook to log here; M4 owns the hook's log.
        expect(micBlockedLines(consoleLines).filter((l) => !l.includes("reason=no") && !l.includes("reason=defer"))).toEqual([]);
      });
      await withTutorRoom(browser, { switches: AUDIO_OFF }, async ({ page }) => {
        await chooseMode(page, "LIVE");
        await expect(overlay(page).getByTestId("wb-topbar-mic-toggle")).toBeEnabled({ timeout: 20_000 });
        await expect.poll(() => audioRequests(page), { timeout: 20_000 }).toBeGreaterThan(0);
      });
    }
  );
  // Oracle: C7, both roles. Same controls as M16. The disabled control's reason text is the § 2.5 notice ('CONSENT_SWITCHES.effectWhenOff'), typed in the spec. The spy, the disabled state and '[avx] mic_request_blocked' stay on M16  …
  test.fixme(
    "M16b: disabled mic controls show the § 2.5 notice as their reason",
    async () => {
      // pending: wave that owns M16b
    }
  );
});
