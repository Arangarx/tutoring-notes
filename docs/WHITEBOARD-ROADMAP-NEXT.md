# Whiteboard — what’s left (consolidated roadmap)

Single execution-oriented view merging:

- `.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md` (W-items)
- `docs/BACKLOG.md` → **Whiteboard — implementation / design queue** + pilot bullets
- `docs/WHITEBOARD-STATUS.md` → follow-ups, §1.13, Phase 2 gate
- `docs/whiteboard-smoke-log.md` → pending verification

**Reliability standard:** any new feature work should still pass the adversarial bar in `AGENTS.md` / `reliability-bar.mdc` (5 axes, BLOCKERs in Phase 1 acceptance where applicable).

---

## How to use this doc

1. **Do not start Phase 2 product surfaces** until the **Phase 2 demo gate** in `docs/WHITEBOARD-STATUS.md` is satisfied (Sarah / PO check-in).
2. **Triage top-down:** validation → pilot trust → Sarah asks → backlog table → maintenance → strategic.
3. **Keep lockstep** when you ship or smoke: `WHITEBOARD-STATUS.md`, `BACKLOG.md`, `whiteboard-smoke-log.md`, `WHITEBOARD-IMPROVEMENT-PLAN.md` (same session for substantive changes).

---

## Wave 0 — Verify what we already shipped (blocking further work)

Code has landed for **W2** (native image `assetUrl` + tutor/student cache) and **W6** (sessionStorage flush on hide / unload). **Do not close backlog rows** until manual smoke passes.


| Checkpoint                                         | Source                                     | Action                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| W2 native image (tutor → student, student → tutor) | `docs/whiteboard-smoke-log.md` § *Pending* | Manual browser session with `WHITEBOARD_SYNC_URL`; drag, paste, menu insert; confirm no broken tiles; optional solo replay.     |
| W6 refresh                                         | Same § *Pending*                           | Hard-refresh <1 s after edits (incl. page 2); compare to Excalidraw “Load draft” banner.                                        |
| Playwright                                         | `tests/smoke/whiteboard-workspace.spec.ts` | Runs when Playwright **webServer** can reach a DB (see `playwright.config.ts`). Consent test needs `**BLOB_READ_WRITE_TOKEN`**. |


**Exit:** Update `BACKLOG.md` rows for native image + cold refresh: either ✅ *Verified YYYY-MM-DD* or narrow “still broken when …”.

---

## Wave 1 — Pilot trust & Sarah-blocking (highest leverage)

These are the shortest path to **“Sarah doesn’t need a backup recorder.”**


| #   | Item                                                       | Type                                               | Notes / pointers                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Recording auto-pause when student disconnects** + banner | Pilot / product                                    | `docs/BACKLOG.md` — *Recording auto-pause on student disconnect (Sarah, Apr 24)*. Wire `bothPresent` (or sync peer signal) to **pause** live audio capture and show explicit copy; resume on reconnect. Builds on workspace presence + recorder hooks.            |
| 2   | **Whiteboard session audio** (mic in workspace)            | Build / BLOCKER-class for “real” session recording | `BACKLOG` — *Whiteboard session audio*: mount `**useAudioRecorder`** (or equivalent) in `WhiteboardWorkspaceClient`, persist `SessionRecording`, reuse existing upload pipeline; replay already supports `<audio>`. Large integration; schedule dedicated branch. |
| 3   | **Session timer vs iOS idle** (display drift)              | Bug / UX                                           | `BACKLOG` pilot — timer throttles when screen locks; reconcile on `visibilitychange` + honest copy on iOS.                                                                                                                                                        |
| 4   | **iOS Safari — whiteboard / transcribe**                   | Bug                                                | Pilot thread: reproduce reload vs fresh open; follow `rid=` + instrumentation.                                                                                                                                                                                    |


**Undo toolbar:** `BACKLOG` marks **Whiteboard undo** as shipped; remaining note is **iOS touch verification** — fold into Wave 0 smoke or a short device pass.

---

## Wave 2 — Backlog table (product + tech debt)

Ordered roughly **user-visible value first**, then foundations that unlock more value.


| Priority | `BACKLOG` item                                                       | Work outline                                                                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2a      | **PDF workbook in Board pages** + **Wyzant-style page range picker** | Design: pages strip sections + one board page per PDF page; insert flow: subset of pages; default zoom-to-fit. Touches `pageList`, wire metadata, tutor + student, `insert-asset` / PDF path. **Depends on** stable native image + sync (Wave 0). |
| P2b      | **Replay: time scrub / play without audio**                          | `WhiteboardReplay`: scrub `t` on the event log when no `audioBlobUrl`.                                                                                                                                                                            |
| P2c      | **Event log + replay: multi-page**                                   | Per–board–page diffs in `WBEventLog` + replay reconstructs active page / all pages at `t`. Intersects **P2a** and long sessions.                                                                                                                  |
| P2d      | **Student: follow vs independent view**                              | Product verify: shipped follow + page wire; close gaps vs copy; pilot feedback.                                                                                                                                                                   |
| P2e      | **Whiteboard — student canvas file sync** (yellow)                   | If pilot proves gaps: mirror `BinaryFiles` / `addFiles` hints on joiner; `hydrate-remote-files` path.                                                                                                                                             |
| P2f      | **Cold refresh vs server truth** (remaining)                         | After Wave 0: if Excalidraw IndexedDB still fights `sessionStorage`, product decision — **one** restore story (banner copy, dismiss paths, optional “Use Tutoring Notes recovery”).                                                               |


**Update BACKLOG text for native image / refresh:** once Wave 0 passes, rewrite rows 15–16 to ✅ *Verified* or move residual bugs to a **“Known issues”** bullet.

---

## Wave 3 — `WHITEBOARD-STATUS.md` follow-ups (maintenance, cost, moat)

Not required for Sarah’s daily math flow; schedule when pain appears.


| Item                                           | Notes                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Orphan whiteboard session sweep (blocker #15)  | Cron / admin job; after revenue or Blob > ~$5/mo.                  |
| CI bundle weight — single Excalidraw smoke     | Not per-PR full load; align with Playwright.                       |
| Storage cost watch                             | When Vercel Blob > ~$20/mo.                                        |
| Multi-monitor DPR smoke (blocker #12)          | Manual doc only.                                                   |
| **Phase 1.5** multimodal AI (snapshot + LaTeX) | Moat for AI quality; small $/session.                              |
| **Phase 1.5** Desmos state capture             | Replay fidelity for in-iframe edits; URL-only replay stable today. |
| **PDF mobile / iOS OOM**                       | Server-side PDF path if pilots report crashes.                     |


---

## Wave 4 — Phase 2 (gated — do not implement until gate clears)

`docs/WHITEBOARD-STATUS.md` **Phase 1 → Phase 2 demo gate**: no **collab text / code / Office / Wolfram** until Sarah completes **3 real sessions** + PO surfaces checklist.

Use gate output to add **one** scoped Phase 2 spec — not all four surfaces.

**Strategic / out of scope for near term:** video / screen share / multi-party (see `BACKLOG` yellow items); naming (“Tutoring Studio”); tldraw migration (legacy brainstorm in BACKLOG).

---

## Cross-reference index


| Need                                     | Read                                                 |
| ---------------------------------------- | ---------------------------------------------------- |
| Phase 1 status & blockers                | `docs/WHITEBOARD-STATUS.md`                          |
| Single source open queue rows            | `docs/BACKLOG.md` § Whiteboard                       |
| Manual smoke checklist                   | `docs/whiteboard-smoke-log.md`                       |
| W2 / W6 engineering checklist            | `.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md`       |
| Cursor Build YAML (next execution chunk) | `.cursor/plans/whiteboard_backlog_execution.plan.md` |


*Last updated: 2026-05-05 — fold substantive progress into this file or retire sections so it stays skimmable.*