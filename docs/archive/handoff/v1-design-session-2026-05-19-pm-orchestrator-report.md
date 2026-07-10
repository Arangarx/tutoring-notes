# V1 design session — 2026-05-19 PM · Orchestrator handoff report

> **For the orchestrator that bootstrapped this session** (`docs/handoff/...`-equivalent prior briefing). This report captures what was decided, what was deferred, what's open, and what the next session needs to pick up.

**Session shape (actual vs planned).** Bootstrapper aimed for "settle 8 decisions + write Phase 1 + Phase 2 specs in one shot." Actual outcome: 3 decisions resolved, 5 deferred to a follow-up session post-Sarah-call. **Andrew explicitly walked back to deferral** after we caught a feature-scope question hiding behind the IA decisions — see § Open questions for the catch.

---

## What was decided

### 1. CTA contrast BLOCKER — RESOLVED (Option A)

The light-mode cream-on-coral CTA combination (2.76:1, FAILS WCAG SC 1.4.3) is fixed.

- **Choice:** Option A — dark text on coral. Light-mode `--accent-on` changed from `#FCFBF4` (cream) → `#15203A` (dark text). Ratio 5.64:1, AA.
- **Why over D (the prior session's recommendation):** Andrew picked A after viewing all four options side-by-side at `docs/brand-previews/cta-options-comparison.html`. A is token-cheapest (one value change, no new tokens, no follow-on layout problems), preserves the bright-coral CTA energy that 6+ rounds of palette exploration earned, and avoids the brand-blue-on-brand-blue dashboard up-next-card problem that Option D would have created.
- **Dark mode:** unchanged (already dark text on coral, 6.22 AA).
- **Files updated:**
  - `docs/BRAND.md` — token value + replaced "open palette decision" warning with resolution note.
  - `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` — color table updated; § History entry added.
  - `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — `--accent-on` value updated.
  - `docs/UX-AND-A11Y-SPEC.md` — § 0 BLOCKER note replaced with resolution; § 2.1 audit table updated; § 2.2 rewritten as "RESOLVED" with the four-candidate audit preserved; § 15 row 1 marked resolved; § Changelog entry added.
- **Audit artifact:** `docs/brand-previews/cta-options-comparison.html` (1048 lines) — visual side-by-side of all four options at 3 representative surfaces (marketing hero, dashboard up-next, pre-session preview), light + dark mode toggles. Built mid-session at Andrew's request when the prior bootstrapper's text-only AskQuestion didn't give him enough signal.

### 2. Parent surfaces scope — RESOLVED

- **Today's parent share view (`/s/[token]`)** gets a formal per-surface spec in Phase 1 (was: "separate Phase 4"). Surface 6 of the FINAL mockup is the visual design; the spec formalizes URL, microcopy, states, a11y, D-list answers.
- **Expanded parent surfaces** (parent account, history of past recaps, parent notifications) — deferred indefinitely; no current scope. The "Phase 4" from the old `UX-REFRESH-PLAN.md` was about expanded parent surfaces; that whole world is intentionally out of scope.
- **Why:** Andrew flagged that the parent share view IS the brand's first impression for parents and shouldn't be left as "the mockup is the spec." Cost of formalizing is low (the design exists); benefit is locked microcopy + a11y posture.
- **File updated:** `docs/UX-AND-A11Y-SPEC.md` § 15 row 6 + § Changelog.

### 3. Sarah's top-2 actions — CONFIRMED

- **Action #1:** "Starting a session with a known student."
- **Action #2:** "Ending a session and sending the recap."
- Both confirmed by Sarah via Discord ping mid-session. Sarah is in last week of school; full **3–10 list deferred to Friday 2026-05-22+**.
- **IA implication:** the tutor's two highest-frequency actions are session-centric, not student-centric. **Mental anchor noun = session** is robust against any plausible 3–10 list.
- **File updated:** `docs/UX-AND-A11Y-SPEC.md` § 15 row 7 (marked partially resolved) + § Changelog entry.

---

## What was deferred and why

### The catch that triggered the deferral

After Sarah's top-2 confirmation, the orchestrator surfaced the anchor-noun + default-landing decisions. Andrew responded with: *"Right now she can't actually schedule sessions in our app so if we're adding that, then I imagine she'd first want today-anchored??"*

This caught a feature-scope question hiding beneath the IA decisions:

> **The FINAL mockup's "Up next · Aiden K. at 4 PM today" implicitly assumed scheduling is in v1 scope. But scheduling is a much bigger feature than a UI redesign — calendar surface, recurring sessions, time-zone handling, parent-side scheduling visibility, conflict detection. Without scheduling, "Today" is meaningless because Sarah can't type a 4 PM into existence.**

Resolving the anchor-noun + default-landing decisions therefore depends on a feature-scope decision (scheduling Y/N in v1), which itself depends on more of Sarah's input (does she want scheduling in the app, or does she Calendly/Google-Calendar her sessions and just want our app to be the recording/recap layer?).

Andrew's call: pause the session, settle the rest of the decisions with Sarah after Friday, then resume.

### Specifically deferred

| # | Decision | Why deferred |
|---|---|---|
| 14.1 / D2 | Mental anchor noun (formal lock) | Session is the right answer; Andrew didn't formally lock because deferring the rest, but capture: session-anchored is the de-facto direction. Strictly speaking, locking session anchor doesn't depend on scheduling. We just didn't put the official check-mark on it. |
| 14.2 / D3 | Default landing surface | Depends on scheduling Y/N. Today-anchored only works with scheduling. Without scheduling, the dashboard becomes "next-actions" (start session + finish recaps) — a different surface. |
| 14.3 / D4 | Global "start recording" affordance | Pattern is locked-in-direction (persistent CTA + Cmd+K shortcut), but the *surface* it lives on is downstream of default-landing. |
| 14.4 / D5 | Whiteboard's place in IA | Direction: within-session, not standalone. Robust against scheduling decision. Could have been locked today; deferred for cleanliness in single follow-up session. |
| 14.5 / D6 | URL structure | Depends on full workflow shape from Sarah's 3–10. |
| Phase 1 specs | Public surface specs | Lower-risk to defer to a focused follow-up session that has Phase 2 alongside it. |
| Phase 2 specs | Tutor surface specs | Cannot be written without Sarah's full action list + scheduling decision. |

### Implicit decision worth surfacing

**Scheduling-in-v1 (feature scope, not UI).** Should v1 add scheduling? This is a Sarah conversation. Plausible answers:

1. **No.** Sarah uses external calendaring (Google Calendar, Calendly, etc.); Mynk is the recording/recap layer only. Default landing becomes "next actions" — start a session + finish pending recaps. Today is not a meaningful concept inside Mynk.
2. **Yes, lightweight.** A simple weekly schedule of recurring sessions; "next session" is computed from the schedule. Today-anchored landing works.
3. **Yes, full.** Calendar surface, drag-to-schedule, conflict detection, parent-side visibility. Big v1 scope addition.

Friday's Sarah call should answer: "Do you currently use a calendar tool for tutoring sessions? Would you want Mynk to schedule them, or is the calendar fine?" The answer routes the rest.

---

## What was produced

### New files (untracked — see git note below)

- `docs/brand-previews/cta-options-comparison.html` — the four-options visual audit (light + dark, 3 surfaces × 4 options). Audit artifact, may be archived later.
- `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md` — this report.

### Modified files

- `docs/BRAND.md` — CTA decision applied (token value + warning section).
- `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` — color table updated + § History entry.
- `docs/UX-AND-A11Y-SPEC.md` — § 0 + § 2 + § 15 + § Changelog updated for CTA + parent scope + Sarah top-2.
- `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — `--accent-on` light-mode token value.

### NOT produced (because of the deferral)

- `docs/UX-DESIGNS-PHASE-1.md` — the bootstrapper's primary deliverable for Phase 1.
- `docs/UX-DESIGNS-PHASE-2.md` — the bootstrapper's primary deliverable for Phase 2.
- Updated Composer 2.5 handoff prompt.

### In-flight (background subagent)

A `composer-2.5` `explore` subagent was dispatched mid-session to audit the current public surfaces (login/signup/forgot-password/reset-password/privacy/terms/parent-share/feedback/setup pages — purpose, form fields, server actions, microcopy, a11y, anything weird). Was not yet complete when the session paused. Result will land in this session's transcript when the subagent finishes; useful for the next session's Phase 1 spec work.

---

## Git state

All the brand-decision docs (BRAND.md, MYNK-BRAND-PHASE-2-DECISIONS.md, DESIGN-TOKENS-PLAN.md, UX-AND-A11Y-SPEC.md, brand-previews/) are **untracked** — they've never been committed in any prior session. Today's edits sit on top of that uncommitted baseline.

**Recommended commit story:**

1. Branch: `v1-design-decisions-2026-05-19` from current master.
2. Commit: "Lock CTA contrast (Option A) + parent surfaces scope + capture Sarah top-2."
3. Push to origin.
4. Merge `--no-ff` to master after a quick smoke (open `cta-options-comparison.html` and the FINAL mockup in browser, verify CTA buttons read dark-on-coral).
5. Pick up next session from a clean base.

Doing this commit cleans up a multi-session backlog of uncommitted brand work.

Andrew did not explicitly request the commit; surfacing here for the orchestrator to decide.

---

## Next session — starting context

**Trigger:** Sarah's full 3–10 actions list lands (target Friday 2026-05-22+).

**Pre-call prep:**

- Add to the Sarah call: "Do you currently use a calendar tool for sessions? Would you want Mynk to schedule them, or do you handle scheduling elsewhere?"
- This is the scheduling-in-v1 answer that gates the rest.

**Decisions to lock in next session:**

1. Mental anchor noun (formally — already directionally session).
2. Scheduling-in-v1 (Y/N + scope).
3. Default landing surface (depends on #2).
4. Start-recording affordance surface (depends on #3).
5. Whiteboard's place in IA (formally — already directionally within-session).
6. URL structure (depends on full action list + #2).

**Specs to write in next session:**

- `docs/UX-DESIGNS-PHASE-1.md` (8 public surfaces).
- `docs/UX-DESIGNS-PHASE-2.md` (tutor surfaces — count depends on scheduling decision).
- Updated Composer 2.5 handoff prompt referencing both spec docs.

**Reference materials updated since the bootstrapper:**

- `docs/UX-AND-A11Y-SPEC.md` § 15 — 3 of 8 decisions resolved/partially-resolved.
- `docs/BRAND.md` — `--accent-on` light value is now `#15203A`.
- `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` § History — three new entries (CTA, parent scope, Sarah ping).
- `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — token-corrected.
- `docs/brand-previews/cta-options-comparison.html` — new audit artifact.

**Bootstrapper for next session** — likely structure:

```
You're picking up a v1 design session paused 2026-05-19 PM.
Read this report first: docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md
Then read in order:
  AGENTS.md, docs/UX-AND-A11Y-SPEC.md (skim — 3 of 8 decisions now resolved),
  docs/BRAND.md, docs/MYNK-BRAND-PHASE-2-DECISIONS.md § History (3 new entries),
  Sarah's full action list (Andrew will paste from Discord).

Lock the remaining IA decisions: scheduling Y/N (the gating question), anchor noun (already directionally session), default landing, start-recording surface, whiteboard's place, URL structure.
Write per-surface design specs for Phase 1 + Phase 2.
Update the Composer 2.5 handoff prompt.
```

---

## Notes for the orchestrator on this session's quality

- **Surfaced the scheduling catch.** The bootstrapper's IA questions assumed scheduling; Andrew's question caught it; we walked back rather than ship Phase 2 specs built on a false premise. This is the kind of catch that prevents 3-day smoke loops later.
- **Andrew preferred shorter focused sessions.** He confirmed mid-session (going from "lock everything today" → "lock the safely-lockable + defer") that the smaller cleaner output beats the bigger riskier one. Worth keeping as a default for design sessions until evidence says otherwise.
- **Visual artifacts beat AskQuestion text.** When Andrew was deciding the CTA option, plain-text AskQuestion didn't give him enough signal. Building the side-by-side comparison page was the right move and unlocked the decision in minutes once it existed. Pattern to repeat: any palette/typography/IA decision with subjective tradeoffs deserves a visual artifact, not a text dump.
