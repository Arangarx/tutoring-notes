# Whiteboard P2 — student on new shell — build status

**Plan:** [`docs/handoff/phase-2-student-on-new-shell-plan-2026-06-16.md`](handoff/phase-2-student-on-new-shell-plan-2026-06-16.md)  
**5-axis review:** [`docs/handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md`](handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md)  
**Branch:** `phase2/wb-student-new-shell`  
**Reliability bar:** [reliability-bar.mdc](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)

---

## Guardrails

1. **Extend don't rewrite** — `WhiteboardWorkspaceClient.tsx` tutor engine is additive-only; student path is `StudentLiveWorkspaceClient.tsx` (new).
2. **Legacy fallback** — `StudentWhiteboardClient.tsx` stays until Andrew two-device smoke + production soak.
3. **Flag gate** — `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` enables new shell; production default off until retire-legacy gate.
4. **B1–B4 blockers** — folded into plan acceptance; see phase table below.

---

## Phase status

| Step | Scope | Status |
|---|---|---|
| 0 | B3 WbAVCluster audit (no recording context) | Done — cluster is presentational only |
| 1 | Flag gate + page router | Done |
| 2 | `StudentLiveWorkspaceClient` + chrome | Done |
| 3 | `WhiteboardSessionShell` student union | Done |
| 4 | `defaultShowLocalVideo: true` + AV cluster | Done |
| 5 | Loading guard + `wjg` logging | Done |
| 6 | Shared `join-unavailable-copy` | Done |
| 7 | DOM tests + Playwright flag env | Done (wb-sync pending post-push) |
| 8 | Smokebook + two-device gate | Smokebook authored — Andrew smoke pending |
| 9 | Retire legacy | Blocked on Andrew smoke PASS |

---

## Demo gate (Andrew)

- [ ] Two-device smokebook overall PASS with flag **on**
- [ ] Legacy path spot-check with flag **off**
- [ ] `npm run test:wb-sync` green with flag on
- [ ] Tutor regression smoke item 15 (flag on + off)

---

## B3 audit note (2026-06-16)

`WbAVCluster` imports only React + `AVTilesPanel` + wb-icons + layout hook. No recording FSM context. Safe for student shell inside `WbRoleProvider role="student"`.

---

## Open / deferred

- Step 0 hang repro — document in smokebook item 0 Notes on first Andrew run.
- `relayShowsCollaborator` tutor-presence copy — optional parity (MINOR A2-M4).
- Retire legacy + production flag flip — Step 9 only after soak.
