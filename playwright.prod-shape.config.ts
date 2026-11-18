import { defineConfig, devices } from "@playwright/test";
import { PROD_SHAPE_NEXTAUTH_SECRET } from "./tests/helpers/prod-shape-secret";

const {
  WB_REGRESSION_TOTP_ENCRYPTION_KEY,
  applyWbRegressionLocalDatabaseEnv,
} = require("./scripts/wb-regression-local-db.cjs");
const {
  buildProdShapeServerCommand,
  resolvePwStack,
} = require("./scripts/pw-stack.cjs");

/**
 * Production-shape Playwright config — `npm run test:prod-shape`.
 *
 * The main config (`playwright.config.ts`) runs `next dev`. Dev servers hand a thrown
 * server-action error to the client intact; a production build REDACTS it (generic message +
 * digest only), which is the shape real tutors get. Anything that must survive a server
 * action boundary in production (typed refusals, Error-ID handling) needs one real
 * `next build && next start` check, and this is it.
 *
 * Isolation: its own port (3102), its own webServer, NO harness env (no PLAYWRIGHT_TEST, no
 * blob harness, no test routes — `next start` runs NODE_ENV=production, which locks those
 * routes anyway). It does NOT share the `:3100` dev server, but it does write `.next`, so
 * stop any running `next dev` first. Local Docker Postgres only (host guard below).
 */
applyWbRegressionLocalDatabaseEnv();

const stack = resolvePwStack();
// Iteration only: `PROD_SHAPE_REUSE_BUILD=1` skips the build and serves the existing `.next`
// (which MUST be a production build of the current tree, or the run proves nothing).
const BUILD_STEP = process.env.PROD_SHAPE_REUSE_BUILD === "1" ? "" : "npx next build&& ";

export default defineConfig({
  testDir: "./tests/prod-shape",
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: stack.prodShapeOrigin,
    trace: "retain-on-failure",
  },
  webServer: {
    command: buildProdShapeServerCommand({
      nextAuthSecret: PROD_SHAPE_NEXTAUTH_SECRET,
      totpKey: WB_REGRESSION_TOTP_ENCRYPTION_KEY,
      buildStep: BUILD_STEP,
    }),
    url: `${stack.prodShapeOrigin}/login`,
    // next build + start; the build is the long part.
    timeout: 900_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "prod-shape",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testMatch: ["**/prod-shape/**/*.spec.ts"],
    },
  ],
});
