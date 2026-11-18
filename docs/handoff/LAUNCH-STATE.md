# Launch state

Current picture as of 2026-11-17. The approved plan is [LAUNCH-PLAN.md](LAUNCH-PLAN.md).

## Where production is

[usemynk.com](https://usemynk.com) serves master `97c42ae8` from 2026-09-30. Git master is `eebafee1`, six commits ahead of that deploy. The production deploy of `eebafee1` was canceled.

## Release branch

`feat/org-qol` is at `71e2bc14`. It is 419 commits ahead of master and 0 behind. Org work stages 1 through 5 are done. Stages 6 and 7 are partial. Waves W0 through W4 and W8 are done. W5 and W6 are partial. W7 and W9 have not been started. Consent wave C0 through C6 is built and verified. The C6 verification result is MERGE-OK-WITH-NITS. C7 copy and C8 privacy and terms honesty are still remaining. Cloudflare TURN code is on this branch. Production and preview TURN keys exist in Vercel. The approved plan records a READY preview for this branch.

## Migrations and new runtime

Seven migrations are on this branch and are not on master:

1. `20261006120000_claim_target_schedule_bridge_live_key`
2. `20261007180000_org_membership_invites`
3. `20261011130000_org_learner`
4. `20261012140000_child_consent_restriction`
5. `20261012160000_child_set_consent_provenance`
6. `20261012190000_whiteboard_session_notes_forbidden`
7. `20261112120000_whiteboard_session_board_purge`

The new environment variable is `CONSENT_REAPER_MODE`. Leaving it unset means dry run. The new cron route is `/api/cron/session-cleanup`.

## Hotfixes

`fix/transcript-silence-hallucination` has 5 unique commits. `fix/wb-student-apply-race` has 9 commits. TURN and the restart-after-failed behavior from that hotfix are already on the release branch. Both hotfixes are being folded into `feat/org-qol`. The hotfix-to-master detour is dropped.

## Security checks

Static checks from `sec/audit-pipeline` are being ported onto the release branch.

## Known red tests

- `tests/integration/wb-org-booking.spec.ts` at lines 239 and 587
- `tests/integration/wb-org-qol-bridge.spec.ts` at line 579 (two tests)
- `tests/integration/admin-student-detail-stage6.spec.ts` at line 605
- `tests/smoke/whiteboard-workspace.spec.ts` at line 110

## Testing inventory

About 116 integration specs, about 679 Playwright tests, and about 447 jest files. Consent fixmes still open for C7 are E-copy, S2b, V1 through V4, and M16b. S9a, S10a, and S12 are characterization tests. W26 is non-gating. Other fixmes sit at `tests/integration/wb-av-mesh.spec.ts:1039`, `tests/integration/wb-org-qol-surface.spec.ts:1448`, `tests/integration/wb-review-overlay-3paths.spec.ts:378`, and `tests/integration/wb-live-persist-tab-kill.spec.ts:108`.

## Human-test packets

The Tyson Drive packet has 70 items: 65 PASS, PARTIAL on 35, 48, and 60, FAIL on 54, and SKIP on 55. Items 71, 72, and 73 are PASS. The drawing smoke has not been run. These packets will be replaced by one new book, [PILOT-RELEASE-SMOKE.md](PILOT-RELEASE-SMOKE.md), which does not exist yet.

## Production environment (names only)

`ADMIN_EMAIL` is set. `OPERATOR_EMAILS` is not set. SMTP is set. Twilio is set. SMS is blocked until the A2P campaign is approved. `TOTP_ENCRYPTION_KEY` is set.

## Andrew's decisions (2026-11-17)

There is one release: both hotfixes fold into `feat/org-qol`. Signup stays curated. Approval stays, and Andrew is emailed on every signup. The pilot is free now. Stripe and pricing come during the pilot. Legacy sessions are almost all test data, so audio-only replay for old sessions is accepted. Calculus might become a must if a college organization requires it. That item stays conditional Bucket B while a sizing pass is in progress.

**Parent data deletion.** Parents request deletion by email. Mynk performs it with the existing admin erasure tool. C8 privacy and terms honesty must say how to ask and the timeframe. Parent self-serve deletion with email confirmation is Bucket B.

**Consent at session Start.** No consent popup. The parent's saved privacy settings, frozen at session Start, are the consent.

**Consent switch tiers.** The critical / recommended / standard tiers in `CONSENT_SWITCHES` are ratified as-is.

**OpenAI (Andrew action).** Confirm in the OpenAI dashboard that API data is not used for training and apply for zero data retention. Launch does not wait for ZDR approval.

**Lawyer questions (Bucket B).** Audio recording of minors per jurisdiction, `CONSENT-LEGAL-CONSULT`, and deletion not reaching backups / calendar / mail / logs / OpenAI wait until the site pays for itself. Until then, privacy and terms state only what the app actually does.

**Security launch bar.** Static checks required: Semgrep, gitleaks, npm audit high and critical cleared (including `next` and `next-auth`) plus the security jest suite. AI pen test during the pilot if quarantine setup takes more than one day. Human pen test is Bucket C (after income).

## Stale worktrees

`../tn-org` and `../tn-qol-hydrate` have uncommitted edits. They were deliberately not removed. Andrew will decide what to do with them.

## Lanes in flight (2026-11-17)

Each lane is a worktree `../tn-<lane>` on branch `launch/<lane>`.

| Lane | Tier | Agent |
|---|---|---|
| pw-parallel | Grok | 1242c63a |
| fold-transcript | Grok | 28cb0681 |
| fold-apply-race | Sonnet | 355a519c |
| consent-copy | Grok | 506b73f2 |
| static-checks | Grok | 500b16c6 |
| org-finish | Grok | e77120ee |
| first-impression | Grok | cb9d36d8 |

Read-only freshness checks of the 78 MUST rows are running as six Grok explorers. A calculus sizing is running. The shared machine lock for Playwright, the database, and the dev server is `$env:TEMP\tn-pw.lock`.
