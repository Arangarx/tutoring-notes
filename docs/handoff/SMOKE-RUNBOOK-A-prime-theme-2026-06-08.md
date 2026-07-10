# Smoke runbook — Phase 1 A′ (site-wide theme foundation)

> **Scope:** the A′ theme *control plane* — `useTheme`/`ThemeProvider`, Light/Dark/System toggle, `localStorage` persistence, FOUC-safe bootstrap, Tailwind `data-theme` variant, `ThemeInit` retirement.
>
> **Legend (ratified convention):** `[x]` = **PASS**. Leave unchecked = not-yet / N/A. Put `Notes:` for anything skipped or failed. Pick ONE overall verdict at the bottom.

## Open it

- **Branch:** `feat/theme-plumbing-a-prime` @ `ea878ec` (not yet merged into `v1-redesign`)
- **Preview (give it ~2 min if cold):** [A′ theme foundation preview](https://tutoring-notes-git-feat-theme-pl-50552d-arangarx-5209s-projects.vercel.app)

## Merge bar (read first)

This is a **foundation** chunk. The bar is **functional correctness / no-regression of the theme machinery**, NOT full cohesive visual sign-off. Do **not** block A′ on "every surface looks perfectly polished in both themes" — that's the cohesion/composition build that follows. Block A′ only on broken theme machinery.

## Control plane

- [x] Theme toggle present in admin nav (desktop) **and** mobile drawer — Light / Dark / System.
- [x] Switching **Light ↔ Dark** via the toggle reskins the page immediately and completely.
- [x] Choice **persists across a hard reload** (refresh keeps your pick).
- [x] **No FOUC** — hard refresh / new tab shows the correct theme with no flash of the wrong theme before paint.
- [x] **System** mode follows the browser's reported scheme (see the gotcha below before testing this one).

## Both-theme spot check (a few key surfaces, Light AND Dark via the explicit toggle)

- [x] `/admin` dashboard
- [x] `/admin/students` + a student detail page
- [x] `/admin/settings`
- [x] An auth page (`/login`)

## Known gotcha — "System mode isn't following my OS" (NOT a bug)

If System mode doesn't seem to match your OS, it's almost always one of these — verified 2026-06-08, none are A′ defects:

1. **Chrome's own appearance Mode overrides the OS.** `chrome://settings/appearance` → **Mode** (Light / Dark / **Device**). If set to Light/Dark, Chrome forces `prefers-color-scheme` to that value for *all* sites regardless of the OS. Set it to **"Device"** to follow the OS. (This was the actual cause during the 2026-06-08 smoke — Chrome was pinned Dark while Windows was Light.)
2. **Windows has two settings.** Settings → Personalization → Colors → "Choose your default **app** mode" is the one Chrome's `prefers-color-scheme` follows — NOT "Windows mode" (taskbar/system chrome).
3. **Chrome-on-Windows may not propagate an OS change live** while open (may need a relaunch). macOS Chrome updates live. A′ can only react to what the browser reports.

**Console check** for the value A′ reads:

```js
window.matchMedia('(prefers-color-scheme: dark)').matches   // true = browser reports dark
document.documentElement.getAttribute('data-theme')          // System → null; explicit → "light"/"dark"
localStorage.getItem('mynk-theme')                           // persisted mode, expect "system"
localStorage.getItem('tutoring-notes-dev-theme')             // stale dev override that would pin theme
```

**The explicit Light/Dark toggle is independent of all of the above** and is the deterministic path for smoking both themes.

## Explicitly NOT in scope (do NOT fail A′ on these)

- [ ] **Excalidraw still follows OS theme only** — wiring it to the app theme (TU-12) is a later whiteboard slice, intentionally not in `ea878ec`.
- [ ] `**dark:`-variant components don't flip in System mode.** Tailwind `dark:` is keyed to `[data-theme=dark]`, which System mode leaves absent — so any component still using `dark:` (incl. core `button`/`input`) stays light-styled in System+OS-dark. This is the known `dark:`→token migration debt (design-pass §5), not an A′ machinery failure. The **explicit Dark toggle** sets `data-theme=dark` and flips these correctly.
- [ ] Full visual polish / color variety / density toward the mock — that's the cohesion/composition build.

---

## Overall verdict (pick one)

- [x] **GREEN** — theme machinery works, no regressions → merge A′ into `v1-redesign`.
- [ ] **YELLOW** — works with caveats (note them).
- [ ] **RED** — machinery is broken (note it).

Notes / caveats:

---

## Open decision (carried from smoke)

- [ ] **Fold `dark:`→token cleanup of core primitives (`button`/`input`) into A′ before merge**, so System mode is visually whole, OR
- [x] **Merge A′ as-is** and make those primitives the first surface in the migration chunk.