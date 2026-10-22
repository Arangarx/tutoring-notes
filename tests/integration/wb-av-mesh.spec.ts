import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  loginLearnerInContext,
  openTutorAndStudent,
  readEncryptionKeyFromHash,
  seedWbLiveSyncSession,
  seedWbPendingLiveSyncSession,
  startSessionAsTutor,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
  type WbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

/**
 * Live A/V mesh + layout↔A/V firewall surrogates (hermetic local relay, fake
 * media). These are the `@wb-av` regression nets for the wb-wave5-polish
 * reliability floor (the Sarah merge):
 *
 *  - invariant 2 (LIVE-AV.md) — a student that joins delivers a *live inbound
 *    audio track* to the tutor (the "tutor can't hear student" class of bug).
 *  - invariant 5/16 (firewall) — a layoutMode change NEVER triggers device
 *    enumeration; only an explicit device-UI / devicechange does. The positive
 *    control (a dispatched `devicechange`) proves the counter actually observes
 *    real enumeration, so the no-enumerate assertion can't false-green.
 *  - invariant 6 — a layout resize must not tear down the mesh; the tutor keeps
 *    the student's live audio track across a desktop↔narrow resize.
 *
 * Hardware-only gaps (fake media cannot reproduce) are tracked as WB-AV-GAP-1
 * (Windows enumerate×acquire corruption) and WB-AV-GAP-2 (real-RTCPeerConnection
 * stalled renegotiation) in docs/BACKLOG.md, with jest mechanism coverage in
 * src/__tests__/dom/useLiveAV.dom.test.tsx and src/__tests__/av/peer-mesh.test.ts.
 *
 * Gate: npm run test:wb-affected:run (tagged subset) or npm run test:wb-sync (full).
 */

/** Does the page render at least one remote <audio> tile with a *live* audio track? */
async function pageHasLiveRemoteAudio(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLAudioElement>(
        'audio[data-testid^="av-tile-audio-"]'
      )
    );
    for (const el of els) {
      const ms = el.srcObject as MediaStream | null;
      if (ms && typeof ms.getAudioTracks === "function") {
        if (ms.getAudioTracks().some((t) => t.readyState === "live")) {
          return true;
        }
      }
    }
    return false;
  });
}

/**
 * Wrap `navigator.mediaDevices.enumerateDevices` in-page so we can count calls.
 * Wrapping after load is fine: we only assert the *delta* across a layout change.
 */
async function installEnumerateCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const md = navigator.mediaDevices as MediaDevices & {
      __tnEnumCount?: number;
      __tnEnumWrapped?: boolean;
    };
    if (md.__tnEnumWrapped) return;
    const original = md.enumerateDevices.bind(md);
    md.__tnEnumCount = 0;
    md.enumerateDevices = function patched() {
      md.__tnEnumCount = (md.__tnEnumCount ?? 0) + 1;
      return original();
    };
    md.__tnEnumWrapped = true;
  });
}

async function resetEnumerateCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    (navigator.mediaDevices as MediaDevices & { __tnEnumCount?: number }).__tnEnumCount = 0;
  });
}

async function readEnumerateCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (navigator.mediaDevices as MediaDevices & { __tnEnumCount?: number })
        .__tnEnumCount ?? 0
  );
}

test.describe("live A/V mesh + layout firewall", { tag: [TAG.WB_AV] }, () => {
  test("join → tutor receives a live inbound student audio track", {
    tag: [TAG.WB_PRESENCE],
  }, async ({ browser }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
    });
    try {
      // The student auto-bootstraps mic on join; the mesh must negotiate the
      // student's audio m-line so the tutor ends up with a live inbound track.
      await expect
        .poll(() => pageHasLiveRemoteAudio(peers.tutorPage), {
          timeout: 90_000,
          message: "tutor never received a live student audio track",
        })
        .toBe(true);
    } finally {
      await peers.close();
    }
  });

  test("layout change (desktop→narrow) does NOT enumerate; devicechange does", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    // Student starts at a desktop width (≥400) so a resize below 400 crosses the
    // desktop→narrow boundary (DESKTOP_NARROW_FALLBACK_W) and fires the
    // close-menu-on-layout effect — the historical "layout pokes A/V" path.
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      studentViewport: { width: 1280, height: 900 },
    });
    try {
      const student = peers.studentPage;
      await installEnumerateCounter(student);

      // Let any post-join enumeration settle, then zero the counter.
      await student.waitForTimeout(1_000);
      await resetEnumerateCounter(student);

      // Cross the desktop→narrow breakpoint (and back). layoutMode changes here.
      await student.setViewportSize({ width: 380, height: 844 });
      await student.waitForTimeout(600);
      await student.setViewportSize({ width: 1280, height: 900 });
      await student.waitForTimeout(600);

      // Firewall: a layout change must not have enumerated devices.
      expect(await readEnumerateCount(student)).toBe(0);

      // Positive control — prove the counter actually observes real enumeration:
      // a devicechange routes through useLiveAV's mutexed refresh.
      await student.evaluate(() => {
        navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
      });
      await expect
        .poll(() => readEnumerateCount(student), {
          timeout: 15_000,
          message: "devicechange did not trigger enumeration (counter blind?)",
        })
        .toBeGreaterThan(0);
    } finally {
      await peers.close();
    }
  });

  test("mesh survives a student layout resize — tutor keeps live student audio", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      studentViewport: { width: 1280, height: 900 },
    });
    try {
      // Baseline: tutor has the student's live audio.
      await expect
        .poll(() => pageHasLiveRemoteAudio(peers.tutorPage), { timeout: 90_000 })
        .toBe(true);

      // Student crosses the desktop→narrow breakpoint (mimics phone rotate) and back.
      await peers.studentPage.setViewportSize({ width: 380, height: 844 });
      await peers.studentPage.waitForTimeout(800);
      await peers.studentPage.setViewportSize({ width: 1280, height: 900 });
      await peers.studentPage.waitForTimeout(800);

      // The mesh must NOT have been torn down by the layout change: the tutor
      // still holds a live inbound student audio track.
      await expect
        .poll(() => pageHasLiveRemoteAudio(peers.tutorPage), {
          timeout: 30_000,
          message: "tutor lost the student audio track after a layout resize",
        })
        .toBe(true);
    } finally {
      await peers.close();
    }
  });
});

/**
 * Tester packet item 35 — tutor reloads during a live session with both
 * cameras on, and the other person's camera stops painting.
 *
 * Oracle is the on-screen remote <video>: videoWidth > 0, not paused, and
 * currentTime moving across ~1s. The scene bridge does not expose
 * RTCPeerConnection, so this records signaling/connection state the same
 * way the TURN test below does (a test-side constructor capture). That log
 * is diagnosis only.
 */
type RemoteVideoSample = {
  tileCount: number;
  videoWidth: number;
  paused: boolean;
  currentTime: number;
  onScreen: boolean;
  /** null when the visible remote tile has no <audio> element. */
  audioPaused: boolean | null;
  /** Presence `data-cam-on` on visible remote tiles. Diagnosis only. */
  camOn: string;
  error?: string;
};

/** Test-side captures installed by `installPeerConnectionCapture`. */
type PwCaptureWindow = Window & {
  /** Every RTCPeerConnection the page constructed. */
  __pwPcs?: RTCPeerConnection[];
  /** The captured PCs that are not closed (the single "live PCs" definition). */
  __pwLivePcs?: () => RTCPeerConnection[];
  /** Every video track getUserMedia handed out. */
  __pwGumVideoTracks?: MediaStreamTrack[];
};

/**
 * Init-script capture shared by every A/V test here: records each
 * RTCPeerConnection (+ a `__pwLivePcs()` non-closed filter) and each
 * getUserMedia video track. `relayOnly` additionally forces
 * `iceTransportPolicy: "relay"` (TURN test: stand-in for a network with no
 * direct path).
 */
async function installPeerConnectionCapture(
  context: BrowserContext,
  { relayOnly = false }: { relayOnly?: boolean } = {}
): Promise<void> {
  await context.addInitScript((forceRelay: boolean) => {
    const w = window as PwCaptureWindow;
    const Native = window.RTCPeerConnection;
    const made: RTCPeerConnection[] = [];
    w.__pwPcs = made;
    w.__pwLivePcs = () =>
      made.filter(
        (pc) => pc.signalingState !== "closed" && pc.connectionState !== "closed"
      );
    class CapturingPeerConnection extends Native {
      constructor(config?: RTCConfiguration) {
        super(forceRelay ? { ...(config ?? {}), iceTransportPolicy: "relay" } : config);
        made.push(this);
      }
    }
    window.RTCPeerConnection = CapturingPeerConnection;

    // Independent oracle for the single-acquisition invariant: every video
    // track getUserMedia hands out, whatever the app does with it afterwards.
    const gumTracks: MediaStreamTrack[] = [];
    w.__pwGumVideoTracks = gumTracks;
    const md = navigator.mediaDevices;
    if (md && typeof md.getUserMedia === "function") {
      const nativeGum = md.getUserMedia.bind(md);
      md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const stream = await nativeGum(constraints);
        for (const t of stream.getVideoTracks()) gumTracks.push(t);
        return stream;
      };
    }
  }, relayOnly);
}

type GumVideoTrackState = { readyState: string; enabled: boolean };

/** Every video track created by getUserMedia on the page (init-script capture). */
async function readGumVideoTracks(page: Page): Promise<GumVideoTrackState[]> {
  return page.evaluate(() =>
    ((window as PwCaptureWindow).__pwGumVideoTracks ?? []).map((t) => ({
      readyState: t.readyState,
      enabled: t.enabled,
    }))
  );
}

/** Per-PC transceiver shape: video transceivers with a live/non-null local sender track. */
type PcVideoShape = {
  videoTransceivers: number;
  /** Video senders that currently carry a track (null-track senders excluded). */
  videoSendersWithTrack: number;
  /** Video senders with no track (the empty box on the other side). */
  videoSendersNullTrack: number;
};

async function readPcVideoShapes(page: Page): Promise<PcVideoShape[]> {
  return page.evaluate(() => {
    const live = (window as PwCaptureWindow).__pwLivePcs?.() ?? [];
    return live
      .map((pc) => {
        const video = pc
          .getTransceivers()
          .filter((tr) => tr.receiver.track.kind === "video");
        return {
          videoTransceivers: video.length,
          videoSendersWithTrack: video.filter((tr) => tr.sender.track !== null).length,
          videoSendersNullTrack: video.filter((tr) => tr.sender.track === null).length,
        };
      });
  });
}

async function prepareCamerasAndCapture(context: BrowserContext): Promise<void> {
  // WebKit rejects context permission grants ("Unknown permission: microphone")
  // and has no fake mic. Chromium still needs the grant so the camera auto-enables.
  if (context.browser()?.browserType().name() !== "webkit") {
    await context.grantPermissions(["microphone", "camera"], {
      origin: "http://localhost:3100",
    });
  }
  await installPeerConnectionCapture(context);
}

async function readRemoteVideo(page: Page): Promise<RemoteVideoSample> {
  try {
    return await page.evaluate(() => {
      const tiles = Array.from(
        document.querySelectorAll<HTMLElement>('[data-is-local="false"]')
      ).filter((tile) => {
        const style = getComputedStyle(tile);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const box = tile.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      const empty = {
        tileCount: tiles.length,
        videoWidth: 0,
        paused: true,
        currentTime: 0,
        onScreen: false,
        audioPaused: null,
        camOn: "none",
      };
      if (tiles.length === 0) return empty;
      // Every visible remote tile must be playing. One frozen duplicate fails.
      let videoWidth = Number.POSITIVE_INFINITY;
      let paused = false;
      let currentTime = Number.POSITIVE_INFINITY;
      let onScreen = true;
      let audioPaused: boolean | null = false;
      for (const tile of tiles) {
        const video = tile.querySelector<HTMLVideoElement>(
          'video[data-testid^="av-tile-video-"]'
        );
        const audio = tile.querySelector<HTMLAudioElement>(
          'audio[data-testid^="av-tile-audio-"]'
        );
        if (!video) {
          videoWidth = 0;
          paused = true;
          currentTime = 0;
          onScreen = false;
          continue;
        }
        const style = getComputedStyle(video);
        const box = video.getBoundingClientRect();
        const shown =
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          box.width > 0 &&
          box.height > 0;
        videoWidth = Math.min(videoWidth, video.videoWidth);
        paused = paused || video.paused;
        currentTime = Math.min(currentTime, video.currentTime);
        onScreen = onScreen && shown;
        if (!audio) audioPaused = audioPaused === false ? null : audioPaused;
        else audioPaused = audioPaused === true || audio.paused;
      }
      const camOn = tiles
        .map((tile) => tile.getAttribute("data-cam-on") ?? "unset")
        .join(",");
      return {
        tileCount: tiles.length,
        videoWidth: Number.isFinite(videoWidth) ? videoWidth : 0,
        paused,
        currentTime: Number.isFinite(currentTime) ? currentTime : 0,
        onScreen,
        audioPaused,
        camOn,
      };
    });
  } catch (err) {
    return {
      tileCount: 0,
      videoWidth: 0,
      paused: true,
      currentTime: 0,
      onScreen: false,
      audioPaused: null,
      camOn: "unread",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function videoAdvanced(before: RemoteVideoSample, after: RemoteVideoSample): boolean {
  if (before.error || after.error) return false;
  if (before.tileCount < 1 || after.tileCount < 1) return false;
  return (
    before.onScreen &&
    after.onScreen &&
    before.videoWidth > 0 &&
    after.videoWidth > 0 &&
    !before.paused &&
    !after.paused &&
    after.currentTime > before.currentTime &&
    (after.audioPaused === null || after.audioPaused === false)
  );
}

function formatVideoSample(sample: RemoteVideoSample): string {
  if (sample.error) return `error=${sample.error}`;
  return (
    `tiles=${sample.tileCount} onScreen=${sample.onScreen} ` +
    `videoWidth=${sample.videoWidth} paused=${sample.paused} ` +
    `t=${sample.currentTime.toFixed(2)} audioPaused=${String(sample.audioPaused)} ` +
    `camOn=${sample.camOn}`
  );
}

async function expectBothCamerasPlaying(
  tutorPage: Page,
  studentPage: Page,
  meshLogs: string[],
  label: string,
  timeout: number,
  message: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        const [tutorBefore, studentBefore] = await Promise.all([
          readRemoteVideo(tutorPage),
          readRemoteVideo(studentPage),
        ]);
        await tutorPage.waitForTimeout(1_000);
        const [tutorAfter, studentAfter, tutorPcs, studentPcs] = await Promise.all([
          readRemoteVideo(tutorPage),
          readRemoteVideo(studentPage),
          peerConnectionSummary(tutorPage),
          peerConnectionSummary(studentPage),
        ]);
        const tutorSeesStudent = videoAdvanced(tutorBefore, tutorAfter);
        const studentSeesTutor = videoAdvanced(studentBefore, studentAfter);
        const detail =
          `tutor sees student: ${tutorSeesStudent} (${formatVideoSample(tutorAfter)}); ` +
          `student sees tutor: ${studentSeesTutor} (${formatVideoSample(studentAfter)}); ` +
          `tutor PCs: ${tutorPcs}; student PCs: ${studentPcs}; ` +
          `mesh: ${meshTail(meshLogs)}`;
        console.log(`[av-reload ${label}] ${detail}`);
        return tutorSeesStudent && studentSeesTutor ? "playing" : detail;
      },
      { timeout, message }
    )
    .toBe("playing");
}

async function expectCamerasOn(tutorPage: Page, studentPage: Page): Promise<void> {
  // Live top bar (not the waiting-room toggle). Setup only; the oracle is the video.
  const tutorCam = tutorPage.getByTestId("wb-topbar-cam").locator("button").first();
  const studentCam = studentPage.getByTestId("wb-topbar-cam").locator("button").first();
  await expect(tutorCam).toHaveClass(/mynk-wb-tb-btn--cam-on/, { timeout: 60_000 });
  await expect(studentCam).toHaveClass(/mynk-wb-tb-btn--cam-on/, { timeout: 60_000 });
}

function attachMeshLogs(tutorPage: Page, studentPage: Page): string[] {
  const meshLogs: string[] = [];
  const keepMeshLog = (tag: string) => (msg: { text: () => string }) => {
    const text = msg.text();
    if (
      !/\[peer-mesh\]|signal-apply-fail|renegotiation|offer-send|offer-ignore|event=answer|event=evict-stale|event=peer-instance-replaced|cam acquired|mic acquired|requestMicAndCam acquired|requestCam start|requestMicAndCam start/.test(
        text
      )
    ) {
      return;
    }
    // Prefix the source page so tutor vs student lines are distinguishable.
    meshLogs.push(`${tag}${text.slice(0, 360)}`);
    if (meshLogs.length > 120) meshLogs.shift();
  };
  tutorPage.on("console", keepMeshLog("T| "));
  studentPage.on("console", keepMeshLog("S| "));
  return meshLogs;
}

/** Last N mesh log lines for failure messages. `PW_MESH_TAIL=60` for a fuller diagnosis run. */
const MESH_TAIL = Math.max(1, Number(process.env.PW_MESH_TAIL ?? 8) || 8);
function meshTail(meshLogs: string[]): string {
  return meshLogs.slice(-MESH_TAIL).join(" || ") || "none";
}

/** Diagnosis only — not the pass/fail oracle. */
async function peerConnectionSummary(page: Page): Promise<string> {
  try {
    return await page.evaluate(async () => {
      const w = window as PwCaptureWindow;
      const pcs = w.__pwPcs ?? [];
      const live = w.__pwLivePcs?.() ?? [];
      const rows = await Promise.all((live.length > 0 ? live : pcs).map(async (pc) => {
        let send = "no-senders";
        try {
          const kinds = pc
            .getSenders()
            .map((sender) => sender.track?.kind ?? "empty");
          if (kinds.length > 0) send = kinds.join("+");
        } catch {
          send = "senders-threw";
        }
        let tr = "";
        try {
          tr = pc
            .getTransceivers()
            .map(
              (t) =>
                `${t.receiver.track.kind}:${t.direction}/${t.currentDirection ?? "null"}` +
                `/mid=${t.mid ?? "null"}/rx${t.receiver.track.muted ? "M" : "u"}${t.receiver.track.readyState === "live" ? "" : "E"}` +
                `/tx${t.sender.track ? (t.sender.track.enabled ? "on" : "off") : "none"}`
            )
            .join(",");
        } catch {
          tr = "tr-threw";
        }
        let rtp = "";
        try {
          const stats = await pc.getStats();
          const parts: string[] = [];
          stats.forEach((r) => {
            if (r.kind !== "video") return;
            if (r.type === "inbound-rtp") parts.push(`vIn=${r.packetsReceived ?? 0}`);
            if (r.type === "outbound-rtp") parts.push(`vOut=${r.packetsSent ?? 0}`);
          });
          rtp = parts.join(",");
        } catch {
          rtp = "stats-threw";
        }
        return `${pc.signalingState}/${pc.connectionState}/ice=${pc.iceConnectionState}/send=${send}/tr=[${tr}]/rtp=[${rtp}]`;
      }));
      return rows.length > 0 ? rows.join(" | ") : "none";
    });
  } catch (err) {
    return `unread (${err instanceof Error ? err.message : String(err)})`;
  }
}

test.describe("live A/V camera across tutor reload", { tag: [TAG.WB_AV] }, () => {
  test("after the tutor reloads, both peers still see the other's camera playing", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      await expectCamerasOn(peers.tutorPage, peers.studentPage);
      await expectBothCamerasPlaying(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "baseline",
        90_000,
        "baseline cameras never played"
      );

      await peers.tutorPage.reload({ waitUntil: "domcontentloaded" });
      await expect(peers.tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(peers.tutorPage, "tutor");
      await waitForTutorStudentConnected(peers.tutorPage);

      await expectBothCamerasPlaying(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "after-tutor-reload",
        // Longer than the 5s presence prune and the 6s peer-eviction timer.
        20_000,
        "remote camera did not resume within 20s of tutor rejoin"
      );
    } finally {
      await peers.close();
    }
  });
});

/**
 * TURN relay (Tyson 2026-10-19: phone and laptop on one home Wi‑Fi never
 * connected — tutor tile "Connection failed", phone "Connecting…", Start
 * disabled). Direct paths fail on routers without NAT hairpinning, so the
 * page must hand the browser TURN servers from the server.
 *
 * Both browsers are forced to relay-only (`iceTransportPolicy: "relay"`), the
 * stand-in for a network where no direct path exists. A local coturn
 * container is the TURN server; the Playwright-only cookie points the server
 * page at it. With STUN only, relay-only never connects.
 */
const COTURN_CONTAINER = "pw-coturn-relay";
const COTURN_USER = "pw";
const COTURN_PASS = "pw-relay-pass";
const LOCAL_TURN_ICE: RTCIceServer[] = [
  {
    urls: ["turn:127.0.0.1:3478?transport=udp", "turn:127.0.0.1:3478?transport=tcp"],
    username: COTURN_USER,
    credential: COTURN_PASS,
  },
];
/**
 * Optional: `PW_REAL_TURN_ICE_JSON` = a provider's ICE server list (e.g.
 * Cloudflare `generate-ice-servers` output) runs the same test against the
 * real relay instead of local coturn. Never commit the value.
 */
const REAL_TURN_ICE: RTCIceServer[] | null = process.env.PW_REAL_TURN_ICE_JSON
  ? (JSON.parse(process.env.PW_REAL_TURN_ICE_JSON) as RTCIceServer[])
  : null;
const TURN_ICE = REAL_TURN_ICE ?? LOCAL_TURN_ICE;

function docker(args: string): string {
  return execSync(`docker ${args}`, { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

/** Candidate type of the local end of each connected pair on the page. */
async function selectedLocalCandidateTypes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const pcs = (window as PwCaptureWindow).__pwPcs ?? [];
    const types: string[] = [];
    for (const pc of pcs) {
      const stats = await pc.getStats();
      stats.forEach((r) => {
        if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) {
          const local = stats.get(r.localCandidateId);
          if (local?.candidateType) types.push(local.candidateType as string);
        }
      });
    }
    return types;
  });
}

test.describe("live A/V over a TURN relay", { tag: [TAG.WB_AV, TAG.WB_PRESENCE] }, () => {
  test.beforeAll(() => {
    if (REAL_TURN_ICE) return;
    try {
      docker(`rm -f ${COTURN_CONTAINER}`);
    } catch {
      /* not running */
    }
    docker(
      [
        "run -d --rm",
        `--name ${COTURN_CONTAINER}`,
        "-p 3478:3478 -p 3478:3478/udp -p 49160-49200:49160-49200/udp",
        "coturn/coturn:4.6",
        "-n --log-file=stdout --no-tls --no-dtls --fingerprint --lt-cred-mech",
        `--user=${COTURN_USER}:${COTURN_PASS} --realm=pw.local`,
        "--listening-port=3478 --min-port=49160 --max-port=49200",
      ].join(" ")
    );
  });

  test.afterAll(() => {
    if (REAL_TURN_ICE) return;
    try {
      docker(`rm -f ${COTURN_CONTAINER}`);
    } catch {
      /* already gone */
    }
  });

  test("relay-only peers connect through the server-issued TURN servers", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(180_000);
    const session = await seedWbPendingLiveSyncSession();
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3100";
    const turnCookie = {
      name: "pw_turn_ice_servers",
      value: encodeURIComponent(JSON.stringify(TURN_ICE)),
      url: baseURL,
    };
    const learnerAuthFile = path.join(process.cwd(), "tests", "integration", ".auth", "learner.json");

    const tutorContext = await browser.newContext({
      storageState: "tests/integration/.auth/tutor.json",
      viewport: { width: 1280, height: 900 },
    });
    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ...(fs.existsSync(learnerAuthFile) ? { storageState: learnerAuthFile } : {}),
    });
    try {
      if (!fs.existsSync(learnerAuthFile)) {
        await loginLearnerInContext(studentContext, session.learnerHandle, session.learnerPin);
      }
      for (const ctx of [tutorContext, studentContext]) {
        await ctx.addCookies([turnCookie]);
        await installPeerConnectionCapture(ctx, { relayOnly: true });
      }

      const tutorPage = await tutorContext.newPage();
      await tutorPage.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForWbE2eBridge(tutorPage, "tutor");
      const key = await readEncryptionKeyFromHash(tutorPage);

      const studentPage = await studentContext.newPage();
      await studentPage.goto(`/join/${session.whiteboardSessionId}#k=${key}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });

      // What Tyson saw stuck: Start stays disabled and the student stays on
      // "Connecting…" until the video link is actually up.
      await expect(tutorPage.getByTestId("wb-start-session")).toBeEnabled({ timeout: 60_000 });
      await expect(
        studentPage.getByTestId("wb-waiting-overlay").getByRole("heading", { level: 2 })
      ).not.toHaveText(/connecting/i, { timeout: 30_000 });

      // The link really runs through the relay, not a direct path.
      await expect
        .poll(() => selectedLocalCandidateTypes(tutorPage), { timeout: 15_000 })
        .toContain("relay");
    } finally {
      await tutorContext.close();
      await studentContext.close();
    }
  });
});

/**
 * Packet item 35 (phone student, tutor reload, empty student tile). Same
 * oracle as the tutor-reload test above: the tutor's remote <video> has
 * videoWidth > 0, is not paused, and currentTime advances. PC summaries are
 * diagnosis only.
 *
 * Root cause (docs/LIVE-AV.md "Reloaded peer replaced via fingerprint"):
 *  - trigger: touch bootstrap and camera-default both acquired video, so the
 *    student sent two video tracks (second m-line) and "camera off" left the
 *    first one live;
 *  - primary: a stale PC with more m-lines than a reloaded peer's fresh offer
 *    cannot answer it, and nothing rebuilt the PC while the roster was unchanged.
 */
type Item35Peers = {
  tutorPage: Page;
  studentPage: Page;
  close: () => Promise<void>;
};

async function expectTutorSeesStudentVideo(
  tutorPage: Page,
  studentPage: Page,
  meshLogs: string[],
  label: string,
  timeout: number,
  message: string
): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await readRemoteVideo(tutorPage);
        await tutorPage.waitForTimeout(1_000);
        const [after, tutorPcs, studentPcs] = await Promise.all([
          readRemoteVideo(tutorPage),
          peerConnectionSummary(tutorPage),
          peerConnectionSummary(studentPage),
        ]);
        const tutorSeesStudent = videoAdvanced(before, after);
        const detail =
          `tutor sees student: ${tutorSeesStudent} (${formatVideoSample(after)}); ` +
          `tutor PCs: ${tutorPcs}; student PCs: ${studentPcs}; ` +
          `mesh: ${meshTail(meshLogs)}`;
        console.log(`[item35 ${label}] ${detail}`);
        return tutorSeesStudent ? "playing" : detail;
      },
      { timeout, message }
    )
    .toBe("playing");
}

async function expectWaitingRoomMediaOn(page: Page): Promise<void> {
  const overlay = page.getByTestId("wb-waiting-overlay");
  const cam = overlay.getByTestId("wb-topbar-cam-toggle");
  const mic = overlay.getByTestId("wb-topbar-mic-toggle");
  await cam.scrollIntoViewIfNeeded();
  await expect(cam).toBeVisible({ timeout: 60_000 });
  await expect(cam).toHaveClass(/mynk-wb-tb-btn--cam-on/, { timeout: 60_000 });
  await expect(mic).toHaveClass(/mynk-wb-tb-btn--mic-on/, { timeout: 60_000 });
}

/** Live-session student camera control. Top bar on desktop; tile, then overflow, on a phone. */
async function clickStudentLiveCamera(page: Page): Promise<string> {
  const topbar = page.locator(".mynk-wb-topbar").getByTestId("wb-topbar-cam-toggle");
  if (await topbar.isVisible().catch(() => false)) {
    await topbar.click();
    return "wb-topbar-cam-toggle";
  }
  const tile = page.getByTestId("wb-student-av-row").getByTestId("av-controls-toggle-cam");
  if (await tile.isVisible().catch(() => false)) {
    await tile.click();
    return "av-controls-toggle-cam";
  }
  const overflowBtn = page.getByTestId("wb-student-topbar-overflow");
  await expect(overflowBtn).toBeVisible({ timeout: 10_000 });
  await overflowBtn.click();
  const overflowCam = page.getByTestId("wb-overflow-cam");
  await expect(overflowCam).toBeVisible({ timeout: 10_000 });
  await overflowCam.click();
  return "wb-overflow-cam";
}

async function readStudentCamOn(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="wb-topbar-cam-toggle"], [data-testid="av-controls-toggle-cam"]'
      )
    ).filter((el) => {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    const btn = buttons[0];
    if (!btn) return null;
    return btn.classList.contains("mynk-wb-tb-btn--cam-on");
  });
}

async function reloadTutor(tutorPage: Page): Promise<void> {
  await tutorPage.reload({ waitUntil: "domcontentloaded" });
  await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(tutorPage, "tutor");
  await waitForTutorStudentConnected(tutorPage);
}

/** Waiting room with both cameras on, then the tutor taps Start. Shared by every phone-student test. */
async function item35WaitingRoomThenStart(
  peers: Item35Peers,
  meshLogs: string[]
): Promise<void> {
  const { tutorPage, studentPage } = peers;
  await expect(tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible();
  await expect(studentPage.getByTestId("wb-waiting-overlay")).toBeVisible();
  await expectWaitingRoomMediaOn(tutorPage);
  await expectWaitingRoomMediaOn(studentPage);
  await expectTutorSeesStudentVideo(
    tutorPage,
    studentPage,
    meshLogs,
    "waiting-room",
    90_000,
    "waiting-room student camera never played before Start"
  );
  await startSessionAsTutor(tutorPage);
  await expect(studentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
    timeout: 30_000,
  });
  const layout = await studentPage.locator(".mynk-wb-chrome").getAttribute("data-layout");
  console.log(`[item35] student layout after Start=${layout}`);

  await expectTutorSeesStudentVideo(
    tutorPage,
    studentPage,
    meshLogs,
    "after-start",
    45_000,
    "student camera not playing after Start"
  );
}

/** Student turns the live camera off; the tutor's tile must stop painting it. */
async function item35StudentCameraOff(
  peers: Item35Peers
): Promise<void> {
  const { tutorPage, studentPage } = peers;
  const offVia = await clickStudentLiveCamera(studentPage);
  console.log(`[item35] student camera off via ${offVia}`);
  await expect
    .poll(() => readStudentCamOn(studentPage), {
      timeout: 15_000,
      message: "student camera control did not show off",
    })
    .toBe(false);
  await expect
    .poll(
      async () => {
        const sample = await readRemoteVideo(tutorPage);
        const [tutorPcs, studentPcs] = await Promise.all([
          peerConnectionSummary(tutorPage),
          peerConnectionSummary(studentPage),
        ]);
        const stopped = sample.tileCount >= 1 && !sample.onScreen;
        const detail = `${formatVideoSample(sample)}; tutor PCs: ${tutorPcs}; student PCs: ${studentPcs}`;
        console.log(`[item35 cam-off] ${detail}`);
        return stopped ? "stopped" : detail;
      },
      {
        timeout: 20_000,
        message: "tutor still showed the student camera after the student turned it off",
      }
    )
    .toBe("stopped");
}

async function runItem35Sequence(
  peers: Item35Peers,
  meshLogs: string[],
  mode: "toggle-then-reload" | "reload-only"
): Promise<void> {
  const { tutorPage, studentPage } = peers;
  await item35WaitingRoomThenStart(peers, meshLogs);

  if (mode === "reload-only") {
    // No camera toggle: proves the toggle is incidental to the reload failure.
    await reloadTutor(tutorPage);
    await expectTutorSeesStudentVideo(
      tutorPage,
      studentPage,
      meshLogs,
      "after-tutor-reload-only",
      20_000,
      "tutor did not see student video within 20s of tutor reload (no camera toggle)"
    );
    return;
  }

  await item35StudentCameraOff(peers);

  const onVia = await clickStudentLiveCamera(studentPage);
  console.log(`[item35] student camera on via ${onVia}`);
  await expect
    .poll(() => readStudentCamOn(studentPage), {
      timeout: 15_000,
      message: "student camera control did not show on",
    })
    .toBe(true);
  await expectTutorSeesStudentVideo(
    tutorPage,
    studentPage,
    meshLogs,
    "after-cam-restore",
    30_000,
    "tutor did not see student video again after the student turned the camera on"
  );

  await reloadTutor(tutorPage);
  await expectTutorSeesStudentVideo(
    tutorPage,
    studentPage,
    meshLogs,
    "after-tutor-reload",
    20_000,
    "tutor did not see student video within 20s of tutor reload"
  );
}

/**
 * Pixel 7 (touch-primary, narrow layout) student via the shared harness.
 * Cameras/PC capture are installed by `prepareCamerasAndCapture` before either
 * page navigates.
 */
async function openTutorAndPhoneStudent(
  browser: Browser,
  session: WbLiveSyncSession
): Promise<Item35Peers> {
  const peers = await openTutorAndStudent(browser, session, {
    ensureFollow: false,
    studentDevice: "Pixel 7",
    prepareContext: prepareCamerasAndCapture,
  });
  const ua = await peers.studentPage.evaluate(() => navigator.userAgent);
  const layout = await peers.studentPage.locator(".mynk-wb-chrome").getAttribute("data-layout");
  console.log(`[item35 C] student ua=${ua} layout=${layout}`);
  await expect(peers.studentPage.locator(".mynk-wb-chrome")).toHaveAttribute("data-layout", "narrow");
  return peers;
}

/** Non-closed PCs the page created (init-script capture). */
async function readLivePcTransceiverCounts(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const live = (window as PwCaptureWindow).__pwLivePcs?.() ?? [];
    return live
      .filter((pc) => pc.signalingState === "stable")
      .map((pc) => pc.getTransceivers().length);
  });
}

/**
 * Force one extra sendrecv video transceiver onto the page's live PC and wait
 * until both sides have renegotiated to three m-lines (audio, video, video).
 * Independent of how the app acquires media: this recreates the "PC with more
 * m-lines than a reloaded peer will offer" state directly.
 */
async function forceExtraVideoMLine(
  pageWithPc: Page,
  otherPage: Page
): Promise<void> {
  const added = await pageWithPc.evaluate(() => {
    const live = (window as PwCaptureWindow).__pwLivePcs?.() ?? [];
    const pc = live[live.length - 1];
    if (!pc) return -1;
    pc.addTransceiver("video", { direction: "sendrecv" });
    return pc.getTransceivers().length;
  });
  expect(added, "no live PC to add the extra video m-line to").toBeGreaterThanOrEqual(3);
  for (const page of [pageWithPc, otherPage]) {
    await expect
      .poll(() => readLivePcTransceiverCounts(page), {
        timeout: 30_000,
        message: "extra video m-line never renegotiated to both peers",
      })
      .toEqual([added]);
  }
}

async function reloadStudent(
  tutorPage: Page,
  studentPage: Page
): Promise<void> {
  await studentPage.reload({ waitUntil: "domcontentloaded" });
  await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(studentPage, "student");
  await waitForTutorStudentConnected(tutorPage);
}

test.describe("live A/V reload recovers a peer whose PC has extra m-lines", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  // A reloaded page builds a brand-new RTCPeerConnection (new DTLS identity)
  // for the same stable peerId. The survivor's old PC must not be the one
  // that answers it, whatever m-line count it grew to.
  //
  // FIXME(item 35 / C2): stays red until the fingerprint-based peer replacement
  // (peer-mesh C2) ships. A stale student PC with a forced extra video m-line
  // cannot answer the reloaded tutor's 2-m-line offer. Fix A (one camera track
  // per device) removes the real-world cause, so this documents only the
  // remaining class. Patch: docs/handoff/item35-c2-fingerprint-replace.patch.
  // Tracked in docs/BACKLOG.md ("Live A/V reload: C2 fingerprint replacement").
  test.fixme("tutor reload: student's PC with an extra video m-line still shows the student's camera on the tutor", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      await expectCamerasOn(peers.tutorPage, peers.studentPage);
      await expectBothCamerasPlaying(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "extra-mline-baseline",
        90_000,
        "baseline cameras never played"
      );
      await forceExtraVideoMLine(peers.studentPage, peers.tutorPage);
      await reloadTutor(peers.tutorPage);
      await expectTutorSeesStudentVideo(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "extra-mline-tutor-reload",
        20_000,
        "tutor did not see student video within 20s of tutor reload (student PC had an extra video m-line)"
      );
    } finally {
      await peers.close();
    }
  });

  test("student reload: tutor's PC with an extra video m-line still shows the tutor's camera on the student", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      await expectCamerasOn(peers.tutorPage, peers.studentPage);
      await expectBothCamerasPlaying(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "extra-mline-student-baseline",
        90_000,
        "baseline cameras never played"
      );
      await forceExtraVideoMLine(peers.tutorPage, peers.studentPage);
      await reloadStudent(peers.tutorPage, peers.studentPage);
      await expectBothCamerasPlaying(
        peers.tutorPage,
        peers.studentPage,
        meshLogs,
        "extra-mline-student-reload",
        20_000,
        "cameras did not resume within 20s of student reload (tutor PC had an extra video m-line)"
      );
    } finally {
      await peers.close();
    }
  });
});

test.describe("item 35 phone student camera + tutor reload", { tag: [TAG.WB_AV, TAG.WB_PRESENCE] }, () => {
  test("item 35: Pixel 7 student, waiting-room cameras, student cam off then on, tutor reload keeps the student's video", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndPhoneStudent(browser, session);
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      await runItem35Sequence(peers, meshLogs, "toggle-then-reload");
    } finally {
      await peers.close();
    }
  });

  test("item 35: Pixel 7 student, waiting-room cameras, tutor reload only (no camera toggle) keeps the student's video", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndPhoneStudent(browser, session);
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      await runItem35Sequence(peers, meshLogs, "reload-only");
    } finally {
      await peers.close();
    }
  });
});

test.describe("phone student acquires exactly one camera", { tag: [TAG.WB_AV] }, () => {
  async function openPhoneStudentLive(browser: Browser) {
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndPhoneStudent(browser, session);
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    await item35WaitingRoomThenStart(peers, meshLogs);
    return { peers, meshLogs };
  }

  test("getUserMedia hands the phone student exactly one live video track", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { peers } = await openPhoneStudentLive(browser);
    try {
      // Let any late second acquisition (camera-default effect) land.
      await peers.studentPage.waitForTimeout(3_000);
      const tracks = await readGumVideoTracks(peers.studentPage);
      const live = tracks.filter((t) => t.readyState === "live");
      expect(
        live.length,
        `getUserMedia created ${tracks.length} video track(s): ${JSON.stringify(tracks)}`
      ).toBe(1);
    } finally {
      await peers.close();
    }
  });

  test("phone student has exactly one video m-line, and the tutor has no empty video sender, after waiting-room acquire and a camera toggle", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { peers } = await openPhoneStudentLive(browser);
    try {
      await item35StudentCameraOff(peers);
      const onVia = await clickStudentLiveCamera(peers.studentPage);
      console.log(`[item35 m-line] student camera on via ${onVia}`);
      await expect
        .poll(() => readStudentCamOn(peers.studentPage), { timeout: 15_000 })
        .toBe(true);
      await peers.studentPage.waitForTimeout(2_000);
      const [studentShapes, tutorShapes] = await Promise.all([
        readPcVideoShapes(peers.studentPage),
        readPcVideoShapes(peers.tutorPage),
      ]);
      expect(
        studentShapes.map((s) => s.videoTransceivers),
        `student PCs video shapes: ${JSON.stringify(studentShapes)}`
      ).toEqual([1]);
      expect(
        tutorShapes.map((s) => s.videoSendersNullTrack),
        `tutor PCs video shapes: ${JSON.stringify(tutorShapes)}`
      ).toEqual(tutorShapes.map(() => 0));
    } finally {
      await peers.close();
    }
  });

  test("privacy: after the phone student turns the camera off, no getUserMedia video track is still enabled", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { peers } = await openPhoneStudentLive(browser);
    try {
      // Non-vacuous precondition: the capture must have seen at least one
      // getUserMedia video track, and it must be sending right now. Otherwise
      // "no track still enabled" below would pass with an empty capture.
      const before = await readGumVideoTracks(peers.studentPage);
      expect(
        before.filter((t) => t.readyState === "live" && t.enabled).length,
        `no live+enabled getUserMedia video track captured before camera-off: ${JSON.stringify(before)}`
      ).toBeGreaterThanOrEqual(1);

      await item35StudentCameraOff(peers);
      const tracks = await readGumVideoTracks(peers.studentPage);
      expect(
        tracks.length,
        "capture saw no getUserMedia video tracks after camera-off"
      ).toBeGreaterThanOrEqual(1);
      const stillSending = tracks.filter(
        (t) => t.readyState === "live" && t.enabled
      );
      expect(
        stillSending,
        `camera is off in the UI but these captured video tracks still send: ${JSON.stringify(tracks)}`
      ).toEqual([]);
    } finally {
      await peers.close();
    }
  });
});
