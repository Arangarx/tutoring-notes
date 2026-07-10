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

## ✅ Decisions recorded (Andrew 2026-07-09) — still collect-only until "act"

- **1 SEC-POLICY-TRUTH → A (both):** interim copy accuracy now (grade-level, signed-URL wording, soften 24-mo claim until clock exists) + scope retention-lifecycle build for pre-release. Item 24 PARTIAL was honesty doubt on privacy/terms — same thread.
- **2 Cancel semantics → A (keep cancel=delete)** + critical acceptance: **next Start / copy-link MUST always mint a fresh live session id** ("if a tutor clicks new session it should always be a new session. Period."). Cancel-as-delete is fine pre-start; the stranded-student exit + stale-deleted-id copy-link bugs are the real fix targets (bundle).
- **3 Parent interstitial → B-ish / soft:** hasn't seen it recently; testing on `preview.usemynk.com`. Suspect may be email claim links still pointing at a non-preview / wrong host (he may not be rewriting URLs). **Before a big fix:** verify what host claim-invite emails actually send. If email host ≠ login host → preview/RC-A class; if same-host copy-link still AuthGate → real bug.
- **4 Save-to-notes / review exit → REFINED (Andrew 2026-07-09):** Do **not** auto-nav on Save (keeps replay review available after save). Add an explicit **"Finish review"** (copy TBD) control that navigates to student detail — discoverable "I'm done / now what?" without surprising mid-review bounce. Save still shows confirmation chip; Finish is the escape. Open to copy variants ("Done", "Back to student", etc.).
- **5 Billing → A:** flip default rounding **nearest → up**; surface on **end-session review**; label clearly as **the tutor's billable time** (not "we are billing you" — product doesn't bill yet).
- **6 Marketing nav → A:** restore wordmark → `/?view=home` (Model B). Likely lost when wordmarks were unified to `/` without the logged-in-from-app exception.
- **7 Item 3 FAIL:** Andrew believes findings already handled or queued — no new repro needed unless something still breaks in smoke.
- **8 Item 17 / share FAIL reframed:** not "empty notes" mystery — **View whiteboard from notes lands on OLD legacy replay** (old audio scrubber + tiny board), not the new in-frame surface. = existing SMOKE-BLOCK-2 / "View whiteboard from NOTES" queued item (tutor + student/parent). Save-first unknown; destination stack is the bug.
- **9 Item 24 PARTIAL:** honesty of privacy/terms content (not a broken page) → folded into SEC-POLICY-TRUTH (decision 1A).
- **Master-cut talk (Andrew 2026-07-09):**
  - **(1) `wb-replay-active-board-tab:95` REAL-FAIL → likely TEST (or CSS in wrong place), not product.** Andrew: when watching replay, Board 1 *looks* active correctly. **Visual proof 2026-07-09:** screenshot shows Board 1 with red active dot + orange underline among Boards 1–5; product looks correct. Gate assert is `aria-selected="true"`; received `false` + `disabled` on the tab. Hypothesis: visual active state ≠ `aria-selected` (CSS/class elsewhere), or oracle wrong. **When acting:** investigate visual vs aria first — do NOT treat as a product regression until proven; prefer fix test / wire aria to match visual / move active styles to the correct selector. Still must clear or consciously quarantine before master (full `test:wb-sync` gate).
  - **(2) Sarah surface = `master` only.** She has **never** used `v1-redesign` / preview — as far as she's seen, the site is still the old UI. So **master cut = Sarah delivery**, not "optional later." Redesign preview is Andrew-only smoke. Integrity list (erasure gate, cancel/stale-id, claim escapes, old replay, policy copy, notes quality, share wall already in) is the path to *her* seeing the new product.

---

## Intake — 2026-07-09 review (collect only; do not act until Andrew says)

- **Known issues & roadmap — section headers too muted.** Categories are good; hierarchy feels inverted — section headers read weaker than the bullets under them, so scanning for a section is hard (human perception / contrast-weight, not structure). Likely: muted `<h3>` styling vs body bullets. Fix direction when acting: strengthen section header weight/contrast (not louder bullets).
- **Live board overflow — "Sign out" dimmed at bottom.** Placement + red destructive styling are good; last-row text still half-dimmed/clipped by the sheet bottom fade (same class as the "More styles" clearance fix). When acting: same scroll-padding / fade treatment so "Sign out" is fully readable and tappable.
- **Live board top-bar ⋯ "More" — PDF affordance hard to find.** Knew what to look for and still struggled to spot which item is PDF; first impression was "it isn't there." Not broken, but discoverability/iconography/labeling of the More menu items (esp. PDF) needs a pass. Pre-release polish.
- **Live board top-bar compaction too aggressive.** Collapses controls into ⋯ "More" at widths that still have room; should stay expanded longer and react more gradually to available width. Pre-release (before GA), not blocking Sarah smoke.
- **Password fields — show/hide password affordance.** Before release, password entry fields should have a show-password control (eye toggle or similar), at least on phone. Desktop nice-to-have; phone is the priority.

---

## Resolved-as-designed (no action)

- Whiteboard student styles "regressed" (only color + width showing, indicators/More-styles gone) — by design (WS-R: controls are dynamic to the draw type; "More styles" present, just not auto-expanded). You said leave it.
