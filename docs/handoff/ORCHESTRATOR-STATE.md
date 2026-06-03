# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`**. **Source of truth:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — decisions ledger, sub-pass tracker, open items. Do not duplicate the ledger here.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. **SEC-1 admin impersonation is COMPLETE + EXTENDED** — A (`27fb0d3`) + B (`6e29d57`) + C (`8bb7449`) + role-split follow-up (`7dadd7a`) all merged + smoked GREEN. **usemynk.com brand-domain cutover MERGED** (`291288c`) -- production on apex; Sarah still on `tutoring-notes.vercel.app` until Search Console "Deceptive pages" review + OAuth watch-items clear. **W1 audio durability:** Ship A merged; Ships B/C shelved (upload treated as working). **End-session "0 segments":** RESOLVED as cosmetic (audio confirmed in prod); copy fix in flight on `fix/end-session-segment-copy`.

## Last action completed

**2026-06-02 — Phase D v2 brand-review revision on `feature/phase-d-landing-about`.** Landing `/` + **`/features`** (first-cut `/about` reframed; `/about` route removed/reserved). Single Sign-in menu (tutor/parent/student); no time-promises or no-login marketing copy. Backlogged: About-us (`/about`), Parents marketing page, async transcription durability — [`docs/BACKLOG.md`](../BACKLOG.md). Detail: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) lightweight head.

**2026-06-01 — Identity Phase 2b (parent/child UI surfaces) BUILT, awaiting Andrew smoke.** Branch **`identity-p2b-ui`** @ **`cd7555b`** (base `ca49787`, pushed, **NOT merged**). Shipped: `/account/{login,signup,forgot-password,reset-password}` + `/verify-email` UI, `/account/dashboard`, `/account/children/[id]` (+ ChangePinForm), `/account/children/[id]/devices` (revoke one/all), `/students/login` (child PIN, soft-lockout countdown), `/claim/[token]` wizard (all states + **identity-confirmation interstitial** on existing-session path w/ "Not you?" escape) → `/claim/[token]/setup` (child credential; **consent panel = labeled Phase-3 placeholder, no ConsentRecord writes**), tutor "Send invite" behind `NEXT_PUBLIC_CLAIM_INVITES_ENABLED`. New APIs: device revoke one/all, credential PATCH (PIN change bulk-revokes sessions). Gates green: `tsc`, `next build` (35 routes), `test:regression` 92/92, identity 225/225 + 16 new P2b. **Andrew real-hardware smoke gate** (parent signup→verify-via-logged-link→claim→child login→device list→revoke→401; email STUBBED to logs; smoke w/ non-2FA account). Env: HMAC secrets already set Production+Preview (2026-06-01); set `NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true` on Preview to test tutor side. After smoke PASS → `merge --no-ff` to `v1-redesign`.

**2026-06-01 — Identity Phase 2a (session infra + claim back-end) merged to `v1-redesign`.** `merge --no-ff` `identity-p2a-session-infra` → `v1-redesign` @ **`6c4a268`**. Post-merge gates green: `prisma generate`, `tsc`, `next build`, `test:regression` 92/92, identity-p2a 35/35, identity-2fa+impersonation+p2-schema+ownership 190/190. **Also merged:** `docs/road-to-ga` → `v1-redesign` @ **`eca63b5`** (docs only — [`docs/ROAD-TO-GA.md`](../ROAD-TO-GA.md)).

**2026-06-01 — Component Phase B2 merged to `v1-redesign` @ `0424206`; Identity Phase 1 @ `b5ef4fe`; AH-7 p2 schema @ `242c6b2` + ownership guard @ `1a06a65`.** (Earlier same-day merges — detail in [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md).)

**2026-05-31 — usemynk Safe Browsing / end-session triage (docs on `master`).** Search Console now shows domain-level **"Deceptive pages"** (Sample URLs: N/A); **Request Review** filed 2026-05-31 (supersedes 2026-05-30 `report_error`). Re-test at 48h; no repeated reviews. End-session **"0 segments"** downgraded to **cosmetic** -- prod `SessionRecording` `8a34b5f5-3aa8-48d5-bb1f-0248fa4762a8` (~1.5MB, same smoke session). Copy fix branch `fix/end-session-segment-copy` in flight.

**2026-05-30 — usemynk.com brand-domain cutover MERGED to `master`** (merge commit `291288c`). DNS + Vercel custom domains + Production-only `NEXTAUTH_URL` flip + repo artifacts all landed. **4/4 integration smoke pass** on usemynk.com (Gmail connect proven in incognito; whiteboard / upload / share via impersonating test1). **HOLD:** do not send Sarah to usemynk.com until deceptive-pages review clears + OAuth re-verify (she stays on `tutoring-notes.vercel.app`, zero disruption).

**2026-05-30 — SEC-1 Role follow-up SMOKED + MERGED** (`--no-ff` merge `7dadd7a`): `AdminRole` enum (`ADMIN|TUTOR`, default TUTOR) added to `AdminUser`, orthogonal to `isTestAccount`; migration backfills `arangarx@gmail.com → ADMIN` idempotently on deploy (preview-dev + production via `migrate deploy`); routing now role-based (`TUTOR` logins → `/admin/students`, ADMIN → `/admin` dashboard, tutor paths blocked); `assertIsAdmin()` blocks TUTOR from impersonating (covers real TUTOR logins like Sarah AND test accounts); JWT/session carries `role`; 50 tests green. Andrew smoke **PASS** (test1 direct login blocked, reachable via impersonation). This is the long-asked-for genuine admin-vs-tutor account-type separation; protects a future Sarah login from being stranded on the admin dashboard.

**2026-05-30 — SEC-1 Dispatch C SMOKED + MERGED** (`--no-ff` merge `8bb7449`): real-admin `/admin` dashboard landing + routing (tutor paths impersonation-only; exit → dashboard) + `AdminTestAccountsPanel` replacing interim `TestAccountsSection` + login default callback `/admin` + 39 SEC-1 tests green. Andrew real-hardware smoke **PASS** (dashboard landing, guard redirects, impersonate round-trip, exit-to-dashboard, test-account credential rejection). **SEC-1 (A+B+C) is DONE.** Open nit: banner not amber (cosmetic). **Account cleanup done on BOTH branches 2026-05-30:** `+test1` flipped to `isTestAccount=true` (sole impersonation target; password login disabled by gate; **prod 126 wb-sessions / 116 recordings preserved**); `+test2/3/4` deleted on both; dev-only `+sec1smoke` throwaway deleted. Kept everywhere: `arangarx@gmail.com` (real admin) + all non-arangarx (`malmesae@gmail.com`, dev `playwright@test.local`).

**Also 2026-05-30:** Andrew ratified three SEC-1 / platform decisions (Q1 reversal, admin-dashboard landing, cross-preview SSO gated on usemynk) — captured in [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md) § Ratifications and [`docs/handoff/usemynk-domain-cutover-bootstrapper.md`](usemynk-domain-cutover-bootstrapper.md) § Cross-preview SSO.

## Next action(s)

**V1 epic (`v1-redesign` @ `6c4a268`):**

1. **Andrew:** ✅ 3 env vars set on Vercel Production+Preview (2026-06-01); ✅ preview-dev P2a migration `20260602000000` applied clean (not rolled back, 2026-06-01 20:01). **REMAINING:** smoke P2b on `identity-p2b-ui` preview (set `NEXT_PUBLIC_CLAIM_INVITES_ENABLED=true` on Preview for tutor side).
2. **P2b — BUILT, awaiting Andrew smoke** on `identity-p2b-ui` @ `cd7555b` (see Last action). After smoke PASS → orchestrator `merge --no-ff` to `v1-redesign`.
3. **Phase 3 consent models** — replace P2a stubs (`assertEffectiveConsent`, `assertIsSessionParticipant`, `assertOwnsConsentRecord`).
4. **Component:** B3 session-list UI and/or **Phase D** merge after Andrew re-smokes landing + `/features` on `feature/phase-d-landing-about`. Nav redesign stays with B3–B6.
5. **PROD / preview:** `prisma migrate deploy` p1 + p2 + P2a migrations on next `v1-redesign` deploy.

**Master / pilot (parallel):**

4. **Gate Sarah on usemynk:** Search Console "Deceptive pages" review (filed 2026-05-31) — re-test Connect Gmail at **48h**.
5. **`fix/end-session-segment-copy`** — end-session phase copy (BACKLOG 3c cosmetic).

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| **P2a env vars on Vercel** | P2b smoke | Set `AH_SESSION_HMAC_SECRET` + `LEARNER_SESSION_HMAC_SECRET` (32+ byte base64 each) + `AH_TOTP_ENCRYPTION_KEY` (Phase 6 reserved) on preview/prod before P2b real-hardware smoke. |
| **Preview-dev P2a migration** | Next `v1-redesign` deploy | `20260602000000` (`token`→`tokenHash` on empty column); reset preview-dev to master if fussy. |
| ~~SEC-1 B smoke~~ | — | ✅ **PASS + MERGED 2026-05-30** (`6e29d57`). test1 flip still gated per sequencing guard (after C). |
| **SEC-1 Q1 reversed — keep admin password** | Dispatch C | ✅ **RATIFIED 2026-05-30:** Real admin keeps strong password + credentials login; Google OAuth is additional, not exclusive. Do NOT null real-admin `passwordHash`. Test accounts unchanged (passwordless). Design doc § Ratifications R1. |
| **SEC-1 admin dashboard landing** | Dispatch C | ✅ **RATIFIED 2026-05-30:** Real admin (`isTestAccount=false`, not impersonating) lands on dedicated admin dashboard; tutor view only via "Log in as"; exit returns to dashboard. Design doc § Ratifications R2. |
| **Cross-preview SSO** | usemynk cutover + wildcard previews | ✅ **RATIFIED 2026-05-30 (deferred):** Parent-domain cookie `.usemynk.com` after wildcard preview domains on custom domain — NOT SEC-1; interim per-preview isolation on `vercel.app` is correct. [`usemynk-domain-cutover-bootstrapper.md`](usemynk-domain-cutover-bootstrapper.md) § Cross-preview SSO; design doc § Ratifications R3. |
| ~~SEC-1 design ratification (6 open Qs)~~ | — | ✅ **DELEGATED 2026-05-30** for Q2–Q6 defaults; **Q1 superseded** by explicit reversal above. |
| ~~W1 audio durability ratification~~ | — | ✅ **RATIFIED 2026-05-30** (recovery copy, cross-session backlog, iOS not a gate). |
| ~~Upload re-baseline smoke~~ | — | 🟢 **CLOSED 2026-05-30 (Andrew):** upload treated as working; W1 Ship B not built unless a real failure resurfaces. |
| **fast-variant user rule** | Orchestrator model pick | Offered, unconfirmed — never auto-select FAST unless Andrew approves. |
| **DNS admin one-liner** | Transient git/Docker DNS | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, not applied. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

**Branch in flight (not merged):** `fix/end-session-segment-copy` — end-session End-button phase copy (cosmetic BACKLOG 3c).

**None** (subagent dispatches).

**Recently completed:**
- **SEC-1 role split (ADMIN vs TUTOR)** — ✅ MERGED `7dadd7a` (2026-05-30, Sonnet). Andrew smoke PASS.
- **SEC-1 Dispatch C (admin dashboard + routing)** — ✅ MERGED `8bb7449` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch B (impersonation runtime)** — ✅ MERGED `6e29d57` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch A (Foundation)** — ✅ MERGED `27fb0d3`. Andrew password-login regression smoke GREEN on Preview.

**⚠️ Shared-tree slip recurred 2026-05-30:** the C subagent left the working tree checked out on `feat/sec-1-admin-dashboard`; a subsequent orchestrator docs commit landed on that branch instead of `master`. Reconciled (cherry-pick to master + `branch -f` reset to pushed tip). Lesson: **always `git checkout master` before any orchestrator commit after a code subagent runs in the shared tree.**
- **usemynk domain cutover bootstrapper** — ✅ MERGED `e4f5833`; cross-preview SSO section added 2026-05-30 (docs).

**SEC-1 sequencing guard (HARD — Andrew 2026-05-30):** no account loses its current login until its replacement is proven. Order: A merged → B smoke + merge → **only then** flip test1 to `isTestAccount=true`; **do not null real-admin password** (Q1 reversed). test1 flip + password changes for test accounts only — MANUAL seed steps gated behind B smoke.

## Uncommitted / unmerged state

**Working tree:** on `v1-redesign` @ **`6c4a268`** (docs spine + orchestrator-state commit pending push).

**V1 epic — merged to `v1-redesign`:** `identity-p1-2fa` @ `b5ef4fe`, `component-b2-dashboard-students` @ `0424206`, `identity-p2-schema` @ `242c6b2`, `identity-p2-ownership-guard` @ `1a06a65`, **`identity-p2a-session-infra` @ `6c4a268`**, `docs/road-to-ga` @ `eca63b5` (2026-06-01).

**`master` HEAD:** `a1f5d6e` (does not include V1 epic / 2FA).

Recent `master` (newest first):

```
a1f5d6e docs: usemynk cutover watch-items  ← HEAD
291288c Merge ops/usemynk-domain-cutover
7dadd7a Merge SEC-1 admin-vs-tutor role split
a00557d docs(backlog): feedback page (admin view) has no nav back
8ff3a93 feat(sec-1): AdminRole enum + role-based routing (tutor-vs-admin distinction)
```

**Merged branches (preserved for stale-sweep):**

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `feat/sec-1-admin-tutor-role` | `7dadd7a` | SEC-1 ADMIN-vs-TUTOR role split |
| `feat/sec-1-admin-dashboard` | `8bb7449` | SEC-1 Dispatch C admin dashboard + routing |
| `feat/sec-1-impersonation-runtime` | `6e29d57` | SEC-1 Dispatch B impersonation runtime + banner |
| `feat/sec-1-foundation` | `27fb0d3` | SEC-1 Dispatch A auth foundation |
| `docs/usemynk-cutover-bootstrapper` | `e4f5833` | Brand-domain cutover runbook |
| `ops/usemynk-domain-cutover` | `291288c` | usemynk.com DNS + Vercel domains + NEXTAUTH_URL + repo artifacts |
| `feat/audio-draft-store` | `3c2e634` | W1 ship A |
| `fix/replay-audio-fetch-on-scrub-drop` | `1aaacdd` | Replay scrub audio-defer |
| `whiteboard/regression-net` | `fc7b12b` | Standing real-browser regression net |
| `whiteboard/sync-redesign-phase-1` | `750d494` | Phase 1 sync redesign |

**Dead (historical only):** `reliability/sync-b1-b4` — superseded by sync redesign.

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol" — Opus orchestrates; Composer 2.5 ships by default; Sonnet for auth boundaries + adversarial/5-axis review. Dispatch inline via `Task`; **always set `model` explicitly**, including on `resume` (resume can inherit parent model).
- **Dispatch vs in-chat boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc) — always-applied; read before in-chat execution.
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` on `master`, branch preserved; no PRs. Whiteboard sync touches require local `npm run test:wb-sync` green before merge. See `AGENTS.md` § "Merging convention".
- **Commits on Windows/PowerShell:** multi-line messages via temp file + `git commit -F`, not `-m` — see `AGENTS.md` § Conventions.

## Project arc / recent architectural decisions

- **Pilot:** Pre-public; one pilot tutor (Sarah). North star: [`AGENTS.md`](../../AGENTS.md). Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).
- **SEC-1 (2026-05-30 ratifications):** Admin keeps password (preview-friendly); dashboard landing in Dispatch C; cross-preview SSO deferred to usemynk wildcard previews + `.usemynk.com` cookie domain.
- **Waves:** Wave 1 reliability floor — whiteboard Phase 1 **done**; SEC-1 in flight. Wave 2.5 session-log greenfield ratified 2026-05-27.
- **Whiteboard view-sync (RESOLVED):** Offset-contamination fix `123e60e`; on-device HUD `?wbdebug=1`.
- **Regression net merged:** `fc7b12b`. `npm run test:wb-sync` gate green.
- **Test discipline:** Independent oracle; jsdom cannot prove layout — real-render / hardware gate required.

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file)
3. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
4. [`docs/BACKLOG.md`](../BACKLOG.md)
5. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
6. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md)
7. [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md)
8. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)

## History / audit trail

This file is **updated in place**; full history: `git log -p docs/handoff/ORCHESTRATOR-STATE.md`.

Dated `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` files are **legacy snapshots** (retained, not the live source). Template for heavy restructures: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
