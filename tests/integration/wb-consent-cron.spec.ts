/**
 * Consent wave — § 6l (B1): /api/cron/session-cleanup and the untouched transcription route, over HTTP with the test CRON_SECRET; no relay.
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-cron.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test } from "@playwright/test";
import { TAG } from "../test-tags";

// ---------------------------------------------------------------------------
// 6l. Cron isolation (B1)
// ---------------------------------------------------------------------------
test.describe("consent 6l: Cron isolation (B1)", {
  tag: [TAG.WB_CONSENT, TAG.WB_RECORDING],
}, () => {
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:reaper")'; seed a due purge row and an idle session. Oracle: the purge row's 'boardPurgedAt' is stamped (the purge ran after the reaper threw), the idle session is untouched, the  …
  test.fixme(
    "K1: the reaper throws: the purge still runs, and the route returns 500 naming the reaper",
    async () => {
      // pending: wave that owns K1
    }
  );
  // Oracle: Wave C4c (BL2). Arm 'faultPoint("cleanup:purge")'; 'enforce' mode; an idle session. Oracle: the session is ended (the reaper's work stands), response 500 naming 'purge'
  test.fixme(
    "K2: the purge throws: the reaper's work is already committed, and the route returns 500 naming the purge",
    async () => {
      // pending: wave that owns K2
    }
  );
  // Oracle: SF-G, BL2. (a) C4b, jest guard: 'SESSION_REAPER_TIME_BUDGET_MS + BOARD_PURGE_SWEEP_MIN_WINDOW_MS + SESSION_CLEANUP_MARGIN_MS <= maxDuration * 1000', importing 'maxDuration' from the route module (red when someone raises  …
  test.fixme(
    "K3: budgets: the deadlines derive from the route's start, reaper + purge window + margin fit under maxDuration, and a slow reaper cannot push the purge past the route deadline",
    async () => {
      // pending: wave that owns K3
    }
  );
  // Oracle: C4b with the purge fault only; re-run in C4c with both faults (BL2). Arm the available fault(s) so 'session-cleanup' returns 500; call '/api/cron/transcribe-sweep' over HTTP: it returns 200 and processes a seeded eligibl …
  test.fixme(
    "K4: transcribe-sweep is untouched: it still processes work while session-cleanup is failing, and its schedule is unchanged",
    async () => {
      // pending: wave that owns K4
    }
  );
  // Oracle: Wave C4b (BL2, ADDED, veto-able): the arm of K1/K2 that does not need the reaper. Route has one job at this point. Seed a due purge row; arm 'faultPoint("cleanup:purge")'; call the route. Oracle: HTTP 500 with a body nam …
  test.fixme(
    "K5: purge-only isolation: a throwing purge is caught, logged and returned as a 500 naming purge, and the next clean call purges the row",
    async () => {
      // pending: wave that owns K5
    }
  );
});
