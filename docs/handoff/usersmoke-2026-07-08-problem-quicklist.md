# Smoke problem quicklist — Andrew, 2026-07-08 session

Scannable index of everything Andrew flagged during the 2026-07-08 durability-wave smoke on `v1-redesign`. Status as of 2026-07-09 ~01:45. Full detail + root causes live in [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md); the annotated runbook is [`v1-redesign-durability-wave-usersmoke-2026-07-08.md`](v1-redesign-durability-wave-usersmoke-2026-07-08.md).

Legend: ✅ fixed & merged · 🔧 fixed, on branch, awaiting your smoke · 🔴 P0 · ⏳ queued (not started) · 📋 backlog (post-Sarah) · ❓ needs your decision

---

## ✅ Fixed & merged to `v1-redesign`

- ✅ Dark-mode dropdown coloring broken again (billing settings) — component-scoped `NativeSelect` primitive (`ca19c16`)
- ✅ Known-issues page stale + needs category separation — refreshed + 8 categorized sections (`bb81cbd`)
- ✅ Student left bar in landscape missing the 3-dot "More" menu — CSS rail fix (`e771e4b`)
- ✅ Phone shows "Hold Alt to revert…" hint (no Alt key on phone) — hide keyboard hints on touch (`90762a9`)
- ✅ Phone multipoint line "press Escape or Enter to finish" — custom floating "Done" button on touch (`90762a9`)
- ✅ Landscape "Sign out" unsafe between sync/⋮ buttons — moved into overflow menu (`90762a9`)
- ✅ "More Styles" half-dimmed at bottom on phone — styles-sheet scroll clearance (`90762a9`)

## ✅ Merged into `v1-redesign` overnight (2026-07-09) — ready for you to smoke together

- 🔴✅ **Stroke bleed regressed AGAIN (Board 2 strokes on Board 3)** — P0 blank-board guard hole closed. Merged `9c36cb1`. **Relay gate (`test:wb-sync`) ran on the P0 tip: jest 860/860; all 6 Playwright shards green incl. the new `wb-e3-blank-board-stroke-leak` P0 test + every sync invariant** → confirms P0 introduces no new sync/bleed regression. Smoke: draw on Board 2, switch to blank Board 3, back — no bleed.
- 🔧✅ **Share link allows anonymous access to notes (MAJOR)** — secure-by-default auth wall. Merged `561d7a9`. Smoke: logged-out `/s/` link → login redirect; entitled parent/learner → still sees notes. (Integrated tip passed `next build`.)

> Gate caveat (not caused by either fix): one **pre-existing** relay test is red on `v1-redesign` — see the replay list below.

## 🔴 Decided, queued to dispatch the moment P0 lands

- ⏳ **Notes quality** — Plan/next-steps doubled up; Assessment inaccurate. Decision `prompt_wins` (dedup rule + port v7 assessment grounding into REDUCE). Prompt-only, Composer.
- ⏳ Shimmer briefly flashes real notes content (shimmer not fully fixed) — folded into notes-shimmer per-field skeleton dispatch.

## ⏳ Queued (pre-Sarah, not yet started)

### Whiteboard / replay
- ⏳ "Multi-part recording" warning banner still on replays — remove it (you asked before).
- ⏳ Replay doesn't resume from pause — after "Pause and hide" → "Replay session" it restarts from the beginning; should resume.
- ⏳ Replay "audio loading" line causes layout jump (CLS) below the scrubber — reserved-height slot.
- ⏳ Theme button in replay caused an unexpected nav to `/admin/students/<id>` (once) — hydration guard on review nav links + remove duplicate theme toggle.
- ⏳ Replay top-bar disabled buttons need the same dimness as the sidebar disabled buttons.
- ⏳ Replay board tabs missing the document/PDF icons that the live board tabs have.
- ⏳ **Replay board tabs don't show active-selected state during scrub (pre-existing red, gate-surfaced).** `wb-replay-active-board-tab:95` fails on `v1-redesign` independent of the P0 fix — the Board-1 replay tab stays `aria-selected="false"` and renders `disabled` while scrubbing. Traces to `eb3fb5d` ("reds under triage"). Same replay-tab area as the missing-icons item; likely fix together.
- ⏳ "View whiteboard" from NOTES lands on the OLD/legacy replay (tutor + student) — must land on the new in-frame replay.

### Nav / layout / UX
- ⏳ End-session screen → student detail "flashed like a fast reload."
- ⏳ Flash load again when STARTING a session (same family as end-session flash).
- ⏳ Tutor/admin lost the ability to reach the marketing page — `?view=home` escape hatch orphaned.
- ⏳ "Known issues & roadmap" should be a top-level sidebar link, not buried in Settings.
- ⏳ Double scrollbars on multiple admin pages — single architectural root cause.
- ⏳ Parent dashboard "Manage" button feels out of line with "Copy" — move Manage to the upper-right of each learner block.
- ⏳ Unclaimed student: "Create claim link" should be a top-level affordance, not at the page bottom.
- ⏳ "Save to notes" didn't navigate away (needs a destination decision — see below).

### Claim flow
- 🟠 Claim flow lost the "set up child login LATER" option — parent should NOT be forced to create a child login to claim.
- 🟠 Still no escape when claiming a student who already has a login (dead-end).
- 🟠 Logged-in parent still sees the "you already have an account" interstitial instead of a personalized "signed in as X" (recurring).

### Session lifecycle
- 🟠 Tutor cancel (pre-start) strands the student in the waiting room — tutor "disappears," student never navigates away.
- 🟠 After a cancel, "copy link" for the SAME adult learner hands out the DELETED session's id → dead link (MAJOR).
- 🟠 Student got the WRONG mic after leaving a canceled session and joining the next one.

### Security / compliance (pre-Sarah)
- 🔐 Pending-erasure student: tutor is NOT blocked on `/admin/students/<id>` — can still open notes, upload audio, add notes, make share links. Banner over-promises.
- 🔴🔐 Are we truly honoring privacy/terms 24-mo COPPA retention? — NO enforcing cron / no "account closed" state modeled. Truthfulness gap.

## 📋 Backlog (post-Sarah / pre-release)

- 📋 Rethink the whole claim-screen flow/layout (clunky, too much scrolling on small/desktop).
- 📋 Self-service account deletion for parents/students (your wife's question) — likely lighter than compliance erasure.
- 📋 Laser-pointer color mismatch — student sees red, tutor sees blue.
- 📋 Device-picker cleanup — de-dupe cameras/mics; phone picker: basic front/back only (Sarah's ask).
- 📋 Replay: indicate WHO is speaking (with video-record work).
- 📋 First-acquire mic activity indicator dead until you switch device and back (SMOKE-AUDIO-1).
- 📋 Possible tutor phantom self-unmute (SMOKE-AUDIO-2, unconfirmed — watch).
- 📋 "Finalizing" felt slow on a short session (SMOKE-PERF-1) — confirmed it does NOT scale with session length; de-await snapshot queued.

## ❓ Needs your input (won't block)

- ❓ "Save to notes" destination — student detail, notes list, or stay + prominent CTA?
- ❓ Billing (smokebook item 21) — flip default rounding **nearest → up**? And where should billable time surface (end-session review? session list?).
- ❓ Item 3 FAIL repro — what exactly failed on "Start session / workspace mounts"?
- ❓ Item 17 share-link FAIL repro — `/s/` vs `/join/`? had you Saved to notes first? session ended? logged-out or entitled? what did you SEE?
- ❓ Item 24 marketing/legal PARTIAL — which surface partially failed (`/`, `/privacy`, `/terms`, logged-in `/` redirect)?

---

## Resolved-as-designed (no action)

- Whiteboard student styles "regressed" (only color + width showing, indicators/More-styles gone) — by design (WS-R: controls are dynamic to the draw type; "More styles" present, just not auto-expanded). You said leave it.
