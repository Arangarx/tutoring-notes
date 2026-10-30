/**
 * Bearer the Playwright webServers set as `CRON_SECRET`.
 * A test constant, never a real secret. One definition: playwright.config.ts,
 * the chunk-transcribe spec, and the consent cron driver all import this.
 */
export const PW_CRON_SECRET = "playwright-cron-secret";
