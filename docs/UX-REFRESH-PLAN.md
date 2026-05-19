# UX Refresh — Plan + Phased Rollout

> **Living plan doc.** Started 2026-05-17 evening on branch `feat/ux-refresh-foundation`. Update STATUS section as phases land. Treat the phased plan as the source of truth; orchestrator + executor handoffs reference this doc.

---

## STATUS (2026-05-17 evening)

| Phase | State | Notes |
|-------|-------|-------|
| Plan + audit + research | ✅ Shipped tonight | This doc + decision-fork resolutions captured below |
| Quick win 1: landing page copy accuracy | ✅ Shipped tonight | `src/app/page.tsx` — outcome-focused copy, dropped stale "early access / we'll reach out" framing, swapped CTA hierarchy. No visual redesign yet (waits for Phase 0 primitives). |
| Quick win 2: `AiAssistPanel` default tab → Record | ✅ Shipped tonight | One-line change — saves Sarah a click per session. Falls back to `"text"` when Blob isn't configured. |
| Phase 0: Tailwind + shadcn foundation | ⏳ Next session | ~1 evening. NO existing screens migrated; primitives + tokens only. |
| Phase 1: Landing + public surfaces visual redesign | ⏳ After Phase 0 | ~1 evening. Uses Phase 0 primitives. |
| Phase 2: Tutor flow click-reduction | ⏳ After Phase 1 | ~1-2 evenings. The big wedge — Sarah's daily flow. |
| Phase 3: Micro-polish (toasts, skeletons, Cmd+K, typography) | ⏳ Ongoing | After Phase 2; can interleave with other work. |
| Phase 4: Share-link surfaces (parent audience) | ⏳ Later | Separate audience; defer until tutor side feels right. |

---

## Why we're doing this (the trigger)

> *Andrew, 2026-05-17 evening:* "The landing page sucks, it's not even accurate. People don't have to get in a queue to use it… The description is probably massively out of date. But not only that, the flow is TERRIBLE right now. It's SO many clicks to start a recording or a session, it's ridiculous. We need to start working towards an 'invisible' UI."

Maps directly to the workspace North Star (`AGENTS.md`): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Through Phases 1–6 (functionality, reliability, lifecycle, AV, whiteboard, transcribe) the bet was *functionality first, polish later*. That bet was correct — Sarah has a usable workflow today and the recorder/whiteboard pipelines are reliable. But the bet has a paid-down cost: the UI is functional, not delightful, and the click-counts to primary actions are higher than they should be for a tool Sarah uses multiple times per day.

The UX refresh is the cash-in.

---

## Research synthesis (2026 SaaS UX standards)

Web research conducted 2026-05-17 evening (citations below). Key findings:

### The 2026 trend: "invisible UI" / calm design

The dominant 2026 SaaS-UX shift is toward minimal-chrome, whitespace-heavy interfaces that fade into the background while users focus on the task. Linear is the reference implementation. Advanced settings hide behind progressive disclosure, AI features appear inline (not badged), Cmd+K command palette is mainstream not power-user-only. Sources: [saasui.design 2026 trends](https://www.saasui.design/blog/7-saas-ui-design-trends-2026), [eleken.co invisible UX guide](https://www.eleken.co/blog-posts/invisible-design-ux).

### Patterns that map to our "ridiculous clicks" problem

- **Command palette (Cmd+K)** as primary action surface — used by Linear, Superhuman, Notion, Slack. Reduces clicks-to-anything to 2. ([uxpatterns.dev](https://uxpatterns.dev/patterns/advanced/command-palette))
- **Progressive disclosure** — four techniques: staged (Stripe-style stepwise setup), conditional (show fields only when triggered), contextual (help where needed), layered (KPIs → drill-down). ([pixxen.com playbook](https://pixxen.com/blog/progressive-disclosure-saas/))
- **Intent-based routing at signup** — one question reshapes the dashboard / features / checklists. (HubSpot, Notion.)
- **AI as infrastructure, not feature** — drop the "AI" badge, let suggestions appear inline. (Notion no longer badges AI; classifications happen on save.)
- **Single primary action per screen** — make the obvious next thing obvious.
- **Outcome-focused copy** — "Cut billing reconciliation from 4 hours to 20 min" beats "The smarter way to manage your business." Lead with the *specific* outcome for the *specific* audience. ([conception-labs.com landing anatomy](https://conception-labs.com/blog/saas-landing-page-optimization-anatomy-of-high-converting-pages))

### Landing page anatomy (high-converting SaaS 2026)

Per [inbuild.io guide](https://www.inbuild.io/guides/saas-landing-page) + [conception-labs.com](https://conception-labs.com/blog/saas-landing-page-optimization-anatomy-of-high-converting-pages):

1. **Hero** (50ms decision window) — outcome-focused headline, audience-specific, one primary CTA, product screenshot or short demo
2. **Social proof** in or near hero — concrete numbers > generic claims; if no big numbers, one credible quote with name + title
3. **3–4 feature blocks max** (NOT more — becomes a brochure) — lead with user outcomes, not technical features
4. **Testimonials / case studies**
5. **Pricing** (above the fold for paid tools; can be lower-fold for pilot)
6. **FAQ**
7. **Footer CTA**

Conversion benchmarks: average SaaS landing converts 2–5% (3.8% median), top performers reach 11.6%+. Improving from 3.8% → 7.6% doubles signups.

### Typography precision

Used by Linear / Stripe / Vercel: **tabular numerals** keep numerical columns stable, **text-wrap balance** prevents orphaned headline words. Free wins, ship as part of Phase 0 type-scale token. ([daniasyrofi.com](https://daniasyrofi.com/writing/details-that-make-interfaces-feel-better/))

---

## Audit findings (current state)

Full audit performed 2026-05-17 evening via subagent code survey. Reported click counts are minimums for the happy path; mic permission OS prompts not counted.

### Click counts to primary actions

| Action | Clicks today | Target post-refresh |
|--------|--------------|---------------------|
| Login → start audio recording for existing student | **3** (student card → Record tab → Start recording) | **1** ("Start session for [last student]" on dashboard) |
| Login → start whiteboard session ready to draw | **4–6** (student → Start WB → consent → Start session → maybe Resume → maybe Start recording) | **2** (whiteboard starts → canvas; consent becomes per-student one-time setting; resume becomes inline banner not blocking page) |

### Worst friction points (priority order)

1. **Student detail page is a hub with no primary action.** Share link, AI panel, whiteboard, email, notes all compete vertically. No "the obvious next thing is Start Session" above the fold. (`src/app/admin/students/[id]/page.tsx`)
2. **`AiAssistPanel` defaults to "Paste text" tab.** Sarah hits Record every time → one wasted click per session for the feature she uses daily. *Fixed tonight in quick win 2.*
3. **Whiteboard stacks friction**: consent modal + possible Resume gate + lazy Excalidraw + optional "Start recording" if `recordingDefaultEnabled` is off. Consent could be once-per-student instead of once-per-session.
4. **Dashboard doesn't accelerate work.** Stat cards link to Students — but there's no global "Continue last session" or "Start session for [most recent student]" surface. (`src/app/admin/page.tsx`)
5. **Public landing copy is stale.** Framed as "early access / we'll reach out" but signup is open. *Fixed tonight in quick win 1.*

### Structural finding — no design system

The most consequential finding: **no Tailwind, no shadcn/ui, no `components/ui/` primitives.** Styling lives in `src/app/globals.css` + heavy `style={{...}}` inline on every page. Shared pieces are `SubmitButton`, `ModalPortal`, `AdminNav`, recording subtree, whiteboard-specific components — useful but not a coherent system.

Every future UX iteration without a design system costs ~3× what it should. This is the load-bearing fork. **Decided 2026-05-17: adopt Tailwind + shadcn/ui in Phase 0.**

### Editorial voice

Currently mixed — terse errors ("Invalid credentials"), formal compliance copy (whiteboard consent), casual marketing ("Send a clean update to parents/students in one click"), operator-technical hints (env-var prompts on login). No unified voice. Phase 0 deliverable includes a voice doc.

---

## Decisions log

Track all forks + resolutions here so future-Andrew + future-orchestrator can see why we chose what we chose.

| Date | Fork | Resolution | Rationale |
|------|------|------------|-----------|
| 2026-05-17 | Design system: Tailwind+shadcn vs. stay-with-globals vs. minimal-tokens-hybrid | **Tailwind + shadcn/ui** | Compounding leverage on every future UX change; industry-standard tooling; AI-coding-friendly; dark mode native; one evening of setup cost vs. months of slower iteration. |
| 2026-05-17 | Tonight scope: plan-only vs. plan+quick-wins vs. plan+Phase-0-start | **Plan + 2 quick wins** | Late night, Andrew tired, wants visible progress without committing to a multi-hour foundation build at 10 PM. Quick wins are low-risk + don't depend on the design system. |
| 2026-05-17 | Waitlist form on landing | **Removed** | Andrew confirmed: signup is currently open (gated only by his manual email approval) and even that goes away once email verification ships. Waitlist form was misleading. |
| 2026-05-18 | How to measure Phase 2 click-reduction success | **PostHog product analytics (Phase 11a in master plan)** lands BEFORE Phase 2 of this UX refresh resumes | Phase 2's whole charter is "cut clicks-to-primary-action from 3→1." Without analytics, "we cut clicks" is aesthetic. With PostHog funnels (`/admin → session_started → recording_stopped`), Phase 2's success criteria become measurable. PostHog Tier 0+1 is its own bootstrapper (`docs/handoff/posthog-analytics-tier-0-1-bootstrapper.md`); ships independently of the UX refresh foundation. |
| 2026-05-18 | Build order: Tailwind/shadcn vs. PostHog first | **PostHog first, then resume Phase 0 (Tailwind/shadcn)** | PostHog gives us a baseline measurement BEFORE the refresh changes anything. Otherwise we have no before/after comparison and can't prove the refresh reduced clicks (vs. simply "feels lighter"). Marginal cost: one extra branch sequenced ahead of Phase 0. **Superseded for Tailwind timing (2026-05-18):** brand identity decisions (typography, color, voice) must land before Tailwind/shadcn executes — see "Brand-feeds-refresh sequencing" below. PostHog-before-refresh baseline still holds. |
| 2026-05-18 | Build order: brand vs PostHog vs Tailwind/shadcn | **Brand identity decisions first → PostHog baseline → Tailwind/shadcn + brand** | You cannot pick typography, color palette, or editorial voice without brand identity decided. The refresh *implements* brand visually; brand work feeds the refresh, not the other way around. Supersedes any implicit "Tailwind/shadcn first" sequencing from the 2026-05-17 foundation fork. |

### Hard refresh scope clarification (2026-05-18)

**"Hard refresh"** means professional product visual elevation — typography, color palette, visual language, iconography, and tonal coherence across surfaces — **not** merely copy-rewrite + click-reduction + Tailwind token swaps.

- **Baseline**: the current "clean but usable" state (functional, not delightful).
- **Target**: *looks like a real product, not a side project.*
- Phases 1–3 of this plan still include copy, click-reduction, and primitives — but those are necessary, not sufficient, for the hard refresh bar Andrew set on 2026-05-18.

### Brand-feeds-refresh sequencing (2026-05-18)

Brand identity decisions (**typography, color, voice**) must be made **before** the UX refresh executes, because the refresh implements them visually.

**Sequencing implication:** brand walkthrough + decisions → (domain/handle grabs once name is validated) → PostHog Tier 0+1 baseline → Phase 0 Tailwind/shadcn **with brand tokens baked in** → Phases 1–3 visual + flow work. Do not start Tailwind theme extraction or shadcn theme wiring until brand is locked.

See `docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md` (TBD, in progress 2026-05-18) and the eventual `docs/MYNK-BRAND-CAPTURE-CHECKLIST.md`. Mynk name is an operational commit but **not** 100% locked until step-by-step validation completes (trademark, domain, social, adjacent brand, international pronunciation, SEO). Andrew (2026-05-18): *"Let's walk through this one step by step if we need to see if I'm being dreamy or it's a realistic name to grab."*

### Forward-compatibility: org-level scoping (Phase 12 hook)

**Constraint** (locked in 2026-05-18, see `docs/MYNK-ORG-PILOT-BACKLOG.md`):

The nav primitives and URL structure introduced by this UX refresh
must NOT preclude introducing organization-level scoping later
(Phase 12, gated on this refresh + pilot stability). Specifically:

- Global nav should support a future "org switcher" affordance
  (think Vercel/GitHub team switcher pattern) without requiring
  a rewrite of the primitive.
- New URL structures should accommodate additive `/org/[id]/...`
  paths without colliding with the existing `/admin/students/[id]/...`
  tutor-scoped routes.

**This refresh does NOT need to BUILD any org-aware nav** — Phase 12
is gated on this refresh completing. The constraint is purely "don't
paint us into a corner."

---

## Phased plan

### Phase 0 — Foundation (next session, ~1 evening)

**Goal**: install the design system. NO existing screens migrated yet. Live alongside `globals.css`. New components opt in.

**Tasks:**
1. Install Tailwind 4 + configure for Next.js 15 App Router (PostCSS or CSS-import setup, dark-mode strategy `class`)
2. Extend existing dark palette into Tailwind theme tokens (background / foreground / muted / primary / border / destructive / success — extract from `src/app/globals.css`)
3. Add type scale, spacing scale, elevation/shadow tokens, motion timings
4. Run `npx shadcn@latest init` with our dark theme + CSS variables
5. Install core primitives via shadcn CLI:
   - `Button`, `Card`, `Input`, `Label`, `Textarea`, `Select`, `Checkbox`, `Switch`
   - `Sheet`, `Dialog` (replaces ad-hoc `ModalPortal` long-term), `Tabs`
   - `Toast` (replaces `window.confirm` over time), `Skeleton`, `EmptyState` (custom — not in shadcn core)
   - `Badge`, `Avatar`, `Tooltip`, `Command` (for Cmd+K palette in Phase 3)
6. Add tabular-numerals + text-wrap-balance utility classes
7. Write `docs/UX-REFRESH-VOICE.md` — one paragraph defining editorial voice + 5 do/don't examples derived from the audit
8. **Tests + lints + tsc clean.** Existing tests must not regress; new component primitives get basic render tests if shadcn doesn't ship them.

**Out of scope for Phase 0**: migrating any existing screen. The win is that Phase 1+ can build on real primitives.

**Reliability axes check (per AGENTS.md):**
- Recording is the artifact: **no impact** (presentation-only)
- Additive schema: **no impact** (no DB changes)
- Per-session logging: **no impact** (no new operational surfaces)
- Server-side ownership assertions: **no impact**
- Tight CSP: **possible impact** — Tailwind 4 should be build-time only (no runtime CSS-in-JS), confirm no new external origins; if shadcn pulls in a font from Google Fonts CDN, update `src/middleware.ts` + document in PLATFORM-ASSUMPTIONS.md per the new rule.

### Phase 1 — Landing + Public Surfaces (after Phase 0, ~1 evening)

**Goal**: Full visual redesign of the unauthenticated surfaces using Phase 0 primitives. Hits the audience that decides whether to sign up.

**Tasks:**
1. Landing page (`src/app/page.tsx`) full visual rebuild:
   - Hero with outcome-focused headline + sub + primary CTA + product screenshot (capture from a clean session)
   - 3 feature blocks (Record / Parents get a clean link / It's yours) using shadcn `Card`
   - One credible Sarah quote (with her permission — pending)
   - Pricing block ("Free during pilot — transparent pricing later") instead of vague "early access"
   - FAQ (3-4 questions: data ownership, parent privacy, what about long sessions, what tools does it replace)
   - Footer with privacy/terms/feedback
2. Login (`src/app/login/page.tsx`) visual rebuild — shadcn `Card` + `Input` + `Button`, friendlier error copy ("Email or password didn't match" instead of "Invalid credentials")
3. Signup (`src/app/signup/page.tsx`) visual rebuild — same primitives, add intent-based routing question ("What are you here for? Tutoring 1-on-1 / Small groups / Trying it out") that pre-fills sane student-form defaults later
4. Privacy + Terms (`src/app/privacy/page.tsx`, `src/app/terms/page.tsx`) — consistent layout, readable typography
5. Forgot/reset-password — visual consistency pass

**Reliability axes check:**
- Recording / schema / logging / ownership: **no impact** (no admin surfaces touched)
- CSP: Sarah's quote needs no new origin (static text); product screenshot is a static asset in `/public/`

### Phase 2 — Tutor Flow Click Reduction (~1-2 evenings)

**Goal**: cut clicks-to-primary-action from 3 (audio) / 4-6 (whiteboard) toward the 1 / 2 target.

**Prerequisite**: Phase 11a of the master plan (PostHog Tier 0+1) MUST have shipped before Phase 2 begins. Phase 2's success criteria are measurable only with PostHog funnels live. Concrete bar: **`/admin → session_started → recording_stopped` completes in ≤ 2 events (post-`session_started` page entry) for ≥ 80% of tutor sessions across a 10-session post-Phase-2 baseline**. Without PostHog, this bar collapses to "feels lighter" — unfalsifiable.

**Tasks:**
1. **Dashboard becomes a workspace, not a stats page** (`src/app/admin/page.tsx`):
   - Primary surface: "Continue last session" (if any in-progress) or "Start session for [most recent student]" (if quiet)
   - Recent activity stream inline (instead of separate Outbox surface)
   - Stats demoted to a collapsible "Insights" section
2. **Student detail page restructured** (`src/app/admin/students/[id]/page.tsx`):
   - ONE primary CTA above the fold: "Start session" → opens a `Sheet` with chooser (Audio note / Whiteboard session) and last-used selection pre-selected
   - Share link, notes history, email config progressively disclosed in collapsibles
   - `AiAssistPanel` simplified (already pre-defaulting to Record from quick win 2 — Phase 2 can hide the tabbar entirely when Blob is on and just show Record by default with a small "Other inputs" affordance for Paste/Upload)
3. **Whiteboard consent becomes a per-student one-time setting**:
   - First-ever whiteboard session for a student: full consent modal
   - Subsequent sessions: skip modal (student-level `whiteboardConsentAccepted: true` field), include subtle reminder in the workspace header
   - Schema migration: additive boolean column on `Student`, default false, set true post-first-consent
4. **Resume gate becomes an inline banner**, not a blocking full-page gate
5. **`recordingDefaultEnabled` per-student persistence verified** — once Sarah opts in for a student, recording auto-starts on the next whiteboard session
6. **(Stretch)** Cmd+K command palette: "Start session", "Open student X", "Resume last session", "Recent notes for…", "Go to Outbox"

**Reliability axes check:**
- Recording is the artifact: **CRITICAL** — Phase 2 changes to the whiteboard consent + recording-default flow MUST NOT break the existing FSM/outbox/end-session guarantees. Read `docs/RECORDER-LIFECYCLE.md` before touching `useWhiteboardRecorder` or `handleEndSession`. Adversarial: what if Sarah accepts consent once, then clears site data — does recording silently fail without re-prompting? Need to handle.
- Additive schema: **applies** — `Student.whiteboardConsentAccepted` boolean is additive, default false. No drops, no renames.
- Per-session logging: **no new prefix needed** (still wbsid/rid)
- Server-side ownership assertions: **applies** — any new server action (e.g. "Continue last session") must `assertOwnsStudent`
- Tight CSP: **no impact** (no new origins)

### Phase 3 — Micro-polish (ongoing, interleavable)

- Replace `window.confirm` with shadcn `Toast` + undo where reversible, `Dialog` where confirmation is genuinely needed
- Loading skeletons (vs spinners) on student detail, recording panel, notes page
- Keyboard shortcuts on every primary action, discoverable via Cmd+K palette
- Typography pass: tabular numerals on all numerical displays (session count, duration, dates), text-wrap balance on headlines
- Empty states with concrete next-action copy + sometimes inline action button
- Microcopy audit: every button label says what it does; every error says how to fix it
- Animation/transition layer: subtle motion on primary actions per shadcn defaults (don't overdo)

### Phase 4 — Share-link surfaces (parent audience, later)

Separate audience (parents/students, not tutors), so deserves its own dedicated pass. Defer until tutor side feels right. Touches:
- `src/app/s/[token]/page.tsx` + `src/app/s/[token]/all/page.tsx` + `src/app/s/[token]/whiteboard/[id]/page.tsx`
- `src/app/w/[joinToken]/page.tsx` (student live whiteboard join)

Parent-side priorities are different — they read on phones, they want simplicity + trust signals, they're not power-users. Keep mostly chrome-less, optimize for the "got a text from my kid's tutor" moment.

---

## Reliability axes adversarial review (cross-phase)

Per workspace AGENTS.md North Star: *"Every feature plan in this app must include an adversarial review against the 5 reliability axes, with BLOCKERs folded into Phase-1 acceptance — not deferred to follow-ups."*

The UX refresh is unique because it's presentation-layer for most phases. Phase-by-phase impact called out above. Cross-cutting concerns:

1. **Recording is the artifact** — UX changes MUST NOT change recording behavior. Specifically: any redesign of the recording UI must preserve the B3 always-mount invariant (`AudioInputTabs.tsx` comment lines 32-49). Don't conditional-render the recorder. If we hide Record-tab content visually, hide via CSS not unmount.
2. **Additive schema** — Phase 2's per-student consent boolean is additive. No drops. Run on prod Neon via migration, not raw SQL.
3. **Per-session logging** — No new prefixes needed; existing `rid` (audio) and `wbsid` (whiteboard) cover all session-bound flows. Phase 2's Cmd+K palette is per-action not per-session, so doesn't need a session ID; just log `[cmdk] action=<name>` at execute time.
4. **Server-side ownership assertions** — Any new dashboard surface ("Continue last session") must call `assertOwnsStudent` (or appropriate variant) before reading or returning student-scoped data. Confirm during code review on every Phase 2 PR.
5. **Tight CSP** — Tailwind 4 + shadcn should be build-time only. Verify no external font CDN, no runtime CSS-in-JS injection. If a screenshot/asset CDN is added for landing page imagery, update `src/middleware.ts` + `docs/PLATFORM-ASSUMPTIONS.md` per the new rule.

**No BLOCKERs identified**, but Phase 2 has the most reliability surface area (consent flow + dashboard server actions). Phase 2 acceptance must include a full pass through the recorder-lifecycle smoke (record → stop → upload → end-session → replay) to confirm we didn't break the artifact pipeline.

---

## Tonight's concrete deliverables (recap)

1. **This doc** (`docs/UX-REFRESH-PLAN.md`) — created, captures everything above.
2. **Landing page copy rewrite** (`src/app/page.tsx`) — outcome-focused headline, dropped stale waitlist form, accurate framing, swapped CTA hierarchy (Create account = primary). No visual redesign; uses existing `globals.css` classes. Phase 1 will do the full visual.
3. **`AiAssistPanel` default tab** (`src/app/admin/students/[id]/AiAssistPanel.tsx`) — defaults to `"record"` when `blobEnabled`, else `"text"`. Single-line behavior change.

All three commit together on `feat/ux-refresh-foundation`. Branch pushed for Vercel Preview. Quick wins are low-risk + don't depend on the design system, so they're independently mergeable to master once Andrew smokes Preview (or on confidence — both changes are textual/structural-trivial).

---

## Open questions (for Andrew, when convenient)

1. **Sarah quote on landing** — would she let us use a 1-sentence quote with her name + "tutor, Saskatchewan" (or whatever attribution she prefers)? Phase 1 deliverable.
2. **Product screenshot for hero** — capture from a real session (with PII masked) or stage one specifically? Latter is cleaner but stale-risk. Phase 1 decision.
3. **Pricing surface** — keep "free during pilot" forever, or add a "what pricing will look like" preview? Phase 1 copy decision.
4. **Cmd+K palette priority** — full Phase 3 deliverable, or pull into Phase 2 as a power-user surface? My recommendation: defer to Phase 3 — Sarah is not a power user and shouldn't be the primary beneficiary; build it once we have a second tutor.
5. **Intent-routing at signup** — actually useful for a single-persona pilot, or premature? My recommendation: ship the question in Phase 1 (cheap), pre-fill defaults from it in a later phase when there's enough scale to A/B.

---

## References

- Workspace `AGENTS.md` — North Star + reliability bar
- `docs/BACKLOG.md` — pre-existing UX gaps (sections "UX gaps — tutor side" line 118, "UX gaps — parent side" line 126) — Phase 2/4 should retire these as they're addressed
- `docs/PLATFORM-ASSUMPTIONS.md` — keep current as Phase 0 may introduce new build deps
- 2026 UX research:
  - https://www.saasui.design/blog/7-saas-ui-design-trends-2026
  - https://www.eleken.co/blog-posts/invisible-design-ux
  - https://pixxen.com/blog/progressive-disclosure-saas/
  - https://uxpatterns.dev/patterns/advanced/command-palette
  - https://www.inbuild.io/guides/saas-landing-page
  - https://conception-labs.com/blog/saas-landing-page-optimization-anatomy-of-high-converting-pages
  - https://daniasyrofi.com/writing/details-that-make-interfaces-feel-better/
