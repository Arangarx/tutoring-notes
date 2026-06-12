# Scheduling + calendar integration — requirements capture

**Date:** 2026-06-11  
**Status:** Requirements capture — **not yet a build spec**  
**Context:** Backs **Group F** overnight scheduler surface on branch `v1-design-system` (visual-only tonight; no wiring).

> Andrew's verbatim intent captured during the overnight v1 design-system run. Use this doc for design and sequencing decisions; do not treat it as an implementation spec until a dedicated design pass ratifies it.

---

## Native-first principle

Scheduling must work **fully through our app**. External calendar integration is optional — not every tutor will connect one. The in-app scheduler is the primary surface; calendar sync is an enhancement for tutors who want events mirrored elsewhere.

---

## First-class calendar integrations

| Integration | Stakeholder | Priority |
|---|---|---|
| **Apple Calendar** | Sarah (explicit request) | First-class |
| **Google Calendar** | Andrew | First-class |
| **Other providers** | — | Design room for future expansion |

**When connected:** events created in-app **also push** to the connected external calendar. One-way outbound sync from Mynk → external calendar is the minimum expectation for connected accounts.

---

## Open design question — two-way sync

> **UNRESOLVED — flag prominently for Andrew + design pass.**

Do we need **two-way sync** — i.e. webhooks/subscriptions (Google Calendar push notifications / Apple CalDAV) to detect changes made **on the external calendar** and reflect them back into our app?

This is an open design question, **not a decision**. Options to evaluate in a future design pass:

- **One-way (Mynk → external only):** simpler; external edits do not flow back; tutor must edit in Mynk for source-of-truth changes.
- **Two-way (external → Mynk):** requires push notification infrastructure (Google Calendar API watch channels) and/or CalDAV polling/subscriptions for Apple; conflict resolution policy needed.

---

## Google OAuth bundling decision

Calendar scopes require **re-scoped Google access** + **site re-verification**, tied to the shared **Mortensen Apps OAuth consent screen** (see [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md)).

**Bundle Google Sign-in (auth) in the SAME consent/verification cycle** as the calendar scope request — avoid repeated Google verification rounds and permission-extension churn.

Operational notes from LEGAL-SYNC:

- The consent screen is registered under **"Mortensen Apps"** with policy URLs at `https://www.mortensenapps.com/privacy` and `/terms`.
- Adding new OAuth scopes triggers re-verification against that consent screen.
- Path A (umbrella OAuth) remains the ratified approach — calendar + auth scopes should land in one verification submission.

---

## Tonight's build scope (Group F — visual only)

**No wiring tonight.** The overnight scheduler surface is visual-first from the frozen v1 component library.

The visual **must bake in this model** even without backend integration:

1. **"Connect calendar" affordance** — entry point for Apple/Google (and placeholder for "other").
2. **Per-event sync state** — indicator showing whether an event is synced / pending / disconnected.
3. **Integrations settings area** — dedicated surface for managing connected calendars.

Flag clearly for Andrew's morning review: net-new design (no mock exists); visual-only per overnight breadth-over-caution directive.

---

## Relationship to prior BACKLOG entry (2026-06-08)

The [`docs/BACKLOG.md`](../BACKLOG.md) § Scheduling entry (2026-06-08) proposed "integrate, don't replace" with external calendar as primary read surface. **This 2026-06-11 capture refines that:** native-first scheduling in-app is primary; external calendar is optional first-class integration with outbound push when connected. Sequencing remains **post-V1, pre-release** (Gate B era).

Prior proposal items still relevant where not superseded:

- In-app schedule layer (upcoming sessions, reminders, start-session deep links)
- Student/parent join surface
- Soft session length (calendar block ≠ hard recording cap)

---

## Open questions summary

| # | Question | Status |
|---|---|---|
| Q1 | Two-way sync — webhooks/subscriptions for external→Mynk changes? | **Unresolved** |
| Q2 | Conflict resolution if two-way sync is yes | Not started |
| Q3 | Apple Calendar integration path (CalDAV vs EventKit bridge) | Not started |
| Q4 | Reminder channels (push, email, in-app) | Not started |
| Q5 | Timezone handling policy | Not started |
| Q6 | Bundle Google auth + calendar scopes in one OAuth verification cycle | **Decision captured** — implement when wiring |

---

## Cross-references

- [`docs/BACKLOG.md`](../BACKLOG.md) § Scheduling — concise pointer + open questions
- [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md) — Mortensen Apps OAuth consent screen
- [`docs/handoff/overnight-v1-design-system-handoff-2026-06-11.md`](overnight-v1-design-system-handoff-2026-06-11.md) — Group F fan-out context
- [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) — Wave 3 IA / scheduling sequencing
- [`docs/handoff/whiteboard-session-shell-design-2026-06-08.md`](whiteboard-session-shell-design-2026-06-08.md) — open Q8
