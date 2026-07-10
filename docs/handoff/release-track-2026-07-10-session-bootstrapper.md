# Release track — session bootstrapper (2026-07-10)

> **Recommended model: Composer 2.5 conductor** (known-loop + judgment on greenlights). Escalate to Sonnet/Opus only on tripwires (fragile surfaces, Wave C/D, agenticPipeline architecture). Executors: Composer 2.5 default; overnight used `grok-4.5-xhigh` — revert to Composer unless Andrew says otherwise. Verifiers: separate agent (Sonnet for adversarial / large diffs).
>
> **This file is your complete task briefing.** Fresh chat: `@` this file + [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) + prior chat if useful. Read the reading list, then **talk through the Open Andrew-confirms with Andrew before greenlighting any next work.** Do not start Wave B / pipeline code / Google-dependent features until those are decided.

---

## Reading list (in order)

1. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) — HEAD (release track + overnight progress + open confirms)
2. [`docs/BACKLOG.md`](../BACKLOG.md) — § Release priorities + § Release triage (MUST/MAYBE/1.x) + Priority #2 Google checklist
3. [`docs/DEDUPE-PLAN.md`](../DEDUPE-PLAN.md) — Wave A done; Wave B/C/D remaining; zero-regression discipline
4. [`docs/AGENTIC-PIPELINE-INTEGRATION.md`](../AGENTIC-PIPELINE-INTEGRATION.md) — pipeline Phase 1 plan (awaiting greenlight)
5. Always-apply rules: `composition-no-duplication.mdc`, `exhaustive-testing-mandate.mdc`, `agentic-verification-pipeline.mdc`
6. `git log -15 --oneline` on `master` for tip truth

**Tip at swap:** `master` @ `0c3e267d` (confirm with `git log -1`).

---

## Where we are (one paragraph)

Sarah is on **master** (redesign cut 2026-07-09, waived red `test:wb-sync`). Docs cleaned + backlog reorganized (484 items, release-triaged). Non-negotiables locked: zero unjustified duplication, exhaustive red/green tests, independent agentic verification. Overnight: **Wave A safe dedupe complete — 8 consolidations**, each executor → Sonnet verifier → merge, zero regressions. Pipeline proven. Next work needs Andrew's greenlight (Wave B is security-aware; Google Console is external; agenticPipeline Phase 1 is architecture).

---

## Decisions already durable (do not re-ask)

| Decision | Where recorded |
|----------|----------------|
| Release = expand beyond Sarah to unsupervised new pilots | BACKLOG § Release priorities; ORCHESTRATOR-STATE |
| Priorities: (1) dedupe → (2) external Google validation → (3) instrumentation → (4) scheduling | BACKLOG + AGENTS.md + STATE |
| New work = absolute zero new duplication; existing debt = safe/incremental, stability first | `composition-no-duplication.mdc` |
| Calendar = **two-way** (`calendar.events` + `calendar.readonly` + watch) | BACKLOG Priority #2 |
| Instrumentation = **COPPA-first-party** for minor data/traffic; third-party only off COPPA surfaces; Terms/Privacy honest (default transparency) | BACKLOG Priority #3 |
| SectionCard = **parameterize** (realm prop); old "do not consolidate" overridden | DEDUPE-PLAN Wave B |
| bcrypt realm split = **keep** | DEDUPE-PLAN |
| AI prompt v8 (homework→plan) = **prioritize** (note-quality moat) | BACKLOG triage corrections |
| Zero catchable regressions; teeth tests; escalate if untestable | DEDUPE-PLAN § Discipline |
| agenticPipeline = real workstream (not just subagents); path `C:\Users\arang\Documents\Andrew\dev\agenticPipeline` | STATE + AGENTIC-PIPELINE-INTEGRATION.md |
| Never auto-merge TN master from pipeline | AGENTIC-PIPELINE-INTEGRATION.md |

---

## Open Andrew-confirms — talk through these first

### 1. Wave B greenlight (dedupe continues)

Safe Wave A is done. Wave B items (from [`docs/DEDUPE-PLAN.md`](../DEDUPE-PLAN.md)):

| Item | Risk | Notes |
|------|------|--------|
| **SectionCard** realm-param | UI multi-consumer | Pre-approved parameterize; still needs careful consumer grep + teeth tests |
| **consent-write** service | Consent/security | Claim setup + parent consent share versioned ConsentRecord create |
| **blob-proxy / share-proxy** helpers | Security (authz + blob streaming) | Triplicated routes → one helper |
| Kill **`/api/upload/audio`** | Upload path | Migrate callers → `/api/upload/blob`, delete parallel route |

**Ask Andrew:** greenlight Wave B as a whole, item-by-item, or hold? Any item to skip/reorder?

### 2. `tokens.css` dark-palette dedup

~95 duplicated lines (`@media` vs `[data-theme=dark]`). CSS-only — no unit teeth. Needs Playwright/visual baseline or Andrew visual smoke.

**Ask Andrew:** defer until visual gate exists, or approve a specific visual-test approach now?

### 3. Priority #2 — Google Console (Andrew-owned, long lead)

Checklist in BACKLOG § Priority #2. **Blocking external clock:**

- Confirm consent screen **Published** + `gmail.send` still verified
- **`usemynk.com`** Search Console + branding re-submit if pending
- Redirect URIs: `/api/auth/callback/google` + `/api/auth/gmail/callback`
- **Submit two-way calendar verification** (4–6 weeks) — scopes decided; submission is Andrew's

**Ask Andrew:** status of Console actions? Want a short runbook / screencast outline for the calendar verification package?

### 4. agenticPipeline Phase 1

Plan: [`docs/AGENTIC-PIPELINE-INTEGRATION.md`](../AGENTIC-PIPELINE-INTEGRATION.md).

- Pipeline is ~15–25% of vision (contracts strong; no autonomous runner; approval fail-open)
- Phase 1: **change-run mode** + **fail-closed verify** + TN-targeted prompt; prove on one Wave A-style chunk; **no auto-merge to TN master**

**Ask Andrew:** greenlight Phase 1 implementation in `agenticPipeline`? Any constraints (no cloud, no auto-merge already assumed)?

### 5. Priority #3 — instrumentation first slice

Policy locked (COPPA-first-party for minor surfaces). Not yet scoped to a concrete first PR.

**Ask Andrew:** after Wave B / Google kickoff, what's the first instrumentation slice (e.g. first-party event log for tutor session lifecycle only)?

---

## How we work (do not regress)

- **Executor → independent verifier → gates → merge.** Author does not self-certify.
- **Diff-for-identity** before folding duplicates; preserve differences as props.
- **Teeth tests** (red-before/green-after, independent oracle, right layer). Untestable → escalate to Andrew.
- Worktree isolation: prefer executors in a dedicated worktree; don't collide orchestrator git with an active executor on the same tree.
- Default conductor Composer 2.5; escalate on tripwires. Fragile surfaces (recorder FSM, outbox, live A/V, WB sync/viewport) → plan mode then Sonnet/Opus.

---

## After confirms — suggested order

1. Whatever Andrew greenlights first among Wave B / Google runbook / pipeline Phase 1.
2. Continue release priorities in order (dedupe → external validation → instrumentation → scheduling).
3. Keep STATE + BACKLOG current every material turn.

---

## Do not

- Start Wave C/D (whiteboard/AV fragile) without explicit Andrew OK + Opus-grade review.
- Auto-merge from agenticPipeline to tutoring-notes master.
- Create new duplication or skip verification/tests without Andrew waiver.
- Re-ask decisions already in the durable table above.
