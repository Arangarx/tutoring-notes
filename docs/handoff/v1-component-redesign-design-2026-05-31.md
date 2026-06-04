# v1 Component Redesign — Design Document
**Authored:** 2026-05-31 (Composer 2.5 subagent, dispatched by Opus orchestrator)
**Deliverable type:** Design document only — no production code touched
**Continues:** [`docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md`](v1-design-session-2026-05-19-pm-orchestrator-report.md)
**Andrew reviews in morning — this is the per-surface spec that was planned May 19 but deferred.**

> **Executor note:** This document is the primary briefing for Composer 2.5 execution dispatches. Every section is structured as a concrete spec, not a brainstorm. Read §8 (Open Questions) before making any Andrew-gated decision.

---

## §1. Executive Summary

### What this delivers

The May-19 Opus design session locked brand decisions (palette, typography, voice) and resolved the CTA contrast blocker, but deferred all per-surface specs because the scheduling-in-v1 question was unresolved. That question was answered on 2026-05-26: **no scheduling in v1; Mynk = tutoring-delivery layer only.** This document picks up exactly where the May-19 report ended — delivering the per-surface specs that were listed as "NOT produced" — and extends them with the reliability redesign findings from 2026-05-27.

### The current-state gap

A "UX refresh Phase 0" ran and produced:

| Gap | Current state | Status |
|---|---|---|
| Light-mode token recolor | `tokens.css` light palette = approved Mynka Blue | ✅ Done |
| Dark-mode Mynka Blue palette | `tokens.css` dark = legacy purple `#7c5cff` | ❌ Never implemented |
| Font stack (Fraunces + Inter + JetBrains Mono) | Not loaded anywhere in the app | ❌ Never implemented |
| Component redesign | All components unchanged — only recolored | ❌ None done |
| IA / URL restructure | All routes still under `/admin/students/...` depth | ❌ None done |

Andrew's stated preference: dark mode is his **favorite**. This doc treats it as a first-class design surface, not an afterthought.

### How this continues the May-19 plan

The May-19 report described two deliverables that never landed:
- `docs/UX-DESIGNS-PHASE-1.md` (8 public surfaces)
- `docs/UX-DESIGNS-PHASE-2.md` (tutor surfaces)

This document supersedes both planned files with a single, more complete spec that:
1. Folds in the 2026-05-27 reliability redesign findings (mobile-first student layout, session log, solo mode, URL restructure)
2. Reconciles §14–15 open IA questions against Sarah's confirmed answers (scheduling=no, anchor noun=session)
3. Covers both public and tutor surfaces in one place (fewer hand-offs)

### Phased path (overview)

| Phase | Scope | Risk |
|---|---|---|
| **A — Foundations** | Dark-mode tokens + fonts (no IA change, no component change) | Low |
| **B — Per-surface component redesign** | Redesign component by component, starting with public surfaces → dashboard → workspace | Medium |
| **C — IA / URL restructure** | URL renames + 301 redirects + OAuth coordination | High (Andrew-gated, coordinated deploy) |
| **D — V1 gap-close (required for V1)** | Landing/hero marketing page redesign + net-new `/about` route | Medium (design pass needed; dedicated follow-up phase acceptable) |

Phases A and B can run in parallel with Wave 1 reliability work on separate branches. Phase C is gated on Andrew ratifying the URL proposals in §2 and coordinating the OAuth callback deploy. **Phase D** ships before V1 launch (Andrew 2026-06-01) — may run as its own sub-pass after B/C surfaces are stable.

**Nav redesign — NOT pulled forward (Andrew 2026-06-01):** global nav / IA chrome redesign is **not** a standalone early pass. It lands with the real surface redesign per §5.1 (dashboard), §5.2 (student list), §5.10 (settings), and the corresponding B batches (B3–B6) — do not re-litigate.

---

## §2. IA / URL Restructure Proposal

> **🚩 FLAG FOR ANDREW RATIFICATION** — every decision in this section is proposed, not locked. Andrew explicitly said he wants URLs matching user verbs. This section surfaces the proposal for him to ratify or revise. Phase C is hard-blocked until he does.

### 2.1 Driving principles

1. **Session is the anchor noun** — confirmed by Sarah 2026-05-26. URLs lead with `/sessions/[id]`, not `/admin/students/[id]/whiteboard/[id]/workspace`.
2. **User verbs, not system nouns** — Sarah says "start a session," "look up notes," "send a recap." She doesn't say "navigate to admin."
3. **Flat, not deep** — the current `/admin/students/[id]/whiteboard/[id]/workspace` depth is an engineering accident. Three IDs in one URL is too much.
4. **Org forward-compat** — nav must accommodate a future `[Org name] ▾` switcher in the top-left. URLs must allow `/org/[id]/sessions/[id]` additive scoping without collision.
5. **301 redirects for every public-facing route** — parent share links and student join links are already in Sarah's messages to families. Any rename breaks those unless 301 redirects land *first*.

### 2.2 Current → proposed URL map

| Current route | Proposed route | Redirect? | Notes |
|---|---|---|---|
| `/` | `/` | — | **Landing/marketing page — V1 redesign required** (Phase D; was "unchanged" pre-2026-06-01) |
| `/login` | `/login` | — | Keep |
| `/signup` | `/signup` | — | Keep |
| `/forgot-password` | `/forgot-password` | — | Keep |
| `/reset-password` | `/reset-password` | — | Keep |
| `/setup` | `/setup` | — | Keep |
| `/privacy` | `/privacy` | — | Keep (legal facade) |
| `/terms` | `/terms` | — | Keep (legal facade) |
| `/feedback` | `/feedback` | — | Keep |
| — | `/about` | NEW | Product/about page — **V1-required** (Phase D; net-new route, not previously planned) |
| `/w/[joinToken]` | `/join/[token]` | 301: `/w/*` → `/join/*` | "Join" is the verb Sarah says to students. Token extraction unchanged. |
| `/s/[token]` | `/share/[token]` | 301: `/s/*` → `/share/*` | Cleaner URL for parents, still tokenized. |
| `/s/[token]/all` | `/share/[token]/all` | 301 | |
| `/s/[token]/whiteboard/[id]` | `/share/[token]/whiteboard/[id]` | 301 | |
| `/admin` | `/` (post-login redirects to dashboard) | Auth redirect | "Admin" prefix removed from tutor-facing paths |
| `/admin/students` | `/students` | 301 | Roster management |
| `/admin/students/[id]` | `/students/[id]` | 301 | Student detail |
| `/admin/students/[id]/notes` | `/students/[id]/notes` | 301 | |
| `/admin/students/[id]/whiteboard/[id]` | `/sessions/[id]` | 301 | Session review/replay — session ID is the sole key |
| `/admin/students/[id]/whiteboard/[id]/workspace` | `/sessions/[id]/workspace` | 301 | Live workspace |
| `/admin/settings` | `/settings` | 301 | |
| `/admin/settings/email` | `/settings/email` | 301 | |
| `/admin/settings/profile` | `/settings/profile` | 301 | |
| `/admin/settings/billing` | `/settings/billing` | NEW (Wave 2.5) | Rounding defaults + timezone |
| `/admin/feedback` | `/feedback` (or `/settings/feedback`) | 301 | |
| `/admin/outbox` | `/outbox` | 301 | Internal/debug; keep accessible |
| `/admin/waitlist` | `/waitlist` | 301 | |
| — | `/sessions` | NEW | All sessions (session log surface, Wave 3 UI) |
| — | `/session-log` | Alias for `/sessions` | Sarah's vocabulary: "log the time" |

### 2.3 New routes (additive — no redirects needed)

| New route | Purpose | Wave |
|---|---|---|
| `/about` | Product/about page (company story, trust, pilot positioning) | **V1 — Phase D** (design pass TBD) |
| `/sessions` | Session list + billing log view | W3 UI (W2.5 data) |
| `/sessions/[id]/workspace` | Live workspace (new URL for existing workspace) | W3 (with 301 from old) |
| `/settings/billing` | Rounding defaults, timezone, billing format | W2.5 |
| `/join/[token]` | Student join (new URL for existing `/w/[token]`) | W3 (with 301 from old) |
| `/share/[token]` | Parent share (new URL for existing `/s/[token]`) | W3 (with 301 from old) |

### 2.4 Org forward-compat path (Phase 12, additive)

When org features ship, these routes are added **without** changing any current route:

```
/org/[orgId]/sessions/[id]          → org-scoped session
/org/[orgId]/students               → org's student roster
/org/[orgId]/settings               → org-level settings
```

The nav's top-left area will host `[Mynk wordmark] · [Org name ▾]` (org switcher). In solo mode (most tutors), the org switcher is absent — the space just holds the wordmark. No layout change needed when the org switcher is added.

### 2.5 OAuth callback coordination (**BLOCKER for Phase C deploy**)

The NextAuth callback route `/api/auth/callback/google` is registered in Google Cloud Console. The `/api/auth/[...nextauth]` route itself doesn't move, so there is no OAuth callback change needed for the URL restructure proposed above. The `/admin/` prefix removal only affects UI routes, not `/api/` routes.

> **⚠️ FLAG Q-1 FOR ANDREW:** Confirm: is the OAuth callback URL hardcoded in Google Cloud Console as a specific base domain (e.g. `https://usemynk.com/api/auth/callback/google`) or a wildcard? If the domain changes as part of v1 launch, that IS an OAuth-coordinated deploy. If the domain stays the same (just the `/admin/` prefix is removed from UI routes), no OAuth change is needed.

### 2.6 301 redirect implementation plan

In Next.js 15, permanent redirects go in `next.config.js`:

```js
// next.config.js — redirects block
async redirects() {
  return [
    // Student join
    { source: '/w/:token', destination: '/join/:token', permanent: true },
    // Parent share
    { source: '/s/:token', destination: '/share/:token', permanent: true },
    { source: '/s/:token/all', destination: '/share/:token/all', permanent: true },
    { source: '/s/:token/whiteboard/:sid', destination: '/share/:token/whiteboard/:sid', permanent: true },
    // Tutor routes (admin prefix removal)
    { source: '/admin/students/:path*', destination: '/students/:path*', permanent: true },
    { source: '/admin/settings/:path*', destination: '/settings/:path*', permanent: true },
    { source: '/admin/feedback', destination: '/feedback', permanent: true },
    { source: '/admin/outbox', destination: '/outbox', permanent: true },
    { source: '/admin/waitlist', destination: '/waitlist', permanent: true },
    { source: '/admin', destination: '/', permanent: true },
    // Session URL flattening (studentId+sessionId → sessionId only)
    // These require server-side lookup: old URL has studentId + wsid → redirect to /sessions/wsid
    // Implementation: middleware reads wsid from path, verifies ownership, 301s to /sessions/wsid
  ];
}
```

> **⚠️ FLAG Q-2 FOR ANDREW:** The session URL flattening (`/admin/students/[id]/whiteboard/[wsid]` → `/sessions/[wsid]`) requires the whiteboard session ID to be globally unique (not scoped to student). Confirm this is already the case in the Prisma schema. If `WhiteboardSession.id` is globally unique (standard Prisma cuid), the redirect middleware is straightforward.

### 2.7 Phase C deploy sequence

1. **Freeze**: No new `/admin/` routes for 2 weeks before Phase C.
2. **Implement 301 redirects** in a dedicated branch.
3. **Deploy to Preview** — verify every old URL gets a 301 (automated Playwright test: `GET /admin/students → expect 301`).
4. **Brief Sarah** — let her know the URL prefix is changing (in case she has any bookmarks). Her parent-share and student-join links will auto-redirect.
5. **Deploy to Production** with redirects first, then update all internal links in the same deploy.
6. **OAuth confirmation** — per §2.5 flag, if domain unchanged, no action needed.

---

## §3. Typography Implementation Spec

### 3.1 Font loading — `src/app/fonts.ts`

```ts
// src/app/fonts.ts
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

// Fraunces variable — wordmark, headings, AI prose
// CRITICAL: declare both SOFT and opsz axes so font-variation-settings can slide them
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],       // required — without this, SOFT=0 always (V2 only)
  weight: ["400", "700"],        // regular for ai-prose, bold for wordmark/heading
  display: "swap",               // FOUT mitigation: text visible immediately in fallback
});

// Inter variable — body text
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500"],        // 400 for body (V2); 500 reserved for emphasis if needed
  display: "swap",
});

// JetBrains Mono variable — labels, timestamps, eyebrows
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});
```

**Wire into `layout.tsx`:**

```tsx
// src/app/layout.tsx
import { fraunces, inter, jetbrainsMono } from "./fonts";

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

### 3.2 CSS typography utilities — `src/styles/typography.css` (new file)

```css
/* -------------------------------------------------- */
/* Font stack CSS vars — resolve from next/font vars  */
/* -------------------------------------------------- */
:root {
  --font-display: var(--font-display, "Fraunces", "Iowan Old Style", Georgia, serif);
  --font-body:    var(--font-body, "Inter", ui-sans-serif, system-ui, -apple-system,
                    "Segoe UI", Roboto, sans-serif);
  --font-mono:    var(--font-mono, "JetBrains Mono", ui-monospace, "SF Mono",
                    Menlo, Consolas, monospace);
}

html, body {
  font-family: var(--font-body);
  font-weight: 400;
  font-size: 16px;           /* SC 1.4.4: 200% zoom must still reflow */
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* ============================= */
/* V4 WORDMARK — "Mynk·"        */
/* Fraunces: opsz 144, SOFT 60  */
/* ============================= */
.wordmark {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 60, "wght" 700;
  color: var(--brand);
  letter-spacing: -0.025em;
  line-height: 0.95;
  user-select: none;
}
.wordmark .wordmark-dot {
  color: var(--accent);
  margin-left: 1px;
}

/* ============================== */
/* V2 HEADING — crisp + bold      */
/* Fraunces: opsz 144, SOFT 0     */
/* ============================== */
.heading {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 144, "SOFT" 0, "wght" 700;
  color: var(--text-default);
  letter-spacing: -0.02em;
  line-height: 1.12;
}

/* ============================================== */
/* AI PROSE — differentiates AI-generated content */
/* Fraunces: opsz 14, SOFT 30 — small-text serif  */
/* ============================================== */
.ai-prose {
  font-family: var(--font-display);
  font-variation-settings: "opsz" 14, "SOFT" 30, "wght" 400;
  color: var(--text-default);
  line-height: 1.55;        /* Fraunces at small opsz reads denser — use 1.55 not 1.5 */
  max-width: 65ch;          /* SC 1.4.8 line length guideline */
}

/* ================================= */
/* MONO LABEL — timestamps, eyebrows */
/* ================================= */
.label-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

/* ========================= */
/* UTILITY CLASSES           */
/* ========================= */
.tabular-nums  { font-variant-numeric: tabular-nums; }
.text-balance  { text-wrap: balance; }     /* headlines only */
.text-pretty   { text-wrap: pretty; }      /* body paragraphs */
```

### 3.3 Where AI prose applies

The `.ai-prose` class (Fraunces serif, small optical size, SOFT 30) is used on **every AI-generated surface**. The user visually distinguishes "Mynk wrote this" from "UI chrome" without needing a label.

| Surface | Applies? | Notes |
|---|---|---|
| AI-generated recap sections (Topics, Plan, Summary) | ✅ Yes | Full body text in recap editor |
| AI summary panel in live session | ✅ Yes | The live transcript is auto-scroll, not editable |
| Parent share view recap content | ✅ Yes | Parent sees same serif AI voice |
| Transcript display (live + replay) | ❌ No | Transcript is verbatim speech — use Inter body |
| Dashboard descriptions, headings | ❌ No | UI chrome |
| Student notes (tutor-written) | ❌ No | Tutor's voice, use Inter |

### 3.4 FOUT / CLS mitigation strategy

`display: "swap"` on all three fonts ensures text renders immediately in system fallback while Fraunces/Inter/JetBrains Mono download. The fallback stacks are chosen to minimize layout shift:

- Fraunces fallback → `"Iowan Old Style", Georgia, serif` (similar x-height, similar serif weight — CLS minimal)
- Inter fallback → `ui-sans-serif, system-ui, -apple-system` (system fonts closely match Inter metrics)
- JetBrains Mono fallback → `ui-monospace, "SF Mono", Menlo, Consolas, monospace` (standard mono stack)

If CLS proves problematic after real-device testing, use `size-adjust` in `@font-face` overrides. Measure on slow 3G in Chrome DevTools before deciding.

### 3.5 CSP compliance (Invariant A10)

`next/font/google` **self-hosts fonts** — it downloads the font files at build time and serves them from the app's own domain. No Google Fonts CDN request at runtime. `src/middleware.ts` does **not** need a `fonts.googleapis.com` or `fonts.gstatic.com` CSP allowance. This is the correct pattern per A10. Do not use `<link>` tags pointing to Google Fonts CDN directly.

---

## §4. Dark-Mode Mynka Blue Token Spec

> The current `tokens.css` dark block (both `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`) uses the legacy purple palette (`--brand: #7c5cff`, `--accent: #7c5cff`). This section is the complete replacement. Every token name matches the existing `tokens.css` names — this is a **clean swap** of the dark block values only.

### 4.1 The full replacement dark block

Replace **both** dark blocks in `src/styles/tokens.css` (the `@media` block and the `[data-theme="dark"]` block) with identical values:

```css
/* ------------------------------------------------------------ */
/* Mynka Blue · DARK MODE                                        */
/* Replaces legacy purple. Both blocks get the same values.     */
/* Source: docs/MYNK-BRAND-PHASE-2-DECISIONS.md dark table.     */
/* WCAG audits: §4.3 below. Andrew: dark mode is his favorite.  */
/* ------------------------------------------------------------ */

  color-scheme: dark;

  /* Surfaces — near-navy deep blue-charcoal */
  --surface-base:     #051A24;   /* Main page bg — near-navy */
  --surface-inset:    #021018;   /* Deepest recessed wells, device chrome */
  --surface-1:        #0E2A38;   /* Cards, panels — raised */
  --surface-2:        #142F3E;   /* Slightly more raised (interpolated) */
  --surface-3:        #1C3548;   /* Most raised surfaces, elevated panels */
  --surface-inverse:  #F0EDE4;   /* Warm off-white inverse (e.g. light badge on dark) */
  --surface-drawer:   #0D2330;   /* Side drawer / bottom sheet bg */
  --surface-nav:      rgba(2, 16, 24, 0.50);   /* Nav overlay on dark base */
  --surface-elevated: #1C3548;   /* Floating menus, tooltips, dropdowns */
  --surface-input:    rgba(255, 255, 255, 0.06); /* Input field subtle tint */
  --surface-overlay:  rgba(0, 0, 0, 0.60);   /* Modal backdrop scrim */
  --surface-tile:     rgba(5, 26, 36, 0.90); /* A/V camera tiles */
  --surface-tile-solid: #021018; /* Solid camera tile bg (no alpha) */

  /* Borders */
  --border-subtle:  #0E2A38;   /* Nearly invisible — decorative only */
  --border-default: #1C3548;   /* Standard card/panel borders (deep slate) */
  --border-strong:  #6A8FA0;   /* Focus rings, ghost-button outlines */

  /* Shadows (deeper on dark to preserve elevation sense) */
  --shadow-sm: rgba(0, 0, 0, 0.30);
  --shadow-md: rgba(0, 0, 0, 0.45);
  --shadow-lg: rgba(0, 0, 0, 0.60);

  /* Text */
  --text-strong:   #F0EDE4;   /* Warm off-white — headings + strong body */
  --text-default:  #F0EDE4;   /* Same — all primary text */
  --text-muted:    #A5B5C0;   /* Cool blue-grey-light — subtitles, timestamps */
  --text-disabled: rgba(165, 181, 192, 0.45); /* Muted + 45% opacity */
  --text-inverse:  #051A24;   /* Dark text for inverse surfaces */
  --text-on-dark:  rgba(165, 181, 192, 0.65); /* Muted text on dark camera tiles */

  /* Brand */
  --brand:    #7EA4B1;   /* Lifted blue-grey — wordmark + brand text on dark */
  --brand-on: #051A24;   /* Dark text on top of brand-tinted fills */

  /* Accent — CORAL IS THE CONSTANT ACROSS MODES */
  --accent:        #E27D60;   /* Coral — unchanged. The mode-invariant anchor. */
  --accent-soft:   #2E1D18;   /* Deep coral-brown — AI panel backgrounds */
  --accent-strong: #D06B4E;   /* Slightly deeper coral for hover states */
  --accent-on:     #051A24;   /* Dark text on coral CTA (6.22 AA) */
  --accent-text:   #E8A08A;   /* Light peach — eyebrows, AI labels, sign-out */

  /* Semantic status (kept from current dark — verified AA on navy bg) */
  --success:        #4ade80;
  --success-soft:   rgba(34, 197, 94, 0.12);
  --success-border: rgba(34, 197, 94, 0.35);
  --warning:        #fde047;
  --warning-soft:   rgba(234, 179, 8, 0.12);
  --warning-border: rgba(234, 179, 8, 0.4);
  --error:          #fca5a5;
  --error-soft:     rgba(239, 68, 68, 0.12);
  --error-border:   rgba(239, 68, 68, 0.35);
  --info:           #60a5fa;
  --info-soft:      rgba(37, 99, 235, 0.12);
  --info-border:    rgba(37, 99, 235, 0.4);

  /* Interactive chrome */
  --focus-ring:     var(--border-strong);   /* #6A8FA0 — 5.13 AA on surface */
  --overlay-scrim:  rgba(0, 0, 0, 0.55);
  --selection:      rgba(226, 125, 96, 0.30); /* Coral selection — matches accent */

  /* Mic/audio meter (functional — keep visible on navy) */
  --meter-quiet: #A5B5C0;   /* Reuse text-muted */
  --meter-good:  #4ade80;
  --meter-loud:  #fde047;
  --meter-clip:  #fca5a5;

  /* Sign-out (coral-tinted on dark for brand cohesion) */
  --sign-out:           #E8A08A;               /* Accent-text — coral/peach */
  --sign-out-hover-bg:  rgba(226, 125, 96, 0.12);
  --sign-out-hover-text: #E8A08A;

  /* Slider */
  --slider-track:  rgba(255, 255, 255, 0.15);
  --slider-thumb:  #F0EDE4;   /* Warm off-white knob */
  --slider-shadow: rgba(0, 0, 0, 0.40);

  /* Badges */
  --badge-neutral-bg:  rgba(126, 164, 177, 0.18); /* Brand-tinted neutral */
  --badge-neutral-fg:  #A5B5C0;
  --badge-neutral-dot: #7EA4B1;

  /* Avatar colors (functional identity — keep vivid on dark) */
  --avatar-1: #f97316;
  --avatar-2: #f59e0b;
  --avatar-3: #84cc16;
  --avatar-4: #10b981;
  --avatar-5: #06b6d4;
  --avatar-6: #3b82f6;
  --avatar-7: #6366f1;
  --avatar-8: #d946ef;

  /* Excalidraw canvas theming */
  --excalidraw-stroke: #F0EDE4;   /* Warm off-white strokes on navy */
  --excalidraw-bg:     #0E2A38;   /* Canvas bg = surface-1 (raised) — feels "inset" */
  --excalidraw-bg-dark: #021018;  /* Deep mode canvas */

  accent-color: var(--accent);    /* Browser native accent = coral */

  /* Page chrome token */
  --page-bg-dark: #02080D;   /* Outside device frames in mockups */
```

### 4.2 Token name alignment with legacy aliases

The legacy alias block at the bottom of `tokens.css` (`:root, [data-theme="light"], [data-theme="dark"]`) maps short names to the structured names above. These aliases are **unchanged** — the aliases that point to the tokens automatically pick up the new dark values:

```css
/* These already exist in tokens.css and require NO CHANGES */
--bg:     var(--surface-base);    /* now resolves to #051A24 in dark */
--panel:  var(--surface-1);       /* now resolves to #0E2A38 in dark */
--text:   var(--text-default);    /* now resolves to #F0EDE4 in dark */
--muted:  var(--text-muted);      /* now resolves to #A5B5C0 in dark */
--border: var(--border-default);  /* now resolves to #1C3548 in dark */
```

### 4.3 WCAG contrast audit — dark Mynka Blue

All pairs from `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` dark table (pre-computed), plus new tokens:

| Pair | Ratio | Verdict |
|---|---|---|
| `text #F0EDE4` on `surface-base #051A24` | 15.21 | ✅ AAA |
| `text` on `surface-1 #0E2A38` | 12.75 | ✅ AAA |
| `text` on `surface-inset #021018` | 16.46 | ✅ AAA |
| `text` on `surface-2 #142F3E` | ~11.3 | ✅ AAA |
| `text` on `surface-3 #1C3548` | ~8.5 | ✅ AAA |
| `text-muted #A5B5C0` on `surface-base` | 8.45 | ✅ AAA |
| `text-muted` on `surface-1` | 7.09 | ✅ AAA |
| `brand #7EA4B1` on `surface-base` | 6.64 | ✅ AA |
| `accent #E27D60` on `surface-base` | 6.22 | ✅ AAA (coral on navy — striking) |
| `accent-text #E8A08A` on `accent-soft #2E1D18` | 7.53 | ✅ AAA |
| `text` on `accent-soft` (AI prose on dark AI panel) | 13.75 | ✅ AAA |
| `accent-on #051A24` on `accent #E27D60` (coral CTA) | 6.22 | ✅ AA |
| `brand-on #051A24` on `brand #7EA4B1` fills | 6.64 | ✅ AA |
| `border-strong #6A8FA0` on `surface-base` | 5.13 | ✅ AA (UI 3:1) |
| `border-default #1C3548` on `surface-base` | 1.40 | ⚠️ FAIL (decorative — same known issue as light mode; use border-strong when border is sole delineator) |

**Notable upgrade from legacy purple:** In the old dark mode, `--accent: #7c5cff` on `#0b1020` was ~5.5:1 (borderline AA). The new coral accent on navy produces **6.22 AAA** — stronger contrast AND more distinctive brand personality.

### 4.4 The "Andrew's favorite" design intent

Dark Mynka Blue is deliberately **"study at night with one lamp"** — a sophisticated near-navy that reads as purposeful rather than generically dark. The coral accent (#E27D60) pops vividly against the navy (6.22 AAA) — more than any other standard dark-mode accent combination. The warm off-white text (#F0EDE4) prevents the clinical feel of pure white on dark. Together: quiet intelligence, legible, alive.

---

## §5. Per-Surface Component Redesign Specs

> Voice column follows `docs/BRAND.md` surface split: B = helpful colleague; D = smart-friend playful. For each surface: layout, components, brand voice, and D-list answers.

### 5.0 Cross-surface layout principles

- **Whiteboard gets maximal screen real estate.** The live whiteboard workspace should use most of the available viewport — the canvas dominates, surrounding chrome (nav, panels, toolbars) stays minimal and unobtrusive — **not** a literal browser-fullscreen (F11) or Fullscreen-API toggle. Rationale: pilot tutor (Sarah) wants a larger whiteboard area — the whiteboard is the core live-tutoring surface. Do **not** clone Wyzant's exact UI; honor the "big canvas, light chrome" intent. Treat as a from-the-start layout constraint for any workspace/component redesign, not a retrofit. (Captured 2026-06-01; viewport-vs-F11 clarified 2026-06-01.)

---

### 5.1 Surface 1 — Dashboard / Next-actions landing (`/` after login)

**Visual reference:** Surface 2 of `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — **BUT** the "Up next · Aiden K. at 4 PM today" card is **WRONG** (scheduling not in v1). Replace with next-actions framing. The surrounding layout, typography hierarchy, and color application remain the visual reference.

**Purpose:** Tutor's first surface after login. Sarah's mental model: "what do I need to do right now?" Not "what happened today." Not a calendar.

**Layout:**
```
┌─ Topbar ──────────────────────────────────────────┐
│  [Mynk·]                    [Theme toggle] [Avatar]│
├───────────────────────────────────────────────────┤
│                                                    │
│  ┌─ Primary CTA ──────────────────────────────┐    │
│  │  "Start a session"  [Student ▾]  [Mode ▾]  │    │
│  │  ───────────────────────────────────────   │    │
│  │  [Solo / in-person]  [New student +]       │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  ┌─ Pending recaps ───────────────────────────┐    │
│  │  "3 sessions waiting for a recap"          │    │
│  │  [Aiden K. · 45 min · Today]    [Finish →] │    │
│  │  [Emma T. · 60 min · Yesterday] [Finish →] │    │
│  └────────────────────────────────────────────┘    │
│                                                    │
│  ┌─ Recent sessions ──────────────────────────┐    │
│  │  [Aiden K. · May 29 · 45 min] [View]       │    │
│  │  [Emma T. · May 28 · 60 min]  [View]       │    │
│  └────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────┘
```

**Components:**
- `Topbar` — wordmark (`.wordmark`) left, theme toggle + avatar right. Top-left area reserves space for future org switcher after the wordmark (`[Mynk·] · [Org name ▾]` pattern — additive, no redesign).
- `StartSessionCard` — primary CTA, `--surface-1` raised card, coral `--accent` CTA button. Student picker uses shadcn `Select`. Mode picker: "Live" (default) vs "Solo / in-person". Keyboard: Tab to student, Tab to mode, Enter to start.
- `PendingRecapsCard` — `--accent-soft` tinted background (AI surface signal), recap items as rows with finish button. Uses `.label-mono` for session metadata.
- `RecentSessionsList` — `--surface-1` card, session rows, tabular timestamps.
- Empty state (first run): heading "Start your first session." body "Mynk records, transcribes, and generates notes. You stay focused on your student." button "Start a session →". Voice: D (smart-friend warm — brand moment).

**Brand voice:** B with occasional D. Dashboard greeting if desired: "Good afternoon." (B). Empty state: D.

**D-list answers:**
- D1: No capture pillar interaction — recorder mounts at `/sessions/[id]/workspace`, not here.
- D2: If a session is in progress when landing here: show inline banner (`Banner` component) per §9.3 of UX-AND-A11Y-SPEC. "You have an in-progress session with Aiden. [Resume] [Discard]"
- D3: N/A (no capture here).
- D4: No per-session log prefix for the dashboard itself. Session start logs `wbsid=` at workspace mount.
- D5: Server action to load pending recaps: `assertOwnsStudent` before returning student data.
- D6: No schema change.
- D7: No new external origin.
- D8: Loading: skeleton (2s expected); Network error: Banner "Couldn't load your dashboard. [Retry]"; Empty: first-run onboarding state per §11.4.
- D9: Tab → Start Session card → student picker → mode → Start. Tab → pending recaps → individual finish buttons. All keyboard-navigable.
- D10: Pending recap count announced via `aria-live="polite"` region on load.

---

### 5.2 Surface 2 — Student list (`/students`)

**Purpose:** Roster management. Adding students, searching students.

**Layout:** Two-column at ≥768px (sidebar nav + main), single-column on mobile.

**Components:**
- `StudentList` — searchable list of student cards. Search input with `/` keyboard shortcut to focus. Each student card: name, last session date, total sessions count, quick "Start session →" action.
- `AddStudentButton` — coral CTA: "Add student". Opens shadcn `Sheet` (side panel) with a create form. Sheet closes on Esc, focus returns to trigger.
- Empty state: "No students yet. Add your first student to start recording sessions." + "Add student →" button.
- Student cards use `--surface-1` background, `--border-default` border (decorative), `--border-strong` on hover/focus to indicate interactivity.

**Brand voice:** B (helpful colleague — functional task surface).

**D-list answers:**
- D1/D2: No capture interaction.
- D5: All student list server actions: `assertOwnsSession` / `assertAdminUser` — list returns only this tutor's students.
- D8: Loading: skeleton matching card shape; Error: inline banner "Couldn't load students." + Retry; Empty: first-run state.
- D9: Tab → search → Tab → Add student → Tab through card list → Enter to view/start session.

---

### 5.3 Surface 3 — Student detail (`/students/[id]`)

**Purpose:** Student profile + history of sessions for this student.

**Layout:**
```
┌─ Student header ───────────────────────────────────┐
│  [Avatar initials]  Aiden K.          [Edit] [···]  │
│  5 sessions · Last session May 29                   │
│  [Start session with Aiden →]                       │
└─────────────────────────────────────────────────────┘
┌─ Sessions for Aiden ──────────────────────────────┐
│  [Date range filter]   [Student filter: Aiden ✓]  │
│  May 29 · 45 min · Algebra II    [View] [Recap ✓] │
│  May 22 · 60 min · Quadratics    [View] [Recap ✓] │
└───────────────────────────────────────────────────┘
```

**Components:**
- `StudentHeader` — avatar circle (initials + `--avatar-N` color), name (`.heading`), metadata (`.label-mono`), primary "Start session" CTA (coral), secondary actions menu.
- `SessionListForStudent` — same `SessionList` component as `/sessions` but pre-filtered. Shares component, not duplicated.
- Consent status badge — "Audio consent ✓ / Video consent: —" per student. Will expand when student accounts + consent lands (Wave 5).

**Brand voice:** B.

---

### 5.4 Surface 4 — Session list / Session log (`/sessions`)

**Purpose:** All sessions across all students. This is Sarah's "log the time + notes" surface. Also the billing/compliance query surface (Wave 2.5 data + Wave 3 UI).

**Layout (Wave 3 UI):**
```
┌─ Session log ─────────────────────────────────────────┐
│  Date range: [Last 14 days ▾]  Student: [All ▾]       │
│  ─────────────────────────────────────────────────────│
│  Subtotal: 8 sessions · 6h 45m billed                 │
│  ─────────────────────────────────────────────────────│
│  Date      Student   Start–End      Billed  Notes      │
│  May 29    Aiden     10:00–10:55    55 min  [Preview…] │
│  May 28    Emma      2:00–3:05      65 min  [Preview…] │
│  ─────────────────────────────────────────────────────│
│  [Export ▾ (Wyzant / UVU / CSV)]                       │
└───────────────────────────────────────────────────────┘
```

**Components:**
- `DateRangePicker` — shadcn `Popover` + calendar. Presets: Today, This week, Last 14 days, This month, Custom.
- `StudentFilter` — shadcn `Select` with "All students" + individual names.
- `SessionTable` — sortable table. Columns: Date (sortable), Student, Start–End (local times, tabular-nums), Billed duration, Notes preview (truncated). Cursor-based pagination, 25 rows default. On mobile: card layout (not table).
- `SubtotalRow` — sticky at top of table, updates as filters change. Shows total sessions + total billed minutes.
- `ExportButton` — dropdown: "Wyzant format", "UVU format", "CSV (all fields)", "JSON". Triggers server-side export generation.
- Default-discoverability per B11: first visit shows a small hint "Showing last 14 days, all students. [Change filters →]" dismissible after first acknowledgment. The rounding rule in effect is shown as: "Time rounded to nearest 5 min (your default). [Change in Settings →]"

**New log prefix:** `slg` — session log view filter interactions. Log each search/filter submit: `[slg] filter dateRange=last14d student=all page=1`.
**New log prefix:** `exp` — export lifecycle. Log: `[exp] export=<id> format=wyzant started`, `[exp] export=<id> rows=8 completed`.

**Brand voice:** B (operational — Sarah is doing billing work here).

**D-list answers:**
- D6: Schema changes from Wave 2.5 are additive (`billedDurationMin`, `disconnectGapMs`, `tutorTimezone`, etc. on `WhiteboardSession`). No destructive migrations.
- D5: `assertAdminUser` — only the tutor sees their own sessions.
- D8: Loading: skeleton table rows; Empty with filters: "No sessions for [criteria]. [Clear filters]"; True empty: "No sessions recorded yet. [Start a session →]"; Export fail: inline error banner + retry.

**Billing immutability (ratified Q-6, 2026-05-31; see also [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) Surface 7):** The exact rounded value shown to the tutor is persisted as `billedDurationMin` and is IMMUTABLE once shown — frozen at session-close, NEVER recomputed, even if a rounding rule is later fixed or redesigned. The rounding rule used (`billedRoundingIncrementMin`, `billedRoundingMode`) is stored alongside it as the audit trail of which rule produced that number. Future rule changes affect only NEW sessions; existing rows keep their frozen value AND rule. `ratePerHour`/`billedAmount` remain deferred until in-app billing ships.

---

### 5.5 Surface 5 — Session detail / Replay (`/sessions/[id]`)

**Purpose:** View a completed session — whiteboard replay, transcript, AI-generated recap, send recap to parent.

**Layout (desktop):**
```
┌─ Session header ──────────────────────────────────────┐
│  Aiden K. · May 29 · 45 min billed · [Recap sent ✓]  │
│  [Send recap →]  [Share with parent →]  [···]         │
└───────────────────────────────────────────────────────┘
┌─ Whiteboard replay ────────┐  ┌─ Recap + Notes ───────┐
│  [replay canvas]            │  │  AI Summary (prose)   │
│  [timeline scrubber]        │  │  ─────────────────    │
│  [play] [0:23/45:00]       │  │  Topics covered        │
│  [page tabs: 1 2 3]        │  │  ─────────────────    │
└────────────────────────────┘  │  Plan / next steps     │
                                │  ─────────────────    │
                                │  [Edit] [Regenerate]  │
                                └───────────────────────┘
┌─ Transcript ──────────────────────────────────────────┐
│  [Tutor 0:00] Hi Aiden, let's pick up where we…       │
│  [Tutor 0:32] So the quadratic formula…               │
└───────────────────────────────────────────────────────┘
```

**Components:**
- `SessionHeader` — session metadata (`.label-mono`), primary "Send recap" CTA, "Share with parent" (generates/shows token link), actions menu.
- `WhiteboardReplay` — existing replay engine; Visual refresh = apply new surface tokens to replay chrome. Canvas itself unchanged (Excalidraw replay logic preserved per A5).
- `RecapEditor` — AI-generated content uses `.ai-prose` (Fraunces serif). Editable inline. "Regenerate" action. Shows `--accent-soft` background tint to signal "AI wrote this."
- `TranscriptPanel` — verbatim transcript, Inter body. Timestamps in `.label-mono`. Aria-live not needed here (replay surface, not live).
- `ParentSharePanel` — when "Share with parent" is clicked, opens shadcn `Sheet` showing the share token URL, copy button, revoke option. Token is `--accent-text` styled, not a raw URL.

**Brand voice:** B with D in empty/first-run states.

**D-list answers:**
- D1: Replay surface touches Pillar 3 (reads from `WhiteboardSession` end state, uses snapshot rendering engine). Does NOT interact with live FSM or outbox. Read-only.
- D2: If tutor navigates here while a different session is active: the active session continues (always-mounted at its workspace boundary, A3). No conflict.
- D5: `assertOwnsStudent(adminUserId, studentId)` before loading session data. Parent share link uses token (no ownership check at public token level — token IS the authorization).
- D8: Loading: full-page skeleton matching the 3-panel layout; Replay load fail: inline error in replay panel + "Retry"; Transcript missing: "Transcript not available for this session" placeholder; AI recap missing: "Recap not generated yet. [Generate now →]".
- D10: SR announcement when recap is being regenerated: `role="status"` "Generating recap…".

---

### 5.6 Surface 6 — Live workspace (`/sessions/[id]/workspace`)

**Purpose:** The LIVE tutoring session. Sarah's primary work surface. Wyzant-shaped layout (whiteboard dominant). This is the most reliability-critical surface in the app.

**Layout — desktop (≥1024px):**
```
┌─ Session bar (40px) ──────────────────────────────────────┐
│  [●] LIVE  Aiden K.  [Timer: 23 min]  [End session]       │
└───────────────────────────────────────────────────────────┘
┌─ Whiteboard canvas (~80% height) ─────────────────────────┐
│                                                            │
│  [Excalidraw canvas — dominant]                           │
│                                  [Camera tile: Aiden]      │
│                                  [small, bottom-right]    │
│                                                            │
└───────────────────────────────────────────────────────────┘
┌─ Toolbar (left strip, collapsible) ──────────────────────┐
│  [Cursor] [Pencil] [Eraser] [Text] [Shape ▾] [···]        │
│  Order: Sarah's priority order (cursor → pencil → eraser) │
└──────────────────────────────────────────────────────────┘
┌─ Controls (bottom, minimal) ─────────────────────────────┐
│  [Mic: on/off] [Cam: on/off] [Pages: 1/3] [Share link]   │
└──────────────────────────────────────────────────────────┘
```

**Layout — student-side mobile (≥80% whiteboard — BREAKING redesign, see 5.7).**

**Components:**
- `SessionBar` — always visible. Live dot (coral `--accent` + `"LIVE"` text label, satisfying SC 1.4.1). Timer: minutes-only (no seconds, per Sarah: "she does NOT want to see seconds"). Timer uses tabular-nums. End session button is destructive-confirming (inline confirmation, not a dialog — "Are you sure? Your recording will be saved. [End session] [Keep recording]").
- `WhiteboardCanvas` — Excalidraw, dominant area. Toolbar reordered: Cursor, Pencil, Eraser, Typing, then Shape dropdown (line+arrow together), then Geometry dropdown (square+diamond+circle together). Defaults: sloppiness=architect, edges=sharp (per Sarah U7/U8).
- `AVTilePanel` — camera tile corner-overlaid (bottom-right of canvas on desktop). Tap/click to expand. Student tile: small. Tutor self-view: smaller.
- `RecordingIndicator` — positioned in session bar. Aria-live polite announcement on recording start/stop/error.
- `SoloModeIndicator` — when `sessionMode === "solo"`: replaces "Waiting for student" with "Recording — solo session." No student link shown. No A/V panel mounted (per Surface 6 design in RELIABILITY-REDESIGN doc).
- `ResumeBanner` — if session was interrupted and tutor returns to workspace: inline `Banner` (§9.3 pattern) not a full-page gate. "Session with Aiden was interrupted at 23 min. [Resume recording] [End and save]"

**Brand voice:** B calm operational. ("Recording. We'll handle the notes.") No whimsy here — Sarah is in a live session with a student.

**D-list answers:**
- D1: **Yes — all three pillars.** Workspace mounts the recorder FSM (Pillar 1), interfaces with upload outbox (Pillar 2), triggers `endWhiteboardSession` transaction (Pillar 3). CRITICAL surface.
- D2: Always-mounted per A3: recorder mounts at the workspace route boundary. Navigating away (e.g., tutor accidentally hits back) must trigger the resume banner on return, not silently discard.
- D3: Recording failure: persistent `role="alert"` banner. "Recording paused (network error). We're buffering locally — your audio is safe." Auto-retry up to 3× then show "Retry manually". Never auto-dismiss a recording error banner.
- D4: `wbsid=` (existing). `rid=` (existing audio). `avx=` (existing A/V). `sessionMode` logged at session start per P6.
- D5: Server actions in workspace: `assertOwnsStudent` for all mutations. Join-token validation for student-side (token is the auth boundary — no ownership check needed).
- D7: `WHITEBOARD_SYNC_URL` origin already in CSP. Self-hosted fonts = no new origin.
- D8: **Every failure mode must be designed.** Mic dropped: banner "Microphone disconnected. [Reconnect]". Sync server flake: silent sync-disconnect marker in event log (existing FSM behavior); tutor sees no interruption. A/V peer dropped: "Student disconnected. Timer paused." (auto-pause, B7 fix). End-session fail: show error + "Try again. Your recording is still running."
- D9: Session bar fully keyboard-navigable. Whiteboard canvas: Excalidraw keyboard shortcuts (P=pencil, R=rectangle, etc.) per §6.3 whiteboard exception. End session: keyboard-activatable button + confirm inline.
- D10: Recording start/stop: `role="status"` polite. Recording errors: `role="alert"` assertive. Student joined/left: `role="status"` polite. Timer: NOT announced (would be disruptive every minute). Transcript updates: `aria-live="polite" aria-atomic="false"` on transcript container.

---

### 5.7 Surface 7 — Student join / mobile workspace (`/join/[token]` — BREAKING redesign)

**This is the Wave 3 mobile-first BREAKING redesign per Surface 5 of RELIABILITY-REDESIGN-2026-05-27.md.**

**Target:** Student on iPhone Safari. Whiteboard ≥80% of viewport. Wyzant-shaped.

**Layout — mobile (375px, iOS Safari):**
```
┌─────────────────────────────────────────┐ ← dvh top
│                                         │
│   [Excalidraw canvas — ≥80% dvh]        │
│                                         │
│             [Cam tile: Andrew]          │
│             [bottom-right, overlay]     │
│                                         │
├─────────────────────────────────────────┤
│ [1] [2] [3]  ←page tabs (compact strip)│
│ [follow tutor ON] [mic: off] [leave]   │ ← 48px bottom bar
└─────────────────────────────────────────┘ ← dvh bottom
```

**Key changes from current layout:**
1. Use `100dvh` (dynamic viewport height) not `100vh` — iOS Safari collapses the URL bar when scrolling, `dvh` tracks it correctly.
2. Camera tile: overlay on canvas (bottom-right), `position: fixed` from viewport, `width: 120px height: 80px`. Tap expands to 240×160. NOT stacked above the canvas.
3. "Board pages" explainer card: **removed entirely**. Replaced with compact `PageStripBar` (≤40px height) at bottom — pill-shaped page tabs: `[1] [2] [3]`. Tutor-created pages auto-appear here.
4. Excalidraw toolbar: **hidden by default** on mobile student view. Student only needs the "follow tutor" toggle and basic tools (pencil, eraser). Collapsed into a `···` overflow button.
5. Student-only control bar: 48px height, anchored to bottom (above page strip). Contains: follow-tutor toggle (on by default), mic toggle, leave session.
6. Follow-tutor default: `sync-to-tutor` checked by default per Sarah B1/B2 priority.

**D-list answers:**
- D1: Student side does not record — recorder FSM not relevant here. Student side interacts with sync client only.
- D2: N/A (student is always in this one workspace route).
- D3: Sync failure (relay drops): "Reconnecting…" pill at top of canvas. Reconnects automatically via existing sync-reconnect logic.
- D4: No new log prefix (uses existing `avx=` / `wbsid=` via server-side session).
- D5: Student join authenticated via token only (`/api/w/[joinToken]/...` routes). No `assertOwnsStudent` needed — token IS the auth boundary. All student-side server actions validate the join token before any response.
- D9: Follow-tutor toggle is keyboard-accessible. Leave button keyboard-accessible. Whiteboard drawing is SC 2.1.1 essential exception.

---

### 5.8 Surface 8 — Parent share (`/share/[token]`) — Phase 1 formal spec

**Purpose:** Parent views the session recap. Phone-first, read-only. Brand's first impression for parents.

**Visual reference:** Surface 6 of `docs/brand-previews/palette-mocks-FINAL-mynka-blue.html` — this mock IS the design intent. Formalize it here with URL, microcopy, states, and a11y.

**Layout (mobile-first, max-width 640px centered on desktop):**
```
┌─ Share page ──────────────────────────────────────┐
│  [Mynk·]          "Notes from your session"        │
│  ─────────────────────────────────────────────────│
│  Aiden K. · Algebra II · May 29, 2026              │
│  45 minutes                                        │
│  ─────────────────────────────────────────────────│
│  [AI Summary card — accent-soft bg, ai-prose]      │
│  Topics covered: Quadratic formula, vertex form…   │
│  ─────────────────────────────────────────────────│
│  Plan: Practice problems 3–5 on worksheet…         │
│  ─────────────────────────────────────────────────│
│  [Whiteboard preview thumbnail]  [View replay →]   │
│  ─────────────────────────────────────────────────│
│  Questions? Reply to your tutor…  [Contact form?]  │
└───────────────────────────────────────────────────┘
```

**Components:**
- `ShareHeader` — wordmark (`.wordmark`) small, soft heading "Session notes from your tutor." Brand moment for parents.
- `SessionMeta` — student name, subject if provided, date, duration. `.label-mono` for metadata, `.heading` for the section.
- `AiSummaryCard` — `--accent-soft` background, `.ai-prose` text for all AI content. Heading "From your session" in brand voice. No "AI SUMMARY" eyebrow needed here — parent context is different from tutor context.
- `WhiteboardThumbnail` — snapshot PNG, tap/click opens replay modal or link to `/share/[token]/whiteboard/[id]`.
- `ContactAffordance` — minimal. Either a tutor email link or a reply form (TBD per §8 Q-5).
- **Token expiry state:** if token is revoked or expired: "This session note is no longer available. Contact your tutor for a new link." No technical error language.

**Brand voice:** D leaning B — warm + accessible, not technical. Parent-first. The Mynk wordmark appears but no product chrome.

**D-list answers:**
- D1/D2: No capture interaction (read-only surface).
- D5: Token validation on every request. Replay API routes validate token before serving events or snapshots. No raw Blob URLs exposed.
- D7: No new external origin.
- D8: Token invalid/expired: graceful "no longer available" message. Whiteboard replay load fail: "Whiteboard replay temporarily unavailable." Audio player load fail: "Audio not available." All fail gracefully — parent sees recap text even if replay fails.
- D9: All content readable without replay (recap text is primary). Replay is enhancement.
- D10: Page has a single logical reading order. AI prose is semantically plain text — no special SR treatment needed.

---

### 5.9 Surface 9 — Auth surfaces (`/login`, `/signup`, `/forgot-password`, `/reset-password`)

**Visual reference:** Surface 1 of the FINAL mockup for login. Apply Mynka Blue to public auth surfaces.

**Layout — centered card, max-width 400px:**
- Page background: `--surface-base` (cream light / near-navy dark)
- Card: `--surface-1` (raised), `--border-default` border, `--shadow-sm` elevation
- Wordmark at top of card: `.wordmark` sized at ~28px
- Heading: `.heading` ("Welcome back" / "Create your account" / "Reset your password")
- Form: shadcn `Input` + `Label` + `Button` primitives
- CTA button: coral `--accent` fill, `--accent-on` text (dark text on coral, 5.64 AA light / 6.22 dark)
- Error states: inline per SC 3.3.1 (aria-invalid + aria-describedby + `--error-border` + icon + text)
- Footer links: "Don't have an account? Sign up →" (`.text-muted` with `--brand` link color)

**Brand voice:** B helpful colleague. "Welcome back." "Create your account." "We'll send a reset link to your email." No slogans on auth surfaces.

**D-list answers:**
- D6: No schema changes for auth surface redesign.
- D8: Form submit fail: inline server error. "Email or password didn't match. Try again, or [reset your password]." Network error: "Couldn't reach Mynk. Check your internet, then try again." Rate limit: "Too many attempts. Wait 30 seconds, then try again."
- D9: Full keyboard flow: Tab through fields → Enter to submit → Tab to forgot-password link.
- D10: Form errors announced via `aria-invalid` + `aria-describedby`. Submit loading state: button becomes disabled + `aria-busy="true"`.

---

### 5.10 Surface 10 — Settings (`/settings`, `/settings/email`, `/settings/profile`, `/settings/billing`)

**Purpose:** Tutor preferences. New: `/settings/billing` for rounding defaults + timezone (Wave 2.5 data already; Wave 3 UI).

**Layout:** Settings nav (left sidebar or top tabs on mobile) + content area.

**New `/settings/billing` surface:**
```
Billing defaults
────────────────
Time rounding: [Nearest 5 min ▾]   ← options: 5 / 15 / 30 / no rounding
Rounding direction: [Round up ▾]    ← options: up / down / nearest
Your timezone: [America/Denver ▾]   ← timezone picker
─────────────────────────────
These defaults apply to new sessions. Existing session billing
is frozen and won't be changed. [Learn more about billing →]
```

Per B11 (default-discoverability): the current default is shown explicitly ("We're using nearest 5 min, rounded up — this is what will appear on the session log. Change it here."). On `/sessions` the first visit shows a dismissible hint linking here.

**Brand voice:** B. Settings is functional — no whimsy.

---

### 5.11 Surface 11 — Solo / in-person mode UX

**This is the session-creation modal redesign.** Solo mode is a first-class v1 feature (locked §8 decision; Sarah explicitly requested it; currently disabled in production — must be enabled).

**Session creation modal (opens when "Start a session" is tapped):**
```
┌─ Start a session ─────────────────────────────────┐
│  Student: [Aiden K. ▾]                             │
│                                                    │
│  Session type:                                     │
│  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ ● Live           │  │   Solo / in-person   │   │
│  │ Student joins    │  │   Record locally     │   │
│  │ with a link      │  │   no remote student  │   │
│  └──────────────────┘  └──────────────────────┘   │
│                                                    │
│  ┌─ Consent attestation ─────────────────────────┐ │
│  │ (Live) "My student has consented to this       │ │
│  │  session being recorded (audio + writing)."   │ │
│  │ (Solo) "My student is present in-person and   │ │
│  │  has consented to audio and whiteboard         │ │
│  │  recording of this session."                   │ │
│  │ [✓] I confirm                                  │ │
│  └───────────────────────────────────────────────┘ │
│                                                    │
│  [Cancel]                   [Start session →]      │
└───────────────────────────────────────────────────┘
```

**In solo mode, the workspace changes:**
- Session bar: "● RECORDING — solo session" (no student name)
- No "Waiting for student" banner
- No "Copy student join link" button
- No A/V peer tiles (student join panel not shown at all, `useLiveAV` not mounted)
- Timer starts immediately at session creation (no `bothConnectedAt` wait)
- Consent copy: solo version (see above)

**Brand voice:** B. Calm, clear mode selection.

---

### 5.12 Surface 12 — Admin dashboard (`/admin/system` or `/superadmin`)

This surface is Andrew-facing (operator/superadmin), not Sarah-facing. It exists at `/admin/waitlist` today. When the `/admin/` prefix is removed from tutor-facing routes, this surface needs its own path to avoid confusion.

> **🚩 FLAG Q-3 FOR ANDREW:** Propose: `/superadmin` for the operator dashboard (waitlist, user management, metrics). This keeps the operator surface distinct from tutor surfaces. The current `/admin/outbox` (debug view) and `/admin/waitlist` move here. Confirm before Phase C.

---

## §6. Five-Axis Reliability Adversarial Review

### 6.1 Carry-forward invariants A1–A10 — confirmed preserved

| # | Invariant | Preserved by this redesign? | How |
|---|---|---|---|
| **A1** | Recording is the artifact | ✅ | Workspace surface (5.6) remains recording-first. Session bar keeps live dot + recording state. No UX change deprioritizes capture. |
| **A2** | Three-pillar recorder stack (FSM / outbox / atomic end-session) | ✅ | Component redesign touches CSS/JSX layout, not FSM logic. `endWhiteboardSession` transaction is untouched. |
| **A3** | Always-mounted capture surface | ✅ | Workspace component mounts recorder at route boundary (hidden via CSS). The BREAKING student-side redesign (5.7) explicitly does NOT mount a recorder (students don't record). Solo mode routes to same workspace component. |
| **A4** | Live collab table stake (whiteboard sync) | ✅ | Sync architecture unchanged. Student-side redesign changes layout shell, not `sync-client.ts`. |
| **A5** | Library-agnostic event log | ✅ | No changes to `excalidraw-adapter.ts` or event format. |
| **A6** | Consent + recording disclosure | ✅ | Solo mode consent copy updated (more accurate) but consent is still enforced server-side per `WhiteboardSession`. Two consent variants (live / solo) share the same server enforcement. |
| **A7** | Tokenized + revocable share links | ✅ | Parent share URLs renamed (`/s/` → `/share/`) with 301 redirects. Token extraction logic unchanged. Phase C deploy sequence (§2.7) puts redirects FIRST before any URL rename goes live. |
| **A8** | Server-side ownership assertions | ✅ | Every new server action in §5 includes `assertOwnsStudent` (or `assertAdminUser`). See D5 answers per surface. Session log server actions: ownership validated before any query. |
| **A9** | Additive migrations only | ✅ | Wave 2.5 billing columns are additive with `@default` values. Wave 3 URL changes are not schema changes. No drops or renames. |
| **A10** | Tight CSP | ✅ | Fonts self-hosted via `next/font/google` (no CDN request). No new external origins in this design. `WHITEBOARD_SYNC_URL` already in CSP. 301 redirects are same-origin. |

### 6.2 Five-axis scan — per axis

**Axis 1 — Data durability / Capture integrity**

- **BLOCKER folded into Phase-1 acceptance:** IDB partial-segment persistence (BACKLOG #1) and upload-hold-until-retry (BACKLOG #2) must ship in Phase A or B before any UX redesign is Sarah-facing. The redesigned UI is meaningless if recordings still crash-lose data.
- **New surface risk:** Session log billing fields (`billedDurationMin`, etc.) are FROZEN at session close per RELIABILITY-REDESIGN §7 invariant. The settings billing UI must never retroactively modify frozen billing rows — the server action for updating rounding defaults only affects NEW sessions.
- **Parent share URL rename risk:** Mitigated by Phase C deploy sequence (301 redirects land before URL rename) per §2.7.

**Axis 2 — Clock + ordering**

- **Timezone tech debt:** Session timestamps stored as UTC-pretending-wall-clock (BACKLOG §). The billing fields (`billedStartLocal`, `tutorTimezone`) freeze correct local times at session close. Display in Session Log (`/sessions`) must use `billedStartLocal` / `billedEndLocal` (frozen strings), NOT recalculate from `startedAt` + a current timezone. This ensures the session log always shows what Sarah originally billed.
- **Timer display:** Minutes-only (Sarah U9). The timer component must not tick seconds. Round to nearest minute on display. Use `tabular-nums` for stable layout.

**Axis 3 — Race conditions**

- **Solo mode session creation:** When `sessionMode === "solo"`, the FSM should receive `soloEnabled: true` immediately at workspace mount (before any participant events). No race with "waiting for participant" state.
- **Session log export:** Export generation should be async (server action returns a job ID → client polls / SSE for completion). Do not block the UI thread for Wyzant/UVU format generation. Client shows spinner and disables the export button until complete.
- **Billing default update:** Tutor changes rounding default in settings → only new sessions pick it up. No race with in-flight session (in-flight sessions already have the rule frozen at start).

**Axis 4 — Cross-platform**

- **Student-side mobile (iPhone Safari):** The BREAKING redesign (5.7) directly addresses I5. Use `100dvh` for the canvas height. Test on real iPhone Safari before declaring Wave 3 done (jsdom blind spot per AGENTS.md hard-won lesson).
- **Dark mode across browsers:** Fraunces variable font with custom axes (`SOFT`, `opsz`) must be tested on Safari — variable font axis support varies. Fallback stack (Iowan Old Style, Georgia) must be visually acceptable if `SOFT`/`opsz` fail to resolve.
- **Session log on iPad:** Billing review surface. Table layout tested at 768px — responsive breakpoint from table → card stack at ≤640px.

**Axis 5 — Observability**

- **New log prefixes claimed by this design:** `slg` (session log filter interactions), `exp` (export lifecycle). Document in AGENTS.md § Conventions before implementation.
- **Solo mode logging:** `sessionMode` MUST be logged at session start (`[wbsid=<id>] sessionMode=solo`). Currently not logged (RELIABILITY-REDESIGN Surface 6 finding).
- **Theme toggle:** `thm` prefix optional — low-value lifecycle. Skip unless Andrew requests.
- **Font loading:** no custom logging needed; Next.js built-in metrics cover LCP/FCP.

### 6.3 BLOCKERs that must fold into Phase-1 acceptance (not deferrals)

| # | BLOCKER | Fold into |
|---|---|---|
| B-1 | Font self-hosting (CSP A10): fonts.ts must not reference any CDN that isn't already in CSP | Phase A acceptance |
| B-2 | IDB partial-segment persistence (#1) and upload-hold (#2) must be shipped before the redesigned UI reaches Sarah | Phase A gate — do not ship redesigned UX to Sarah until Wave 1 reliability items P2/P3 are done |
| B-3 | Parent share 301 redirects must be live BEFORE any `/s/` → `/share/` URL rename | Phase C gate: redirects first, rename second |
| B-4 | Billing rows must be FROZEN at session close — settings UI must not modify historical billing | Phase B (session log surface) acceptance |
| B-5 | Solo mode consent copy and `soloEnabled` wiring must be reviewed for legal adequacy before production enable | Phase B (solo mode surface) acceptance — flag for Andrew |

---

## §7. Phased Composer Execution Plan

> Each phase is a separately-shippable branch sized for a single Composer-2.5 dispatch. Sequence: Phase A must land before Phase B starts. Phase C is Andrew-gated and can run after Phase A+B are stable.

### Phase A — Foundations: dark tokens + fonts

**Scope:**
1. Replace dark blocks in `src/styles/tokens.css` with Mynka Blue dark values (§4.1)
2. Create `src/app/fonts.ts` with Fraunces + Inter + JetBrains Mono config (§3.1)
3. Create `src/styles/typography.css` with utility classes (§3.2)
4. Wire fonts into `src/app/layout.tsx`
5. Smoke test: dark mode on existing surfaces renders Mynka Blue navy (not legacy purple); light mode unchanged; fonts load; no CLS regression

**Does NOT include:** Any component structure change. Any route change. Zero IA changes.

**Dependencies:** None — purely additive to existing CSS.

**Acceptance criteria:**
- [ ] Dark `--brand` is `#7EA4B1` (not `#7c5cff`) — verify in DevTools
- [ ] Dark `--accent` is `#E27D60` (coral, not purple)
- [ ] Dark `--surface-base` is `#051A24` (navy, not `#0b1020`)
- [ ] `.wordmark` class uses `font-variation-settings: "opsz" 144, "SOFT" 60, "wght" 700`
- [ ] `.heading` class uses `"opsz" 144, "SOFT" 0, "wght" 700`
- [ ] `.ai-prose` class uses `"opsz" 14, "SOFT" 30, "wght" 400`
- [ ] No new Google Fonts CDN URL in CSP — `next/font/google` serves fonts locally
- [ ] Andrew: "this looks like dark mode I actually want to use" (subjective, but that's the bar)
- [ ] Invariants A1–A10 unaffected (CSS-only change, no logic change)
- [ ] axe-core passes on existing smoke surfaces with dark mode enabled

**Andrew decisions gating Phase A:** None. Phase A can begin immediately.

**Reliability invariants this phase must not break:** A10 (no new CSP origin for fonts). All others trivially preserved (CSS change only).

---

### Phase B — Per-surface component redesign

**Scope (6 sub-batches, each independently shippable):**

**Phase B1 — Public surfaces (login/signup/forgot/reset/setup):**
Install Tailwind 4 + shadcn/ui. Replace auth surface components using shadcn Form + Input + Button primitives + Mynka Blue tokens. Apply `.wordmark` to auth card headers.

**Phase B2 — Dashboard + student list + student detail:**
Redesign `/`, `/students`, `/students/[id]` using new component system. `StartSessionCard`, `PendingRecapsCard`, `RecentSessionsList`. Apply B11 default-discoverability hints.

**Phase B3 — Session list (billing log UI):**
Redesign `/sessions` — date range picker, student filter, session table, subtotal row, export button. New log prefixes `slg` and `exp` registered in AGENTS.md. Backend (Wave 2.5 schema) must be complete before this batch's export functionality, but the table + filter can ship with existing data fields earlier.

**Phase B4 — Session detail / replay:**
Redesign `/sessions/[id]` — session header, recap editor (`.ai-prose`), whiteboard replay chrome refresh, transcript panel, parent share sheet.

**Phase B5 — Live workspace + solo mode:**
Redesign `/sessions/[id]/workspace` — session bar (timer minutes-only), toolbar reorder (cursor→pencil→eraser→text→shapes), Wyzant-shaped layout, camera tile corner overlay, solo mode UX (session creation modal, solo workspace variants). Enable solo mode in production.

**Phase B6 — Student-side mobile (BREAKING):**
Redesign `/join/[token]` — mobile-first layout, `100dvh`, camera tile overlay, compact page strip, minimal toolbar. Test on real iPhone Safari. Playwright/WebKit required per jsdom blind spot rule.

**Dependencies:** Phase A must complete first (tokens and fonts must be in place). Tailwind 4 + shadcn install (B1) must complete before B2+. Phase B5 depends on Wave 1 P4 (solo mode schema + FSM wiring) being complete before production enable.

**Acceptance criteria (per batch):**
- [ ] **Reusable password primitive** — one shared component (password + confirm + show/hide + zxcvbn strength) applied across all **8** credential forms (tutor signup/reset/forgot-adjacent, AccountHolder signup/reset, admin change-password, claim signup, Change-PIN), closing tutor-reset **minLength 8 vs signup 10 + zxcvbn** policy drift (`src/app/reset-password/page.tsx` vs signup paths)
- [ ] WCAG 2.2 AA: axe-core passes with `color-contrast` ENABLED (currently disabled — must be re-enabled in Phase B1 and kept on)
- [ ] Touch targets ≥44×44 CSS px on all interactive elements
- [ ] Keyboard navigation sweep: all primary actions reachable, focus ring visible
- [ ] Mobile reflow at 320px: no horizontal scroll, no truncation
- [ ] All carry-forward invariants (A1–A10) confirmed unbroken (D-list walkthrough per surface)
- [ ] No hardcoded hex values in new component files (ESLint hex ban active)
- [ ] Recorder FSM / outbox / end-session logic untouched (grep diff confirms)
- [ ] Phase B5 only: solo mode tested end-to-end on a real session before enabling in production (Andrew confirms)
- [ ] Phase B6 only: student whiteboard ≥80% of viewport on iPhone Safari (real device test)

**Andrew decisions gating Phase B:**
- Q-1 (§2.5): OAuth callback URL confirmation before any URL-adjacent work
- Q-4 (§8): Tailwind 4 + shadcn installation approach (if Andrew has a preference on CSS architecture)

---

### Phase C — IA / URL restructure

**Scope:**
1. Implement 301 redirects in `next.config.js` (§2.6)
2. Rename route directories (`/admin/students` → `/students`, etc.)
3. Update all internal navigation links to new paths
4. Playwright redirect smoke test: every old path 301s to new path

**Hard gates before Phase C begins:**
- [ ] Andrew ratifies URL proposal in §2.2 (Q-2: session ID global uniqueness confirmed)
- [ ] OAuth callback URL confirmed unchanged (Q-1)
- [ ] Sarah briefed that URL prefix is changing
- [ ] Phase A + B complete (system stable before breaking URL changes)

**Deploy sequence:** 301 redirects first in one deploy → verify on Preview → deploy to Production → rename internal links in same deploy or next deploy.

**Acceptance criteria:**
- [ ] Every old URL 301s to new URL (automated Playwright test suite)
- [ ] Auth: login, signup, forgot-password still work end-to-end
- [ ] Student join: `/w/[token]` redirects to `/join/[token]`, join still works
- [ ] Parent share: `/s/[token]` redirects to `/share/[token]`, share view still loads
- [ ] Session replay: old `/admin/students/[id]/whiteboard/[wsid]` redirects to `/sessions/[wsid]`
- [ ] No new 404s on any production surface
- [ ] A7 (tokenized shares): existing tokens still work after redirect

**Andrew decisions gating Phase C:** Q-1, Q-2, Q-3 — ✅ ratified 2026-05-31 (§8).

---

### Phase D — V1 gap-close (required for V1)

> **Andrew 2026-06-01:** These items were **not** in the original component plan but are **V1-required**. A dedicated gap-close phase (after core B batches and/or alongside late B work) is acceptable. Detailed visual specs are **not** written here yet — placeholder scope only.

**Decision recorded (do not re-litigate):** **Nav redesign is NOT pulled forward** into its own early pass. Global nav / top chrome redesign ships with the real surface specs in §5.1, §5.2, §5.10 and batches B3–B6 — not as standalone work ahead of those surfaces.

#### D1 — Landing / hero / marketing page (`/`)

**Current state:** Public `/` is a minimal marketing shell; the original plan marked it "unchanged."

**V1 intent:** Full landing/hero redesign — Andrew: the public landing "needs a lot of work." Apply Mynka Blue tokens, Fraunces/Inter typography, and shadcn primitives consistent with B1 auth surfaces. Scope includes hero, value props, primary CTA(s), and trust/social-proof blocks as appropriate.

**REQUIRED — separate parent sign-in entry (Andrew 2026-06-02):** The landing/hero MUST expose a distinct **"Sign in (parents)"** affordance pointing at `/account/login`, separate from the tutor `/login` entry. Root cause this fixes: the two auth realms (Operator/tutor `/login` vs AccountHolder/parent `/account/login`) have separate login URLs with no cross-link, so a parent who lands on the default tutor login gets a dead-end "email or password didn't match" with no nudge. Landing must make the parent path obvious. (Companion lightweight follow-up — cross-links *between* `/login` and `/account/login` themselves — tracked as a P2b/auth-IA papercut; the landing entry is the V1-required piece.)

**Status: BUILT — 2026-06-02 (first cut, Andrew review pending before merge).**

**Concrete layout implemented:**

```
┌─ MarketingHeader (sticky, blur backdrop) ──────────────────────────┐
│  [Mynk·]   About               [Sign in parents▸] [Tutors] [Create]│
└────────────────────────────────────────────────────────────────────┘

┌─ Hero (centered, max-width 760px) ─────────────────────────────────┐
│  "Now in pilot"  ← label-mono coral eyebrow                        │
│                                                                    │
│  "Session notes that write themselves."  ← heading clamp 2–3.5rem │
│                                                                    │
│  Subhead (Inter, text-muted): 1 sentence, max 600px               │
│                                                                    │
│  [Create your account]  [Sign in — tutors]  ← CTA row             │
│                                                                    │
│  "Parent or family member?  Sign in to your parent account" ←      │
│    separate line below CTAs, coral link → /account/login           │
└────────────────────────────────────────────────────────────────────┘

┌─ Value props (3-col flex, wraps to 1-col mobile) ──────────────────┐
│  ┌─ Record once ────┐  ┌─ Clean parent updates ─┐  ┌─ Your data ──┐│
│  │ coral eyebrow    │  │ coral eyebrow           │  │ coral eyebrow││
│  │ heading          │  │ heading                 │  │ heading      ││
│  │ muted body       │  │ muted body              │  │ muted body   ││
│  └──────────────────┘  └─────────────────────────┘  └─────────────┘│
└────────────────────────────────────────────────────────────────────┘

┌─ How it works (surface-1 bg, 3-col grid) ──────────────────────────┐
│  "How it works" eyebrow + heading                                   │
│  01 Start a session · 02 Teach normally · 03 Send the recap         │
└────────────────────────────────────────────────────────────────────┘

┌─ Trust / pilot CTA (centered) ─────────────────────────────────────┐
│  "Pilot access" eyebrow                                             │
│  "Built for working tutors."                                        │
│  Subhead + [Get started — it's free] [Learn more → /about]         │
│  Legal micro-copy (terms + privacy links)                           │
└────────────────────────────────────────────────────────────────────┘
```

**Parent sign-in affordance — dual placement:**
1. `MarketingHeader`: inline nav — "Sign in" badge labeled `parents` (coral accent-soft badge) + separate "Tutors" link + "Create account" CTA. Visually distinct from the tutor entry.
2. Hero section: soft italic line below the primary CTAs — "Parent or family member? Sign in to your parent account" with coral underline link → `/account/login`.

This satisfies the Andrew 2026-06-02 requirement: two auth realms are clearly surfaced; a parent cannot end up on the wrong login screen.

**First cut — Andrew review requested before merge to master.** Key questions:
- Hero headline: "Session notes that write themselves." — does this land, or is the older copy ("Record your tutoring session. Send a polished parent update in 90 seconds.") preferred?
- Value prop ordering: "Record once" → "Clean parent updates" → "Your data" — right priority order?
- "Now in pilot" eyebrow — keep, or remove for a cleaner launch-ready look?
- Parent sign-in placement: header badge vs below-hero paragraph — is both placements overkill, or is the redundancy appropriate?

**Does NOT include:** Post-login dashboard (§5.1 / B2 reskin is the interim floor on `/admin` routes until Phase C URL flattening).

#### D2 — About page (`/about`)

**Current state:** Route does not exist.

**V1 intent:** Net-new public `/about` — product story, who we are, how Mynk relates to tutoring (align with brand voice in `docs/MYNK-BRAND-PHASE-2-DECISIONS.md`). Linked from landing footer and/or global public nav when that nav is redesigned.

**Status: BUILT — 2026-06-02 (first cut, Andrew review pending before merge).**

**Concrete layout implemented:**

```
┌─ MarketingHeader (shared with landing) ────────────────────────────┐

┌─ Page intro (max-width 720px) ─────────────────────────────────────┐
│  "About Mynk" eyebrow                                               │
│  "Tutoring infrastructure for independent professionals."           │
│  Two paragraphs: what Mynk solves + why we don't take a cut        │
└────────────────────────────────────────────────────────────────────┘

┌─ Product features (surface-1 bg, auto-fit grid) ───────────────────┐
│  "The product" eyebrow + heading                                    │
│  6-card grid: Session recording · AI-drafted notes · Live           │
│  whiteboard · Parent share links · Session log · Privacy-first      │
└────────────────────────────────────────────────────────────────────┘

┌─ Who it's for (max-width 720px) ───────────────────────────────────┐
│  "Who it's for" eyebrow + heading                                   │
│  2 paragraphs: independent tutors + families                        │
│  [Create your account — free]  [Back to home]                       │
└────────────────────────────────────────────────────────────────────┘

┌─ Pilot context (surface-1 bg) ─────────────────────────────────────┐
│  [Mynk·]  "Currently in pilot"                                      │
│  Whisper/OpenAI disclosure, free-during-pilot context               │
│  Feedback · Privacy · Terms links                                   │
└────────────────────────────────────────────────────────────────────┘
```

**Linked from:** `SiteFooter` (About link added), `MarketingHeader` (About nav link), landing "Learn more" CTA.

**Brand voice:** Honest + direct (B with some D warmth). "We built Mynk because every platform for tutors wants a cut of your revenue. We don't." — sets the tone of tool vs marketplace.

**Dependencies:** Phase A (tokens/fonts). Shares `MarketingHeader` + shadcn `Button` with D1 landing.

**Acceptance criteria (placeholder — refine at design pass):**
- [x] `/` no longer ships as pre-redesign marketing stub
- [x] `/` exposes a distinct **"Sign in (parents)" → `/account/login`** entry, separate from the tutor `/login` link (Andrew 2026-06-02)
- [x] `/about` returns 200 with on-brand layout; linked from `/`
- [x] `npx tsc --noEmit` passes (0 errors)
- [x] `npx next build` exits 0 (route table confirms `/` and `/about` as `○` static)
- [x] 92/92 Jest regression tests pass (1 pre-existing Playwright-in-Jest config issue unrelated to D work)
- [ ] WCAG 2.2 AA — axe with `color-contrast` enabled (pending Andrew merge review + manual smoke)
- [x] No new CSP origins; fonts via `next/font` only
- [x] Invariants A1–A10 unaffected (marketing routes only, no recorder/outbox/auth logic touched)

#### Phase D v2 — brand review (Andrew + wife, 2026-06-02)

**Scope:** Copy + light IA + route rename on `feature/phase-d-landing-about` after first-cut brand review. Marketing pages, `MarketingHeader`, `SiteFooter`, and docs only — no auth/identity/schema/migrations.

| Decision | Outcome |
|---|---|
| **Header sign-in** | Single **Sign in** control opens an accessible menu: Tutor → `/login`, Parent → `/account/login`, Student → `/students/login`. Hero body keeps contextual parent sign-in line. Authenticated tutor state (Dashboard) unchanged. |
| **Features vs About** | First-cut `/about` reframed as **Features** at **`/features`**. All internal links updated. Route **`/about` reserved** (removed) for a future company-story About-us page — **not built this pass**. |
| **Parents marketing page** | **Backlogged** — parent-targeted public page (what families get, privacy posture, how parent/student login works). |
| **No time promises** | Remove all temporal/speed marketing copy (`90 seconds`, `two minutes`, `instantly`, etc.) from public surfaces. Reframe value: AI drafts notes for tutor review when ready; no latency claims until async transcription reliability ships (see BACKLOG). |
| **Tutor-targeted hero** | State plainly near top: Mynk is for **independent/professional tutors** (buyer); parents/students invited by tutor. |
| **Headline** | Keep **"Session notes that write themselves."** — de-emphasize as sole value; broaden subhead/value props to practice OS (durable record, parent comms, you-own-your-data). |
| **Commission copy** | **"No commission on your tutoring rate"** as today's pilot model — not "100% forever" / not implying we never take a cut later. |
| **No anonymous parent access** | Drop all "no login" / login-free parent copy (K-12 no-anonymous-access principle). Parents use **secure parent sign-in**; drop word "polished." |
| **How it works step 2** | **"Teach your lesson"** — no-behavior-change reassurance in supporting line, not step title. |
| **Voice** | **"working tutors"** → **professional / independent tutors**; soften **homework** in marketing (don't conflate with "plan"). |
| **Features page headline** | Keep **"Tutoring infrastructure for independent professionals."** |
| **Marketplace fee claim** | Sourced, non-absolute: Wyzant 25%, Preply up to 33% — not "every platform." Keep **"Mynk is a tool — not a marketplace."** |
| **Session log** | Plain language: time-ordered record of what happened in each session. |
| **Institutions** | **Inclusive:** built first for independent tutors; drop exclusionary "not for agencies/marketplaces/institutions" clause (school departments in scope for Andrew). |

**Gates (v2):** `prisma generate`, `tsc --noEmit`, `next build` (`/` + `/features`, no `/about`), `test:regression`.

---

## §8. Open Questions for Andrew

> **All 10 questions (Q-1 through Q-10) were ratified by Andrew on 2026-05-31.** Original questions preserved below; each has a **RATIFIED 2026-05-31:** outcome. Phase C is no longer blocked on Q-1–Q-3. Phase A can begin immediately.

**Q-1 — OAuth callback domain (blocks Phase C)**
Is the OAuth callback URL in Google Cloud Console `https://usemynk.com/api/auth/callback/google` (specific domain) or something with a wildcard? If the domain is changing as part of v1 launch (e.g., from an older domain), the callback must be updated in Google Cloud Console coordinated with the deploy. If the domain is already `usemynk.com` and staying the same, no OAuth action needed — the `/admin/` prefix removal doesn't touch `/api/` routes.

**RATIFIED 2026-05-31:** RESOLVED. Authorized redirect URIs in Google Cloud Console already include `https://usemynk.com/api/auth/callback/google` (explicit, no wildcard); callback domain is `usemynk.com` and not changing. URL flattening touches only page routes, never `/api/*`. No OAuth action needed.

**Q-2 — Session ID global uniqueness (blocks Phase C)**
Does `WhiteboardSession.id` in the Prisma schema use a globally unique ID (e.g., Prisma's default `cuid()` or `uuid()`)? The proposed URL flattening (`/sessions/[wsid]`) relies on the session ID being globally unique — not scoped to a student. Confirm, then the redirect middleware can safely redirect `/admin/students/[any-id]/whiteboard/[wsid]` to `/sessions/[wsid]`.

**RATIFIED 2026-05-31:** Narrow technical part CONFIRMED — `WhiteboardSession.id` is `uuid()` (globally unique); `/sessions/[wsid]` flattening is safe. BUT this question expanded into a major new architecture: student/parent accounts + participant-scoped session & note access (Sarah wants notes/recordings limited to the intended student, not anyone-with-link). That work is now its own design pass — see [`docs/handoff/session-identity-access-design-2026-05-31.md`](session-identity-access-design-2026-05-31.md) and the epic spine [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

**Q-3 — Operator surface path**
Propose `/superadmin` for Andrew's operator dashboard (waitlist management, user management, system metrics). This separates operator tools from tutor tools when the `/admin/` prefix is removed. Alternatively: keep operator tools at `/admin/` and only remove it from tutor-facing routes. Which approach do you prefer?

**RATIFIED 2026-05-31:** RESOLVED. Remove all `/admin/` from the tutor surface; site-operator tools live at `/superadmin`.

**Q-4 — Tailwind 4 + shadcn install preference**
The v1 component stack is Tailwind 4 + shadcn/ui (locked decision). The current app uses vanilla CSS + inline styles. The Phase B1 install will add both. Any concerns about the migration approach? The execution plan is: Tailwind runs in compatibility mode alongside existing CSS initially, then we migrate component-by-component. The ESLint hex-ban rule activates as components are migrated. Confirm: OK to proceed with this incremental install?

**RATIFIED 2026-05-31:** RESOLVED. Proceed with incremental install (compatibility mode first, migrate component-by-component, end clean).

**Q-5 — Parent share "contact tutor" affordance**
The parent share view (5.8) currently has no contact mechanism. Sarah mentioned that engaged parents "sometimes over text and ask follow-up questions." Should the parent share view include a contact affordance (e.g., a pre-populated mailto link to the tutor's email, or a reply form)? Options: (a) email link — simple, requires tutor email on the share view; (b) no contact — keep the share view purely read-only; (c) defer to Wave 5 with student accounts. Your call.

**RATIFIED 2026-05-31:** RESOLVED (scope moved to the identity/access design). Build a DB-routed parent<->tutor conversation (site keeps the thread), with email as an OPTIONAL channel/notification — NOT a raw mailto. HARD legal gate: the mortensenapps.com umbrella privacy/terms must cover parents/students emailing back before this ships (see [`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md)).

**Q-6 — Session log: billing rate and amount auto-calculation**
Sarah is currently billing externally (Wyzant / UVU by the minute). Does she want rate-per-hour stored in Mynk and billing amount calculated automatically in the session log? Or just billed minutes for now, with external calculation? This determines whether `ratePerHour` and `billedAmount` fields go in the schema now. Sarah said she'll share Wyzant + UVU form templates — has she done so yet?

**RATIFIED 2026-05-31:** RESOLVED — already designed in [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) Surface 7; do NOT re-open. Immutability statement added to §5.4 (Session log): the exact rounded value shown to the tutor is persisted as `billedDurationMin` and is IMMUTABLE once shown — frozen at session-close, NEVER recomputed, even if a rounding rule is later fixed or redesigned. The rounding rule used (`billedRoundingIncrementMin`, `billedRoundingMode`) is stored alongside it as the audit trail of which rule produced that number. Future rule changes affect only NEW sessions; existing rows keep their frozen value AND rule. `ratePerHour`/`billedAmount` remain deferred until in-app billing ships.

**Q-7 — Student-side "add page" capability**
Sarah was uncertain (I5 smoke note): "She's not sure if she needs the student to be able to add a page." The student-side mobile redesign (Phase B6) needs this answered before implementing the toolbar. Options: (a) No — student can't add pages (simpler toolbar, cleaner mobile UX); (b) Yes — student can add pages (more complex toolbar, but Sarah might discover a use case). Default proposal: No for v1, revisable via future Sarah feedback.

**RATIFIED 2026-05-31:** RESOLVED. No for v1 (simpler mobile toolbar), but architecture must not preclude enabling it later.

**Q-8 — Waiting room concept**
Sarah mentioned (U1 smoke note): "a waiting room might be better. Like Google Meet / Teams. Session timer shouldn't start till they've left the waiting room." This is a meaningful UX change to the session start flow. In scope for v1 component redesign or defer? It affects: timer start logic, consent timing, student join flow, FSM state. My recommendation: flag as Wave 3 design item but not Phase B5 scope (solo mode enable is more urgent).

**RATIFIED 2026-05-31:** RESOLVED — YES, build a waiting room (session timer starts when the student LEAVES the waiting room; affects timer/consent/join/FSM). Larger directive from Andrew: this is the TRUE V1 of the whole site — full flow redesign is in scope, best architecture, low-friction "invisible" UI, first-class look/feel, and the site must be INSTRUMENTED (usage analytics) as a first-class v1 requirement, not deferred. Nothing preserved for preservation's sake. Waiting room + session-start flow will be detailed in a queued session-lifecycle flow design pass.

**Q-9 — Default landing after login**
Post-redesign, the dashboard (/) shows "Start a session" + pending recaps. Does this match your expectation for what Sarah sees first? Or should it be: the most recent incomplete session? Or the student list? Confirming this before Phase B2 begins ensures we build the right default landing surface.

**RATIFIED 2026-05-31:** RESOLVED — confirmed: dashboard = next-actions (Start a session + pending recaps), NOT a scheduling/"today timeline". Open sub-question carried into the lifecycle-flow pass: pick-student-then-start vs start-then-invite vs a Teams-like "start a session and invite the student" — pick whatever flows smoothest for Sarah's described usage.

**Q-10 — URL verb for student join**
Proposing `/join/[token]` as the replacement for `/w/[joinToken]`. The "w" was legacy for "whiteboard" — students don't think "whiteboard," they think "join my tutor's session." Is `/join/[token]` the right verb? Alternative: `/session/[token]` (same landing). This is the URL Sarah sends to students in messages — it should match what she'd naturally say. "Click this link to join" → `/join/[token]` seems right, but confirming.

**RATIFIED 2026-05-31:** RESOLVED. `/join/[token]`.

---

## §9. Implementation Notes for Composer Executors

These are conventions the executor must follow — not design decisions.

1. **Token names:** Always use the structured tokens (`--surface-base`, `--surface-1`, `--text-default`, `--border-default`) not the legacy aliases (`--bg`, `--panel`, `--text`). Both resolve to the same values, but new code should use the canonical names.

2. **No raw hex values in component files.** The ESLint hex-ban activates in Phase B1. If a component needs a color not in tokens, propose a new semantic token in the same PR. Don't inline hex to ship faster.

3. **Coral as UI state indicator** must always be paired with a non-color signal (SC 1.4.1). The live dot (`--accent` coral) is always adjacent to "LIVE" text. Never use coral alone to convey information.

4. **`.ai-prose` on AI content.** Every surface that shows AI-generated content (session summaries, recap sections, AI prompts in notes) must use `.ai-prose`. This is both a brand decision and a user-trust signal ("this is AI-generated, not tutor-written").

5. **Touch targets.** Every interactive element in new components must be ≥44×44 CSS px including invisible padding. Smallest button: `size-11` (44px) in Tailwind. Smallest icon button: `<button className="size-11 grid place-items-center">`.

6. **Log prefix registration.** Before implementing any new lifecycle surface, register the 3-letter prefix in `AGENTS.md` § Conventions AND `docs/RECORDER-LIFECYCLE.md` § Cheat Sheet. New prefixes from this doc: `slg` (session log) and `exp` (export). Do this in the same commit as the first log line using that prefix.

7. **Dark mode test in CI.** When Playwright smoke tests are written for Phase B surfaces, include dark-mode snapshots. Use `page.emulateMedia({ colorScheme: 'dark' })` + `page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))` to force dark mode in the test.

8. **Real device test gate for Phase B6.** The student mobile redesign MUST be verified on a real iPhone Safari before the branch merges to master. jsdom reports geometry as zero (per AGENTS.md hard-won lesson 2026-05-30). "Green in Jest" is not sufficient for the viewport math. Use Playwright/WebKit against a local server, or Andrew tests on his phone.

---

## §10. Log Prefix Registry — New Additions

| Prefix | Surface | First log event |
|---|---|---|
| `slg` | Session log view filter/search | `[slg] query dateRange=... student=... triggered` |
| `exp` | Session export lifecycle | `[exp] export=<id> format=wyzant started rows=N` |

These must be added to `AGENTS.md` § Conventions and `docs/RECORDER-LIFECYCLE.md` § Cheat Sheet before Phase B3 executor dispatch.

---

## Changelog

- **2026-05-31:** Initial doc. Authored by Composer 2.5 subagent. Continues `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md`. Incorporates `docs/RELIABILITY-REDESIGN-2026-05-27.md` findings, Sarah 2026-05-26 pilot call answers (no scheduling, session anchor noun confirmed, action list), and `docs/UX-AND-A11Y-SPEC.md` §14–15 reconciliation.
- **2026-05-31:** §8 Q-1–Q-10 ratified by Andrew; billing immutability statement added to §5.4 (Session log).
