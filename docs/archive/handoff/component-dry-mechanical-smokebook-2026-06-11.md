# Component DRY mechanical — smokebook (2026-06-11)

**Branch:** `feat/component-dry-mechanical` (not merged to `v1-redesign`)

**Claim:** No visual or behavioral change intended — presentational + shared-logic consolidation only.

## What changed (4 chunks)

1. **Notes display utils** — `safeJsonArray`, `orderedUnique`, `formatNoteTime`, `formatNoteDurationLabel`, and re-export of recorder `formatDuration` moved to `src/lib/notes/display-utils.ts`. Consumers: parent share note card, tutor expanded note body, admin student notes page, whiteboard replay id loader.

2. **SubmitButton de-dup** — Call sites migrated from `className="primary"` / `className="btn"` to explicit `variant` prop where mapping is identical. Local duplicate in change-password form replaced with shared `SubmitButton` (height preserved via `className="h-9 min-h-9"`).

3. **Dead CSS** — Removed unused `.admin-nav*` rules from `globals.css` (AdminNav is Tailwind-only). Kept `.sign-in-menuitem` (still used by marketing header).

4. **Theme dropdown hook** — Shared `useThemeDropdown()` in `src/hooks/useThemeDropdown.ts`; `ThemeToggle` and `WbThemeToggle` consume it with unchanged presentation.

## Smoke checklist

- [ ] **Parent share note** (`/s/[token]`) — card layout, times, recording duration labels, topics/homework labels unchanged
- [ ] **Tutor notes expanded row** (`/admin/students/[id]/notes`) — expand a note; topics/links/recordings/WB links match before
- [ ] **Admin notes page** — time range display on note rows unchanged
- [ ] **Change password** (`/admin/settings/profile`) — submit button size/label/pending state unchanged
- [ ] **Theme toggle** (marketing/admin header) — open menu, pick light/dark/system, Escape + outside click close
- [ ] **Whiteboard theme toggle** — same behavior in WB top bar; controlled open still works with other menus
- [ ] **Admin nav** — desktop + mobile drawer links, active state, sign out (no regression from CSS removal)
- [ ] **Submit buttons** — Create share link, Add student, Save student, Start session, Log in as test account: primary styling unchanged

## Non-goals (unchanged on purpose)

- Legacy `.btn` / `.btn.primary` on non-SubmitButton elements (feedback page, whiteboard modals, etc.)
- Recorder `formatDuration` semantics on share cards (`formatNoteDurationLabel` keeps legacy `M:SS` unpadded minutes)
