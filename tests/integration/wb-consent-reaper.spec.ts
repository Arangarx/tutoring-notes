/**
 * Consent wave — § 6k stale-session reaper (Q3 APPROVED, Andrew 2026-10-29).
 *
 * C0 SKELETON (docs/handoff/consent-wave-plan.md § 6, § 8 C0): every row below is `test.fixme` and is filled in by the wave that
 * owns its behavior. Titles state the rule; each row's oracle is quoted in the comment above it. A row is un-fixme'd only together
 * with its red-before / green-after evidence (exhaustive-testing-mandate.mdc).
 *
 * Run (after un-fixme): npx playwright test tests/integration/wb-consent-reaper.spec.ts --project=wb-regression --workers=1 --retries=0
 */

import { test } from "@playwright/test";
import { TAG } from "../test-tags";

// ---------------------------------------------------------------------------
// 6k. Stale-session reaper (R3)
// ---------------------------------------------------------------------------
test.describe("consent 6k: Stale-session reaper (R3)", {
  tag: [TAG.WB_CONSENT, TAG.WB_PRESENCE],
}, () => {
  // Oracle: Seeded: A idle 25 h (no batch, no recording, no participant activity), B idle 23 h, C idle 25 h on its row but with a recent batch. After one cron call: A 'endedAt' set; B and C untouched (positive controls)
  test.fixme(
    "G1: an ACTIVE session idle past the bar is ended by the cron, and an active one is not",
    async () => {
      // pending: wave that owns G1
    }
  );
  // Oracle: Family set whiteboard off after create; after the cron: 'endedAt' set, snapshot row exists ('frozen_at_end'), intent set and the board purged after the sweep (the reaper arm of S7b; the snapshot row is the reaper arm of  …
  test.fixme(
    "G2: a PENDING session idle past the bar is ended and its snapshot is written at End",
    async () => {
      // pending: wave that owns G2
    }
  );
  // Oracle: Harness listing and batch counts, with a positive control before
  test.fixme(
    "G3: whiteboard-off reaped session: board purged; whiteboard-on reaped session: board kept",
    async () => {
      // pending: wave that owns G3
    }
  );
  // Oracle: 'endedAt' set for a whiteboard-on session; no intent; board data untouched
  test.fixme(
    "G4: the reaper ends sessions with whiteboard on too (one End semantics)",
    async () => {
      // pending: wave that owns G4
    }
  );
  // Oracle: Seeded appointment 'endAt' in the future; session untouched after cron; reaped once the appointment is in the past
  test.fixme(
    "G5: a PENDING session with an appointment still in the future is not reaped",
    async () => {
      // pending: wave that owns G5
    }
  );
  // Oracle: Second cron call changes nothing; 'endedAt' and intent timestamps identical
  test.fixme(
    "G6: reaping is idempotent and does not move endedAt",
    async () => {
      // pending: wave that owns G6
    }
  );
  // Oracle: Guard (§ 6i)
  test.fixme(
    "G7: reaper uses the one shared stamp helper",
    async () => {
      // pending: wave that owns G7
    }
  );
  // Oracle: Checkpoint 409; 'issueJoinToken' refused; open-session list omits it
  test.fixme(
    "G8: a reaped session cannot be resumed, joined or checkpointed",
    async () => {
      // pending: wave that owns G8
    }
  );
  // Oracle: More candidates than the batch; fault on one; the rest are ended in the run
  test.fixme(
    "G9: reaper batch is bounded and a failing row does not block the others",
    async () => {
      // pending: wave that owns G9
    }
  );
  // Oracle: Row fields; 'orgForcedEndUploadOpen' false; 'touchOrgForceEndIfDue' leaves 'endedAt' unchanged (§ 3.9 effect 6)
  test.fixme(
    "G10: org session reaped before any forced-end read: notesForbidden unchanged, no late-upload window, a later touch is a no-op",
    async () => {
      // pending: wave that owns G10
    }
  );
  // Oracle: Settles the UNVERIFIED in § 3.9 effect 2: result recorded in the PR note and the effects table is updated to match
  test.fixme(
    "G11: after a reap, the tutor can open review and the manual generate action behaves as documented",
    async () => {
      // pending: wave that owns G11
    }
  );
  // Oracle: B2, arm → park → release. Seed an ACTIVE session idle 25 h; arm 'reaper:between_scan_and_stamp'; fire the cron (the reaper scans, selects the session, parks); wait until parked; record activity through a real path (a che …
  test.fixme(
    "G12: the reaper does not end a session that became active between its scan and its stamp",
    async () => {
      // pending: wave that owns G12
    }
  );
  // Oracle: B2, null-'endAt' rule. Three seeds, all idle 25 h: linked 'ScheduledSession' with 'endAt' null (reaped: no throw, no skip), linked with 'endAt' in the future (not reaped until it passes), no link (reaped). 'delayUntil =  …
  test.fixme(
    "G13: a session with no appointment end is reaped on idleness alone; an appointment end only delays",
    async () => {
      // pending: wave that owns G13
    }
  );
  // Oracle: B2. Env unset behaves as 'dry_run'; an idle-25-h session is untouched ('endedAt' null, no snapshot written, no intent), '[slc] action=would_reap' is logged with the session id; a not-idle session logs nothing
  test.fixme(
    "G14: CONSENT_REAPER_MODE=dry_run (the default) logs would_reap and ends nothing",
    async () => {
      // pending: wave that owns G14
    }
  );
  // Oracle: B2 + B1. Idle session untouched, no 'would_reap', no 'reaped', exactly one 'reaper_off' line for the run; the purge half of the same route still processes a due row (the kill switch is the reaper's, not the route's)
  test.fixme(
    "G15: CONSENT_REAPER_MODE=off does nothing to sessions, and the purge still runs",
    async () => {
      // pending: wave that owns G15
    }
  );
  // Oracle: B2. Value 'enfroce' (typo): nothing is ended and a '[slc] action=reaper_mode_invalid' line is logged; the empty string and unset behave as 'dry_run' without that line. Red on a parser that treats unknown as truthy
  test.fixme(
    "G16: an unrecognized CONSENT_REAPER_MODE value falls back to dry_run, never to enforce",
    async () => {
      // pending: wave that owns G16
    }
  );
  // Oracle: Q7 default, C4c. Whiteboard-on ACTIVE session with batches, idle 25 h, reaped (enforce). Oracle: the events route for the session returns a log whose strokes equal the strokes written through the real draw path (independ …
  test.fixme(
    "G17: REAPER-ASSEMBLE: a reaped whiteboard-on session's replay serves the board the batches held",
    async () => {
      // pending: wave that owns G17
    }
  );
  // Oracle: Q7. Whiteboard-off idle session reaped: no assembled blob, board purged by the sweep, and a seeded audio blob, concat blob and another student's session blob are all still in the harness store
  test.fixme(
    "G18: REAPER-ASSEMBLE: a reaped whiteboard-off session assembles nothing and deletes nothing outside its prefix",
    async () => {
      // pending: wave that owns G18
    }
  );
  // Oracle: SF-F, re-review 3; RED against a reaper that passes the last-activity instant as 'now' to everything. Seed a whiteboard-off ACTIVE session with 'startedAt' 26 h ago and last activity 25 h ago (DB oracle helper, so both i …
  test.fixme(
    "G19: a reaped session back-dates endedAt and duration, and sets participant leftAt to that same endedAt (never later); the purge intent, the snapshot and token revokedAt carry real server time",
    async () => {
      // pending: wave that owns G19
    }
  );
});
