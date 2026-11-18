import { defineConfig, devices } from "@playwright/test";
import { PW_CRON_SECRET } from "./tests/helpers/pw-cron-secret";

const {
  WB_REGRESSION_TOTP_ENCRYPTION_KEY,
  applyWbRegressionLocalDatabaseEnv,
} = require("./scripts/wb-regression-local-db.cjs");
const {
  authStatePath,
  buildWbDevServerCommand,
  resolvePwStack,
} = require("./scripts/pw-stack.cjs");

applyWbRegressionLocalDatabaseEnv();
const stack = resolvePwStack();

// Dummy Twilio credentials so the SMS consent UI renders in Playwright.
// The consent specs never submit Send code. A real send with these values
// 401s at Twilio and does not deliver a message. Always set on the webServer
// command below so a developer .env cannot point the test server at live Twilio.
const PW_TWILIO_ACCOUNT_SID = "ACplaywright00000000000000000000";
const PW_TWILIO_AUTH_TOKEN = "playwright-dummy-not-a-real-token";
const PW_TWILIO_FROM_NUMBER = "+15555550100";
if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
  process.env.TWILIO_ACCOUNT_SID = PW_TWILIO_ACCOUNT_SID;
}
if (!process.env.TWILIO_AUTH_TOKEN?.trim()) {
  process.env.TWILIO_AUTH_TOKEN = PW_TWILIO_AUTH_TOKEN;
}
if (!process.env.TWILIO_FROM_NUMBER?.trim()) {
  process.env.TWILIO_FROM_NUMBER = PW_TWILIO_FROM_NUMBER;
}

const path = require("path");
// Headless Chromium's built-in fake mic is silent once Playwright adds
// `--mute-audio`. Every slot then sits under the silent-track RMS floor,
// recovery burns ~6s, and a short session only keeps a sub-second webm.
// A real tone plus dropping that mute gives the analyser energy.
// Playback to the machine is muted separately by
// scripts/playwright-mute-output.ps1 (started from globalSetup), so the
// tone still reaches the recorder but not speakers or headphones.
// globalSetup is on the root config, so one helper covers every project
// in a `playwright test` invocation. The projects that drop --mute-audio
// (and therefore need that OS mute) are integration, wb-regression, and
// wb-in-person-unmasked. Other projects keep Chromium's mute. The helper
// only mutes executables under ms-playwright, never the user's Chrome.
const PW_FAKE_MIC_WAV = path
  .resolve(__dirname, "tests/fixtures/pw-fake-mic.wav")
  .replace(/\\/g, "/");
const PW_FAKE_MEDIA_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-audio-capture=${PW_FAKE_MIC_WAV}`,
];

/**
 * Playwright config — visual regression, a11y, smoke, e2e, and integration tests.
 *
 * - Visual: tests/visual/ (`npm run test:e2e` desktop/mobile projects; no snapshots in integration).
 * - Smoke: tests/smoke/
 * - E2E opt-in: tests/e2e/
 * - Integration (Phase 0c+): tests/integration/ — `npm run test:integration`
 *   Behavior + API contract tests; uses `auth.setup.ts` + `storageState` (no per-test login).
 *   Full recording flow needs `BLOB_READ_WRITE_TOKEN` in `.env` (test self-skips if unset).
 *
 * Run default Playwright (all non-integration projects): npm run test:e2e
 * Update baselines: npm run test:visual:update
 *
 * Database: Playwright webServer + globalSetup force local Docker Postgres
 * (`127.0.0.1:5432/tutoring_notes`, or PW_DB_NAME) and abort if DATABASE_URL
 * host is not local. Your `.env` may still point at Neon for normal dev; the
 * harness never uses it. Ports follow PW_PORT / PW_RELAY_PORT (defaults 3100 and 3002).
 */
export default defineConfig({
  outputDir: stack.outputDir,
  ...(stack.reportDir
    ? {
        reporter: [
          ["list"],
          ["html", { outputFolder: stack.reportDir, open: "never" }],
        ],
      }
    : {}),
  globalSetup: require.resolve("./tests/integration/wb-regression-global-setup.ts"),
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,

  expect: {
    toHaveScreenshot: {
      // Allow up to 1% pixel difference to tolerate sub-pixel anti-aliasing
      // across OS/GPU rendering. Raise only if you see consistent false
      // failures on identical-looking screenshots.
      maxDiffPixelRatio: 0.01,
      // Disable CSS animations so screenshots are stable.
      animations: "disabled",
    },
  },

  use: {
    baseURL: stack.origin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: [
    {
      command: buildWbDevServerCommand({
        port: stack.port,
        primary: true,
        totpKey: WB_REGRESSION_TOTP_ENCRYPTION_KEY,
        twilioSid: PW_TWILIO_ACCOUNT_SID,
        twilioToken: PW_TWILIO_AUTH_TOKEN,
        twilioFrom: PW_TWILIO_FROM_NUMBER,
        cronSecret: PW_CRON_SECRET,
      }),
      url: stack.origin,
      // A server already on the primary dev port is kept. globalSetup rejects
      // it unless GET /api/test/playwright-harness reports PLAYWRIGHT_TEST=1.
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node scripts/playwright-relay-or-stub.cjs",
      url: stack.relayHttpUrl,
      // The Docker relay port is never killed; always reuse when healthy.
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ].concat(
    process.env.WB_SKIP_3101_WEBSERVER
      ? []
      : [
          {
            command: buildWbDevServerCommand({
              port: stack.altPort,
              primary: false,
              totpKey: WB_REGRESSION_TOTP_ENCRYPTION_KEY,
              twilioSid: PW_TWILIO_ACCOUNT_SID,
              twilioToken: PW_TWILIO_AUTH_TOKEN,
              twilioFrom: PW_TWILIO_FROM_NUMBER,
              cronSecret: PW_CRON_SECRET,
            }),
            url: stack.altOrigin,
            // Same reuse rule as the primary port. globalSetup checks this
            // port too unless WB_SKIP_3101_WEBSERVER is set.
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
  ),

  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ["**/visual/**/*.spec.ts", "**/smoke/**/*.spec.ts"],
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
      },
      // Smoke tests only on mobile for now; visual baselines are desktop-first.
      // Add **/visual/**/*.spec.ts here once mobile baselines are captured.
      testMatch: ["**/smoke/**/*.spec.ts"],
    },
    {
      // Opt-in browser end-to-end smokes (recorder rollover, etc.). These
      // self-skip unless their gating env var is set, so it's safe to leave
      // in the default project list — but they're isolated here to keep
      // baseline screenshot config and viewport choices independent.
      name: "e2e",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
      testMatch: ["**/e2e/**/*.spec.ts"],
    },
    {
      name: "integration-setup",
      testMatch: ["**/integration/auth.setup.ts"],
    },
    {
      name: "integration",
      dependencies: ["integration-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: authStatePath("tutor.json"),
        permissions: ["microphone"],
        launchOptions: {
          ignoreDefaultArgs: ["--mute-audio"],
          args: PW_FAKE_MEDIA_ARGS,
        },
      },
      testMatch: [
        "**/integration/**/*.spec.ts",
        "**/smoke-admin-student-detail.spec.ts",
      ],
      testIgnore: [
        "**/integration/auth.setup.ts",
        "**/integration/identity/**/*.spec.ts",
        "**/integration/whiteboard-live-sync-regression.spec.ts",
        "**/integration/wb-phantom-stroke-regression.spec.ts",
        "**/integration/calendar-sync-badge.spec.ts",
        "**/integration/calendar-oauth-connect.spec.ts",
      ],
    },
    {
      name: "identity-e2e",
      dependencies: ["integration-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: authStatePath("parent.json"),
      },
      testMatch: ["**/integration/identity/**/*.spec.ts"],
    },
    {
      name: "wb-regression",
      dependencies: ["integration-setup"],
      workers: 1,
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        storageState: authStatePath("tutor.json"),
        permissions: ["microphone"],
        launchOptions: {
          ignoreDefaultArgs: ["--mute-audio"],
          args: PW_FAKE_MEDIA_ARGS,
        },
      },
      testMatch: [
        "**/integration/whiteboard-live-sync-regression.spec.ts",
        "**/integration/wb-student-exit-rejoin.spec.ts",
        "**/integration/wb-student-mic-persistence.spec.ts",
        "**/integration/wb-wave5-polish.spec.ts",
        "**/integration/wb-av-mesh.spec.ts",
        "**/integration/wb-session-lifecycle.spec.ts",
        "**/integration/wb-cancel-pending-session.spec.ts",
        "**/integration/wb-chrome-interactions.spec.ts",
        "**/integration/wb-phantom-stroke-regression.spec.ts",
        "**/integration/wb-live-persist-tab-kill.spec.ts",
        "**/integration/wb-resume-from-backend.spec.ts",
        "**/integration/wb-end-from-roster.spec.ts",
        "**/integration/wb-end-from-gate.spec.ts",
        "**/integration/wb-review-overlay-3paths.spec.ts",
        "**/integration/wb-vad-per-speaker-durability.spec.ts",
        "**/integration/wb-tab-kill-audio-durability.spec.ts",
        "**/integration/wb-tutor-recording-mute.spec.ts",
        "**/integration/wb-transcription-language-notice.spec.ts",
        "**/integration/wb-e2-pdf-stroke-leak.spec.ts",
        "**/integration/wb-e2-apply-remote-pdf-stroke-leak.spec.ts",
        "**/integration/wb-e3-blank-board-stroke-leak.spec.ts",
        "**/integration/wb-e4-pdf-board-stroke-leak.spec.ts",
        "**/integration/wb-e5-pdf-board-stroke-bleed-initial-board.spec.ts",
        "**/integration/wb-notes-shimmer.spec.ts",
        "**/integration/wb-notes-silent-empty.spec.ts",
        "**/integration/wb-chunk-transcribe-queue.spec.ts",
        "**/integration/wb-finish-review-cta.spec.ts",
        "**/integration/wb-session-review-transcript.spec.ts",
        "**/integration/wb-roughness-style.spec.ts",
        "**/integration/wb-shift-constrain-shapes.spec.ts",
        "**/integration/wb-org-qol-presence.spec.ts",
        "**/integration/wb-ghost-viewport.spec.ts",
        "**/integration/wb-student-view-lock.spec.ts",
        "**/integration/wb-tutor-recenter.spec.ts",
        "**/integration/wb-org-qol-bridge.spec.ts",
        "**/integration/wb-org-booking.spec.ts",
        "**/integration/wb-org-link-row.spec.ts",
        "**/integration/wb-org-removal.spec.ts",
        "**/integration/wb-adhoc-session-list.spec.ts",
        "**/integration/wb-graph-ink.spec.ts",
        "**/integration/wb-org-qol-surface.spec.ts",
        "**/integration/identity/org-learner-claim.spec.ts",
        "**/integration/wb-hydration-peer-id.spec.ts",
        "**/integration/wb-replay-active-board-tab.spec.ts",
        "**/integration/wb-replay-scrub-seek.spec.ts",
        "**/integration/view-whiteboard-new-replay.spec.ts",
        "**/integration/wb-share-replay-viewport-phone.spec.ts",
        "**/integration/wb-board-tab-overflow.spec.ts",
        "**/integration/admin-student-detail-stage6.spec.ts",
        "**/integration/admin-student-detail-start-claim-findability.spec.ts",
        "**/integration/identity/parent-dashboard-notes-scope.spec.ts",
        "**/integration/ai-assist-panel.spec.ts",
        "**/integration/note-form-hydration.spec.ts",
        "**/integration/note-outbox-share.spec.ts",
        "**/integration/ux-sarah-wave1-bundle.spec.ts",
        "**/integration/public-limits.spec.ts",
        "**/integration/calendar-sync-badge.spec.ts",
        "**/integration/calendar-oauth-connect.spec.ts",
        "**/integration/recording-resilience.spec.ts",
        "**/integration/recording-end-to-end.spec.ts",
        "**/integration/wb-self-learner-audio-off.spec.ts",
        "**/integration/wb-end-winddown.spec.ts",
        "**/integration/wb-replay-no-multipart-banner.spec.ts",
        "**/integration/wb-replay-camera-fit.spec.ts",
        "**/integration/wb-shortcut-help-dismiss.spec.ts",
        "**/integration/wb-modifier-hints-placement.spec.ts",
        "**/integration/parent-child-notes-whiteboard-replay.spec.ts",
        "**/integration/wb-child-home.spec.ts",
        // Consent wave (docs/handoff/consent-wave-plan.md § 6): C0 harness self-test + the
        // matrix skeletons (every row `test.fixme` until its wave lands).
        "**/integration/wb-consent-harness-selftest.spec.ts",
        "**/integration/wb-consent-matrix.spec.ts",
        "**/integration/consent-entry.spec.ts",
        "**/integration/wb-consent-board-purge.spec.ts",
        "**/integration/wb-consent-mic.spec.ts",
        "**/integration/wb-consent-reaper.spec.ts",
        "**/integration/wb-consent-cron.spec.ts",
        "**/audio-upload.spec.ts",
        "**/smoke/whiteboard-workspace.spec.ts",
      ],
    },
    {
      name: "wb-in-person-unmasked",
      dependencies: ["integration-setup"],
      retries: 1,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
        baseURL: stack.altOrigin,
        storageState: authStatePath("tutor.json"),
        permissions: ["microphone"],
        launchOptions: {
          ignoreDefaultArgs: ["--mute-audio"],
          args: PW_FAKE_MEDIA_ARGS,
        },
      },
      testMatch: ["**/integration/wb-in-person-audio-start.spec.ts"],
    },
  ],
});
