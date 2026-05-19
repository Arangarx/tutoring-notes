# Mynk brand walkthrough — Phase 2 decisions

**Status (as of 2026-05-19 PM, all four pillars DECIDED):** Pillar 1 (voice) DECIDED; Pillar 2 (color) DECIDED — **Mynka Blue**; Pillar 3 (typography) DECIDED — Fraunces V4 wordmark + Fraunces V2 heading + Inter body + JetBrains Mono labels; Pillar 4 (mascot) DIRECTIONALLY LOCKED (style still iterating).

**This unlocks UX refresh Phase 0** (`docs/DESIGN-TOKENS-PLAN.md`) with a real palette to bake in, not a placeholder.

**Canonical home:** This doc holds Phase 2 brand decisions made jointly between Andrew (founder) and orchestrator (Opus). Decisions captured here gate UX refresh Phase 0+ (Tailwind/shadcn install + design tokens). When this doc and any older doc disagree, **this doc wins** for Phase 2 scope.

**Cross-references:**
- `docs/BRAND.md` — **quick-reference card** (hex codes, font settings, copy-paste tokens). Use this for engineering.
- `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — **live reference mockup** showing the locked palette + typography across six product surfaces. Visual source of truth.
- `docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md` — name validation (Phase 1, complete 2026-05-18)
- `docs/MYNK-BRAND-CAPTURE-CHECKLIST.md` — digital asset acquisition status
- `docs/UX-REFRESH-PLAN.md` — UX refresh phases, gated on this doc
- `docs/DESIGN-TOKENS-PLAN.md` — token migration plan; Phase 1 now uses Mynka Blue values

---

## Brand brief (synthesized 2026-05-19)

### Audience

**Current (Sarah-class):** Solo tutors. Mostly K-12 + some early-college (early-college uncertain — don't anchor). Often mid-career, frequently female, often working from home or part-time. Real pain: *"toolchain is fragmented, no one product does everything, and writing notes after the session is the part I hate most."* Andrew's correction to my earlier "burned by other tools" framing — the actual wedge is **fragmented toolchain + post-session note-writing overhead**, not bad-experience-with-cute-vs-cold-products.

**Next (Phase 12, mid-late Aug 2026 prof-meeting target):** University tutoring department heads + learning-center directors. They need to feel "this is a real product, not a side project" within 5 seconds of the landing page.

**Future-possible:** Students directly — if/when Mynk expands into the tutoring marketplace segment. Not current, but the brand system should not preclude it.

**Never directly targeted as primary buyer:** Parents, K-12 schools, LMS administrators.

### Brand promise

*Sync your mind with your students'. We handle the memory.*

Andrew's read: right brand idea, not necessarily the marketing line.

### What we are

Warm, competent, calm, durable. Linear's design discipline + Things 3's serenity + a coffee-shop hospitality vibe. The Mynk/mink association leans quiet-intelligent-agile-mammal — not loud, not aggressive.

### What we are NOT

Chat-app cute, edtech-juvenile, gamified, AI-bro futuristic, Silicon-Valley-disrupt, enterprise-cold (Salesforce-y, overbuilt, joyless).

---

## Pillar 1: voice / tone — DECIDED

**Selected:** **Option B with Option D flavor in mascot moments.**

- **B — "Helpful colleague" (core product copy):** Conversational but not chatty. Acknowledges the human friction of tutoring. Sentence-level reference: *"You teach. Mynk takes the notes — so you can stay with your student."*
- **D — "Smart-friend playful" (brand surfaces):** Mascot can carry whimsy in marketing copy, landing-page hero, social posts, blog headers. Sentence-level reference: *"Sarah teaches algebra. Mynk takes notes. Nobody forgets the homework."*

**Surface split (provisional):**

| Surface | Tone |
|---------|------|
| Signup / auth / settings / admin | B (helpful colleague) |
| Dashboard / session list / empty states | B with occasional D moments |
| Recording UI / live session | B (calm, doesn't break tutor's flow) |
| Error / recovery / "we lost connection" | B (reassuring, never blame the user) |
| Landing page hero | D (whimsy + mascot front-and-center) |
| Marketing copy / blog | D leaning B (whimsy with credibility) |
| Social posts | D (mascot can flex) |
| Transactional email | B |

---

## Pillar 4: mascot — DIRECTIONALLY LOCKED (style still iterating)

**Yes mascot. Yes mink. Currently sketched as "mink riding/driving a pencil."** Conceived by Andrew + daughter. Logo direction: leans **(c) geometric/minimalist** with a smidge of **(b) editorial-illustrated**, calibrated for dept-head professionalism per GPT consultation guidance.

**Deployment model: brand character system, constrained to non-obtrusive presence.**

- Logo mark: minimalist mink-on-pencil
- Loading / transcribing / uploading animations: mink shown "doing the work" in restrained playful register (typewriter, suitcase, etc.)
- Easter-egg micro-animations: the mink doing "random little things" (Andrew's framing) — built slowly over time, brand-affection multipliers
- NOT used: large mascot illustrations dominating any product surface; chibi/big-eye styling; sticker-pack energy

**Adaptive brand register (forward-compat decision):** The system should accommodate a *future kid-facing mode* where the mascot can flex to cartoony / cuter / more chibi for younger-student-facing surfaces (if/when Mynk surfaces a student-facing product or knows the viewer is a younger student). Implementation note: design this as a token/mode primitive from day one (e.g. `brand-energy: "adult" | "young"`), not retrofit later. Avoid hard-coupling visual assets to a single energy register.

**Symbolic resonance (why this works):**
- Mink "doing the work" with a pencil is the direct visual metaphor for the product (handles transcription/notes so tutor doesn't have to).
- Playful enough to disarm; competent enough not to disqualify with dept heads.
- Builds brand affection through micro-moments rather than loud branding.

**Open / iterating:**
- Exact line weight, fur-detail level, pencil-position, color rendering of the mascot — still in sketch phase.
- Mascot name: not yet decided. Andrew's daughter has naming input; defer to Phase 2 close.

---

## Pillar 2: color palette — DECIDED

**Selected:** **Mynka Blue** — a desaturated slate-navy `#1E3D54` paired with warm cream surfaces and a coral-salmon accent. Internally referred to as F2 (Bluer Bridge) throughout the exploration; renamed to **Mynka Blue** at the moment of selection on 2026-05-19, following the brand-blue naming convention (cf. Tiffany Blue `#0ABAB5`, Klein Blue `#002FA7`, Pantone 286 Reflex Blue).

By convention, the name **Mynka Blue** refers to the brand hex `#1E3D54` specifically. The full F2 token set is **the Mynka Blue palette**. Light- and dark-mode surfaces, the coral accent, and all supporting hues ride along under that umbrella name.

### The full palette

**Light mode (default surface):**

| Token | Hex | Role |
|---|---|---|
| `--brand` | `#1E3D54` | Mynka Blue. Wordmark, primary CTA fill, sidebar headers, section underlines, active-tab indicators |
| `--text` | `#15203A` | Deep blue-black. Headings + primary body text |
| `--text-muted` | `#5A6877` | Cool blue-grey. Subtitles, helper text, timestamps |
| `--surface` | `#F5F4EC` | Warm cream. Page bodies |
| `--surface-raised` | `#FCFBF4` | Lifted cream. Cards, panels, the live-transcript visual |
| `--surface-sunken` | `#ECEBE1` | Recessed cream. Device chrome, inset wells, sidebars |
| `--border` | `#C5CFD0` | Cool blue-tinted neutral. Default card borders, dividers |
| `--border-strong` | `#4A6680` | Mid blue-grey. Ghost-button outlines, focus rings |
| `--accent` | `#E27D60` | Coral. Live dot, AI summary bars, mic ring, checkmarks |
| `--accent-soft` | `#F8E0D6` | Pale peach. AI summary panel backgrounds, soft-coral halos |
| `--accent-text` | `#8A3C25` | Burnt coral. Eyebrows, "AI SUMMARY" labels, surface numbers |
| `--accent-on` | `#15203A` | Dark text *on top of* the coral CTA. **Updated 2026-05-19 PM (Option A)** from cream `#FCFBF4` → text-color `#15203A` to fix WCAG 1.4.3 BLOCKER. Ratio 5.64 AA. |

**Dark mode (toggle):**

| Token | Hex | Role |
|---|---|---|
| `--brand` | `#7EA4B1` | Light blue-grey. Wordmark + brand text in dark mode |
| `--text` | `#F0EDE4` | Warm off-white. All headings + primary body |
| `--text-muted` | `#A5B5C0` | Cool blue-grey-light. Subtitles, helper text |
| `--surface` | `#051A24` | Near-navy / deep blue-charcoal. Main background |
| `--surface-raised` | `#0E2A38` | Lifted blue-charcoal. Cards, panels |
| `--surface-sunken` | `#021018` | Recessed near-black-blue. Device chrome, sidebars |
| `--border` | `#1C3548` | Deep slate. Card borders |
| `--border-strong` | `#6A8FA0` | Mid blue-grey. Ghost-button outlines, focus rings |
| `--accent` | `#E27D60` | Coral (unchanged across modes — the constant) |
| `--accent-soft` | `#2E1D18` | Deep coral-brown. AI summary panel backgrounds in dark mode |
| `--accent-text` | `#E8A08A` | Light peach. Eyebrows + AI labels (light coral on dark bg) |
| `--accent-on` | `#051A24` | Near-navy. Text on top of coral CTAs in dark mode |

**Quick reference:** `docs/BRAND.md` for the engineering-facing copy-paste card.
**Live reference:** `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` for the six-surface visual proof.

### Why this won (Andrew's read at selection)

> *"I really like this color palette. I like the saturation without overwhelming the eyes, and this blue leans very closely toward my favorite color. The brownish and salmon are great accents."*

Translated into brand criteria:

- **Saturation/eye-strain trade.** `#1E3D54` is desaturated enough to read all day without fatigue (matters for tutors in 6-hour sessions), saturated enough to feel intentional rather than greige-default.
- **Personal alignment.** Founder loves blue. The brand is a long-lived asset; the founder shouldn't dread looking at it.
- **Accent harmony.** Coral `#E27D60` is the complementary-warm partner to slate-navy — they energize each other without fighting. Coral survived every elimination round across 6+ palette explorations, which says it earned its place.
- **Cream surface vs pure white.** `#F5F4EC` reads warm/inviting rather than clinical, which fits the "warm competent" brand-what-we-are while staying credible for dept-head buyers.
- **Dark mode is a real mood.** The near-navy `#051A24` dark surface is sophisticated-quiet (think "study at night with one lamp"), not generic dark-grey or oppressive black.

### Parked alternatives (in case a future re-evaluation is needed)

| Palette | Status | Why parked |
|---|---|---|
| F1 — Forest-Teal Bridge v2 (brand `#1E4D4A`) | Strong runner-up | Final comparison at scale (`palette-mocks-FINALISTS-comprehensive-F1-V4w-V2h.html`) showed the green tipped slightly toward "outdoor brand / hiking app" vs F2's "calm professional tool." If we ever decide green better matches a future product positioning (e.g. wellness, K-12 focus), F1 is the fallback. |
| F3 — Quieter Coral Bridge | Eliminated round 4 | Dialed-down coral lost the "this surface has personality" moment we want for AI content. |
| F4 — Softest Bridge | Eliminated round 4 | Combining every softening dial flattened the palette into greige territory. |
| MWW (Midnight Woodland Whimsy) + coral variants | Eliminated round 3 | Light mode lacked contrast even after the v2 patch; never made it past the family preference check. |
| Concept 3 (Warm Graphite Dark) | Eliminated round 2 | Pleasant but not distinctive enough — could be any modern dark-mode-first SaaS. |
| Mystic Waters | Eliminated round 2 | Too cool / corporate — failed the warmth requirement. |

Round-by-round exploration is preserved in `docs/brand-previews/archived/` for posterity.

### Per-org theming (Mynk Org / University pilot tie-in)

The Mynka Blue palette is the **default** brand. Per-org theming (Tufts blue, etc.) plugs into the same token surface via `[data-org="orgId"]` selectors — see `docs/DESIGN-TOKENS-PLAN.md` § *Per-org theming bonus* for the mechanism. Mynka Blue is what new orgs see before they apply their own colors.

---

## Pillar 3: typography — DECIDED

**Selected:** **V4 wordmark + V2 heading + Inter 400 body + JetBrains Mono labels.** Locked at the same selection moment as Pillar 2, on the F2 comprehensive mockup which used this exact pair.

### The full stack

| Role | Font | Settings |
|---|---|---|
| **Wordmark "Mynk·"** (V4) | Fraunces (variable) | `opsz 144`, `SOFT 60`, `wght 700` — soft + bold. The dot is `var(--accent)` coral. |
| **Headings** (V2 — `.heading` class) | Fraunces (variable) | `opsz 144`, `SOFT 0`, `wght 700` — crisp + bold |
| **AI prose** (AI-generated content surfaces) | Fraunces (variable) | `opsz 14`, `SOFT 30`, `wght 400` — soft, optical-size for reading. Differentiates AI-written content from UI chrome. |
| **Body text** | Inter | `font-weight: 400` (V2 body) — light, crisp |
| **Labels, surface numbers, eyebrows, timestamps** | JetBrains Mono | various sizes, uppercase, letter-spaced |

### Why this won

- **Fraunces variable axes carry the brand voice.** The same family does two jobs — soft-bold wordmark (intelligent-warm) AND crisp-bold heading (competent-direct) — by sliding the `SOFT` axis. One font load, two personalities.
- **Inter 400 body is the conservative choice on purpose.** Sarah reads a lot of small text (transcripts, recap drafts, dashboard stats). Inter at 400 stays light and crisp at small sizes. We considered 500; 400 won for long-form comfort.
- **JetBrains Mono for labels** keeps the timestamps, surface numbers, and "FOR PRIVATE TUTORS" eyebrows clearly *meta* — they read as system labels, not as competing brand voice.
- **AI prose in Fraunces low-`opsz` low-`SOFT`** is a structural design choice: every AI-generated surface (summary panels, recap previews, prose blocks) gets a serif voice that's visibly different from the sans UI. The user sees "AI wrote this" without us having to label it. Goes hand-in-hand with the "AI as helpful colleague" tone from Pillar 1.

### What this means for component refresh (Phase 3)

- Replace whatever font stack is currently loaded with: `Fraunces` variable + `Inter` variable + `JetBrains Mono`.
- All `next/font/google` calls need to declare `axes` for Fraunces so `SOFT` and `opsz` are accessible.
- Add reusable utility classes (`.wordmark`, `.heading`, `.ai-prose`) — exact CSS lives in `docs/BRAND.md` and in every brand-preview mockup.

### Parked alternatives

| Combo | Why parked |
|---|---|
| V3 wordmark (Fraunces 600, SOFT 50) | Slightly more refined; lost at the matrix stage because V4 had more presence at marketing-hero scale |
| V2 wordmark (crisp 700, no soft) | Too austere; lost the "warm" half of the brand-what-we-are |
| V3 heading (Fraunces 600) | Slightly lighter; lost crispness in dense dashboard contexts |
| V3 body (Inter 500) | Heavier body weight; tested in matrix round 6; lost long-form comfort |

---

## History

- **2026-05-19 ~10:00 AM** — Phase 2 walkthrough kicked off. Brand brief synthesized; corrections folded in (audience pain reframe, future-student possibility, mascot already iterating with Andrew's daughter).
- **2026-05-19 ~10:20 AM** — Pillar 1 (voice) locked as B + D-flavor split; pillar 4 (mascot) directionally locked with adaptive-brand-register forward-compat decision; pillar 2 (color) discussion begun.
- **2026-05-19 ~12:00 PM** — Color exploration moved into matrix form (rounds 4–6: 4 palette finalists × 4 typography variants). Body-weight nuance correction folded in (V2 = Inter 400 body, not 500).
- **2026-05-19 ~2:00 PM** — Comprehensive F2 × V4w+V2h mockup built across six product surfaces; F1 sibling built for green-at-scale comparison.
- **2026-05-19 ~2:50 PM** — **Decision moment.** Andrew locked F2 as **Mynka Blue** ("clear winner"). V4w+V2h typography pair locked as the de facto typography decision (the pair the comprehensive mock used). All four Phase 2 pillars now decided. Brand-preview archive restructured; canonical reference mock renamed `palette-mocks-FINAL-mynka-blue.html`. Unblocks `DESIGN-TOKENS-PLAN.md` Phase 1 (palette swap moves from "use placeholder Concept 3" to "use Mynka Blue").
- **2026-05-19 ~3:30 PM** — UX & A11y spec foundation written (`docs/UX-AND-A11Y-SPEC.md`) targeting **WCAG 2.2 Level AA**. Contrast audit revealed one BLOCKER: cream text on coral fill (light-mode CTA) fails at 2.76:1. Resolution pending — see UX-AND-A11Y-SPEC § 2.2 (recommended path: Option D — demote coral from CTA fills; brand-blue becomes the sole CTA fill color, coral persists for accents/live-dot/AI labels/eyebrow). Andrew confirmed **v1-from-scratch framing** — current IA, pages, tabs, and URL structure are fair game for full redesign. Open IA questions captured in UX-AND-A11Y-SPEC § 14 to be settled in the next Opus design session before per-surface specs land.
- **2026-05-19 ~3:45 PM** — Andrew added the **functionality-preservation addendum** as the highest-priority constraint on the v1 redesign. UX-AND-A11Y-SPEC now opens with a Pre-flight section before the conformance target: 10 carry-forward invariants (recorder lifecycle 3-pillar stack, B3 always-mount, library-agnostic event log, consent server-side enforcement, tokenized share links, ownership assertions, additive migrations, tight CSP), 10 better-safer patterns to generalize for new v1 surfaces (pure-function FSM, durable outbox, atomic end-of-X transactions, per-session ID logging, etc.), 13 anti-patterns to retire, and 10 design-time questions every per-surface spec must answer before any v1 design ships. The intent: prevent the "long smoke chain Sarah's pilot can't absorb" failure mode by encoding everything Phases 1–6 already paid to learn.
- **2026-05-19 ~4:30 PM** — **CTA contrast BLOCKER resolved: Option A — dark text on coral.** Andrew picked Option A after reviewing all four candidates side-by-side in `docs/brand-previews/cta-options-comparison.html`. Light-mode `--accent-on` changed from cream `#FCFBF4` (2.76:1, FAILS) to text-color `#15203A` (5.64:1, AA). Dark-mode `--accent-on` unchanged (already dark text on coral, 6.22 AA). Coral keeps its CTA role; only the text on top inverts to dark. Other options considered: B (burnt-coral fill, lost the bright-CTA energy), C (added a 4th coral hue, more tokens to manage), D (demote coral entirely — cleanest brand-voice argument but the up-next-card brand-blue-on-brand-blue problem made it a heavier Phase 1 design lift; Option A is token-cheapest and visually preserves the CTA energy that the prior brand exploration earned). Updates: `BRAND.md` token + warning section, `MYNK-BRAND-PHASE-2-DECISIONS.md` color table + this entry, `palette-mocks-FINAL-mynka-blue.html` `--accent-on` value, `UX-AND-A11Y-SPEC.md` § 2.2 marked resolved + § 15 row 1 marked resolved.
