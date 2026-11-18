import { execSync } from "child_process";
import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
  seedWbPendingLiveSyncSession,
  startSessionAsTutor,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
  type WbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
const { resolvePwStack } = require("../../scripts/pw-stack.cjs");

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
  /** Every audio track getUserMedia handed out (B11: hardware release oracle). */
  __pwGumAudioTracks?: MediaStreamTrack[];
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
    const gumAudioTracks: MediaStreamTrack[] = [];
    w.__pwGumVideoTracks = gumTracks;
    w.__pwGumAudioTracks = gumAudioTracks;
    const md = navigator.mediaDevices;
    if (md && typeof md.getUserMedia === "function") {
      const nativeGum = md.getUserMedia.bind(md);
      md.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        const stream = await nativeGum(constraints);
        for (const t of stream.getVideoTracks()) gumTracks.push(t);
        for (const t of stream.getAudioTracks()) {
          gumAudioTracks.push(t);
          (w as unknown as { __pwGumAudioStacks?: string[] }).__pwGumAudioStacks ??= [];
          (w as unknown as { __pwGumAudioStacks: string[] }).__pwGumAudioStacks.push(
            new Error().stack?.split("\n").slice(2, 7).join(" | ") ?? ""
          );
        }
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
      origin: resolvePwStack().origin,
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
    const baseURL = testInfo.project.use.baseURL ?? resolvePwStack().origin;
    const turnCookie = {
      name: "pw_turn_ice_servers",
      value: encodeURIComponent(JSON.stringify(TURN_ICE)),
      url: baseURL,
    };

    const peers = await openTutorAndStudent(browser, session, {
      // The test asserts the waiting room itself. The helper's default wait
      // would hide that the Start button and "Connecting…" clear only after relay.
      waitForConnected: false,
      ensureFollow: false,
      prepareContext: async (ctx) => {
        await ctx.addCookies([turnCookie]);
        await installPeerConnectionCapture(ctx, { relayOnly: true });
      },
    });
    try {
      const { tutorPage, studentPage } = peers;

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
      await peers.close();
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
  test("tutor reload: student's PC with an extra video m-line still shows the student's camera on the tutor", async ({
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

/**
 * G1 (Tyson packet item 35, Discord 2026-10-29): "especially if either the
 * tutor or student refresh their page while in the waiting room" — the other
 * person's camera tile stays a colored placeholder. Spec: after EITHER person
 * reloads in the waiting room (both cameras on), BOTH people's remote <video>
 * tiles paint moving frames again within the 20s window used for the live
 * reload tests (longer than the 5s presence prune + 6s eviction timer).
 * Oracle = the on-screen remote <video> (videoWidth > 0, not paused,
 * currentTime advancing), never the app's own muted/camOn gating.
 */
test.describe("G1 waiting-room reload keeps both camera tiles", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  const studentKinds: Array<{ label: string; device?: string }> = [
    { label: "desktop student" },
    { label: "Pixel 7 phone student", device: "Pixel 7" },
  ];

  async function openWaitingRoomBothCamerasOn(browser: Browser, device?: string) {
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
      ...(device ? { studentDevice: device } : {}),
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    await expect(peers.tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible();
    await expect(peers.studentPage.getByTestId("wb-waiting-overlay")).toBeVisible();
    await expectWaitingRoomMediaOn(peers.tutorPage);
    await expectWaitingRoomMediaOn(peers.studentPage);
    await expectBothCamerasPlaying(
      peers.tutorPage,
      peers.studentPage,
      meshLogs,
      "waiting-room-baseline",
      90_000,
      "waiting-room baseline: both camera tiles never painted before any reload"
    );
    return { peers, meshLogs };
  }

  for (const kind of studentKinds) {
    test(`G1: ${kind.label}, tutor reloads in the waiting room — both camera tiles paint again`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const { peers, meshLogs } = await openWaitingRoomBothCamerasOn(browser, kind.device);
      try {
        await reloadTutor(peers.tutorPage);
        await expect(peers.tutorPage.getByTestId("wb-waiting-overlay")).toBeVisible();
        await expectBothCamerasPlaying(
          peers.tutorPage,
          peers.studentPage,
          meshLogs,
          "waiting-room-tutor-reload",
          8_000,
          "camera tiles did not paint within 8s of a tutor reload in the waiting room"
        );
      } finally {
        await peers.close();
      }
    });

    test(`G1: ${kind.label}, student reloads in the waiting room — both camera tiles paint again`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const { peers, meshLogs } = await openWaitingRoomBothCamerasOn(browser, kind.device);
      try {
        await reloadStudent(peers.tutorPage, peers.studentPage);
        await expect(peers.studentPage.getByTestId("wb-waiting-overlay")).toBeVisible();
        await expectBothCamerasPlaying(
          peers.tutorPage,
          peers.studentPage,
          meshLogs,
          "waiting-room-student-reload",
          8_000,
          "camera tiles did not paint within 8s of a student reload in the waiting room"
        );
      } finally {
        await peers.close();
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Launch lane `launch/live-av` — remaining A/V items. Each oracle is something
// the browser reports (PC list, track readyState, getStats, the painted <video>),
// never the app's own gating state.
// ---------------------------------------------------------------------------

/** Every audio track getUserMedia created on the page (init-script capture). */
async function readGumAudioTracks(page: Page): Promise<GumVideoTrackState[]> {
  return page.evaluate(() =>
    ((window as PwCaptureWindow).__pwGumAudioTracks ?? []).map((t) => ({
      readyState: t.readyState,
      enabled: t.enabled,
    }))
  );
}

/** How many PCs the page ever created, and the creation index of each non-closed one. */
async function readPcIdentity(page: Page): Promise<{ created: number; liveIdx: number[] }> {
  return page.evaluate(() => {
    const w = window as PwCaptureWindow;
    const all = w.__pwPcs ?? [];
    const live = w.__pwLivePcs?.() ?? [];
    return { created: all.length, liveIdx: live.map((pc) => all.indexOf(pc)) };
  });
}

/** What the browser says about each non-closed PC: ICE state, connectionState, inbound RTP. */
async function readPcStates(page: Page): Promise<
  Array<{ ice: string; conn: string; audioIn: number; videoIn: number }>
> {
  return page.evaluate(async () => {
    const live = (window as PwCaptureWindow).__pwLivePcs?.() ?? [];
    return Promise.all(
      live.map(async (pc) => {
        let audioIn = 0;
        let videoIn = 0;
        const stats = await pc.getStats();
        stats.forEach((r) => {
          if (r.type !== "inbound-rtp") return;
          if (r.kind === "audio") audioIn += r.packetsReceived ?? 0;
          if (r.kind === "video") videoIn += r.packetsReceived ?? 0;
        });
        return { ice: pc.iceConnectionState, conn: pc.connectionState, audioIn, videoIn };
      })
    );
  });
}

/** Inbound audio packets are arriving on some live PC (independent of any tile/UI state). */
async function pageReceivesAudioRtp(page: Page): Promise<boolean> {
  return (await readPcStates(page)).some((s) => s.audioIn > 0);
}

/**
 * Emulates the Safari/iOS quirk behind SMOKE-BLOCK-1: the browser's aggregate
 * `connectionState` never leaves "connecting" although ICE is connected and
 * media flows. Applied to the prototype so every PC the app builds inherits it.
 */
async function installConnectionStateStuckConnecting(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // Find the prototype in the chain that owns the accessor (another init script
    // may have wrapped RTCPeerConnection, so the accessor can sit further up).
    let owner: object | null = RTCPeerConnection.prototype;
    while (owner && !Object.getOwnPropertyDescriptor(owner, "connectionState")) {
      owner = Object.getPrototypeOf(owner);
    }
    const desc = owner ? Object.getOwnPropertyDescriptor(owner, "connectionState") : undefined;
    if (!owner || !desc?.get) return;
    const realGet = desc.get;
    Object.defineProperty(owner, "connectionState", {
      configurable: true,
      get(this: RTCPeerConnection) {
        const real = realGet.call(this) as RTCPeerConnectionState;
        return real === "connected" ? "connecting" : real;
      },
    });
  });
}
test.describe("SMOKE-BLOCK-1 Start enables when ICE is up even if connectionState lags", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  test("SMOKE-BLOCK-1: connectionState stuck on connecting with ICE connected and media flowing — Start still enables", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      waitForConnected: false,
      prepareContext: async (ctx) => {
        await prepareCamerasAndCapture(ctx);
        await installConnectionStateStuckConnecting(ctx);
      },
    });
    try {
      const { tutorPage, studentPage } = peers;
      // Independent proof the link is really up (browser stats, not app state),
      // and that the quirk is really in effect (so the test cannot pass vacuously).
      await expect
        .poll(
          async () => {
            const s = (await readPcStates(tutorPage))[0];
            return s ? `${s.ice}/${s.conn}/audioIn>0=${s.audioIn > 0}` : "no-pc";
          },
          { timeout: 90_000, message: "tutor PC never reached ICE connected with inbound audio" }
        )
        .toMatch(/^(connected|completed)\/connecting\/audioIn>0=true$/);

      await expect(tutorPage.getByTestId("wb-start-session")).toBeEnabled({ timeout: 30_000 });
      await expect(
        studentPage.getByTestId("wb-waiting-overlay").getByRole("heading", { level: 2 })
      ).not.toHaveText(/connecting/i, { timeout: 30_000 });
    } finally {
      await peers.close();
    }
  });
});

test.describe("BUG-8 / AV-REFRESH-LOSS: media comes back after a peer leaves and returns", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  async function openLiveBothCamerasPlaying(browser: Browser) {
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    await expectCamerasOn(peers.tutorPage, peers.studentPage);
    await expectBothCamerasPlaying(
      peers.tutorPage,
      peers.studentPage,
      meshLogs,
      "live-baseline",
      90_000,
      "live baseline cameras never played"
    );
    await expect.poll(() => pageReceivesAudioRtp(peers.tutorPage), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => pageReceivesAudioRtp(peers.studentPage), { timeout: 30_000 }).toBe(true);
    return { peers, meshLogs };
  }

  test("BUG-8: student Exit then Rejoin — tutor builds a new peer connection and both cameras and audio flow again", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { peers, meshLogs } = await openLiveBothCamerasPlaying(browser);
    try {
      const { tutorPage, studentPage } = peers;
      const before = await readPcIdentity(tutorPage);
      expect(before.liveIdx.length, "tutor should hold exactly one live PC before the exit").toBe(1);

      await studentPage.getByTestId("wb-student-exit").click();
      await expect(studentPage.getByRole("status")).toHaveText(/you left the session/i, {
        timeout: 15_000,
      });
      await studentPage.getByTestId("wb-student-rejoin").click();
      await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
        timeout: 90_000,
      });
      await waitForTutorStudentConnected(tutorPage);

      await expectBothCamerasPlaying(
        tutorPage,
        studentPage,
        meshLogs,
        "after-student-exit-rejoin",
        30_000,
        "cameras did not resume within 30s of the student's Exit then Rejoin"
      );
      await expect.poll(() => pageHasLiveRemoteAudio(tutorPage), { timeout: 15_000 }).toBe(true);
      await expect.poll(() => pageHasLiveRemoteAudio(studentPage), { timeout: 15_000 }).toBe(true);

      // The tutor must be talking over a NEW peer connection, not the pre-exit one.
      const after = await readPcIdentity(tutorPage);
      expect(after.liveIdx.length, `tutor live PCs after rejoin: ${JSON.stringify(after)}`).toBe(1);
      expect(
        after.liveIdx[0],
        `tutor kept the pre-exit PC (created=${before.created}, live=${JSON.stringify(after.liveIdx)})`
      ).toBeGreaterThanOrEqual(before.created);
    } finally {
      await peers.close();
    }
  });

  test("AV-REFRESH-LOSS: student hard refresh in a live session — own camera and mic come back with no action and both sides see and hear each other", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const { peers, meshLogs } = await openLiveBothCamerasPlaying(browser);
    try {
      const { tutorPage, studentPage } = peers;
      await reloadStudent(tutorPage, studentPage);
      await expectBothCamerasPlaying(
        tutorPage,
        studentPage,
        meshLogs,
        "after-student-hard-refresh",
        25_000,
        "cameras did not resume within 25s of the student's hard refresh"
      );
      // The reloaded page holds its OWN live camera and mic again, unprompted.
      await expect
        .poll(
          async () => ({
            video: (await readGumVideoTracks(studentPage)).filter((t) => t.readyState === "live").length,
            audio: (await readGumAudioTracks(studentPage)).filter((t) => t.readyState === "live").length,
          }),
          { timeout: 15_000 }
        )
        .toMatchObject({ video: 1, audio: expect.any(Number) });
      expect((await readGumAudioTracks(studentPage)).filter((t) => t.readyState === "live").length).toBeGreaterThanOrEqual(1);
      await expect.poll(() => pageReceivesAudioRtp(tutorPage), { timeout: 15_000 }).toBe(true);
      await expect.poll(() => pageReceivesAudioRtp(studentPage), { timeout: 15_000 }).toBe(true);
    } finally {
      await peers.close();
    }
  });
});

test.describe("B11 student releases camera and mic on the ended screen", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  test("B11: tutor ends the session — the student's camera and mic hardware tracks are released", async ({
    browser,
  }) => {
    test.setTimeout(300_000);
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: prepareCamerasAndCapture,
    });
    const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
    try {
      const { tutorPage, studentPage } = peers;
      await item35WaitingRoomThenStart({ ...peers, close: peers.close }, meshLogs);

      // Non-vacuous precondition: the student really holds a live camera AND a live mic.
      const liveBefore = {
        video: (await readGumVideoTracks(studentPage)).filter((t) => t.readyState === "live").length,
        audio: (await readGumAudioTracks(studentPage)).filter((t) => t.readyState === "live").length,
      };
      expect(liveBefore.video, "student never held a live camera track").toBeGreaterThanOrEqual(1);
      expect(liveBefore.audio, "student never held a live mic track").toBeGreaterThanOrEqual(1);

      console.log(
        "B11-diag student audio gUM:",
        JSON.stringify(
          await studentPage.evaluate(() =>
            ((window as unknown as { __pwGumAudioStacks?: string[] }).__pwGumAudioStacks ?? []).map(
              (s, i) => ({ i, stack: s.slice(0, 400) })
            )
          )
        )
      );

      await tutorPage.getByTestId("wb-end-session").click();
      await expect(tutorPage.getByTestId("wb-end-session-confirm")).toBeVisible({ timeout: 10_000 });
      await tutorPage.getByTestId("wb-end-session-confirm-yes").click();
      await expect(studentPage.getByText("Session has ended")).toBeVisible({ timeout: 60_000 });

      // The ended screen is up: the hardware (camera light, mic indicator) must be free.
      await expect
        .poll(
          async () => {
            const [video, audio] = await Promise.all([
              readGumVideoTracks(studentPage),
              readGumAudioTracks(studentPage),
            ]);
            return JSON.stringify({
              liveVideo: video.filter((t) => t.readyState === "live").length,
              liveAudio: audio.filter((t) => t.readyState === "live").length,
            });
          },
          {
            timeout: 10_000,
            message: "student still holds a live camera/mic track on the 'Session has ended' screen",
          }
        )
        .toBe(JSON.stringify({ liveVideo: 0, liveAudio: 0 }));
    } finally {
      await peers.close();
    }
  });
});

test.describe("AV-CAM-BUTTON-ACQUIRING camera button reflects a camera that is starting", {
  tag: [TAG.WB_AV, TAG.WB_PRESENCE],
}, () => {
  test("AV-CAM-BUTTON-ACQUIRING: while the camera is still starting the button reads on, and one tap cancels it so the camera ends off", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const session = await seedWbPendingLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session, {
      ensureFollow: false,
      prepareContext: async (ctx) => {
        await prepareCamerasAndCapture(ctx);
        // Slow camera hardware (phone HAL): video getUserMedia resolves ~8s late.
        await ctx.addInitScript(() => {
          const md = navigator.mediaDevices;
          const prior = md.getUserMedia.bind(md);
          md.getUserMedia = async (c?: MediaStreamConstraints) => {
            if (c && c.video) await new Promise((r) => setTimeout(r, 8_000));
            return prior(c);
          };
        });
      },
    });
    try {
      const { studentPage } = peers;
      const cam = studentPage.getByTestId("wb-waiting-overlay").getByTestId("wb-topbar-cam-toggle");
      await expect(cam).toBeVisible({ timeout: 30_000 });
      // The camera has not arrived yet (the slow getUserMedia is still pending)...
      expect((await readGumVideoTracks(studentPage)).length).toBe(0);
      // ...and the button must say the camera is coming ON (offering "turn off"),
      // not claim it is off.
      await expect(cam).toHaveAttribute("aria-label", "Turn camera off");

      await cam.click(); // user cancels the starting camera
      await expect(cam).toHaveAttribute("aria-label", "Turn camera on");

      // Let the slow camera finally arrive.
      await expect
        .poll(async () => (await readGumVideoTracks(studentPage)).length, { timeout: 30_000 })
        .toBeGreaterThanOrEqual(1);
      await studentPage.waitForTimeout(1_500);

      await expect(cam).toHaveAttribute("aria-label", "Turn camera on");
      const tracks = await readGumVideoTracks(studentPage);
      expect(
        tracks.filter((t) => t.readyState === "live" && t.enabled),
        `user cancelled the camera but a track still sends: ${JSON.stringify(tracks)}`
      ).toEqual([]);
    } finally {
      await peers.close();
    }
  });
});
test.describe("phone student A/V is bidirectional", { tag: [TAG.WB_AV, TAG.WB_PRESENCE] }, () => {
  // Real WebKit is not available here: Playwright's WebKit build on Windows has no
  // RTCPeerConnection/MediaStream (probed 2026-11-17: all `undefined`), so an iPhone
  // student cannot run a call in it. The closest surrogate is the iPhone 13 and Pixel 7
  // device profiles (touch-primary narrow layout, mobile UA) on the Chromium engine,
  // plus the existing WebKit join/consent specs for engine-specific layout.
  // PLAYWRIGHT-GAP: real iOS Safari WebRTC (see docs/BACKLOG.md "Phone student A/V: real WebKit").
  for (const device of ["Pixel 7", "iPhone 13"]) {
    test(`phone student (${device} profile): after Start, tutor and student each see moving video and receive live audio RTP`, async ({
      browser,
    }) => {
      test.setTimeout(300_000);
      const session = await seedWbPendingLiveSyncSession();
      const peers = await openTutorAndStudent(browser, session, {
        ensureFollow: false,
        studentDevice: device,
        prepareContext: prepareCamerasAndCapture,
      });
      const meshLogs = attachMeshLogs(peers.tutorPage, peers.studentPage);
      try {
        const { tutorPage, studentPage } = peers;
        await expect(studentPage.locator(".mynk-wb-chrome")).toHaveAttribute("data-layout", "narrow");
        await item35WaitingRoomThenStart({ ...peers, close: peers.close }, meshLogs);
        await expectBothCamerasPlaying(
          tutorPage,
          studentPage,
          meshLogs,
          `phone-${device}-live`,
          45_000,
          `${device} student: both camera tiles never painted after Start`
        );
        await expect.poll(() => pageHasLiveRemoteAudio(tutorPage), { timeout: 30_000 }).toBe(true);
        await expect.poll(() => pageHasLiveRemoteAudio(studentPage), { timeout: 30_000 }).toBe(true);
        await expect.poll(() => pageReceivesAudioRtp(tutorPage), { timeout: 30_000 }).toBe(true);
        await expect.poll(() => pageReceivesAudioRtp(studentPage), { timeout: 30_000 }).toBe(true);
      } finally {
        await peers.close();
      }
    });
  }
});
