# Smoke runbook — 2026-06-07

**Purpose:** Smoke two merge-ready branches before orchestrator merge.

> **Legend (read first):** `[x]` = **step PASSED** (executed and behaved as expected). If a step was **skipped** or **failed**, leave it unchecked and say so on the **Notes:** line. A fully-checked target = green merge gate.

## Branches under smoke


| Branch                               | Commit                               | Preview                                                                                                         | What it covers                                             |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `feat/recording-p1-slice3-autonotes` | `7e89a93` (feature rework `0fa2363`) | [slice-3 preview](https://tutoring-notes-git-feat-recordin-5af9c9-arangarx-5209s-projects.vercel.app)           | Slice-3 Pass-1 **B4 save-model** — merge-blocker           |
| `harden/auth-role-refresh`           | `f5e44f8`                            | [auth-role-refresh preview](https://tutoring-notes-git-harden-auth-r-69db0c-arangarx-5209s-projects.vercel.app) | Role re-fetch on JWT refresh + server-side cost-panel gate |


> **Preview note (slice-3):** Branch alias currently serves READY deploy @ `0fa2363` (B4 rework). Docs-only HEAD `7e89a93` had a canceled deploy; alias unchanged until next code push rebuilds.

---

## Target A — Slice-3 Pass-1 notes save-model (merge-blocker)

**Branch:** `feat/recording-p1-slice3-autonotes`  
**Preview:** [slice-3 preview](https://tutoring-notes-git-feat-recordin-5af9c9-arangarx-5209s-projects.vercel.app)

**LOCKED B4 model:** `TutorNote` = AI working draft (never parent-visible). **Save** = ONE live READY `SessionNote`; parents see it immediately (no DRAFT, no SENT).

**Local gate (run first):** `npm run test:wb-sync` — expect **12/12 green** (import-coupling / TextEncoder regression fixed).

- [x] **1. No auto SessionNote on end** — End a session → confirm **no** `SessionNote` is auto-created (institutional-memory list / parent share shows nothing yet).
  **Notes: I notice that my last note created on a previous smoke is in draft status but the one before that is ready...that's weird that we have them in two different states.**  
  Still no proper skeleton with blurs while notes are loading, fine if this is explicitly going to be covered later.  


- [x] **2. Save creates one READY note** — From the review page, fill/edit notes → **Save** → confirm a single READY note is created and is **immediately visible to the parent** (open the share link).
  **Notes:**

- [x] **3. Re-save updates in place** — **Save again** (edit then re-save) → confirm it updates **in place** (no duplicate note).
  **Notes: No "updated" pill yet. Dunno if that's intentional.**

- [x] **4. Cancel & delete session (review page)** — On the session **review** page use **Cancel and delete session data** → confirm you're returned to student detail **regardless of outcome** (never stranded on an error / "Deleting…" screen); the session's note is removed for the parent. _(NOTE: per-note deletion from the student **notes list** is a SEPARATE surface — under investigation per Andrew's smoke note below.)_
  **Notes: I pass this only because it works as you should, not as this step said it should.  When I deleted a note it stayed on the notes list.  I will separately test what this probably should refer to and that's the cancel and delete operation on session review.  Cancel and delete navigated away. Don't really know if it would have on a hang I only know i nav'd away.**

- [x] **5. Correct tutor name on share** — Open the **parent share page** → confirm it shows the **correct tutor's name** for that student (not an arbitrary admin).
  **Notes:**

**Overall Target A verdict** (check one):
- [x] PASS
- [ ] FAIL

_(Andrew 2026-06-07: PASS with notes — follow-ups captured in `ORCHESTRATOR-STATE.md`; merge held pending the delete-list investigation.)_

**On full PASS:** orchestrator merges this branch `--no-ff` → `v1-redesign` **LAST** (carries the migration).

---

## Target B — Auth role-bleed fix (parked-ready, pending Andrew go)

**Branch:** `harden/auth-role-refresh`  
**Preview:** [auth-role-refresh preview](https://tutoring-notes-git-harden-auth-r-69db0c-arangarx-5209s-projects.vercel.app)

**Fix A + B:** Role re-fetched from DB on JWT refresh so a TUTOR no longer carries stale `role=ADMIN`; cost panel gated server-side.

- [ ] **1. TUTOR sees no admin surfaces** — Log in as a TUTOR account (e.g. `arangarx@hotmail.com` if it's TUTOR) → confirm **no** admin-only surfaces appear and `role` reflects TUTOR.
  **Notes:**

- [ ] **2. Cost panel gating** — Confirm the **session cost panel** is hidden for a non-admin / non-impersonating / non-test user, and visible for admin / impersonating / test.
  **Notes:**

- [ ] **3. ADMIN unchanged** — Confirm a genuine ADMIN still sees admin surfaces (no over-correction).
  **Notes:**

**Overall Target B verdict** (check one):
- [ ] PASS
- [ ] FAIL