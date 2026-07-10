# POC smoke — whiteboard chrome feasibility (fail-fast gate)

> **Purpose:** Confirm in a real browser that our Excalidraw chrome direction works **before** Phase 1 goes full bore. This is throwaway spike code on `spike/wb-chrome-poc-857e6d4c` — sync-free, dev-only route. `tsc` + `next build` already pass; only the real-browser items below remain.
>
> **Legend (ratified convention):** `[x]` = **PASS**. Leave unchecked = not-yet / N/A. Put `Notes:` for anything skipped or failed. Pick ONE overall verdict at the bottom.

## Open it

- **Preview (give it ~2 min to finish building):** [POC @ /dev/wb-chrome-poc](https://tutoring-notes-git-spike-wb-chro-d1d388-arangarx-5209s-projects.vercel.app/dev/wb-chrome-poc)
- Route: `/dev/wb-chrome-poc` (not linked from nav — open the URL directly)

## Desktop checks (your Mac)

- [x] **No native Excalidraw chrome anywhere** — no left tool rail, no hamburger/menu, no properties panel, no bottom footer (zoom/undo/help). Just canvas + the Mynk overlay toolbar.
- [x] **Tools switch + draw:** cursor (select), pencil (freedraw), eraser, rectangle, text — each one activates from the Mynk toolbar and actually works on the canvas.
- [ ] **Active-tool highlight** tracks the selected tool (status line bottom-left shows `activeTool`).
- [ ] **Stroke width** control changes the thickness of the *next* stroke.
- [ ] **Color** swatches change the *next* stroke's color.
- [x] **Undo / Redo buttons** work.
- [x] **Ctrl/Cmd+Z** works with the overlay present (the known 2026-06-06 regression — this is the one to watch).
- [ ] **Overlay doesn't block the canvas** — you can draw under/around the toolbar; no dead zones.

## Tablet / pen check (borrowed tablet)

- [x] **Pen draws** through the hidden native chrome (generic-stylus proof; NOT a substitute for Sarah's XPPen G640).
- [ ] **Touch** draw/pan behaves sanely.
- [ ] Notes:

## Honest impression (not a polish gate — POC is intentionally rough)

- [ ] Nothing about the *approach* feels structurally wrong / dead-end.
- Notes:

---

## Overall verdict (pick one)

- [x] **GREEN** — direction works; greenlight Phase 1 (tutor-desktop chrome).
- [ ] **YELLOW** — works with caveats; note them and we decide.
- [ ] **RED** — approach is blocked; we rethink before any Phase 1 build.

**Result (2026-06-08): GREEN** — Andrew real-device smoke; screenshot-confirmed full native-chrome hide; Ctrl+Z/Y keyboard OK; generic-stylus OK (XPPen G640 residual). **Phase 1 is unblocked.**

Notes / caveats:

---

*After verdict: cleanup the spike worktree with `/delete-worktree` (or keep it until Phase 1 lifts the CSS selector list). The hide-selector list lives in the POC subagent report + design doc.*
