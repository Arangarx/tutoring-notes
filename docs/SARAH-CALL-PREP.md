# Sarah call prep

> **Purpose.** Durable home for questions that need Sarah's input before downstream design / product decisions can land. Rolling doc — newest call section at the top, prior calls captured below with the answers we got. Each open question links to what it gates so we don't forget *why* we're asking.

---

## Next call — target Friday 2026-05-22+

**Context.** V1 design session paused 2026-05-19 PM because IA decisions hit a feature-scope question we didn't have an answer for. See `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md` for the full record.

### 1. Scheduling-in-v1 — THE gating question

> **Ask Sarah:** "Do you currently use a calendar tool to track your tutoring sessions (Google Calendar, Calendly, iCloud Calendar, paper planner, anything)? If we built scheduling into Mynk, would you actually move your sessions there — or is your current calendar fine and you'd rather Mynk just be the recording/recap tool?"

**Why this gates everything.** The FINAL palette mockup's "Up next · Aiden K. at 4 PM today" assumed scheduling was in v1 scope. But scheduling is a meaningful product surface (calendar UI, recurring sessions, time-zone handling, parent visibility, conflict detection) — not free. Without scheduling, "Today" is meaningless inside Mynk because Sarah can't type "4 PM" into existence.

The three plausible shapes Sarah's answer puts us in:

| Answer | What v1 default-landing surface becomes | Rough v1 scope delta |
|---|---|---|
| **No scheduling — calendar lives elsewhere** | "Next actions" dashboard: start a session + finish pending recaps. No "Today" concept. | Smaller v1. Faster ship. |
| **Yes, lightweight** — recurring weekly schedule of standing sessions | "Today" landing works. "Next session" computed from the schedule. | Adds a schedule-setup surface + recurring-event model. ~1-2 weeks. |
| **Yes, full** — calendar surface, drag-to-schedule, conflict detection | Full calendar landing. Parent-side schedule visibility. | Multi-week feature in its own right. |

Andrew's instinct (2026-05-19): probably (1) for v1 — Sarah likely already lives in Google Calendar and we shouldn't try to replace it. But this needs Sarah's actual answer, not our guess.

**This question gates:** mental anchor noun (formal lock), default landing surface, start-recording affordance surface, URL structure, ~half of Phase 2 tutor surface specs.

### 2. Sarah's full 3–10 most-frequent actions

> **Ask Sarah:** "If we were redesigning the app from scratch, what 3–10 things should be the most frictionless? Top 2 you already gave us: starting a session with a known student, ending a session and sending the recap. What's #3? #4? Through ~10 if you have them."

**Why we need this.** Tells us what gets the front page vs. one click in vs. behind a menu. Currently we only have top-2 (confirmed via Discord mid-session, last week of school context).

**This question gates:** information architecture below the default-landing surface, Phase 2 surface specs, what we put in a Cmd+K palette vs. inline buttons.

### 3. (Optional, time-permitting) Recap reading patterns

> **Ask Sarah:** "When you send a recap to a parent, do they reply? Do they read it on phone or desktop? Have any parents asked you for something the recap doesn't currently have?"

**Why.** The parent share view (`/s/[token]`) is getting a formal Phase 1 spec; knowing how parents actually engage with it changes the priority order of states (mobile-first vs. desktop, "ask follow-up" affordance, etc.).

**This question gates:** parent share view spec depth (Phase 1).

### 4. (Optional, time-permitting) Pain point you've been working around

> **Ask Sarah:** "Is there anything you do *every session* that's annoying — that you've just learned to work around — that you've never told us about because it didn't feel like a 'bug'?"

**Why.** Sarah is patient (per AGENTS.md North Star). Patient users underreport friction. Direct ask occasionally surfaces a big workflow win we couldn't have predicted.

**This question gates:** nothing structural, but informs Phase 3 polish priority.

---

## How to use this doc

1. **Before a call with Sarah:** review the active section. Add/remove questions. Move stale questions to "Answers landed" below.
2. **During / right after the call:** paste her answers under each question in this doc. Don't paraphrase aggressively — Sarah's exact words are useful signal.
3. **After answers land:** open the next chat with "Read `docs/SARAH-CALL-PREP.md` § Answers landed first" so the agent has the new ground truth before starting work.

---

## Answers landed

### 2026-05-19 (Discord, mid-session)

**Q: Top 2 most-frequent actions in the app?**

A: (paraphrased) Starting a session with a known student. Ending a session and sending the recap.

→ Drove the conclusion that **session-anchored IA** (not student-anchored) is correct. Captured in `docs/UX-AND-A11Y-SPEC.md` § 15 row 7.

---

## Earlier calls (placeholder)

_No prior call notes captured in this doc yet. If we wrote up past Sarah conversations elsewhere, link them here for continuity._
