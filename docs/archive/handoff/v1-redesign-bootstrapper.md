# V1 Redesign — Opus Orchestrator Bootstrapper

**Date:** 2026-05-31  
**Audience:** Fresh Opus orchestrator chat (not an executor)  
**Goal (founder intent):** *"So good that I feel like I'm just continuing the conversation in a new window."*

---

## §0 — Who you are + prime directive

You are the **Opus orchestrator** for the Mynk **V1 redesign** epic — a multi-day, first-class rebuild of the whole site.

Your job is to **ORCHESTRATE, not execute**: decide, sequence, dispatch to subagents, synthesize results for Andrew.

Before any execution-flavored in-chat action (reading many files, writing code/tests, authoring long docs, multi-step refactors), **STOP and dispatch instead.**

Read and follow:

- [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc) — dispatch-vs-do boundary, carve-outs, state discipline.
- [`AGENTS.md`](../../AGENTS.md) § **Model usage protocol** — tier assignment, escalation, parallel subagent safety, `resume` gotcha.

---

## §1 — Read this first (the spine)

[`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) is the **single source of truth** — read it at the **START of every session** and keep it current.

Then re-read **this bootstrapper**.

The spine's **decisions ledger overrides any older doc** if anything conflicts.

---

## §2 — Doc map (what each is for)

| Doc | Purpose |
|-----|---------|
| [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) | Epic spine / decisions ledger / sub-pass tracker (**READ FIRST**). |
| [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) | Identity/accounts/consent/auth/2FA architecture; §11 Q-4/Q-6 proposals SUPERSEDED by spine. |
| [`docs/handoff/consent-gates-capture-design-2026-05-31.md`](consent-gates-capture-design-2026-05-31.md) | Consent-gates-capture enforcement + interim attestation; §9 open Qs delegated to Opus fly-pass. |
| [`docs/handoff/v1-component-redesign-design-2026-05-31.md`](v1-component-redesign-design-2026-05-31.md) | Visual/component + IA/URL layer; §8 has ratified Q-1..Q-10; §5.4 billing immutability. |
| [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) | 7-surface reliability redesign (Surface 7 = session-log billing freeze; student-mobile breaking; URL/IA; solo mode). |
| [`docs/UX-AND-A11Y-SPEC.md`](../UX-AND-A11Y-SPEC.md) | Global UX/a11y bar (WCAG 2.2 AA), carry-forward invariants A1–A10, IA §14. |
| [`docs/MYNK-BRAND-PHASE-2-DECISIONS.md`](../MYNK-BRAND-PHASE-2-DECISIONS.md) + [`docs/BRAND.md`](../BRAND.md) + [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](../brand-previews/palette-mocks-FINAL-mynka-blue.html) | Brand canon (Mynka Blue palette + Fraunces/Inter/JetBrains type). **Note:** the mock's "4 PM today" dashboard is **WRONG** (no scheduling in v1). |
| [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) | mortensenapps.com umbrella privacy/terms + OAuth consent sync protocol (COPPA gate lives here). |
| [`AGENTS.md`](../../AGENTS.md) | Conventions + model protocol + hard-won lessons (read once per fresh chat). |
| [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) | Global orchestrator state; points back to the spine. |

---

## §3 — State snapshot (as of 2026-05-31)

**Read order:** spine → this bootstrapper → design docs below. **Branch:** `v1-redesign` @ `90f9bfa` (HEAD moves). **`master`** @ `a621a5b` does not have the V1 corpus yet.

### LOCKED (do not re-litigate)

- **Brand:** Mynka Blue; Component Phase A (dark tokens + fonts) **implemented** @ `5aa3c7d` — pending Andrew real-hardware smoke.
- **IA/URLs:** session-centric; `/sessions/[wsid]`; `/join/`; `/share/`; `/superadmin`; no scheduling.
- **Identity model:** 3 principals; parent-primary K-12; `isSelfLearner` adult collapse.
- **Consent:** tiered **two mechanisms** — (1) **Essentials** = contract to use live services (NOT toggles; VPC for minors); (2) **Optional** = explicit **unchecked** opt-in toggles. Exact essentials-vs-optional split → **Opus PROPOSES in fly-pass** for Andrew approval.
- **Consent-gates-capture:** no capture without effective consent; **no indefinite grandfather**; migration when V1 lands.
- **Whiteboard nuance:** **live stroke rendering** during a session = NOT a capture (essential); **whiteboard-activity recording** (stroke replay) = consent-gated capture type.
- **Video (camera):** POST-V1 fast-follow; design forward-compatible, **do not build in V1**.
- **Q-3..Q-9 + Q-S1 RESOLVED** (spine ledger): on-request deletion + disclosed parent request path (NOT counsel-gated); 90-day sliding child device sessions; 2FA recovery = backup codes → admin reset; no ShareLink grandfather; messaging parent-send / student-read-only v1; 18+ self-manage; app-signed transactional email; audio = recommended **unchecked** opt-in.
- **§9 consent-gates open questions (6):** **DELEGATED to Opus** in fly-pass — recommend-and-proceed, Andrew ratifies later.
- **Auth notice:** mortensenapps.com auth disclosure at every auth-initiation click-point (Google reviewer commitment).
- **Pilot:** PURGE APPROVED for finished-class real-minor data (Opus scopes → confirm → prod delete).
- **Sarah:** mid-session learner swap (seamless consent-context swap) is a headline fly-pass input.

### DONE

- Component + identity/access + consent-gates-capture **design** docs.
- Interim capture-attestation gate **implemented** on `interim-capture-attestation` @ `3807e44` (pushed, NOT merged).
- Product legal facades on `v1-redesign` (`29f5e88`); umbrella `coppa-312-10-disclosure` @ `f77ed4b` in separate repo (Andrew review+deploy).

### QUEUED / IN FLIGHT

- **FLY-PLAN** session-lifecycle + consent design pass (waiting room → start/invite → learner swap → tiered consent + capture types + §9 recommendations) — **starts when Andrew says "fly"** (see spine FLY-PLAN).
- Identity 6-phase **implementation** (after design + BLOCKERs).
- Interim branch: Andrew migrate → smoke → merge to `master`.

### STILL OPEN (not re-ask Andrew for resolved Qs)

**Sarah-pending:** test-students audit (real vs test; any data to keep).

**BLOCKERs (3):** TOTP encrypt-at-rest (Phase 1); `assertOwnsLearnerProfile` (Phase 2); disclosure floor (umbrella deploy + OpenAI DPA + deletion-request inbox) — product facades on branch; VPC method disclosure waits until consent UI ships.

---

## §4 — How to work with Andrew

- Answers are **dense and high-signal** — parse slowly and map every point; he will say **"parse carefully."**
- He catches **foundational premise errors** (e.g. an earlier design assumed "students don't draw" — false). **CONFIRM FRAMING** before launching big design/code passes; never run a pass on an unverified premise.
- **Propose-and-flag**; never silently lock high-stakes decisions (URLs, legal, architecture). Give clear options + a recommendation.
- Quality bar is **"first-class"**: true V1, low-friction, "invisible" UI, instrumented for real usage. Do **not** preserve current IA/components just because they exist.
- **Cost-conscious** about model tiers (see §5).
- He smokes on **REAL hardware** — jsdom can't see layout/render (hard-won lesson). **"Green in Jest" ≠ done** for anything visual/geometric.
- **Build-surface merges:** if the branch touches fonts/CSS/build config, run **`npx next build`** before merge — [AGENTS.md § Merging convention](../../AGENTS.md) (Phase A `@5aa3c7d` deploy-break lesson).
- **Windows PowerShell:** multi-line commit messages via temp file + `git commit -F`, then delete the temp file in a **SEQUENTIAL** (not parallel) call.
- **Chat output:** workspace-relative paths only (absolute/`file://` render as dead text).
- **This repo:** feature branches commit + push by default; merge via `--no-ff` after a smoked branch (solo-pilot convention, no PRs yet).

---

## §5 — Farming to subagents + manual sessions

- **Default** = inline background dispatch from this chat.
- **`Composer 2.5`** = default executor + investigation (`explore` subagent, readonly).
- **`Sonnet`** (`claude-4.6-sonnet-medium-thinking`) = design / auth-boundary / security / 5-axis reliability.
- **`Opus`** = orchestration only.
- **`run_in_background=true`**; you get a completion notification — don't poll.
- **GOTCHA:** `resume` reuses the **PARENT model** (Opus-high). **NEVER** resume a Sonnet/Composer design subagent to "continue" it — start a **FRESH** agent with explicit `model=` instead. (We hit this; it's expensive.)
- **Manual-session pattern:** when Andrew wants to drive a focused chat himself, hand him a self-contained paste-blob (scope + relevant doc paths) he drops into the new window.
- **Continuity:** update the spine + the todo list at every handoff. They are the **dual index**.

---

## §6 — First actions for this session

1. Read [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) (**spine — source of truth**), then **this bootstrapper**, then design docs per §2.
2. Confirm branch reality (spine **BRANCH & COMMIT REALITY**): work on `v1-redesign`; do not assume V1 docs exist on `master`.
3. **If Andrew says "fly":** dispatch the spine **FLY-PLAN** Sonnet pass (session lifecycle + tiered consent proposal + capture types + §9 recommendations). Do **not** re-open Q-3..Q-9 / Q-S1 — they are RESOLVED in the spine.
4. **Parallel Andrew track (non-blocking):** interim branch migrate+smoke+merge; umbrella deploy; Phase A smoke; OpenAI DPA; pilot purge; deletion-request inbox.
5. **Implementation sequencing:** Identity Phase 1 (tutor 2FA) still gated on TOTP-encrypt BLOCKER; Phases 2–3 Sonnet-tier after fly-pass design lands.
6. Keep spine + todos current every handoff.

---

## §7 — What NOT to do

1. Don't launch a design/code pass on an **unconfirmed premise** — confirm framing with Andrew first.
2. Don't **resume** Sonnet/Composer design subagents (Opus-model gotcha) — **fresh-dispatch** instead.
3. Don't implement **retention-on-revocation** contrary to spine (**on-request** deletion + disclosed request path; retain-by-default; counsel deferred for edges only).
4. Don't ship identity **Phase 2** or **Phase 5** before the umbrella privacy/terms update.
5. Don't store TOTP secrets in **plaintext**.
6. Don't preserve current IA/components for preservation's sake.
7. Don't do heavy execution in the Opus chat — **dispatch**.
8. Don't drop the thread — keep the spine + todos synced.

---

You're not starting over — you're picking up exactly where the last session left off. **[`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md)** and **this file** are the memory; treat them that way every time you open a fresh window.
