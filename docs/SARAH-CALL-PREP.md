# Sarah call prep

> **Purpose.** Durable home for questions that need Sarah's input before downstream design / product decisions can land. Rolling doc — newest call section at the top, prior calls captured below with the answers we got. Each open question links to what it gates so we don't forget *why* we're asking.

---

## Next call (next Sarah thread after 2026-05-26)

**Context.** 2026-05-26 evening call + 12:03–12:17 AM Discord follow-up largely answered the prior prep list. Full capture: [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md). See § Answers landed (2026-05-26) below for what landed.

### 0. Sarah primary tutoring device — OPEN verify (2026-06-18)

> **Ask Sarah:** "When you're tutoring live sessions in Mynk, what device do you normally use — desktop/laptop or phone/tablet? If desktop, is it Windows?"

**Why.** Assumed from Andrew 2026-06-18: Sarah tutors primarily from a **Windows desktop** (Chromium/Blink), not Mac/iPhone. Recalibrates our WebKit/mobile risk model — **tutor side = Chromium (zero WebKit risk)**; **student side = mobile-web generally** (Android test-student covered; iOS student coverage = zero). See [`docs/PLATFORM-ASSUMPTIONS.md`](PLATFORM-ASSUMPTIONS.md) §8.0.

### 1. Q4 — pain point you've been working around (still never asked)

> **Ask Sarah:** "Is there anything you do *every session* that's annoying — that you've just learned to work around — that you've never told us about because it didn't feel like a 'bug'?"

**Why.** Patient users underreport friction. Direct ask occasionally surfaces a workflow win we couldn't have predicted.

### 2. Sarah-drives-tutor-side follow-up (methodology)

Andrew drove the tutor side for most of the 2026-05-26 live session; Sarah was on the **student side** on iPhone. Schedule a session where **Sarah drives the tutor side end-to-end** before heavy n=1 dependency on tutor-side UX we may have missed.

**Detail:** [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md) — Generalization caveat (methodology sub-bullet).

### 3. Wyzant + UVU forms (artifacts)

Sarah said she'll share what Wyzant and UVU require her to fill out — screenshots / form templates / fields. These inform **session-log + reporting + search** design from the log-the-time answer.

**Detail:** [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation).

### 4. Brand awareness check — **defer until AFTER UI refresh ships**

Correction post-call (2026-05-27 12:26 AM): tonight's late thread WAS the brand reveal — the UI refresh would be the first time "Mynk" + logo appear on Sarah's surface, and Andrew hadn't told anyone outside immediate family before tonight. Cold pronunciation "Mink" landed clean and Sarah liked the mascot direction, so the reveal itself was a green light. Real "does she notice the brand in the UI?" feedback is **only meaningful after Wave 3 UI/brand refresh lands** — defer until then. **Not a question for the next thread.**

**Detail:** [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#10-brand-reveal--first-surface-to-sarah-clean-cold-pronunciation-test`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#10-brand-reveal--first-surface-to-sarah-clean-cold-pronunciation-test).

### 5. Anything else she remembers wanting to add

Invite her to share anything else (*"if I do I'll let you know"* from Q1 continuation).

---

## How to use this doc

1. **Before a call with Sarah:** review the active section. Add/remove questions. Move stale questions to "Answers landed" below.
2. **During / right after the call:** paste her answers under each question in this doc. Don't paraphrase aggressively — Sarah's exact words are useful signal.
3. **After answers land:** open the next chat with "Read `docs/SARAH-CALL-PREP.md` § Answers landed first" so the agent has the new ground truth before starting work.

---

## Answers landed

### 2026-06-06 (Discord — post live whiteboard session, ~10:28–10:43 PM)

Full capture: [`docs/handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md) — real session (Sarah tutor Mac + student PC); sync + drawing pad validated; desktop UX annoyances triaged vs v1 redesign / identity epic / recording re-arch.

### 2026-06-07 (engineering capture — Excalidraw 0.18.1 feasibility; do not re-litigate)

These Sarah asks are **known** with a verified feasibility answer — not open questions for the next call:

- **Toolbar reorder (Sarah U4, 2026-05-26)** — Cursor → Pencil → Eraser → Typing first. **Answered:** not achievable via `UIOptions` on pinned 0.18.1; requires Mynk custom toolbar driving `excalidrawAPI`. On whiteboard-wave roadmap.
- **Shape dropdown consolidation (Sarah U5/U6, 2026-05-26)** — line+arrow together; rectangle/diamond/ellipse together. Same custom-chrome path; not a config tweak.
- **Mobile palette dismiss (I7, 2026-05-26 iPhone smoke)** — color/pen palette should close on outside tap. **Answered:** not exposed in 0.18.1 public API; fix lands in **student-mobile-first** custom chrome. On whiteboard-wave roadmap.

Detail: `docs/WHITEBOARD-STATUS.md` § Sarah UX asks + custom chrome; `docs/BACKLOG.md` whiteboard queue framing note (2026-06-07).

### 2026-05-26 / 2026-05-27 (evening call + 12:03–12:17 AM follow-up thread)

Full verbatim capture: [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md).

- **Q1 (top 10 actions)** — #1–#6: whiteboard session (bundled A/V + notes), homework image import, annotate, graph insert, shapes/geometry, log time + notes. **#7 retroactive:** looking back at notes (ties to session-log surface). **Use-case shift:** solo / in-person tutor mode — not a new verb, first-class need. → [§ 9 Solo / in-person tutor mode](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#9-first-class-feature-solo--in-person-tutor-mode)
- **Q2 (scheduling)** — No scheduling in v1; iPhone/Google calendar stays external; Mynk = recording/recap tool. → [§ 1 Q2](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#q2-scheduling-yn--the-gating-question)
- **Log-the-time clarification** — Much richer than prior interpretation: session-log + reporting + search, billing/compliance (Wyzant/UVU), round-to-5-min, disconnect gap adjustment, consolidated export. Reclassified off Wave 6 polish. → [Q2 follow-up](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#q2-follow-up--log-the-time--notes-verbatim-much-bigger-than-the-prior-interpretation)
- **Q3 (parent recap reading patterns)** — Devices unknown (assume both); Wyzant 25-word/session + UVU pay-period sheet; prefers in-person recaps; ~50/50 parent engagement; self-acquired students want conversational status, not notes artifacts. → [§ 1 Q3](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#q3-recap-reading-patterns--parent-engagement-answered-12031204-am)
- **Strategic reframe** — Wedge = **whiteboard + live recording** (live session unique); AI notes "pretty cool" but secondary; notes-to-parents mostly institutional compliance. → [§ 8 Strategic reframe](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#8-strategic-reframe-called-out-by-sarah-validated-explicitly)
- **Brand reveal** — Tonight was the **first reveal** of "Mynk" to Sarah (UI refresh hadn't shipped to her surface; Andrew hadn't told anyone outside immediate family). Cold pronunciation "Mink" landed clean; positive on mascot/logo direction. Reveal landed cleanly. → [§ 10 Brand reveal](handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md#10-brand-reveal--first-surface-to-sarah-clean-cold-pronunciation-test)
- **iPhone live-A/V smoke** — extensive breakage + UX requests captured in orchestrator report § 2 (not repeated here).

### 2026-05-19 (Discord, mid-session)

**Q: Top 2 most-frequent actions in the app?**

A: (paraphrased) Starting a session with a known student. Ending a session and sending the recap.

→ Drove the conclusion that **session-anchored IA** (not student-anchored) is correct. Captured in `docs/UX-AND-A11Y-SPEC.md` § 15 row 7.

---

## Earlier calls (placeholder)

_No prior call notes captured in this doc yet. If we wrote up past Sarah conversations elsewhere, link them here for continuity._
