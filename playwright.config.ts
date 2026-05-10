import { defineConfig, devices } from "@playwright/test";

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
 * Local: ensure `.env` has a valid `DATABASE_URL` (PostgreSQL) and run
 * `npx prisma db push` if needed — the web server reuses that URL (no longer
 * forces sqlite `file:./pw.db`).
 */
export default defineConfig({
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
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  webServer: {
    command:
      'cmd /c "set NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=1&& set NEXTAUTH_URL=http://localhost:3100&& npx prisma db push --skip-generate&& npm run dev -- --port 3100"',
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

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
        storageState: "tests/integration/.auth/tutor.json",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
      testMatch: ["**/integration/**/*.spec.ts"],
      testIgnore: ["**/integration/auth.setup.ts"],
    },
  ],
});
