# Mynk brand — engineering quick reference

> **This is a copy-paste card.** Decision rationale, parked alternatives, and
> the "why this won" narrative live in
> [`docs/MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md).
> Visual proof at six product surfaces lives in
> [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](brand-previews/palette-mocks-FINAL-mynka-blue.html).
> Token-migration plan (how this gets into the app) lives in
> [`docs/DESIGN-TOKENS-PLAN.md`](DESIGN-TOKENS-PLAN.md).

**Decided 2026-05-19.** All four Phase 2 brand pillars locked.

---

## TL;DR

| Pillar | Decision |
|---|---|
| Color palette | **Mynka Blue** — brand `#1E3D54`, coral accent `#E27D60`, warm cream surfaces |
| Wordmark | Fraunces 700 with `SOFT 60` (V4 — soft + bold) — the "Mynk·" lockup |
| Headings | Fraunces 700 with `SOFT 0` (V2 — crisp + bold) |
| AI prose | Fraunces 400 with `opsz 14, SOFT 30` — small-text serif for AI-generated content |
| Body text | Inter 400 (V2 body — light, crisp, long-form friendly) |
| Labels / timestamps | JetBrains Mono, uppercase, letter-spaced |
| Voice | "Helpful colleague" (Option B) for product, "smart-friend playful" (Option D) for marketing |
| Mascot | Mink-on-pencil, geometric/minimalist, used as logo + loader animations (no large mascot illustrations) |

---

## CTA contrast — RESOLVED 2026-05-19 (Option A)

The light-mode CTA combination is now **dark text on coral** (`--accent-on` = `#15203A` in light mode, was `#FCFBF4` cream). Ratio 5.64:1 — passes WCAG SC 1.4.3 AA. Coral keeps its CTA role; text on top inverts to dark. Dark mode unchanged (already dark text on coral, 6.22 AA). See `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` § History 2026-05-19 PM for the rationale + the four candidates considered.

---

## Tailwind + shadcn — also coming in this migration

This file shows the raw CSS-variable values, but the actual Phase 0 implementation (per [`docs/UX-REFRESH-PLAN.md`](UX-REFRESH-PLAN.md) § Phase 0) installs **Tailwind 4 + shadcn/ui** alongside these tokens. Tailwind v4's `@theme` block IS CSS variables — the values in this file map directly to Tailwind theme entries (e.g., `--color-brand` becomes `bg-brand` / `text-brand` utilities). Component-level styling will use shadcn primitives + Tailwind utilities; the CSS variables stay as the canonical source of brand truth.

This corrects an earlier note in this file that suggested deferring Tailwind. The earlier note was made without reading `UX-REFRESH-PLAN.md`; the v1 redesign genuinely needs the shadcn primitive set.

---

## Color tokens — copy this into `globals.css`

### Mynka Blue · light mode (default)

```css
:root {
  /* Brand */
  --brand:           #1E3D54;  /* Mynka Blue — the named brand hex */
  --brand-on:        #FCFBF4;  /* text/icon on top of brand fills */

  /* Text */
  --text:            #15203A;  /* headings + primary body */
  --text-muted:      #5A6877;  /* subtitles, helper text, timestamps */

  /* Surfaces */
  --surface:         #F5F4EC;  /* page bg — warm cream */
  --surface-raised:  #FCFBF4;  /* cards, panels (lifted cream) */
  --surface-sunken:  #ECEBE1;  /* device chrome, sidebars, inset wells */

  /* Borders */
  --border:          #C5CFD0;  /* default card/panel borders, dividers */
  --border-strong:   #4A6680;  /* ghost-button outlines, focus rings */

  /* Accent — coral / salmon */
  --accent:          #E27D60;  /* live dot, AI bars, mic ring, CTA fill */
  --accent-soft:     #F8E0D6;  /* AI summary panel bg, soft-coral halos */
  --accent-text:     #8A3C25;  /* burnt-coral for eyebrows + AI labels */
  --accent-on:       #15203A;  /* DARK TEXT on top of coral CTA — 5.64 AA. See MYNK-BRAND-PHASE-2-DECISIONS § History 2026-05-19 (Option A). */

  /* Page chrome (outside device frames in mockups; rarely needed in-app) */
  --page-bg-light:   #EBE9E0;
}
```

### Mynka Blue · dark mode (toggle via `[data-theme="dark"]`)

```css
[data-theme="dark"] {
  --brand:           #7EA4B1;  /* lifted blue-grey, readable on near-navy */
  --brand-on:        #051A24;

  --text:            #F0EDE4;  /* warm off-white */
  --text-muted:      #A5B5C0;

  --surface:         #051A24;  /* near-navy, deep blue-charcoal */
  --surface-raised:  #0E2A38;
  --surface-sunken:  #021018;

  --border:          #1C3548;
  --border-strong:   #6A8FA0;

  --accent:          #E27D60;  /* coral is the constant across modes */
  --accent-soft:     #2E1D18;  /* deep coral-brown for AI panel bg */
  --accent-text:     #E8A08A;  /* light peach for eyebrows/labels */
  --accent-on:       #051A24;

  --page-bg-dark:    #02080D;
}
```

Token names align with the taxonomy in
[`docs/DESIGN-TOKENS-PLAN.md`](DESIGN-TOKENS-PLAN.md) § *Target token
taxonomy*. If a name there is more specific (e.g. `--surface-base`,
`--surface-1`, `--surface-2`), use that; this card is the brand-color
*values*, the plan is the token *structure*.

---

## Typography — copy this into `globals.css` + font loading

### Font loading (Next.js)

```ts
// src/app/fonts.ts (or wherever next/font/google calls live)
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],   // critical — without this we can't slide SOFT
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
```

### CSS — reusable typography classes

```css
:root {
  --font-display: "Fraunces", "Iowan Old Style", Georgia, serif;
  --font-body:    "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

html, body {
  font-family: var(--font-body);
  font-weight: 400;  /* V2 body weight */
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* V4 — wordmark "Mynk·" (soft + bold) */
.wordmark {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 60, "wght" 700;
  color: var(--brand);
  letter-spacing: -0.025em;
  line-height: 0.95;
}
.wordmark .dot { color: var(--accent); margin-left: 1px; }

/* V2 — headings (crisp + bold) */
.heading {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 0, "wght" 700;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.12;
}

/* AI prose — visibly different from sans UI chrome */
.ai-prose {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 14, "SOFT" 30, "wght" 400;
  color: var(--text);
  line-height: 1.55;
}

/* Mono labels — timestamps, eyebrows, surface tags */
.label-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
```

---

## Voice (Pillar 1) — at a glance

| Surface | Tone | Example |
|---|---|---|
| Signup / auth / settings / admin | B (helpful colleague) | "Let's get your account set up." |
| Dashboard / session list | B with occasional D | "Good afternoon, Sarah." / "Three sessions waiting for a recap." |
| Recording UI / live session | B (calm, doesn't break flow) | "Recording. We'll handle the notes." |
| Error / recovery | B (reassuring, never blame the user) | "We lost connection for a moment. Your audio is safe — uploading now." |
| Landing page hero | D (whimsy + mascot) | "You teach. Mynk takes the notes." |
| Marketing copy / blog | D leaning B | "Sarah teaches algebra. Mynk takes notes. Nobody forgets the homework." |
| Social posts | D (mascot can flex) | — |
| Transactional email | B | — |

Full rationale: [`MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md) § *Pillar 1*.

---

## Mascot (Pillar 4) — at a glance

- **Mink-on-pencil**, geometric/minimalist, light editorial polish.
- **Used:** logo mark, loading/transcribing/uploading animations (mink "doing the work"), easter-egg micro-moments.
- **Not used:** large mascot illustrations dominating any product surface, chibi/big-eye styling, sticker-pack energy.
- **Adaptive register:** designed as a token primitive (`brand-energy: "adult" | "young"`) so a future kid-facing mode can flex cartoonier without retrofit.
- Mascot name: TBD (Andrew's daughter has naming input).

Full rationale: [`MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md) § *Pillar 4*.

---

## What lives where (file map)

```
docs/
├── BRAND.md                                ← you are here (quick reference)
├── MYNK-BRAND-PHASE-2-DECISIONS.md         ← canonical decisions + rationale
├── MYNK-BRAND-CAPTURE-CHECKLIST.md         ← digital asset acquisition status
├── MYNK-BRAND-NAME-VALIDATION-NOTES.md     ← name validation (Phase 1)
├── DESIGN-TOKENS-PLAN.md                   ← how brand gets into the app (Phase 0+1)
├── UX-REFRESH-PLAN.md                      ← broader UX refresh roadmap
└── brand-previews/
    ├── palette-mocks-FINAL-mynka-blue.html ← live visual reference (6 surfaces)
    └── archived/                            ← all earlier exploration mocks
```

---

## When to update this card

This file should be edited if and only if:

1. **A token value changes** (e.g. a hex gets nudged after real-world testing).
   Update the value here AND in the application's `globals.css` in the
   same PR.
2. **A new token gets added** to the brand surface (e.g. a `--success`
   that needs a brand-aware tint).
3. **The brand decision itself changes.** This is a load-bearing
   decision — changing it requires updating
   [`MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md)
   first, then mirroring here, then planning the migration via
   [`DESIGN-TOKENS-PLAN.md`](DESIGN-TOKENS-PLAN.md).

For typo fixes or doc improvements, just edit. For value changes, file a
PR with a screenshot of the new mockup or affected surface.
