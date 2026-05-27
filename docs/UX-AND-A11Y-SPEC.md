# Mynk UX & Accessibility Specification

> **What this is.** The conformance bar, interaction patterns, microcopy
> rules, and quality criteria that the **Mynk v1 redesign** is built
> against. Every per-surface design spec, every component, every PR is
> measured against this doc.
>
> **What this is NOT.** This is *not* a retrofit guide for the current
> app. Per Andrew (2026-05-19): *"this is going to become the first true
> v1. Don't stick with ANYTHING now just because it's been that way so
> far."* The current pages, IA, nav, tab structures, and URL hierarchy
> are explicitly fair game for full redesign.

**Status:** Draft 2026-05-19. Living doc. Gates Phase 1+ of `docs/UX-REFRESH-PLAN.md`. No per-surface design spec (Phase 1 landing, Phase 2 dashboard, etc.) lands until this doc is approved + the open IA questions at the bottom are settled.

**Canonical home for…** the conformance bar, interaction patterns, microcopy, motion, focus, keyboard, error handling, and pattern-vs-pattern decisions (modal vs sheet, toast vs dialog, etc.).

**Companion docs:**
- [`docs/BRAND.md`](BRAND.md) — palette tokens, typography, voice tone matrix
- [`docs/MYNK-BRAND-PHASE-2-DECISIONS.md`](MYNK-BRAND-PHASE-2-DECISIONS.md) — canonical brand decisions + rationale
- [`docs/UX-REFRESH-PLAN.md`](UX-REFRESH-PLAN.md) — strategic phasing (note: Phase 2 task list is now superseded by "v1 from scratch" framing; treat as historical context, not prescription)
- [`docs/DESIGN-TOKENS-PLAN.md`](DESIGN-TOKENS-PLAN.md) — color token migration plan
- [`docs/brand-previews/palette-mocks-FINAL-mynka-blue.html`](brand-previews/palette-mocks-FINAL-mynka-blue.html) — visual reference

---

## 0. TL;DR for engineers and reviewers

| Topic | The bar |
|---|---|
| **Functionality preservation** | **The single most important constraint.** v1 inherits all carry-forward invariants from `RECORDER-LIFECYCLE.md` + `WHITEBOARD-STATUS.md` + `AGENTS.md`. See the **Pre-flight section below** before reading anything else. |
| Conformance | **WCAG 2.2 Level AA** across all surfaces (public + tutor + parent) |
| Color contrast | 4.5:1 normal text, 3:1 large text, 3:1 essential UI components |
| Touch targets | Min **44×44 CSS px** for all interactive elements (WCAG 2.5.8) |
| Keyboard parity | Every mouse-actionable thing is keyboard-actionable with visible focus |
| Motion | Honor `prefers-reduced-motion` for every animation > 200ms |
| Modals/sheets | Focus-trapped, Esc closes, focus restored on close, `role="dialog"` + `aria-modal="true"` |
| Forms | Labeled inputs, inline + submit-time error identification (SC 3.3.1), error text describes how to fix |
| Live regions | `aria-live="polite"` for transcript/status updates during recording |
| Loading | Skeleton (≥200ms expected) or spinner (<200ms), never blank screen |
| Empty states | Heading + body + primary action; no dead-ends |
| Microcopy | Verbs not nouns on buttons; specific not generic in errors; voice matches `BRAND.md` § Voice |
| Testing | axe-core with `color-contrast` ENABLED (currently disabled, regression risk); Playwright snapshots; manual keyboard nav per release |

**Resolved 2026-05-19 PM:** the CTA contrast BLOCKER is fixed. Light-mode `--accent-on` is now dark text `#15203A` on coral (5.64:1, AA). See § 2.2 for the four candidates considered + the locked decision. Coral keeps its CTA role; only the text on top inverts to dark.

**Per Andrew's 2026-05-19 PM addendum:** the v1 redesign's #1 risk is breaking working functionality (recording, outbox, atomic end-session, consent, share-link tokens, CSP) and triggering a long smoke-fix loop Sarah's pilot can't absorb. The Pre-flight section below is the prevention rule — every per-surface design spec walks through it.

---

## Pre-flight: functionality preservation — the smoke-test prevention rule

> **Andrew (2026-05-19), adding this section:** *"Be really careful with
> functionality or this'll be a looooooong smoke test. If there are
> better and safer patterns now that we know what does and doesn't work,
> now is the time to do it — just please don't leave me with 50
> iterations of smoke and fix."*

This is the most important constraint on the v1 redesign, full stop. The current app is functionally reliable because Phases 1–6 paid the smoke-loop tax to find the right patterns. The v1 redesign **must inherit those patterns**, not relearn them. Any IA or surface change that *accidentally* breaks one of the invariants below will trigger a smoke chain Sarah's pilot can't absorb.

This section is divided into:

- **A. Carry-forward invariants** — patterns the v1 *must* preserve. Treat as design-time constraints, not implementation details.
- **B. Better/safer patterns we now know** — generalize these to any new capture/upload/state surface the v1 introduces.
- **C. Anti-patterns to retire** — things the current code does that bit us; don't reintroduce in v1.
- **D. Design-time questions** — ask these before finalizing any v1 surface that touches recording, whiteboard, uploads, or persistence.

### A. Carry-forward invariants (do not break)

| # | Invariant | Where it's documented | If violated… |
|---|---|---|---|
| **A1** | **Recording is the artifact.** Live collab is a table stake; capture correctness is the product. The recorder is the source of truth; never sacrifice replay correctness for live-sync simplicity. | `docs/WHITEBOARD-STATUS.md` § Guardrails #1, `AGENTS.md` § North Star | Sarah loses real sessions. |
| **A2** | **Three-pillar recorder stack.** Pillar 1 = lifecycle FSM (pure function, host-owned latches). Pillar 2 = IndexedDB upload outbox (durable, survives refreshes, serial-within-stream, parallel-across-streams). Pillar 3 = atomic `endWhiteboardSession` (one Prisma transaction). | `docs/RECORDER-LIFECYCLE.md` (entire doc — required read before any touch) | Sarah loses real sessions OR gets duplicate uploads OR mid-end-session crashes leave the DB in an inconsistent state. |
| **A3** | **B3 — capture surface is always-mounted.** The audio recorder mounts at the surface boundary; it's hidden via CSS, never conditional-rendered. Currently enforced by `AudioInputTabs.tsx` lines 32–49. Whatever the v1 anchor noun ends up being (session / today / student), the recorder mounts at that surface and stays mounted. | `src/app/admin/students/[id]/AudioInputTabs.tsx` lines 32–49, `UX-REFRESH-PLAN.md` § cross-phase reliability | Recording stops mid-session when the user switches tabs / opens a sheet / triggers a re-render. |
| **A4** | **Live collab is the table stake (whiteboard).** Even when the sync server flakes mid-session, the recording must still finalize cleanly with `sync-disconnect`/`sync-reconnect` markers in the event log. | `docs/WHITEBOARD-STATUS.md` § Guardrails #1 | A flaky sync server takes the session with it; Sarah loses the whiteboard recording. |
| **A5** | **Library-agnostic event-log format.** The recorded JSON we persist is *our* canonical format, not Excalidraw's `Element` shape leaked through. A future tldraw / custom-canvas swap must only require a new adapter, not break old sessions. | `src/lib/whiteboard/excalidraw-adapter.ts`, `docs/WHITEBOARD-STATUS.md` § Guardrails #3 | Every old session breaks the day Excalidraw deprecates `Element`. |
| **A6** | **Consent + recording disclosure.** Consent is server-side enforced on the `WhiteboardSession` row; back/forward nav cannot bypass it. (Per current rules; whether v1 makes consent per-student-once-only is a Phase 2 design decision but the *server enforcement* stays.) | `docs/WHITEBOARD-STATUS.md` § Guardrails #4 | Legal exposure + Sarah's trust. |
| **A7** | **Tokenized + revocable share links.** No public Blob URLs for student content. Parent share links are token-gated, can be revoked. Same applies to any new sharing surface v1 adds. | `AGENTS.md` § Conventions, `src/middleware.ts` CSP | Parent content leaks to anyone who guesses a URL pattern. |
| **A8** | **Server-side ownership assertions.** Every server action that touches student data calls `assertOwnsStudent(adminUserId, studentId)` (or equivalent). Applies to every new server action v1 introduces. | `AGENTS.md` § Conventions | Cross-tutor data leaks via crafted requests. |
| **A9** | **Additive migrations only.** Never drop or rename a column in production Neon without a multi-step migration. Applies to any v1 schema change. | `AGENTS.md` § Conventions | Production DB drops on deploy; rollback path destroyed. |
| **A10** | **Tight CSP.** Adding any new external origin (font CDN, image host, sync server) requires updating `src/middleware.ts` and documenting in `docs/PLATFORM-ASSUMPTIONS.md`. shadcn install MUST self-host fonts (no Google Fonts CDN) — already a constraint per UX-REFRESH-PLAN reliability check. | `src/middleware.ts`, `docs/PLATFORM-ASSUMPTIONS.md` | First-paint blocked; analytics flagged as cross-origin; CSP violations cluttering prod logs. |

**For the next Opus design session:** before approving any IA or surface design, walk through A1–A10 and ask "does this break or preserve each invariant?" Capture the answer in the per-surface design spec.

### B. Better/safer patterns we now know — generalize these

These are the patterns the three-pillar stack EARNED. Any *new* capture / upload / state-machine / sharing surface in v1 should adopt them by default rather than reinvent.

| Pattern | What it is | Where to use it in v1 |
|---|---|---|
| **B1. Pure-function FSM + host-owned latches** | `evaluate(inputs) → outputs` as a pure function. Host owns any "sticky" state. Re-renders are safe. Tests are deterministic. | Any non-trivial UI state machine v1 introduces — e.g., AI recap drafting states, parent-share-link sharing states, onboarding-flow progress. |
| **B2. Durable IndexedDB outbox for any uploadable artifact** | Persist locally first, upload-with-retry second. Serial-within-stream, parallel-across-streams. Dedupe by `(scopeId, streamId, segmentId)`. | Any new uploadable artifact v1 introduces — whiteboard snapshots, recap drafts saved offline, parent-message drafts. The outbox abstraction in `src/lib/recording/upload-outbox.ts` is generic enough to extend. |
| **B3. Always-mounted capture surface** | See A3. Generalize: any surface that captures user-generated content (audio, drawing, typing into a long-form editor) is mounted at the boundary, hidden via CSS when not visible, never unmounted while a capture might be in progress. | Recap editor, parent-message editor, any future video-capture surface. |
| **B4. Atomic end-of-X transaction** | One server transaction stamps the terminal state, swaps the canonical artifact pointer, registers everything that needed to finalize, and revokes anything ephemeral (tokens, live joins). | `endRecapDrafting`, `revokeShareLink`, `endOnboarding`, `endTrialPeriod` — anything that needs "after this, the world is in a stable state." |
| **B5. Per-session/per-action 3-letter ID logging prefix** | Every new feature with a session-bound lifecycle picks a 3-letter prefix and logs every state transition. Currently in use: `rid` (audio recorder), `wbsid` (whiteboard session), `obx` (upload-outbox row), `snp` (snapshot generation), `pvw` (preview-before-Start). | Any new lifecycle surface — claim a prefix, log every transition. Without this, prod debugging is impossible. |
| **B6. Snapshot/preview rendered via the same engine as replay** | The "preview before Start" surface and the "replay" surface use the same `buildSceneAt` / `createScenePainter` engine. Single source of truth for "what does this look like." | Any v1 surface that needs to show "what this artifact looks like" without the editor — recap previews, whiteboard thumbnails on the dashboard. |
| **B7. Adapter layer for any third-party data shape** | Excalidraw `onChange` → our canonical event log → Excalidraw scene on replay. The third-party shape doesn't leak into our schema or our wire format. | Wherever v1 introduces a new third-party dep (a rich-text editor for recaps, a video peer library, etc.). |
| **B8. Tokenized + revocable URLs by default** | Anything shareable gets a token; the token can be revoked; the token doesn't encode internal IDs. | New v1 sharing surfaces — single-recap shares, calendar-link sharing, etc. |
| **B9. Adversarial review against the 5 reliability axes before each phase ships** | Data integrity, backwards compatibility, performance, error visibility, recoverability. BLOCKERs fold into Phase-1 acceptance, not deferred. | Every per-surface design spec gets this review. It catches the "but what if the network drops mid-X" cases that smoke loops otherwise find. |
| **B10. Sticky latches for "this thing happened at least once"** | `everHadParticipants`, `everHadAudioFlow` — once true, stays true. Survives re-renders, doesn't need persistence layer. | "User has dismissed the welcome banner," "User has connected at least one student," "Recap has been edited at least once." |
| **B11. Default-discoverability principle** | Every default value Mynk picks on the user's behalf (rounding rule, theme, mic device, default prompt style, page size, default landing surface, etc.) gets a discoverability cue. **Minimum bar:** the setting page describes the default explicitly ("Default: 15-min increments, rounded up — change to 5/30 or 'nearest'") AND the consuming surface either tooltips it, banner-hints it on first use, or links to Settings ("We're rounding to 15min. [Change in Settings →]"). Don't rely on users finding settings on their own — that's industry-standard discoverability hygiene. Pattern source: Andrew 2026-05-27, applied to W2.5 rounding settings as the first concrete instance. | **Every v1 surface that picks a default on the user's behalf** — rounding rule + mode (W2.5), theme (Phase 0 + dark-mode work), mic preference (W1 audio durability), default landing surface (W3 IA), default page-size on session-log table (W2.5), org-aware session labelling (BACKLOG follow-up), prompt voice/style preference (eventually), default whiteboard tool, default ribbon collapse state, etc. Composer/Sonnet design passes for any of these MUST include a default-discoverability spec. |

### C. Anti-patterns to retire — don't reintroduce in v1

Patterns the current code uses that bit us. The v1 redesign is the chance to delete them, not preserve them out of inertia.

| # | Anti-pattern | Where it bit us | What to do instead in v1 |
|---|---|---|---|
| **C1** | **Inline `rgba(255,255,255,X)` literals assuming dark bg.** | ~60 instances across ~25 files (per audit). On any light-mode surface these become invisible. | Use design tokens (`var(--surface-1)` etc. — see `BRAND.md`). Lint rule blocks new ones. |
| **C2** | **Conditional-rendering the recorder** (or any capture surface). | Pre-B3; recording stops when user navigates. | Always-mount; hide via CSS. (Invariant A3.) |
| **C3** | **`window.confirm()` for destructive actions.** | Loses focus, can't be styled, can't be tested, blocks the render thread. | shadcn `Dialog` for confirmations, or `Toast`+Undo for reversible. (Spec § Dialogs.) |
| **C4** | **Status-by-color-only signals.** | Red/green pills with only color difference fail WCAG 1.4.1 and color-blindness checks. | Color + icon + text. (Spec § 2.4.) |
| **C5** | **Full-page "Resume gate" blocking the workspace.** | Friction; user has to navigate a separate page just to get back to work. | Inline banner with primary actions. (Spec § 9.3.) |
| **C6** | **Hardcoded `var(--token, #fallback)` where fallback is a different color.** | Audit found `var(--color-primary, #2563eb)` while `--color-primary` is `#7c5cff`. If the token ever fails to resolve, the wrong color flashes. | Fallback should match the token value (or omit if the token is guaranteed defined). |
| **C7** | **Polling / drag-fires-network-requests patterns.** | `Replay scrub drag` bug — dragging the scrubber fires 429s; client never throttles. | rAF/debounce drag updates; `AbortController` to supersede in-flight requests; client-side cache by `(sessionId, t)`. |
| **C8** | **Hydration-mismatch surfaces** (locale-formatted dates rendered without stable TZ, theme detection that differs server-vs-client, `Date.now()`/`Math.random()` at render). | React #418 on `/admin/students/[id]`. | Render dates server-side with a fixed TZ; theme set via cookie before first paint; no clock/random in render. |
| **C9** | **Excalidraw IndexedDB "Load draft" popup competing with our recovery.** | User picks wrong option, state forks. | Suppress Excalidraw's local recovery; rely on our checkpoints + recorder truth. |
| **C10** | **MediaRecorder blobs without duration header for playback.** | `<audio>.duration` = `Infinity`; can't scrub; right-side timer shows `0:00`. | Server-side ffmpeg pass adds duration header during finalize; or use `preload="metadata"` + virtual scrubber on client. |
| **C11** | **Inline `style={{}}` everywhere instead of design tokens / classes.** | ~330 files; impossible to refactor consistently. | Tailwind utilities + shadcn primitives (per `UX-REFRESH-PLAN.md` Phase 0). |
| **C12** | **`#fff` literals in pseudo-element styles** (slider thumbs, etc.). | Pseudo-elements can't take CSS-var inline styles via React; embedded `<style>` blocks have to be tokenized too. | Use Tailwind utilities or scoped CSS modules with `var(--token)` for pseudo-elements. |
| **C13** | **Race between custom-element registration and DOM mount** (mathlive first-open white-box). | Element appended before `connectedCallback` chain warms up. | `await customElements.whenDefined(name)` + one `requestAnimationFrame` before usage. |

### D. Design-time questions for any v1 surface that touches recording / whiteboard / uploads / persistence

The next Opus design session must walk through these for every spec that has *any* connection to capture or persistence. Capture the answers in the per-surface design spec.

1. **Does this surface or any flow on it interact with a capture pillar (recorder FSM, outbox, end-session transaction)?** If yes, name which pillar(s) and confirm the design preserves the contract.
2. **If a capture is in progress when the user enters/leaves this surface, what happens?** Is the surface always-mounted (B3)? Does navigating away pause/end/keep-going the capture?
3. **What's the recovery path if a capture/upload fails on this surface?** Is the user shown a non-blocking banner? Can they retry? Where does buffered work persist?
4. **What's the per-session ID prefix for this surface, if it has a lifecycle?** Pick one (3 letters) or reuse an existing one. Document in `AGENTS.md` § Conventions.
5. **What server actions does this surface trigger? Does each call `assertOwnsStudent` (or appropriate ownership check)?**
6. **Does this surface need a schema change? Is the migration additive? Is the rollback path documented?**
7. **Does this surface introduce a new external origin (font, image host, sync, API)?** If yes, CSP update + `PLATFORM-ASSUMPTIONS.md` doc.
8. **What's the failure mode of every UI element on this surface?** Empty state, loading state, network-dropped state, server-error state, validation-error state — designed, not "TBD."
9. **What's the keyboard-only path through this surface, end-to-end?** No mouse-only flows (Spec § 6).
10. **Is there a screen-reader announcement for every state change that matters?** (Recording started, upload finished, error happened, validation failed.)

### Cross-references — go deeper

- `docs/RECORDER-LIFECYCLE.md` — full architecture of the 3-pillar stack (REQUIRED before touching lifecycle/outbox/end-session)
- `docs/LIVE-AV.md` — peer mesh + signaling + Web Audio fan-out (REQUIRED before touching `useLiveAV` / `peer-mesh` / `mic-recorder-audio.addRemoteAudio`)
- `docs/WHITEBOARD-STATUS.md` § Guardrails — the 4 immutable whiteboard rules
- `docs/PHASE-1B-STATUS.md` — outbox + atomic end-session details
- `docs/PLATFORM-ASSUMPTIONS.md` — CSP, hosting, observability constraints
- `docs/BACKLOG.md` — every bug we've shipped + the patterns that fixed them
- `AGENTS.md` — North Star, reliability bar, per-session ID convention, ownership-assertion convention

---

## 1. Conformance target & why

### 1.1 Target: WCAG 2.2 Level AA

Adopted as the project bar 2026-05-19. WCAG 2.2 was published October 2023; AA is the legally-required conformance level under most digital-accessibility regimes:

| Regime | Effective | Applies to Mynk when… |
|---|---|---|
| **European Accessibility Act (EAA)** | June 28, 2025 | Any EU consumer (B2C) can reach `mynk.app` today |
| **UK Equality Act 2010 / PSBAR** | Ongoing | Any UK consumer |
| **US ADA Title III** | Active case law since Robles v. Domino's (2019) | US public-facing commercial site |
| **EN 301 549** | EU public procurement | Mynk Org / University pilot reaches any EU institution |
| **Section 508 (US federal)** | Active | If Mynk ever sells to US federal entity |

The practical procurement question Mynk WILL be asked by institutional buyers: *"What is your WCAG conformance level? Do you have a VPAT?"* Hitting AA is table stakes. Hitting "AAA where feasible" is a competitive advantage but not the v1 bar.

### 1.2 What we are NOT targeting

- **WCAG 2.2 Level AAA** — many AAA criteria (most notably 1.4.6 contrast 7:1 for normal text) constrain visual design beyond what the brand can sustain. We will hit AAA opportunistically (the Mynka Blue palette already does on most normal-text combos — see § 2), but we don't enforce it.
- **WCAG 2.1** — the EAA-required floor. AA 2.2 is strictly stronger and only adds 9 net new success criteria (compared to 2.1). No reason to anchor below current.

### 1.3 Where AAA happens for free

Per the contrast audit (§ 2), **most normal-text-on-surface combinations in Mynka Blue already pass AAA (≥7:1).** The spec calls this out so engineers reading low-contrast tickets can see what's intentional restraint vs accidental drift.

---

## 2. Color & contrast (with full Mynka Blue audit)

WCAG 2.2 requires:

| Criterion | Requirement | Applies to |
|---|---|---|
| **SC 1.4.3 (Contrast — Minimum)** AA | 4.5:1 normal text, 3:1 large text (≥18pt / 14pt bold) | All non-decorative text |
| **SC 1.4.11 (Non-text Contrast)** AA | 3:1 for UI components & essential graphical objects | Borders, icons, focus rings, indicators-of-state |
| **SC 1.4.13 (Content on Hover or Focus)** AA | Hover/focus reveals must be dismissable, hoverable, persistent | Tooltips |

### 2.1 Mynka Blue contrast audit (computed 2026-05-19)

Every token pair that can render text or convey UI state, in both modes. Ratios computed via the WCAG sRGB luminance formula; full PowerShell script committed in shell history.

#### Light mode

| Pair | Ratio | Verdict | Used for |
|---|---|---|---|
| `text #15203A` on `surface #F5F4EC` | **14.65** | PASS AAA | Body, headings on page bg |
| `text #15203A` on `surface-raised #FCFBF4` | **15.58** | PASS AAA | Body, headings on cards |
| `text #15203A` on `surface-sunken #ECEBE1` | **13.49** | PASS AAA | Body in inset wells |
| `text-muted #5A6877` on `surface` | **5.17** | PASS AA | Subtitles, helper text |
| `text-muted` on `surface-raised` | **5.50** | PASS AA | Subtitles on cards |
| `text-muted` on `surface-sunken` | **4.76** | PASS AA (tight) | Subtitles in wells |
| `brand #1E3D54` on `surface` | **10.28** | PASS AAA | Links, brand text |
| `brand` on `surface-raised` | **10.94** | PASS AAA | Links on cards |
| `accent-text #8A3C25` on `surface` | **6.91** | PASS AA | Eyebrows on page bg |
| `accent-text` on `accent-soft #F8E0D6` | **6.04** | PASS AA | Eyebrow + AI labels in AI panels |
| `text` on `accent-soft` | **12.79** | PASS AAA | AI prose body |
| Cream `#FCFBF4` on `brand` fill | **10.94** | PASS AAA | CTA text on brand-blue button |
| **Dark `#15203A` on `accent` fill** | **5.64** | PASS AA | CTA text on coral button — RESOLVED 2026-05-19 (Option A) |
| ~~Cream `#FCFBF4` on `accent` fill~~ | ~~2.76~~ | ~~🔴 FAIL~~ | ~~Was BLOCKER. Replaced 2026-05-19 PM with dark text on coral.~~ |
| `accent #E27D60` on `surface` | **2.59** | ⚠️ FAIL (UI 3:1) | Coral as standalone state indicator |
| `border-strong #4A6680` on `surface` | **5.43** | PASS AA (UI) | Focus rings, essential borders |
| `border #C5CFD0` on `surface` | **1.44** | ⚠️ FAIL (UI 3:1) | Default card borders |
| `brand` fill on `surface` (UI element) | **10.28** | PASS AAA | Filled brand buttons |

#### Dark mode (every pair passes)

| Pair | Ratio | Verdict |
|---|---|---|
| `text #F0EDE4` on `surface #051A24` | 15.21 | PASS AAA |
| `text` on `surface-raised #0E2A38` | 12.75 | PASS AAA |
| `text` on `surface-sunken #021018` | 16.46 | PASS AAA |
| `text-muted #A5B5C0` on `surface` | 8.45 | PASS AAA |
| `text-muted` on `surface-raised` | 7.09 | PASS AAA |
| `brand #7EA4B1` on `surface` (links) | 6.64 | PASS AA |
| `accent #E27D60` on `surface` | 6.22 | PASS AAA |
| `accent-text #E8A08A` on `accent-soft #2E1D18` | 7.53 | PASS AAA |
| `text` on `accent-soft` (AI prose) | 13.75 | PASS AAA |
| Dark text on `accent` fill (CTA in dark) | 6.22 | PASS AA |
| Dark text on `brand` fill in dark | 6.64 | PASS AA |
| `border-strong #6A8FA0` on `surface` | 5.13 | PASS AA (UI) |
| `border #1C3548` on `surface` | 1.40 | ⚠️ FAIL (UI 3:1) — same issue as light |

### 2.2 CTA text on coral fill — RESOLVED 2026-05-19 PM (Option A)

**Decision: Option A — dark text on coral.** Light-mode `--accent-on` changed from cream `#FCFBF4` (2.76:1, FAILED) to text-color `#15203A` (5.64:1, AA). Dark mode unchanged (already dark text on coral, 6.22 AA). Coral keeps its CTA role; only the text on top inverts to dark.

**Why Option A won** (Andrew's selection after viewing all four side-by-side at `docs/brand-previews/cta-options-comparison.html`):

- **Token-cheapest fix.** One value changes; no new tokens to manage; no cascading layout consequences.
- **Preserves the bright-coral CTA energy.** Options B and C made the CTAs darker/more austere; Option D removed coral from CTAs entirely. A keeps the warm bright moment we earned through 6+ rounds of palette exploration.
- **No follow-on Phase 1 design problem.** Option D would have created a brand-blue-button-on-brand-blue-card situation in the dashboard up-next card; A doesn't.

**Fix candidates considered** (preserved for audit trail):

| Option | New light tokens | Ratio | Why not chosen |
|---|---|---|---|
| **A. Dark text on coral (CHOSEN)** | `--accent-on: #15203A` | **5.64** AA | — |
| B. Reuse `--accent-text` as fill | CTA fill `#8A3C25`, cream text | **7.35** AAA | Loses bright-coral CTA energy; mood goes "serious" not "warm." |
| C. Add `--accent-strong` for CTA fills only | New token `#9E3D24` | **6.43** AA | Adds a 4th coral hue to manage; net visual gain over A is small. |
| D. Demote coral from CTA role entirely | CTA fill becomes `--brand` `#1E3D54` | 10.94 AAA | Tight brand voice ("blue is the brand, coral is the spark") but creates the up-next-card brand-blue-on-brand-blue problem; bigger Phase 1 design lift than A. |

**Downstream changes from this decision** (already applied 2026-05-19 PM): `BRAND.md` token + warning section, `MYNK-BRAND-PHASE-2-DECISIONS.md` color table + § History entry, `palette-mocks-FINAL-mynka-blue.html` `--accent-on` value updated.

### 2.3 Three non-blocking watch-items

#### Coral as standalone UI state indicator (`accent` on `surface` = 2.59)

**Where it shows up:** live recording dot, mic-ring ambient glow, section underline accents, active-tab indicator if we use coral for that.

**WCAG SC 1.4.11 requires 3:1 for "essential" UI components.** Standalone coral fails. Mitigations (any one is sufficient):

1. **Pair with a text label.** A live-dot is fine if it's adjacent to "LIVE" text — the text passes contrast and conveys the same information.
2. **Pair with a darker outline.** A coral dot with a 1px `accent-text` (`#8A3C25`) ring around it gives the *shape* a 6.91:1 contrast against surface, satisfying "essential graphical object."
3. **Pair with shape or motion.** A coral pulse animation is detectable independent of color.
4. **Don't use coral as the SOLE state signifier.** Always pair with text, shape, or position change.

This is a design rule, not a palette change. Bake into the spec as a non-negotiable when using coral.

#### Default border on surface (1.44 light / 1.40 dark)

`--border` `#C5CFD0` on cream is decorative-grade only. **Rule:** when a border is the *sole* delineator of a UI region (no elevation, no surface-raised bg, no shadow), use `--border-strong` (5.43 light / 5.13 dark, both AA). When a region has elevation OR a different surface bg, `--border` is fine as a decorative hairline.

#### `text-muted` on `surface-sunken` (4.76, tight pass)

Above 4.5 but with no margin. Rule: avoid placing `text-muted` on `surface-sunken` for body-length copy. For brief metadata (timestamps, "3 minutes ago"), the slight reduction in readability is acceptable. For paragraph copy in inset wells, use `text` instead.

### 2.4 Color-meaning rules (SC 1.4.1 — Use of Color)

WCAG 1.4.1 forbids using color as the *only* visual means of conveying information. Mynk-specific application:

- ❌ A red border-only error state with no error text or icon. (Color-blind users miss it.)
- ✅ Red border + error text + an icon = three signals; color is reinforcement, not the only signal.
- ❌ A green vs red status pill where the only difference is hue.
- ✅ A "Connected" vs "Disconnected" pill with different text AND different icon AND color reinforcement.
- ❌ Coral text inside a normal paragraph indicating "this is the important sentence."
- ✅ Coral text + bold + a leading icon = redundantly signaled importance.

---

## 3. Typography (a11y constraints on top of `BRAND.md`)

### 3.1 Minimum sizes

| Role | Minimum | Current spec |
|---|---|---|
| Body text | 16 CSS px | Inter 400 at 16px (per `BRAND.md`) |
| Helper / caption / timestamp | 14 CSS px | OK |
| Label / mono badge | 11 CSS px | OK — non-essential metadata only |
| Touch-target-adjacent label | Whatever size; the *target* must be 44×44, not the text |

**Never** render essential text below 14 CSS px. Decorative labels (eyebrows, surface numbers, mono-tag badges) can go to 11 px because they're metadata, not the primary content.

### 3.2 Line length & line height

- Optimal line length: **45–80 characters** for body prose. Use `max-width: 65ch` on long-form content blocks (parent share recap, AI prose).
- Line height: **1.5** for body, **1.2–1.3** for headings, **1.4** for AI prose (Fraunces small-`opsz` reads denser than Inter at the same line-height).

### 3.3 Reflow (SC 1.4.10)

Content must reflow at 320 CSS px width without horizontal scroll, except for:
- Data tables
- Maps
- Images / video
- The whiteboard canvas itself
- Code blocks (acceptable per WCAG)

This means **mobile-first layout is not optional.** Every surface must be designed for 320px and progressively enhance up. The current desktop-first patterns must be rethought during v1 design.

### 3.4 Text-resize (SC 1.4.4)

Text must remain readable at 200% browser zoom without loss of functionality. Implication: avoid fixed `height` on text containers; use `min-height` instead; never truncate primary content (truncating secondary metadata with a tooltip is fine).

### 3.5 Tabular numerals + text-wrap balance

Per `UX-REFRESH-PLAN.md` § research synthesis — implement as utility classes available everywhere:

```css
.tabular-nums { font-variant-numeric: tabular-nums; }
.text-balance { text-wrap: balance; } /* headlines only; no body */
.text-pretty  { text-wrap: pretty; }  /* body paragraphs */
```

Tabular numerals: timestamps, session counts, duration, prices, anywhere numbers stack vertically. Text-balance: headlines, marketing copy.

---

## 4. Touch targets & pointer (SC 2.5.8 — Target Size Minimum)

Every interactive element must be ≥ **44×44 CSS px**, including padding. Smaller visual hit-area is allowed if invisible padding makes the *clickable region* 44×44.

**Current code: zero files enforce this.** Audit at `MicControls.tsx` slider thumbs and `PageStrip.tsx` thumbnails likely fails.

**Implementation pattern:**

```tsx
// Bad: 24px icon button with no padding
<button className="icon-btn"><Icon size={16} /></button>

// Good: 24px icon centered in a 44×44 button
<button className="size-11 grid place-items-center"><Icon size={16} /></button>
```

**Exceptions** (WCAG-permitted):
- Inline links in body text (link IS the text; sized with the prose)
- Equivalent control elsewhere on the page (e.g., a tiny "×" close button is OK if there's also a full-size "Cancel" button)
- Browser-native controls (default `<input type="checkbox">`)

---

## 5. Focus management

### 5.1 Visible focus ring (SC 2.4.7)

Every focusable element must have a focus indicator that meets:
- ≥ 3:1 contrast against adjacent colors
- ≥ 2 CSS px thick (WCAG 2.4.11 AA)
- Not behind other elements

**Spec:** All focus rings use `--border-strong` color, 2px solid, with a 2px offset to lift off the element edge.

```css
:focus-visible {
  outline: 2px solid var(--border-strong);
  outline-offset: 2px;
  border-radius: inherit;
}
```

`focus-visible` not `focus` — keyboard users get the ring; mouse users don't. (Mouse-clicked buttons still receive focus, but the ring is suppressed because the user already knows where they clicked.)

### 5.2 Focus order (SC 2.4.3)

Tab order matches visual reading order. Use semantic HTML; never `tabIndex` to reorder. Tabindex values:
- `tabIndex={0}` — make non-button element focusable
- `tabIndex={-1}` — programmatically focusable (not in tab cycle)
- `tabIndex` ≥ 1 — **never use** (breaks tab order)

### 5.3 Focus on dynamic content

When a route changes (Next.js navigation), focus should move to the new `<h1>` or a designated landmark. When a modal opens, focus moves to the first focusable element inside (typically the close button or the primary input). When a modal closes, focus returns to the element that opened it.

Implementation: `useFocusOnMount` hook or shadcn's built-in Dialog focus management.

### 5.4 Skip link (SC 2.4.1 — Bypass Blocks)

Every page that has navigation needs a "Skip to main content" link as the first focusable element. Visually hidden until focused.

```tsx
<a href="#main-content" className="sr-only focus:not-sr-only ...">
  Skip to main content
</a>
```

The target `<main id="main-content">` must have `tabIndex={-1}` so it can receive focus programmatically.

---

## 6. Keyboard navigation

### 6.1 Universal model

| Key | Action |
|---|---|
| Tab | Focus next interactive element |
| Shift+Tab | Focus previous |
| Enter | Activate buttons, links, submit forms |
| Space | Activate buttons, toggle checkboxes |
| Esc | Close modal / sheet / popover / inline editor; cancel current action |
| ↑ ↓ | Navigate within composite widgets (lists, menus, comboboxes) |
| ← → | Navigate within tab-like widgets, range sliders, carousels |
| Home / End | Jump to start/end of composite list |
| / (forward slash) | Focus search input (if global search exists) |
| Cmd/Ctrl + K | Open command palette (Phase 3) |

### 6.2 Mouse-parity rule

**Every** action triggerable by mouse must be triggerable by keyboard. No exceptions. Mouse-only patterns to avoid:
- Hover-only menus (use click-to-open with hover-shortcut as enhancement)
- Drag-and-drop without keyboard alternative (provide arrow-key reorder)
- Right-click-only menus (always have a corresponding visible button)

### 6.3 Whiteboard exception

The whiteboard canvas is inherently pointer-driven. Excalidraw provides keyboard shortcuts (P for pen, R for rectangle, etc.) — these satisfy keyboard-accessibility for tool selection. The actual *drawing* doesn't have a keyboard equivalent and is an acceptable WCAG exception per SC 2.1.1 (the activity is essential to the function).

---

## 7. Motion & animation

### 7.1 Honor `prefers-reduced-motion` (SC 2.3.3)

**Mandatory.** Wrap any animation > 200ms in a reduced-motion-respecting class:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Some animations are essential (e.g., the live-recording pulse — it's the visual signal that recording is active). Essential animations CAN play under reduced-motion but should be subtler (a slow fade vs a bouncing dot).

**Current code: zero `prefers-reduced-motion` queries.** Adding this is a global one-block change in `globals.css` for the default; per-component overrides for essential signals.

### 7.2 Auto-playing content (SC 2.2.2)

Anything that plays automatically for > 5 seconds must have a pause/stop/hide control. The whiteboard replay auto-play satisfies this with the existing play/pause control. The marketing landing's "live transcript" visual (currently animated in the F1/FINAL mockup) is OK because it's stopped/started by scroll position and doesn't loop indefinitely.

### 7.3 Flash limit (SC 2.3.1)

No more than 3 flashes per second. Trivially satisfied — Mynk has no strobing content.

### 7.4 Motion principle: serve the function

Animation must communicate, not decorate. Allowed/expected:
- 150ms fade-in for newly-mounted content (prevents flash of unstyled content)
- 200ms slide-in for sheets, drawers
- Pulse on recording active state (essential signal)
- Skeleton shimmer (signal that content is loading)

Disallowed without justification:
- Page-load curtain animations
- Hover scale-up on cards
- Decorative parallax
- Anything that delays the user's action by > 200ms

---

## 8. Forms

### 8.1 Label association (SC 1.3.1, SC 3.3.2)

Every input has a programmatically-associated label. Three valid patterns:

```tsx
// 1. <label htmlFor> (preferred)
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// 2. Wrapping label
<label>
  Email
  <input type="email" />
</label>

// 3. aria-label (only when visual label is omitted by design — e.g. search icon-only input)
<input aria-label="Search" type="search" />
```

Placeholder text is NOT a label. Placeholders disappear once typing starts; users with cognitive disabilities lose context.

### 8.2 Required field marking (SC 3.3.2)

Required fields marked with `aria-required="true"` AND a visible "Required" indicator (asterisk or "(required)" text). Don't use color alone (SC 1.4.1).

```tsx
<label htmlFor="email">
  Email <span className="text-muted">(required)</span>
</label>
<input id="email" type="email" required aria-required="true" />
```

### 8.3 Error identification & recovery (SC 3.3.1, 3.3.3)

When a field has an error:

1. **Mark** with `aria-invalid="true"`
2. **Describe** the error with `aria-describedby` pointing to the message
3. **Color** the field border with `--error` (with a non-color signal too — icon, prefix word)
4. **Message** says *what's wrong* AND *how to fix it*

```tsx
<label htmlFor="email">Email</label>
<input
  id="email"
  aria-invalid={hasError}
  aria-describedby={hasError ? "email-error" : undefined}
/>
{hasError && (
  <p id="email-error" className="text-error">
    Email must include an @. Try again.
  </p>
)}
```

### 8.4 Inline vs submit-time validation

- **Inline (on-blur):** for format validation that doesn't require server check — email format, password complexity, required fields the user skipped.
- **Submit-time:** for server-validated errors — email already taken, wrong password, etc.
- **Never on-keystroke:** validating while the user types is hostile; let them finish.

When submit fails, focus moves to the first invalid field. Page does not reload.

### 8.5 Microcopy for errors (§ 11 for full guide)

| Bad | Good |
|---|---|
| "Invalid credentials" | "Email or password didn't match. Try again, or [reset your password]." |
| "Required field" | "Email is required." |
| "Format error" | "Email needs an @ — like `you@example.com`." |
| "Network error" | "Couldn't reach Mynk. Check your internet, then try again." |

---

## 9. Dialogs, sheets, modals, drawers

### 9.1 Which to use when

| Pattern | When | Examples |
|---|---|---|
| **Dialog** (modal) | Confirmation of destructive/irreversible action; blocking decision required | Delete student? Confirm? |
| **Sheet** (side-anchored panel) | Secondary task, mostly form-based, user might want to refer to underlying page | Edit student profile, configure share link, AI assist panel |
| **Drawer** (full-height side panel) | Persistent secondary nav or context (mostly desktop) | Inspector for a session detail |
| **Popover** | Brief interaction, no form, no scrolling required | Date picker, color swatch picker |
| **Toast** | Reversible action confirmation, transient | "Note saved · undo" |
| **Banner / inline** | Persistent context that doesn't require action right now | "We lost connection — reconnecting…" |
| **Full page** | Long-form content, primary task | Recording session, whiteboard workspace |

### 9.2 Dialog/sheet contract (mandatory)

Every modal-ish surface must:

1. Have `role="dialog"` and `aria-modal="true"`
2. Have `aria-labelledby` pointing to the heading (or `aria-label` if no visible heading)
3. Trap focus: Tab cycles only within the dialog
4. Restore focus to the trigger when closed
5. Close on Esc
6. Close on click of an explicit close button (× in upper-right is the convention)
7. **Not** close on outside-click for destructive-confirmation dialogs (would let users dismiss accidentally)
8. **Yes** close on outside-click for sheets/popovers (less consequential)

shadcn `Dialog` + `Sheet` handle all of this. Don't roll your own.

### 9.3 Banner pattern (replaces blocking full-page gates)

The current "Resume gate" (full-page block when a previous session is in progress) becomes an **inline banner** at the top of the relevant surface — not blocking, dismissible, with a primary action.

```tsx
<Banner severity="info">
  You have an in-progress session with Aiden from 3:42 PM.
  <Banner.Action onClick={resumeSession}>Resume</Banner.Action>
  <Banner.Action onClick={discardSession}>Discard and start new</Banner.Action>
</Banner>
```

### 9.4 Toast vs Dialog for destructive actions

| Action | Pattern | Why |
|---|---|---|
| Delete a note (recoverable) | Optimistic delete + toast with Undo (8s) | No interruption |
| Delete a student (data loss) | Confirmation dialog | Genuinely destructive |
| End a recording session | Inline confirmation in the recording panel | Already in the relevant context |
| Sign out | Toast confirmation, no dialog | Trivially recoverable |
| Permanently delete account | Dialog requiring typing the email to confirm | Maximally destructive |

### 9.5 Toasts MUST have an aria-live region

Toasts that announce errors are `role="alert"` (assertive). Toasts that announce success are `role="status"` (polite). Use shadcn's Toast for both — it handles the ARIA correctly.

---

## 10. Live regions & status announcements (SC 4.1.3)

### 10.1 Recording transcript

The live transcript on the recording UI must be announced to screen readers as new lines arrive. Use `aria-live="polite"` (not assertive — assertive interrupts whatever the SR is currently reading; polite waits for a pause).

```tsx
<div aria-live="polite" aria-atomic="false" role="log">
  {transcriptLines.map(line => <p key={line.id}>{line.text}</p>)}
</div>
```

`aria-atomic="false"` so only the new line is read, not the entire log every time.

### 10.2 Recording state changes

Recording started / stopped / paused / error — `role="status"` (polite) for normal transitions, `role="alert"` (assertive) for errors that require attention.

### 10.3 Loading states

Skeleton placeholders should have `aria-busy="true"` while loading and the parent region should announce completion via a hidden live region.

### 10.4 Upload outbox / sync state

The "uploading…" → "uploaded" transition needs an announcement. Especially important per AGENTS.md *"recording is the artifact"* — Sarah needs to know the recording is safe even if she can't see the screen.

---

## 11. Microcopy guide

### 11.1 Voice ladder (extends `BRAND.md` voice tones)

Three registers in order of formality:

| Register | When | Example |
|---|---|---|
| **Calm operational** | In-product, mid-task, the tutor is working | "Recording. We'll handle the notes." |
| **Helpful colleague** | In-product, between tasks, errors, settings | "Email or password didn't match. Try again, or reset your password." |
| **Smart-friend warm** | Marketing, onboarding, empty states, mascot moments | "You teach. Mynk takes the notes." |

Maps to `BRAND.md` § Voice surface table: most product UI is *calm operational* or *helpful colleague*; marketing surfaces flex to *smart-friend warm*.

### 11.2 Button labels

| Bad | Good | Why |
|---|---|---|
| "Submit" | "Save changes" / "Create student" / "Send recap" | Verbs describe what happens |
| "OK" | "Got it" / "Send anyway" / "Delete student" | Specific, never just "OK" |
| "Cancel" | "Cancel" | OK — established convention |
| "Click here" | "[Reset your password]" (the verb IS the link) | Link text = the action |
| "Yes" / "No" (in dialogs) | "Delete student" / "Keep student" | Mirrors the action |

### 11.3 Error message structure

`<what went wrong>` + `<why if helpful>` + `<how to fix>`. All three when possible.

- ✅ "Couldn't reach Mynk (network error). Check your internet, then try again."
- ✅ "Email is required."
- ❌ "Error 500."
- ❌ "Something went wrong."

### 11.4 Empty state structure

`<heading>` + `<one sentence body>` + `<primary action button>`. No dead-ends.

- ✅ Heading: "No sessions yet." Body: "Once you record a session, it'll show up here." Button: "Start a session"
- ❌ "No data" (alone, no action)

### 11.5 Confirmation language

- Destructive: "This can't be undone."
- Reversible: "You can undo this for 8 seconds."
- Irreversible-by-policy: "This will permanently delete [thing] and [downstream effect]."

### 11.6 Pronouns & person

- Speak to Sarah as **you**. ("You're recording with Aiden.")
- Refer to Mynk as **Mynk**, not "we" in error states. ("Couldn't reach Mynk" not "Couldn't reach us" — the latter is confusing because Sarah might think it's her own connection.)
- For the mascot's voice (mark + onboarding), first-person is OK. ("I'll take notes for you.")

### 11.7 Numbers, dates, times

- Always use locale-aware formatting: `new Intl.DateTimeFormat(locale, …)`. Sarah's in Canada; her parents may be in different timezones.
- Dates: relative ("3 minutes ago") for recent, absolute ("Apr 24, 2026") for past-week-plus.
- Durations: "23 min" not "0:23:14" for human reading; "23:14" mono-formatted only when scrubbing playback.
- Times: 12-hour with am/pm in user-facing copy; 24-hour optional only in admin/operator surfaces.

### 11.8 Sentence-case headings

All headings, buttons, and labels use **sentence case** ("Start a session") not Title Case ("Start A Session"). One exception: brand names ("Mynk", "Wyzant") stay proper-cased.

---

## 12. Empty, loading, error states

### 12.1 Loading

| Duration expected | Pattern |
|---|---|
| < 200ms | No indicator (would flash) |
| 200ms – 2s | Spinner inline next to triggering element |
| 2s – 10s | Skeleton placeholder mirroring the eventual content shape |
| > 10s | Progress bar with concrete remaining estimate; explanation if helpful |
| Indeterminate | Skeleton + status banner ("Generating recap… usually takes ~30 seconds") |

**Never** show a blank screen during loading. Always show structure (skeleton) or signal (spinner). Live regions announce completion.

### 12.2 Skeletons

Match the shape of the eventual content (same heights, same widths, same number of rows). Don't shimmer aggressively — a slow pulse is enough (also honors `prefers-reduced-motion`).

### 12.3 Empty states

Every list, panel, and section that *can* be empty must have an explicit empty state, never just disappear or show "(empty)". Structure per § 11.4: heading + body + primary action.

Special case: "First-run empty states" should onboard. The first time Sarah lands on the students list, the empty state IS the onboarding for adding her first student — not a separate flow.

### 12.4 Error states

Three levels:

| Severity | Visual | Action |
|---|---|---|
| Recoverable (form validation) | Inline near field | User fixes, retries |
| Surface-level (a panel failed to load) | Banner inside the panel + retry button | User retries, rest of page works |
| Global (whole route failed) | Full-page error boundary with copy + "Reload" + "Go home" + "Contact support" | Recovery options |

The recording UI gets a fourth tier: **recording-error** is always serious because the artifact is at risk. Recording errors get persistent state (banner stays until acknowledged), an automatic retry attempt, and an explicit "your audio is safe — buffered locally" reassurance per AGENTS.md North Star.

---

## 13. Testing & enforcement

### 13.1 Automated

| Tool | Scope | Enforcement |
|---|---|---|
| **axe-core** in Playwright tests | All routes covered by Playwright | **Enable `color-contrast` rule** (currently excluded — see audit). PR-blocking once Phase 0 ships. |
| **Playwright visual regression** | The 5 surfaces already in `tests/visual/pages.spec.ts` + add: recording UI, whiteboard workspace, AV tile (per audit's HIGH-RISK list) | PR-blocking once baselines committed |
| **ESLint rule** | Block raw hex/rgba in `.tsx`/`.css` outside `globals.css` and `docs/brand-previews/` | PR-blocking (per `DESIGN-TOKENS-PLAN.md`) |

From `docs/DESIGN-TOKENS-PLAN.md` Phase 0 execution playbook (mirrored here for canonical reference).

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
| **TypeScript** | shadcn primitives have typed props for `aria-*` where applicable | Already enforced |

### 13.2 Manual per-release

- **Keyboard nav sweep:** Tab through every primary surface. Confirm every action reachable, focus ring visible, Esc closes overlays, focus restored on close.
- **Screen reader smoke:** macOS VoiceOver or Windows Narrator (whichever the reviewer has) walks login → start session → end session. Goal: no announcement gaps in the critical path.
- **Zoom test:** browser at 200% on the public landing + tutor dashboard. No horizontal scroll, no truncation, no overlap.
- **Mobile reflow:** Chrome DevTools at 320px width on every primary surface.
- **Color-blindness check:** install a Chrome extension (e.g., Stark) and toggle deuteranopia + tritanopia on the recording UI specifically (because mic-meter colors carry meaning).

### 13.3 Continuous

- **VPAT-style conformance document:** maintain a list of WCAG 2.2 success criteria with current status (PASS / PARTIAL / FAIL / NOT-APPLICABLE) at `docs/A11Y-CONFORMANCE.md`. Update on every PR that touches accessibility-relevant surfaces.
- **User feedback loop:** the existing feedback widget should be the path for any user-reported accessibility issue. Triage these as bugs, not feature requests.

### 13.4 What we don't do

- We don't ship a public "Accessibility Statement" page until we've genuinely conformed. A misleading statement is worse than none.
- We don't claim "WCAG 2.2 AA" in marketing copy until the VPAT exists and has been reviewed by a qualified third party (for institutional buyers, this matters).

---

## 14. Open IA questions (to be settled in next Opus session before per-surface design specs)

Per Andrew's v1-from-scratch framing, the current information architecture is fair game. Before per-surface design specs land, the following IA-level decisions need answers. Each is a substantive design conversation, not a 30-second pick.

### 14.1 What is the user's mental anchor noun?

The thing that organizes everything. Three candidates:

| Anchor | URL shape | Implications |
|---|---|---|
| **Student** (current) | `/students/[id]/sessions/[id]` | Tutor thinks "I'm doing work for Aiden." Familiar but stale — Sarah doesn't actually think "Aiden" first, she thinks "what's my 4pm." |
| **Session** | `/sessions/[id]` (sessions surface students inline) | Tutor thinks "I'm running a session right now." Closer to actual mental model. Students become a secondary index. |
| **Today** (calendar/timeline) | `/today` → sessions in time order; `/students` only when curating roster | Most Linear-like. Tutor lands on "now or next." Students managed in a separate surface. |

**Recommendation to consider:** Today-anchored landing, session-as-first-class object, student as a roster entity. But this needs your gut check.

### 14.2 What's the default landing after login?

- The dashboard ("what's happening")?
- The next session ("here's your 4pm with Aiden")?
- A command palette / search-first ("what do you want to do?")?
- A persistent today-view that's the same regardless of when you log in?

### 14.3 Where does "start recording" live globally?

- Inside a student detail page (current — buried)
- A floating action button always visible
- A keyboard shortcut + visible "Start session" CTA on the dashboard
- A persistent "session bar" at the top of every page (with start/pause/stop affordances)

### 14.4 Where does whiteboard live in the IA?

- Always nested under a student session (current)
- A top-level destination ("/whiteboards") with cross-student grouping
- An interactive mode WITHIN a session, not its own destination

### 14.5 URL structure: keep current depth or flatten?

Current: `/admin/students/[id]/whiteboard/[wsid]/workspace`. Deeply nested, requires three IDs in the URL, hard to share.

Alternatives:
- Flatter: `/sessions/[id]` (the session has a `studentId` and `whiteboardId` internally; URL just identifies the session)
- Shareable: tokenized session URLs by default; never expose internal IDs in tutor-facing URLs

URL changes have downstream impact:
- OAuth callbacks (if hardcoded to the old paths)
- Existing parent share links (`/s/[token]/whiteboard/[id]`) — need redirects
- SEO for any public pages (only the landing/signup are public; minimal impact)
- Bookmarks (low — Sarah is the only current user)

### 14.6 Tutor primary actions list

Before designing, enumerate the top-10 actions Sarah does in a typical week, with frequency. Examples to verify with Sarah:

- Start a session with a known student
- End a session and send a recap
- Look up "what did we cover with Aiden last week?"
- Update parent contact info
- Send a follow-up note manually
- Review an AI-generated recap before sending
- Check on a draft note she hasn't finished
- See "how many sessions did I do this month"

This list anchors what gets primary surface area vs progressive disclosure.

### 14.7 Parent surfaces — same redesign or separate?

The parent share view (`/s/[token]`) has a different audience (non-power-user, phone-first, single-purpose). Should it be redesigned in the same Phase 1 sweep, or treated as a separate Phase 4 per `UX-REFRESH-PLAN.md`?

Recommendation: separate, because the design language is allowed to be different (more whitespace, even less chrome, more prose-forward).

### 14.8 Org-aware nav (Phase 12 forward-compat)

Per `MYNK-ORG-PILOT-BACKLOG.md` constraint: the nav primitives introduced now must not preclude an org switcher later. Concretely:

- Top-left brand area must accommodate `[Mynk] [optional org switcher]` later without redesign.
- URL structure should support `/org/[id]/...` paths additively without colliding with current routes.

This is a constraint on the spec, not a feature to build now.

---

## 15. Open decisions blocking Phase 1 design

Captured for visibility. None of these are decided yet; per-surface design specs need answers before they can ship.

| # | Decision | Default if not decided | Where to decide |
|---|---|---|---|
| 1 | ~~**CTA color resolution**~~ ✅ **RESOLVED 2026-05-19 PM (Option A — dark text on coral, 5.64 AA).** See § 2.2 + `MYNK-BRAND-PHASE-2-DECISIONS.md` § History. | — | — |
| 2 | **IA anchor noun** (§ 14.1) | Default: session-anchored | Andrew + Opus design session |
| 3 | **Default landing surface** (§ 14.2) | Default: dashboard with "next session" hero card | Andrew + Opus design session |
| 4 | **Global "start recording" affordance** (§ 14.3) | Default: persistent CTA on dashboard + Cmd+K shortcut | Andrew + Opus design session |
| 5 | **URL structure** (§ 14.5) | Default: flatten to `/sessions/[id]` + tokenized share links | Andrew + Opus design session |
| 6 | ~~**Parent surfaces in scope?**~~ ✅ **RESOLVED 2026-05-19 PM:** Parent share view (`/s/[token]`) gets a formal per-surface spec in Phase 1 today (Surface 6 in FINAL mockup is already the visual design; spec formalizes URL/microcopy/states/a11y/D-list). Expanded parent surfaces (account, history, notifications) deferred indefinitely \u2014 no current scope. | — | — |
| 7 | **Sarah's top-10 actions list** (§ 14.6) | **Partially answered 2026-05-19 PM (Sarah Discord ping):** Confirmed actions #1 + #2 are (1) starting a session with a known student, (2) ending a session and sending the recap. Sarah is in last week of school — full 3\u201310 list deferred to Friday 2026-05-22+. Implication: session-centric mental model is confirmed; supports session-anchored or today-anchored IA over student-anchored. | Sarah (Friday) |
| 8 | **Functionality preservation D-list answers** (Pre-flight § D) | Default: walk through D1–D10 for every Phase 1+2 surface spec | Andrew + Opus (per-surface, in design session) |

---

## 16. Changelog

- **2026-05-19** — Initial draft. WCAG 2.2 AA target locked by Andrew. Mynka Blue contrast audit baked in with one BLOCKER + three watch-items. IA-from-scratch framing per Andrew. Doc gates Phase 1+ of `UX-REFRESH-PLAN.md`.
- **2026-05-19 (later, same day)** — Andrew added the **functionality-preservation pre-flight** ahead of conformance target. Captures: 10 carry-forward invariants the v1 must preserve (A-list), 10 better-safer patterns we've earned and should generalize (B-list), 13 anti-patterns to retire (C-list), and 10 design-time questions every per-surface spec must answer (D-list). This is now the **#1 constraint** on the v1 redesign — preventing the "50 iterations of smoke and fix" failure mode.
- **2026-05-19 PM** — **CTA contrast BLOCKER resolved (Option A).** Light-mode `--accent-on` changed from cream `#FCFBF4` to dark text `#15203A`. Ratio 5.64 AA. § 2.2 updated with the lock-in rationale + the four candidates considered (preserved for audit). § 15 row 1 marked resolved. Comparison page at `docs/brand-previews/cta-options-comparison.html` is the visual audit artifact.
- **2026-05-19 PM** — **Parent surfaces scope resolved.** Today's parent share view (`/s/[token]`) gets a formal per-surface spec in `UX-DESIGNS-PHASE-1.md`. Surface 6 of the FINAL mockup is the visual design; the spec formalizes URL, microcopy, states, a11y, D-list. Expanded parent surfaces (parent account, history of past recaps, notifications) are deferred indefinitely (no current scope). § 15 row 6 marked resolved.
- **2026-05-19 PM** — **Sarah's top-2 actions confirmed via Discord ping.** Andrew DM'd Sarah; she confirmed action #1 = "starting a session with a known student" and action #2 = "ending a session and sending the recap" (the two example actions Andrew primed her with). Sarah is in last week of school; full 3\u201310 list deferred to Friday 2026-05-22+. Implication for IA: tutor's two highest-frequency actions are session-centric (not student-centric). Supports session-anchored or today-anchored mental model over student-anchored. § 15 row 7 marked partially resolved.
