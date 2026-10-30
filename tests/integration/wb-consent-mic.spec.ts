/**
 * Consent wave — fake-media mic rows (spy on getUserMedia injected before load).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-mic.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test } from "@playwright/test";
import { TAG } from "../test-tags";

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
  test.fixme(
    "M1: in person, audio off: zero audio getUserMedia calls from waiting room through End",
    async () => {
      // pending: wave that owns M1
    }
  );
  // Oracle: Spy count = 0 after click
  test.fixme(
    "M2: in person, audio off: the top-bar mic control does not open the mic",
    async () => {
      // pending: wave that owns M2
    }
  );
  // Oracle: Spy count = 0
  test.fixme(
    "M3: in person, audio off: the A/V permission prompt does not request the mic",
    async () => {
      // pending: wave that owns M3
    }
  );
  // Oracle: Spy count = 0
  test.fixme(
    "M4: in person, audio off: the device picker and device swap do not open the mic",
    async () => {
      // pending: wave that owns M4
    }
  );
  // Oracle: Track 'readyState === "ended"'; meter stopped
  test.fixme(
    "M5: flip to in person after the mic was open (online selected): the mic is released before Start",
    async () => {
      // pending: wave that owns M5
    }
  );
  // Oracle: Video track live and audio track absent; 'micAcquireSettled' true. Chromium (fake media) for the live-track assertion; a WebKit variant is spy-only (no fake media there, BL1): the 'video' constraint is requested and no a …
  test.fixme(
    "M6: camera still works after a skipped mic",
    async () => {
      // pending: wave that owns M6
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
  test.fixme(
    "M8: online, audio off: the mic is still acquired for the live conversation but never recorded",
    async () => {
      // pending: wave that owns M8
    }
  );
  // Oracle: Spy count = 0 until mode selected; then ≥ 1 for online, 0 for in person
  test.fixme(
    "M9: audio off, mode not yet chosen: mic acquisition is deferred",
    async () => {
      // pending: wave that owns M9
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
      // pending: wave that owns M16
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
