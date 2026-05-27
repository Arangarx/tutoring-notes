# Design Tokens — UI Refresh Phase 0 plan

> *"People need to use the app with confidence. Sarah is being patient,
> but that won't last forever."* — [AGENTS.md](../AGENTS.md)

This is the **prerequisite** for the UI refresh. Phase 0 doesn't change
how anything looks. It changes the *mechanism* by which colors are applied,
so that picking the final palette later is a half-day job instead of a
3–5-day job, and so that the **Mynk Org / University pilot** can ship
per-institution branding without a parallel refactor.

If you're picking this up cold, read in order: this doc → grep the
codebase for the token names below → ship in the order in the
**Sequence** section.

> **2026-05-19 update — palette decision landed.** The "what palette do we
> swap to in Phase 1" question is now answered: **Mynka Blue** (see
> [`docs/BRAND.md`](BRAND.md) for the copy-paste tokens and
> [`docs/MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md)
> for the rationale). Phase 0 still has to happen first — tokenize the
> codebase before swapping the palette — but the placeholder
> "Concept 3 light" theme this doc previously referenced is replaced
> throughout with the **Mynka Blue light** values.

---

## Why Phase 0 exists

The palette is now decided (**Mynka Blue**, see
[`docs/BRAND.md`](BRAND.md)). But swapping it into the live app today
would still take 3–5 days because:

- `~40 component files` use inline `style={{ ... }}` objects with
  literal `rgba(255, 255, 255, 0.04–0.14)` for "subtle surface lift" —
  this assumes a dark background. On a light surface those styles are
  invisible.
- Slider thumbs, focus rings, and several brand decorations are
  hardcoded `#fff` or `#0b1020`.
- `globals.css` (line ~11) hard-bakes `color-scheme: dark` and notes
  explicitly that the `--color-*` token fallbacks are *light-mode*
  values that would be invisible without the dark vars defined —
  meaning dark mode is structurally load-bearing, not a theme variant.

After Phase 0 lands:

- Swap palette = edit one `:root` block in `globals.css` = ~30 min.
- Add light mode = edit a `[data-theme="light"]` block = ~30 min.
- Per-org theming for Mynk Org = write `data-org="orgId"` selector
  with overrides = first org is ~1 hour, subsequent orgs are
  ~10 minutes each.

The reliability bar: **Sarah's app must keep working pixel-identical
throughout Phase 0.** No visual changes. No flash-of-unstyled. No
regressions in the existing dark theme. The only observable effect
should be that hardcoded colors stop appearing in component files.

---

## Current state (audited 2026-05-19)

**Stack:** Next.js 15 + React 19 + vanilla CSS + CSS-in-JSX inline
styles. **No Tailwind. No shadcn/ui. No CSS-in-JS library.**

**Existing token layer** (in `src/app/globals.css`):

```css
:root {
  color-scheme: dark;
  accent-color: #7c5cff;
  --bg: #0b1020;
  --panel: rgba(255, 255, 255, 0.06);
  --text: rgba(255, 255, 255, 0.92);
  --muted: rgba(255, 255, 255, 0.7);
  --border: rgba(255, 255, 255, 0.12);
  --accent: #7c5cff;
  --color-muted: rgba(255, 255, 255, 0.65);
  --color-border: rgba(255, 255, 255, 0.18);
  --color-primary: #7c5cff;
  --color-success: #4ade80;
  --color-success-bg: rgba(34, 197, 94, 0.12);
  --color-success-border: rgba(34, 197, 94, 0.35);
  --color-error: #fca5a5;
  --color-error-bg: rgba(239, 68, 68, 0.12);
  --color-error-border: rgba(239, 68, 68, 0.35);
  --color-warning: #fde047;
  --color-warning-bg: rgba(234, 179, 8, 0.12);
  --color-warning-border: rgba(234, 179, 8, 0.4);
}
```

**Components do consume the tokens** (~28 `var(--token)` references
in `MicControls.tsx` alone), so the discipline is partially established.

**The gap** — what's NOT tokenized today:

| Pattern | What it encodes | Where | Count (rough) |
|---|---|---|---|
| `rgba(255, 255, 255, 0.04–0.14)` | "subtle surface on dark bg" | inline styles across components | ~60 instances |
| `rgba(0, 0, 0, 0.25–0.5)` | "shadow / overlay on dark bg" | inline styles + globals.css | ~30 instances |
| `#fff` literal | slider thumbs, brand decorations | recording, AV components | ~15 instances |
| Status color fallbacks like `#dc2626` `#16a34a` `#eab308` | red/green/amber semantic colors | meter, error states | ~10 instances |
| `#0b1020`, `#0d1328`, `#1a2558` | brand-specific dark hues | globals.css, drawer, admin nav | ~5 instances |
| `#7c5cff` | brand accent | `accent-color`, several active states | ~5 instances |

**Light mode does not exist.** No `[data-theme="light"]` selector
anywhere. Adding it requires defining the entire token set in a
light variant, which is exactly what Phase 0 does.

---

## Goal (definition of done)

Phase 0 is **done** when all five of these are true:

1. **Expanded token set is defined** in `src/app/globals.css` for both
   `[data-theme="dark"]` (current look, unchanged) AND
   `[data-theme="light"]` (new, populated with **Mynka Blue light** values
   from [`docs/BRAND.md`](BRAND.md) — no placeholder, the final values
   go in directly).
2. **All ~120 hardcoded inline colors** in components are replaced
   with `var(--token)` references. No `rgba(255,255,255,X)` or
   `rgba(0,0,0,X)` or bare hex values remain in `.tsx` files.
3. **A lint rule** blocks new hardcoded colors in `.tsx` / `.css`
   files (allowlist `globals.css` only).
4. **Visual diff is zero** against the current dark-mode-only app.
   Playwright visual regression tests pass without snapshot updates
   (or, where snapshots need updating, the only changes are anti-
   aliasing-level noise, not perceptible color shifts).
5. **Light-mode toggle works end-to-end.** Setting
   `<html data-theme="light">` in the browser devtools makes the
   app render the light palette across every page without breaking
   any component. This is the smoke test that proves Phase 1
   (palette swap) will be cheap.

---

## Target token taxonomy

These are the names every component will reference after Phase 0.
The grouping is intentional — semantic > literal — so palette swaps
don't require code edits beyond the `:root` block.

### Surface / structure

```css
--surface-base       /* page background */
--surface-1          /* primary card / panel */
--surface-2          /* raised element on top of surface-1 (hover, popover) */
--surface-3          /* highest elevation (modal, dropdown) */
--surface-inverse    /* opposite-mode surface (used for tooltips, etc.) */

--border-subtle      /* hairlines, table dividers */
--border-default     /* card/input borders */
--border-strong      /* focus-ring outer, emphasis */

--shadow-sm
--shadow-md
--shadow-lg
```

### Text

```css
--text-strong        /* headings, primary body */
--text-default       /* body text */
--text-muted         /* secondary, metadata, timestamps */
--text-disabled
--text-inverse       /* text on inverse surface */
```

### Brand / accent

```css
--brand              /* logo, wordmark, primary brand moments */
--brand-on           /* text/icon color on top of brand fills */

--accent             /* CTAs, active states, AI-content emphasis */
--accent-soft        /* tinted AI-content backgrounds, hover wash */
--accent-strong      /* hover/pressed of accent */
--accent-on          /* text/icon color on top of accent fills */
--accent-text        /* accent color tuned for readable text on surface */
```

### Status / semantic

```css
--success            /* text / icon */
--success-soft       /* background tint */
--success-border

--warning
--warning-soft
--warning-border

--error
--error-soft
--error-border

--info
--info-soft
--info-border
```

### Interaction

```css
--focus-ring         /* keyboard-focus outline (use var(--border-strong) per UX-AND-A11Y-SPEC § 5.1, NOT var(--accent) — focus ring must not double as a CTA color) */
--overlay-scrim      /* modal/drawer backdrops (currently rgba(0,0,0,0.5)) */
--selection          /* ::selection background */
```

### Recording / AV (existing semantic colors)

```css
--meter-quiet        /* current var(--color-muted) */
--meter-good         /* current var(--color-success) */
--meter-loud         /* current var(--color-warning) — replaces #eab308 */
--meter-clip         /* current var(--color-error) */
```

**Total: ~40 semantic tokens.** That's the surface area to define in
both `[data-theme="dark"]` and `[data-theme="light"]`. Plus the legacy
aliases (`--bg`, `--text`, `--muted`, `--border`, `--accent`,
`--panel`, `--color-*`) stay defined as aliases pointing at the new
names so we can migrate components incrementally without big-bang.

---

## Migration approach (incremental, not big-bang)

Big-bang refactors of 40 component files in a live app fail. The plan:

1. **Phase 0a — Token spec land** (~half-day). Edit `globals.css` to
   add the new token names AND keep old names as aliases. Existing
   components keep working because `--bg` is now just `var(--surface-base)`,
   etc. Add `[data-theme="light"]` block populated with the
   **Mynka Blue light** values from [`docs/BRAND.md`](BRAND.md). (Previous
   versions of this plan called for a placeholder Concept 3 palette; that
   placeholder step is now skipped because the final palette is decided.)
   Ship. Smoke test that nothing visually moved in dark mode (the
   live theme).

2. **Phase 0b — Light-mode regression harness** (~2 hours). Add a
   `data-theme` attribute toggle in dev (a hidden URL param like
   `?theme=light` or a localStorage flag) so we can A/B test light
   mode in every component WITHOUT shipping the toggle to users.
   Add a Playwright visual-regression test that snapshots the 5
   key surfaces (admin dashboard, student detail, recording bar,
   whiteboard workspace, share view) in both themes. Light-mode
   snapshots will be "ugly" because components still have hardcoded
   `rgba(255,255,255,X)` — that's the diff we're going to fix.

3. **Phase 0c — Component migration sweep** (~2–3 days, parallelizable).
   For each component file with hardcoded colors:
   - Replace `rgba(255, 255, 255, 0.04)` → `var(--surface-1)`
   - Replace `rgba(255, 255, 255, 0.08)` → `var(--surface-2)`
   - Replace `rgba(0, 0, 0, 0.4)` → `var(--shadow-md)`
   - Replace `#fff` (slider thumbs etc.) → `var(--text-inverse)` or
     `var(--surface-base)` depending on intent
   - Replace `#dc2626` `#16a34a` `#eab308` etc. → `var(--error)`,
     `var(--success)`, `var(--meter-loud)`
   - Verify the light-mode visual snapshot moves toward "looks
     correct," not "stays broken."

   This is the heaviest phase. Can be split across a few sessions
   or delegated to a subagent with the file list as input. Each
   file's migration is independently reviewable.

4. **Phase 0d — Lint rule** (~2 hours). Add an ESLint rule that
   flags any `rgba(`, `hsl(`, or `#[0-9a-f]{3,6}` literal in
   `.tsx`/`.css` files outside `globals.css` and the brand-preview
   mockup files. New violations block PRs.

5. **Phase 0e — Acceptance** (~1 hour). Manually walk through every
   page in dark mode (baseline, unchanged) and light mode (now showing
   **Mynka Blue light**). Cross-check against
   [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](brand-previews/palette-mocks-FINAL-mynka-blue.html)
   to confirm the in-app surfaces feel like the reference mockup. No
   layout breaks, no invisible text, no missing focus rings. Update the
   Playwright snapshots to capture the now-clean light-mode baseline.

**Total: ~4–5 person-days of focused work, parallelizable to 2–3
calendar days if Phase 0c is split.**

---

## Anti-regression: the lint rule

Concrete rule for `eslint.config.mjs` (or `.eslintrc`):

```js
{
  files: ["src/**/*.{ts,tsx,js,jsx,css}"],
  ignores: ["src/app/globals.css", "docs/brand-previews/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/#[0-9a-fA-F]{3,8}/]",
        message: "Use a design token from globals.css (e.g., var(--accent)) instead of a hardcoded hex color. See docs/DESIGN-TOKENS-PLAN.md."
      },
      {
        selector: "Literal[value=/rgba?\\(/]",
        message: "Use a design token from globals.css instead of an inline rgba() value. See docs/DESIGN-TOKENS-PLAN.md."
      }
    ]
  }
}
```

(The ESLint selector for template literals containing colors is
trickier — a simpler practical version is a CI grep step that fails
the build if new hardcoded colors appear in PR diffs. Either works;
pick whichever the team will actually keep on.)

---

## Per-org theming bonus (Mynk Org / University pilot tie-in)

Once Phase 0 is complete, per-org theming is **nearly free**:

```css
/* Default brand — Mynka Blue */
[data-theme="light"] {
  --brand:    #1E3D54;  /* Mynka Blue */
  --accent:   #E27D60;  /* coral */
  --surface:  #F5F4EC;  /* cream */
  /* ... full token set from docs/BRAND.md ... */
}

/* Tufts pilot org */
[data-theme="light"][data-org="tufts"] {
  --brand:    #3E8EDE;  /* Tufts blue */
  --accent:   #B8A05B;  /* Tufts gold */
  /* surfaces inherit Mynka cream unless org wants their own */
}
```

The Mynk Org backlog includes "let universities apply their own colors";
Phase 0 makes that a 2-line CSS change per institution instead of a
2-week refactor. **This is the strongest single argument for doing Phase
0 before Phase 1.**

---

## Sequence (concrete steps, in order)

| # | Step | Owner type | Est | Deliverable |
|---|---|---|---|---|
| 1 | Read this doc + read `globals.css` + read 2 sample components | Orchestrator | 30m | shared mental model |
| 2 | Draft expanded token set in `globals.css` (both themes); keep old names as aliases | Executor | 4h | PR 1 (no visual change) |
| 3 | Add `data-theme` URL-param toggle in `<html>` root (dev-only) | Executor | 1h | folded into PR 1 |
| 4 | Add Playwright snapshots for 5 key surfaces × 2 themes | Executor | 2h | PR 2 (baseline snapshots) |
| 5 | Migration sweep: components A–H (recording, AV) | Executor | 1d | PR 3 |
| 6 | Migration sweep: components I–N (notes, share, whiteboard) | Executor | 1d | PR 4 |
| 7 | Migration sweep: components O–Z (admin, settings, misc) | Executor | 1d | PR 5 |
| 8 | Add lint rule (or CI grep step); fix any remaining offenders | Executor | 2h | PR 6 |
| 9 | Manual walkthrough in both themes; update Playwright baseline | Orchestrator | 1h | PR 7 (snapshot refresh) |
| 10 | Update `docs/BACKLOG.md` to mark Phase 0 done; write `DESIGN-TOKENS-STATUS.md` for handoff | Orchestrator | 30m | doc PR |

PRs are small and reviewable. Migration PRs can run in parallel if
the components don't overlap.

---

## Adversarial review (per AGENTS.md reliability bar)

Every feature plan in this repo gets reviewed against the 5
reliability axes. Folded findings into the plan above so they're
not deferred to follow-ups.

| Axis | Risk | Mitigation (already in plan) |
|---|---|---|
| **Data integrity** | None — CSS-only change, no DB writes, no user-data path. | N/A |
| **Backwards compatibility** | High. Existing components could break visually for Sarah mid-migration. | Old token names kept as aliases (Phase 0a). Migration is per-component, each PR is independently revertable. Playwright snapshots catch visual diffs before they ship. |
| **Performance** | Negligible. CSS custom property resolution is cheap. No new JS, no new network. | N/A |
| **Error visibility** | Medium. A missing token resolves to "invalid" silently — text becomes default-black on default-white, very hard to spot in code review. | The Playwright dual-theme snapshot test (step 4) makes any unintentional color reset visible immediately. Per-PR review should also grep for new `var(--` references that don't have matching definitions. |
| **Recoverability** | High. Each migration PR is independently revertable. The lint rule can be temporarily disabled if a hotfix needs to land. | Document the rollback path: "revert PR N, redeploy, theme returns to whatever the previous globals.css said." |

**Per-session ID logging** (AGENTS.md convention): N/A for this work
— no new runtime feature surface that needs prefix logging. Existing
prefixes (`rid`, `wbsid`, `obx`, `snp`, `pvw`) are untouched.

**CSP impact:** None. No new external origins, no new fonts, no
new image hosts.

**Migration safety:** None (no DB migrations).

---

## What this plan does NOT cover

Out of scope for Phase 0:

- ~~**Picking the final palette.**~~ ✅ **Decided 2026-05-19: Mynka Blue.**
  See [`docs/BRAND.md`](BRAND.md). Phase 1 below is now "swap in Mynka Blue
  values," not "wait for family to decide."
- **Typography refresh** is now also decided (Fraunces V4 wordmark +
  Fraunces V2 heading + Inter 400 body + JetBrains Mono labels — see
  [`docs/BRAND.md`](BRAND.md)). Phase 2 of the broader UI refresh below
  ships the typography changes; this Phase 0 plan stays color-only.
- **Spacing / radius / motion tokens.** Worth adding eventually but
  not blocking the color question.
- **Component refresh** (new card visuals, hero sections, etc.).
  That's the Phase 3+ "actual UI refresh" work — Phase 0 just makes
  it cheap.
- ~~**Tailwind migration.**~~ ✅ **Reversed 2026-05-19** — per
  `docs/UX-REFRESH-PLAN.md` § Phase 0 (decided 2026-05-17), Tailwind 4
  + shadcn/ui land *with* the brand tokens, not later. Reason: Phase 1+
  (the actual visual + flow redesign) needs the shadcn primitive set
  (`Card`, `Button`, `Sheet`, `Dialog`, `Toast`, etc.); without it
  every component is hand-rolled. Tailwind v4's `@theme` block IS
  CSS variables, so the tokens defined here drop into a Tailwind
  config one-for-one. An earlier section of this doc suggested
  "defer Tailwind"; that advice was made without reading the
  UX-refresh plan and is superseded.
- **User-facing theme toggle.** The `data-theme` toggle in Phase 0b
  is dev-only. Whether to expose a user-facing light/dark switch is
  a Phase 2+ decision, after we've seen which mode the family picks
  as default.

---

## How this connects to the broader UI refresh

```
Phase 0  [THIS PLAN]
  └── Tokenize. No visual change. Foundation.

Phase 1  Palette swap
  └── Edit globals.css :root blocks. ~half-day.
       Picks one of the 10 finalists.

Phase 2  Typography + tone
  └── Wordmark, heading scale, link styles.

Phase 3  Component refresh
  └── Card visuals, hero patterns, dashboard density.
       Each component migrates incrementally.

Phase 4  Mascot integration
  └── Mink illustrations appear in onboarding,
       empty states, AI-content surfaces.

Phase 5  Marketing surfaces
  └── Landing page, OAuth screen, share view,
       email templates aligned to brand.
```

Phase 0 unblocks Phases 1 and 3. It doesn't need to wait for
the palette decision; the placeholder light theme can be Concept 3
and we swap it later in one PR.

---

## Open questions for Andrew before kickoff

1. **Default-mode question.** When Phase 1 ships, should the app
   default to light or dark for a new user? Sarah uses dark today;
   her students will see whatever we default to on the share view.
   The Mynka Blue light surface is what was designed against in the
   reference mockup, but switching Sarah's default is a separate
   call.
2. **Sub-agent delegation.** Phase 0c is the perfect Composer 2.5
   job — mechanical, well-bounded, file-by-file. Worth setting up
   when you have a quiet morning, OR doing in one focused session.
3. ~~**Palette decision blocking.**~~ ✅ Resolved 2026-05-19 — Mynka
   Blue is locked. Phase 0 is now unblocked from the brand-decision
   side; the only question is when to start the engineering work.
