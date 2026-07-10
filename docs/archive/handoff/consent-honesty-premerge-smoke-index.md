# Consent-honesty pre-merge smoke — index

**Branch:** `wb-wave5-polish`
**Tip commit:** [`5c59a37`](https://github.com/Arangarx/tutoring-notes/commit/5c59a371c58a6c4f7e021901bcefb787abd4d341)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

Single entry point for Andrew's **one** pre-merge hardware smoke pass over the full consent-honesty surface (Block B + CC-1 + CC-2 + erasure) on this branch preview — before `merge --no-ff wb-wave5-polish → v1-redesign`.

---

## Run order

Work top-to-bottom. Each smokebook has its own **Overall result** — this index tracks the cut.

| # | Smokebook | Scope (one line) |
|---|---|---|
| 1 | [`wb-block-b-consent-gate-smokebook-2026-06-30.md`](wb-block-b-consent-gate-smokebook-2026-06-30.md) | Client audio-consent projection, mode-aware server gates, tutor banners, dead WB toggle hidden, honest toggle copy — **item 3 = 3b remote-surgical mixdown hardware verify** (student audio absent from recording, heard live). |
| 2 | [`cc1-cc2-consent-gate-smokebook.md`](cc1-cc2-consent-gate-smokebook.md) | CC-1: no session without `ConsentRecord`; CC-2: mandatory claim consent choice (save or decline); all-off record + join-gate interaction; self-learner exempt; theme parity. |
| 3 | [`erasure-smokebook.md`](erasure-smokebook.md) | Admin erasure UI: trigger, tombstone, grace window, cancel, purge semantics. |

---

## Merge gate

**`merge --no-ff wb-wave5-polish → v1-redesign`** only after **all four consent-honesty parts** (Block B, CC-1, CC-2, erasure — across the three smokebooks below) report **Overall result PASS** — every in-scope item PASS. Deliberate per-item **SKIP** or **N/A with notes** must be called out in that item's Notes (and acceptable to you) before calling the book PASS.

---

## Design nuance to confirm during the run

**Erasure grace vs tutor read-access:** The erasure route guards **404** on `Student.erasedAt` (post-purge). During the **7-day grace window** after trigger, a tutor **retains read-access** to the learner's content (content still recoverable / not fully purged). Confirm this is **acceptable** expected behavior when running [`erasure-smokebook.md`](erasure-smokebook.md) item 8 (or equivalent grace-window check).

---

## Pre-merge overall

- [ ] All four parts PASS across the three smokebooks (no unaccepted FAIL / PARTIAL)
- [ ] Erasure grace-window tutor access confirmed acceptable
- [ ] Ready for `merge --no-ff wb-wave5-polish → v1-redesign`
