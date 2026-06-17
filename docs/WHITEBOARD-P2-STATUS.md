# Whiteboard P2 — student on new shell — build status

**Plan:** [`docs/handoff/phase-2-student-on-new-shell-plan-2026-06-16.md`](handoff/phase-2-student-on-new-shell-plan-2026-06-16.md)  
**5-axis review:** [`docs/handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md`](handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md)  
**Branch:** `phase2/wb-student-new-shell`  
**Reliability bar:** [reliability-bar.mdc](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)

---

## Guardrails

1. **Extend don't rewrite** — `WhiteboardWorkspaceClient.tsx` tutor engine is additive-only; student path is `StudentLiveWorkspaceClient.tsx` (new).
2. **Legacy orphan** — `StudentWhiteboardClient.tsx` remains on disk (unreferenced) until Andrew live-session smoke PASS; then delete per **WB-LEGACY-STUDENT-CLIENT-DELETE** in `docs/BACKLOG.md`.
3. **Hard switch** — `/w/[joinToken]` always routes through `StudentWhiteboardSessionShell` → `WhiteboardSessionShell role="student"` (no env flag).
4. **B1–B4 blockers** — folded into plan acceptance; see phase table below.

---

## Phase status

| Step | Scope | Status |
|---|---|---|
| 0 | B3 WbAVCluster audit (no recording context) | Done — cluster is presentational only |
| 1 | Page router → new shell | Done (hard switch) |
| 2 | `StudentLiveWorkspaceClient` + chrome | Done |
| 3 | `WhiteboardSessionShell` student union | Done |
| 4 | `defaultShowLocalVideo: true` + AV cluster | Done |
| 5 | Loading guard + `wjg` logging | Done |
| 6 | Shared `join-unavailable-copy` | Done |
| 7 | DOM tests + Playwright wb-sync | Done |
| 8 | Smokebook + two-device gate | Smokebook authored — Andrew smoke pending |
| 9 | Delete legacy client file | Blocked on Andrew live-session smoke PASS |

---

## Demo gate (Andrew)

- [ ] Two-device smokebook overall PASS
- [ ] `npm run test:wb-sync` green (real `/w/[joinToken]` route)
- [ ] Tutor regression smoke item 14

---

## B3 audit note (2026-06-16)

`WbAVCluster` imports only React + `AVTilesPanel` + wb-icons + layout hook. No recording FSM context. Safe for student shell inside `WbRoleProvider role="student"`.

---

## Open / deferred

- Step 0 hang repro — document in smokebook item 0 Notes on first Andrew run.
- `relayShowsCollaborator` tutor-presence copy — optional parity (MINOR A2-M4).
- Retire legacy file delete — Step 9 only after live-session soak.
