# Mynk site redesign mocks — 2026-06-10

Static HTML review artifacts for Andrew. Open any file directly in a browser. Each mock includes:

- **Desktop / Phone / Compare** viewport toggles (meta header)
- **Light / Dark** theme toggle (`data-theme`, Mynka Blue tokens from `src/styles/tokens.css`)
- Inline notes on what changed vs today's app

Style references: `palette-mocks-FINAL-mynka-blue.html`, `whiteboard-session-shell-mock-2026-06-08.html`.

## Recommended review order

| # | File | Route | What it proposes |
|---|------|-------|------------------|
| 1 | [site-redesign-mock-student-list-2026-06-10.html](site-redesign-mock-student-list-2026-06-10.html) | `/admin/students` | Mobile-first roster: full-width rows, sticky search, FAB + bottom sheet for "Add student". Desktop: left nav + secondary add card. |
| 2 | [site-redesign-mock-student-detail-2026-06-10.html](site-redesign-mock-student-detail-2026-06-10.html) | `/admin/students/[id]` | Mobile: bottom tab bar (Session / Share / Notes / More), sticky "Start whiteboard" CTA, overflow actions sheet. Desktop: horizontal section tabs, all sections scrollable. |
| 3 | [site-redesign-mock-parent-share-2026-06-10.html](site-redesign-mock-parent-share-2026-06-10.html) | `/s/[token]` | Parent-facing: full-bleed note cards on phone, accent NEW treatment, thumb-sized recording/whiteboard chips, collapsed older notes. |
| 4 | [site-redesign-mock-login-2026-06-10.html](site-redesign-mock-login-2026-06-10.html) | `/login` (+ claim/setup pattern) | Centered auth card on desktop; edge-to-edge form on mobile with 48px touch targets. Reusable for claim flow. |
| 5 | [site-redesign-mock-settings-2026-06-10.html](site-redesign-mock-settings-2026-06-10.html) | `/admin/settings` | iOS-style settings list; full-width rows on mobile, contained card on desktop. |
| 6 | [whiteboard-mobile-mock-2026-06-10.html](whiteboard-mobile-mock-2026-06-10.html) | Live whiteboard (mobile/tablet) | Resolution-driven live-board chrome: tier-1 bottom toolbar, AV pip, board tabs, props/overflow/shapes sheets; tutor vs student control-set callouts. |

## Design direction (summary)

- **Cohesive with whiteboard chrome:** same surface stack (`surface-base` → `surface-1` cards), Fraunces headings, coral accent CTAs.
- **Mobile is not squished desktop:** primary content is full-width; secondary actions use bottom sheets, FABs, or tab bars.
- **Admin gets persistent nav on desktop**; mobile uses compact top bar + icon shortcuts.
- **Parent share** prioritizes scannable note cards and clear "new since last visit" hierarchy.

No production code changed — mocks only under `docs/brand-previews/`.
