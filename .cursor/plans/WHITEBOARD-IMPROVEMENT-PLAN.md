> **SUPERSEDED 2026-05-27 (morning cleanup).** See [`docs/RELEASE-ROADMAP.md`](../../docs/RELEASE-ROADMAP.md), [`docs/WHITEBOARD-STATUS.md`](../../docs/WHITEBOARD-STATUS.md), and [`docs/BACKLOG.md`](../../docs/BACKLOG.md) for current whiteboard sequencing, shipped state, and the implementation queue. This file is preserved for archival reference; do not act on it directly. Reason: W-item checklist and lockstep pointers consolidated into BACKLOG + STATUS + RELEASE-ROADMAP.

# Whiteboard — engineering checklist (W-items + smoke folds)

**Canonical location:** this file in the **tutoring-notes** repo (`.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md`). Cursor **Build** reads the companion file `whiteboard_improvement_execution.plan.md` in this folder.

**Lockstep** — update the same set in one pass when smoke, pilot quotes, or code changes land:

| Artifact | Path |
|----------|------|
| Phase handoff + adversarial list | `docs/WHITEBOARD-STATUS.md` |
| Implementation queue | `docs/BACKLOG.md` (whiteboard rows) |
| Manual smoke | `docs/whiteboard-smoke-log.md` |
| **Cursor Build (YAML todos)** | `.cursor/plans/whiteboard_improvement_execution.plan.md` (done) · **`.cursor/plans/whiteboard_backlog_execution.plan.md`** (next waves) |
| **Roadmap (narrative)** | `docs/WHITEBOARD-ROADMAP-NEXT.md` |

---

## W-items (engineering backlog tied to smoke)

| ID | Item | Source | Notes |
|----|------|--------|------|
| **W2** | **Native image insert** — drag/drop, paste, default Excalidraw file paths get `customData.assetUrl` + record + sync like the PDF toolbar | Smoke **2026-04** Test 9 | **2026-05:** **Tutor:** `pageDataRef` + recorder flush + v3 broadcast. **Student:** `syncActivePageElements` after upload. Re-smoke: `docs/whiteboard-smoke-log.md` § Pending. |
| **W6** | **Cold refresh vs server truth** — hard refresh should show the same scene as before without relying on Excalidraw’s IndexedDB “Load draft” banner | Smoke **2026-04** refresh durability; adversarial review #1 | **2026-05:** Tutor: `pagehide` + `visibility` hidden + **`beforeunload`** → immediate multi-page board doc in `sessionStorage`. **Student:** `syncActivePageElements` after native image upload. **Gap:** Excalidraw’s own draft banner can still disagree — manual smoke. |

*Add new W-rows here when smoke files a discrete engineering fold; mirror a one-line row in `docs/BACKLOG.md`.*

---

## Smoke + Sarah → backlog folds

When a smoke run or pilot quote adds scope:

1. Add detail to `docs/whiteboard-smoke-log.md` (dated section).
2. Add or update the matching row in `docs/BACKLOG.md`.
3. Add a **W-item** here if it is a tracked engineering fold (or reference BLOCKER number from `docs/WHITEBOARD-STATUS.md`).
4. Bump the status table / follow-ups in `docs/WHITEBOARD-STATUS.md` if Phase 1 acceptance is affected.

**W2 smoke note (2026-04):** Image via Explorer drag into Excalidraw failed (placeholder); PDF toolbar path passed. Treat native image paths as **bug + build**, not a separate feature.

---

## Strategy reference (non-canonical)

Full Phase 1 narrative, guardrails, and completed milestone list: `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md` (historical Cursor plan; YAML todos mostly `completed`).
