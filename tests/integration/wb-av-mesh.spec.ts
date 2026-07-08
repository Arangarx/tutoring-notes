import { test, expect, type Page } from "@playwright/test";
import {
  openTutorAndStudent,
  seedWbLiveSyncSession,
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
