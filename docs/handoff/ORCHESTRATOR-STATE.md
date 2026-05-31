# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. **SEC-1 admin impersonation is COMPLETE** — A (`27fb0d3`) + B (`6e29d57`) + C (`8bb7449`) all merged + smoked GREEN. **W1 audio durability:** Ship A merged; Ships B/C shelved (upload treated as working).

## Last action completed

**2026-05-30 — SEC-1 Dispatch C SMOKED + MERGED** (`--no-ff` merge `8bb7449`): real-admin `/admin` dashboard landing + routing (tutor paths impersonation-only; exit → dashboard) + `AdminTestAccountsPanel` replacing interim `TestAccountsSection` + login default callback `/admin` + 39 SEC-1 tests green. Andrew real-hardware smoke **PASS** (dashboard landing, guard redirects, impersonate round-trip, exit-to-dashboard, test-account credential rejection). **SEC-1 (A+B+C) is DONE.** Open nit: banner not amber (cosmetic). **Account cleanup done on BOTH branches 2026-05-30:** `+test1` flipped to `isTestAccount=true` (sole impersonation target; password login disabled by gate; **prod 126 wb-sessions / 116 recordings preserved**); `+test2/3/4` deleted on both; dev-only `+sec1smoke` throwaway deleted. Kept everywhere: `arangarx@gmail.com` (real admin) + all non-arangarx (`malmesae@gmail.com`, dev `playwright@test.local`). Andrew confirmed he's the only direct login; Sarah uses her own email + hasn't logged in under new schema (testing was Sarah-as-student, no login yet). **🔴 Latent gap logged (BACKLOG):** routing has no tutor-vs-admin ROLE — every `isTestAccount=false` admin → dashboard + blocked from tutor paths; a 2nd real prod login (Sarah) would be cut off from her students. Needs `role` enum before multi-tutor / Sarah-login. Safe now (single admin).

**Also 2026-05-30:** Andrew ratified three SEC-1 / platform decisions (Q1 reversal, admin-dashboard landing, cross-preview SSO gated on usemynk) — captured in [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md) § Ratifications and [`docs/handoff/usemynk-domain-cutover-bootstrapper.md`](usemynk-domain-cutover-bootstrapper.md) § Cross-preview SSO.

## Next action(s)

1. **Pick next wave** — SEC-1 done, W1 settled. Candidates: usemynk.com cutover (unblocks cross-preview SSO), Wave 2.5 session-log greenfield, W3 mobile/URL, whiteboard regression-net standing-gate finish. Andrew wants "new and shiny."
3. ~~Upload re-baseline smoke~~ — 🟢 **CLOSED 2026-05-30 (Andrew):** treat upload as WORKING (58 MB cleared fast on paid Preview). **W1 Ship B not being built** — revive only if a real upload failure resurfaces.

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
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

**None** — SEC-1 fully merged.

**Recently completed:**
- **SEC-1 Dispatch C (admin dashboard + routing)** — ✅ MERGED `8bb7449` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch B (impersonation runtime)** — ✅ MERGED `6e29d57` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch A (Foundation)** — ✅ MERGED `27fb0d3`. Andrew password-login regression smoke GREEN on Preview.

**⚠️ Shared-tree slip recurred 2026-05-30:** the C subagent left the working tree checked out on `feat/sec-1-admin-dashboard`; a subsequent orchestrator docs commit landed on that branch instead of `master`. Reconciled (cherry-pick to master + `branch -f` reset to pushed tip). Lesson: **always `git checkout master` before any orchestrator commit after a code subagent runs in the shared tree.**
- **usemynk domain cutover bootstrapper** — ✅ MERGED `e4f5833`; cross-preview SSO section added 2026-05-30 (docs).

**SEC-1 sequencing guard (HARD — Andrew 2026-05-30):** no account loses its current login until its replacement is proven. Order: A merged → B smoke + merge → **only then** flip test1 to `isTestAccount=true`; **do not null real-admin password** (Q1 reversed). test1 flip + password changes for test accounts only — MANUAL seed steps gated behind B smoke.

## Uncommitted / unmerged state

**Working tree:** clean on `master`.

**Unmerged branches awaiting gates:** none.

**`master` HEAD:** `8bb7449 Merge SEC-1 Dispatch C: real-admin dashboard landing + routing`.

Recent `master` (newest first):

```
8bb7449 Merge SEC-1 Dispatch C: real-admin dashboard landing + routing  ← HEAD
a806939 docs(state): close upload re-baseline; W1 Ship B not built unless failure resurfaces
6e29d57 Merge SEC-1 Dispatch B: impersonation runtime + banner
c82e017 docs(sec-1): ratify Q1 reversal (keep admin password) + admin-dashboard landing + cross-preview SSO spec
27fb0d3 Merge SEC-1 Dispatch A: auth foundation (schema + GoogleProvider + impersonation primitives)
```

**Merged branches (preserved for stale-sweep):**

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `feat/sec-1-admin-dashboard` | `8bb7449` | SEC-1 Dispatch C admin dashboard + routing |
| `feat/sec-1-impersonation-runtime` | `6e29d57` | SEC-1 Dispatch B impersonation runtime + banner |
| `feat/sec-1-foundation` | `27fb0d3` | SEC-1 Dispatch A auth foundation |
| `docs/usemynk-cutover-bootstrapper` | `e4f5833` | Brand-domain cutover runbook |
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
