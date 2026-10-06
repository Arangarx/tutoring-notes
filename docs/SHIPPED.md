# Tutoring Notes — Shipped

Completed or superseded product work moved out of `docs/BACKLOG.md` on 2026-10-05 so the backlog can be re-prioritized. Open remainders stayed in the backlog. The "Go over soon" review block was not touched.

For open work, see [`docs/BACKLOG.md`](BACKLOG.md).

## Shipped on master

- **Join denial UX** — Shared `AccountAccessDenialPage`; authenticated wrong account holder on join routes to `/account/not-my-session`; child non-participant still fail-closed 404 (G6). Shipped 2026-08-14 ([`647aaf24`](https://github.com/Arangarx/tutoring-notes/commit/647aaf24)).

- **SEC — tutor-asset/route.ts any-origin blob URL** — `isBlobUrlForSession` pins origin via `isAllowedBlobUrl` on all three whiteboard-asset proxies. Shipped 2026-08-14 ([`0252a889`](https://github.com/Arangarx/tutoring-notes/commit/0252a889)).

- **SMOKE-PRIV-1 — learner sign-out on shared device** — `POST /api/auth/learner/logout` revokes and clears `mynk_ah_session` when both learner and account-holder cookies are present. Jest + Playwright identity-e2e. Shipped 2026-08-14 ([`4bc96cfb`](https://github.com/Arangarx/tutoring-notes/commit/4bc96cfb)).

- **Signup waitlist REJECTED + revocation UI** — Terminal WAITLISTED→REJECTED and revoke APPROVED→WAITLISTED. Shipped 2026-08-14 ([`99da0111`](https://github.com/Arangarx/tutoring-notes/commit/99da0111)).

- **Parent consent editor save wiring** — `saveParentConsentAction` wired; parent consent editor persists.

- **ADMIN-STUDENT-DETAIL-MOBILE-ICONS** — Merged ([`a97722df`](https://github.com/Arangarx/tutoring-notes/commit/a97722df)).

- **Schedule page ICS block + planned-length → end-time** — Removed misplaced compact calendar/ICS block from schedule page (ICS lives under Settings → Calendar integrations). Planned length moves end time when start or length changes until end is edited directly (commits [`3f93bf71`](https://github.com/Arangarx/tutoring-notes/commit/3f93bf71) / [`2c5edfb8`](https://github.com/Arangarx/tutoring-notes/commit/2c5edfb8) per backlog).

- **SSG-2 / PRESARAH-2 — student-detail End → End-and-review** — `ActiveWhiteboardSessionsList` offers Resume / End and review / Cancel and delete; covered by `wb-end-from-roster.spec.ts` (no silent orphan end path).

- **WS-M — two-device tutor hears student** — Resolved; working for a while per Andrew triage 2026-07-10.

- **WB-LEGACY-STUDENT-CLIENT-DELETE** — Unified student shell; legacy client removed.

- **Whiteboard session audio wire (strokes-only legacy row)** — Superseded by live session recording path.

- **Account-takeover defense (1/3) email-confirmation signup** — Shipped with auth ship-ready merge ([`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca)) via `src/lib/admin-email-verify.ts` (`emailConfirmedAt`, token table).

- **Debounced-disconnect pause trigger** — Andrew confirmed; `PEER_EVICTION_TIMEOUT_MS = 6_000` (freeze path vs ~6s eviction).

## Superseded plans

- **INTERIM MASTER GATE `captureAttestationAt`** — Never built; superseded by CC-1/CC-2 consent collection (no attestation column).

- **Google OAuth calendar scopes legacy connect+stub (`da93ab78`)** — Superseded by calendar integration wave (merge 2026-09-21): scopes narrowed; real `calendar.events.owned` write + ICS feed shipped; verification approved 2026-09-29 for that scope only.

## Reference ledgers

### Shipped (reference — do not re-open)

Phase 1b outbox + atomic end-session · Phase 1c snapshot · Phase 4a–4d live A/V · gapless rollover B5 · Tier 1 parallel transcribe · recording re-arch Phase 1 core · audio consolidation ffmpeg · W1 Ship A workspace draft · per-chunk map extraction · VAD segment-policy · `session-clock.ts` p3-clock · per-speaker A/B/C (`useRemoteMicRecorders`, worker-driven `transcriptionOnly` enqueue) · WS-N N1–N3 · WS-L scrubber partial · IN_PERSON audio without peer (`wb-in-person-audio-start.spec.ts`) · WS-F waiting-room exit · WS-J billable rounding UI · WS-P deploy freshness · tab-kill N4 gate/roster finalize.

**[WAIVED] MASTER-CUT-2026-07-09 — Andrew waived red `test:wb-sync` for Sarah delivery**  
Merge `v1-redesign` → `master` @ `1c07b5ba` (~22:39 MT). **Green:** `next build`, `test:regression` (117). **Red (isolation):** 9 REAL-FAIL + 2 ENV-FLAKE — triage as cleanup, not Sarah blockers.

| # | Spec | Issue |
|---|------|-------|
| 1 | `recording-end-to-end` | Review auto-start from 0 |
| 2 | `recording-resilience` | SessionRecording rows after reopen |
| 3–5 | `wb-replay-scrub-seek` ×3 | Scrub seek failures |
| 6 | `view-whiteboard-new-replay` | Share locator strict-mode ×4 |
| 7 | `wb-cancel-pending-session` | cancel→B copy link (Andrew smoke PASS) |
| 8–9 | `wb-tab-kill-audio-durability` ×2 | Empty tutor:mic segments (harness suspect) |
| ENV | cam-off initials tile; cancel→roster URL | Flakes |

**[WAIVED] AUTH-SHIP-READY-2026-09-15 — Andrew: pre-existing `test:wb-sync` cluster; move on (do not re-triage as this branch)**  
Auth ship-ready merged to `master` [`c8d613ca`](https://github.com/Arangarx/tutoring-notes/commit/c8d613ca); merge gates 2026-09-12: `next build` exit 0; `test:regression` 149/149; `test:wb-sync` isolation **8 REAL-FAIL + 3 ENV-FLAKE**. Auth diff does not touch recorder/A/V/whiteboard apply-path or these specs. Andrew 2026-09-15: treat as the MASTER-CUT-2026-07-09 cluster; **do not block this merge**; successor orchestrator must still *know* they are red (canonical list in [`ORCHESTRATOR-STATE.md`](handoff/ORCHESTRATOR-STATE.md) HEAD). Classification: replay auto-start + scrub-seek ×3 = leftover **product** (SMOKE-UX-1 / scrub drag); tab-kill ×2, cancel-PENDING copy-link (smoke PASS), parent-share locator = **harness**; wave5 polish ×2 + recording-resilience = **ENV-FLAKE**. Does not authorize skipping `test:wb-sync` on unrelated future branches.

**Product knowns waived with cut:** reopen-at-0 (**WB-REPLAY-REOPEN-START-AT-0**), share PDF placeholders (**WB-REPLAY-PDF-PLACEHOLDER**), **WB-WTR-DEVICE-LOADING**.

### Shipped design reference

Phase 0 tokens · Phase A fonts/palette · Phase B1/B2 auth+dashboard · A′ theme plumbing · Groups A–G surface fan-out · Phase D landing · OAuth notice · CheckboxField · StudentAvatar · Waiting room overlay visual · Parent consent POST · Continue button color X7.

**Resolved / do not re-open (reference):** CONSENT_ENFORCEMENT flag removed · anonymous `/w` join retired to redirect · phantom stroke bug · Slice-3 B4 save model · Auth role-refresh · Parent-create-learner path · Weak PIN validators · Gate B1 core waitlist · SEC-1 impersonation pillar · Tier A security quick wins · Note save vs transcribe race (#6) · B5 gapless rollover · Client-direct blob upload B1 · Multi-recording schema · Share seen-tracking baseline · Billable WS-J · Housekeeping CLIs · Cost admin dashboard · Waiting room overlay · Per-speaker C transcription · In-person audio without peer · 2FA remember device · IAC-13 tutor disconnect parent · Session wrong-identity RC-A · Erasure Option A tombstone + cancel-restore · CF-1–CF-4 consent-honesty blockers · PRESARAH-1 toggle removed (open remainder is `userWantsRecording` in the backlog) · SMOKE-BLOCK-2/3/4 · SMOKE-BUG-1/6 · SMOKE-UX-2/4 · **WS-X** PDF board stroke leak (`34f650a4`, `ef5fb1a0`; parked branch `wb-wave5-ws-x-wip` deleted 2026-10-01) · **Sarah Q6 forward-migration** not run and not needed (one June 16 lesson already on her student; branch `feature/sarah-forward-migration-q6` deleted 2026-10-01) · Many wave5 polish items per known-issues DRAFT appendix.

### Product positioning (ratified)

Independent tutors, subscription, not marketplace. Wedge: AI notes from recording + tutor keeps 100% rate + parent share link. Wyzant has lesson recordings (~30 days) — lead with notes + economics, not recording alone. Pitch: *"Keep 100% of your rate. Better tools than Wyzant, ~$20/month."*

### Tonight / days / weeks / months buckets (historical sequencing)

Many items above supersede these buckets. Remaining highlights:

- **Weeks/moat:** Phase 1 WB largely shipped per [`docs/WHITEBOARD-STATUS.md`](WHITEBOARD-STATUS.md); session timer 1.6 pending.
- **Months polish:** discount system, native/PWA, whiteboard sync hardening at scale.
- **Later in-person:** iPad whiteboard, two-device handoff, PDF annotation.

### Strategic lessons (ChatGPT brainstorm 2026-05-15)

Captured in pricing subsection; transcript local only.

