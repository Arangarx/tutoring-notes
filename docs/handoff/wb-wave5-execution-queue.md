# WB Wave 5 — smoke-triage EXECUTION QUEUE (single source of truth)

> **Purpose:** the ONE canonical list of every workstream still to execute on `wb-wave5-polish`, so any chat (incl. a fresh one after a swap) knows exactly what remains without re-deriving it from scattered `~/.cursor/plans/*.plan.md` files. Detailed specs live in the linked plan files; **this doc is the index + status + order.**
>
> **Branch:** `wb-wave5-polish` · **Worktree:** `tutoring-notes-polishwt` (NOT the default `tutoring-notes` checkout, which is on `v1-redesign`).
> **Live smokebook (Andrew's results):** `docs/handoff/go-to-sarah-master-cut-smokebook.md` — do NOT edit; it's his hand-entered source of truth.
> **Relationship to `ORCHESTRATOR-STATE.md`:** that doc's HEAD is stale (Wave 4). Link this queue from it at the next state refresh. Until then, **this file is authoritative for the wave-5 execution backlog.**

---

## Landed overnight (context — already committed on branch, do not re-do)

Wave 0 Prisma migration · **WS-A** VAD + per-speaker lanes + outbox mid-session register fix (`234c6d7`, 5-axis CLEAN; **F-1 deferred**, see below) · **WS-B** ~1s server persist · **WS-C** end→review · **WS-D** resume-from-backend · E2/E3/WS-E bugs · solo/in-person stroke capture (Andrew confirmed "strokes recover now" @ step 11). Final relay @ `c2ca8f5`: jest 812/812; Playwright wb-regression green except non-product test-isolation reds. **Parked at merge gate.**

> ⚠️ Overnight work is DONE but **smoke is surfacing real defects in it** — see WS-N (audio loss on resume) and WS-L (scrub t=0). "Landed" ≠ "correct on hardware."

---

## OPEN EXECUTION QUEUE

All items below are **planned, not started** (unless noted). Priority: P1 = blocks Sarah cut / data-loss / core-promise; P2 = important polish/UX.

### Recommended order (serialize fragile-surface audio/recorder work; parallelize file-disjoint UI)

1. **WS-I** (tutor mute → recording) — **FIRST.** Unblocks Andrew's ability to verify student audio (can't isolate remote audio while own mic always records). Recorder audio-graph surface.
2. **WS-N** (pre-kill audio loss on resume) — **P1 data loss**, needs root-cause pass before code. Recorder/outbox/resume surface.
3. **WS-L** (scrub t=0 / A6-1 multi-segment) — P1 core replay. Timeline/mapping + per-segment durations.
4. **WS-G** (seamless replay concat) — P1; shares root cause with WS-L (null durations / multi-segment). Sequence right after/with WS-L — the per-segment-duration fix + concat together kill the hitch, drift, "multi-part" warning, and likely the replay-ends-short symptom.
5. **WS-K** (live reduce → notes ≤2–3s at end) — P1 core promise. Notes worker/pipeline; file-disjoint from audio graph → parallelizable with UI items.
6. **WS-M** (student-side mic boost) — P2; build student publish-only audio graph + reuse `MicControls`. Live-A/V surface → serialize vs WS-I (both touch mic graph).
7. **WS-F** (waiting-room exit affordance) — P2 UI; file-disjoint, parallel-safe.
8. **WS-H** (mic persistence hardening) — P2; storage + acquireMic resilience.
9. **WS-J** (billable time rounding) — P2 feature; mostly disjoint (session snapshot + settings UI).

### Item detail

- **WS-I — Tutor mute honored in recording** · P1 · plan: `~/.cursor/plans/tutor_mute_honored_in_recording_8d0e254b.plan.md`
  Root cause: `toggleMic` (`useLiveAV.ts:3005`) flips publish tracks only; recording branch is a separate Web Audio dest → tutor voice still in replay. Fix: new **recording-branch-only** gate in `mic-recorder-audio.ts` gated on existing `isMicMuted` (can't reuse shared `gainNode`/`setGain` — it feeds both dests). Reverses `LIVE-AV.md` invariant 13 (ratified by Andrew). Origin: Andrew smoke ("tutor mute NOT honored in replay").

- **WS-N — Pre-kill audio lost at tab-kill boundary** · P1 DATA LOSS · **fragile surface (recorder/outbox durability contract) → tier bump for design** · plan: **none yet, ROOT CAUSE DECISIVE** (investigations [90727a2d](90727a2d-916f-41d7-82ed-0a7be8184d65) → CORRECTED by [96ea22cd](96ea22cd-2d37-430d-b142-4dc2b4a047ba)).
  **CORRECTED mechanism (Andrew's evidence refuted the "in-progress segment only" theory — he lost MULTI-MINUTE pre-kill audio incl. long-since-cut segments):** a VAD segment becomes durable **only AFTER its blob upload to Vercel Blob completes AND it's then written to the upload-outbox IDB** (`enqueue` with `blobRemoteUrl`). The blob upload runs **in tab memory first** (`useAudioRecorder.ts:785-833` → `WhiteboardWorkspaceClient.tsx:1796-1819`); the durable outbox row is created only after upload resolves, and the UI advances to the next segment immediately. So **any segment whose upload chain hadn't committed to IDB at tab-kill vanishes with the tab** — if uploads were slow/backlogged, that's ALL still-uploading segments, not just the in-flight tail. Raw audio is NOT independently persisted at cut (30s `recording-draft` holds only the current segment + needs manual "Keep"). **Class (A) never-persisted CONFIRMED; class (B) persisted-but-excluded RULED OUT** (replay `notes-actions.ts:536-544` + `page.tsx:121-128` load all rows; finalize dedupe-insert-only keeps all).
  **Secondary data-loss path:** roster / resume-gate "End and review" (`WorkspaceResumeGate.tsx:121`, `ActiveWhiteboardSessionsList.tsx:66`) calls `finalizeWhiteboardSessionFromBackend` **without `extraSegments`** → DB-only → orphans any outbox-only (un-registered) segments.
  **Stroke-gap (same report):** on reopen FSM re-enters `armed` (`everBothPresentRef` reset, `lifecycle-machine.ts:437-467`) → `wbCaptureActive` false → strokes render but aren't logged until `recording` → "jumped from last stroke to pdf import." Same armed-gate family as solo/in-person.
  **Scrubber-short (same report):** `computeScrubberMax` = max(audio, event ts, `log.durationMs`) (`replay-helpers.ts:87-97`); missing audio → bar longer than playable audio. Overlaps WS-L/WS-G.
  **REAL fix (systemic — invert durability order):** persist each cut segment's **raw blob to the outbox IDB AT CUT TIME** (durable immediately), then upload+register FROM that durable store with retry → tab-kill can't lose an already-cut segment; resume re-drains. Supporting: (1) `pagehide`/`visibilitychange` flush in-progress segment to the durable store; (2) auto-promote draft on resume (kill manual "Keep") + `kickWorker` for `!registerOk` rows on resume (`observe()` currently does NOT kick — `upload-outbox.ts:884-891`); (3) await **register** (not just upload) before End seals (`drainAndAwait` awaits uploads only); (4) pass `extraSegments` into gate/roster finalize. (5) close resume `armed` window (stroke-gap). (6) reconcile scrubber max w/ playable audio (folds WS-L/WS-G). **NOT the fix:** lowering VAD min (only shrinks each upload, not the durability-write timing).
  **Testable (existing seams):** block/slow `uploadAudio` mock + `context.close()` mid-upload-backlog → resume → End → assert pre-kill segments present via `/api/test/.../recording-count` + replay/transcript. Plus `__VAD_*` overrides, draft Keep/Discard branches. Origin: smokebook step 11 + Andrew "definitely had pushed-out VAD chunks; loss was the tab-kill boundary itself."
  **25s min-chunk (SEPARATE tuning, not the fix):** `VAD_MIN_SEGMENT_SECONDS=25` (`segment-policy.ts:20`); rationale = avoid fragmenting transcription into tiny chunks. Lowering to ~8–10s = more segments/uploads/Whisper calls/CostEvents + worse multi-segment replay UX (needs WS-G concat). Andrew OK to lower as durability-friendliness; does NOT fix WS-N.

- **WS-L — Scrubber t=0 on multi-segment (A6-1)** · P1 · plan: `~/.cursor/plans/scrubber_multi-segment_seek_fix_663915e7.plan.md`
  Root cause: multi-segment recordings have null `durationSeconds` → `totalMs=0` → `globalMsToSegmentLocal` clamps any drop to 0 → `el.currentTime=0`. Previously-known **A6-1** (ORCHESTRATOR-STATE:231), promoted to always-on by WS-A. Fix: persist real per-segment durations + defensive guard + multi-segment scrub tests (incl. real-browser). Origin: Andrew smoke (scrub → t=0).

- **WS-G — Seamless replay concat** · P1 · plan: `~/.cursor/plans/seamless_replay_concat_eaea8414.plan.md`
  Root cause: WS-A VAD chunking → many tutor:mic segments → boundary hitch + integer-second drift + "Multi-part recording — timing may drift" warning. Fix: server-side FFmpeg concat at finalize → one canonical replay blob (single-segment path already correct); keep small segments for transcription. Origin: Andrew smoke (drift warning).

- **WS-K — Live reduce, notes ready ≤2–3s at end** · P1 · plan: `~/.cursor/plans/live_reduce_notes_ready_at_end_ded9005b.plan.md`
  Root cause: reduce is end-gated (`notes-worker.ts` `endedAt` guard) → notes appear tens of seconds after end. HARD INVARIANT (Andrew): map AND reduce run LIVE incrementally; End = fast finalize, zero LLM if draft current; notes within 2–3s. (Live *display* stays deferred — different feature.) Also fix shimmer (undefined CSS vars) + "Waiting for transcript…" copy. Origin: Andrew smoke.

- **WS-M — Student-side mic boost** · P2 · plan: **none yet** (decided 2026-07-04: student-side, tutor control DEFERRED).
  Student mic today is raw getUserMedia, no audio graph. Build student publish-only graph (mic→gain→publish) + reuse `MicControls` "Browser boost" slider in student shell w/ own gain state + persistence. Boost sits pre-publish → affects live + recording. Tutor-side incoming boost explicitly deferred. Origin: Andrew ("student needs the browser boost the tutor has").

- **WS-F — Waiting-room exit affordance** · P2 · plan: `~/.cursor/plans/waiting-room_exit_affordance_0e0372c5.plan.md`
  Add confirm-gated "Cancel session" (tutor, deletes un-started session) + "Leave session" (student, reuses exit teardown) to `WaitingRoomOverlay`. Origin: Andrew ("no way to exit waiting room").

- **WS-O — Board-tab overflow scroll** · P2 UI · plan: **none yet** (small; file-disjoint, parallel-safe).
  When more board tabs exist than fit across the bottom strip, there's no way to reach the overflow. Add horizontal scroll / scroll-buttons / overflow affordance to `src/components/whiteboard/chrome/BoardTabStrip.tsx` (existing `BoardTabStrip.test.tsx` to extend). Keep active-tab-into-view on switch/add. Origin: Andrew smoke ("more board tabs than fit — need to scroll to see more").

- **WS-P — Always-fresh code on load (no stale bundles / hard-refresh)** · P1 reliability/infra · plan: **none yet** (audit [1c36a37d](1c36a37d-57f7-4edf-85d4-e99627b07cd6)).
  **Root cause (confirmed — NOT a service worker; none exists):** Next App Router **soft navigation reuses the document + already-loaded JS bundles** (`middleware.ts:96-107` documents the same doc-reuse for Permissions-Policy), so a tab opened before a deploy runs OLD JS through all in-app nav. Long-lived workspace tabs (30-60min) never pick up a new deploy. No Vercel Skew Protection, no version check, no `ChunkLoadError` handler. `/_next/static` is correctly immutable; authed HTML is `force-dynamic` (not cached). Hard refresh is the only thing that pulls fresh chunks. **Confounds smoke** (makes "old-way" ghosts) but does NOT explain/fix the proven WS-N/WS-L races.
  **Plan (ranked):** (1) **Enable Vercel Skew Protection** (production dashboard — ANDREW action, project-setting greenlight; prevents mid-deploy chunk 404s). (2) `/api/version` (commit SHA / buildId) + client poll on focus/route-change → get user onto latest. (3) global `ChunkLoadError` → one-time `location.reload()`. (4) expose commit SHA in prod footer (`SiteFooter.tsx`; today preview-only via `PreviewBranchBadge`).
  **DESIGN DECISION (recommend, confirm):** guarantee freshness at app entry / session start / between sessions; **DEFER auto-reload during a LIVE recording session** (reloading mid-session interrupts recording — worse than stale code) → apply on session end or non-intrusive "update ready" prompt. Origin: Andrew ("nobody should ever have to hard refresh to get working code").

- **WS-H — Mic persistence hardening** · P2 · plan: `~/.cursor/plans/mic_persistence_hardening_67d9cd4b.plan.md`
  Store groupId/label correlate alongside deviceId; don't hard-wipe saved pref on transient `OverconstrainedError`. Origin: Andrew smoke (wife's mic not remembered; intermittent).

- **WS-J — Billable time rounding** · P2 · plan: `~/.cursor/plans/billable_time_rounding_8ddd36ee.plan.md`
  Tutor sets rounding increment (min) + direction (up/down/nearest); rounded billable time + rule FROZEN into WhiteboardSession at close. Origin: Andrew ("designed forever ago").

- **WS-Q — Time-alert copy + tutor-configurable defaults** · P2 · plan: **none yet** · smokebook item 7.
  "No alert clock specifically." Volume label should be consistent with the checkbox; copy → **"Time alert volume:"**. Show what the alert is configured to; let tutor set defaults in **settings**. Broader signal: a **tutor-settings surface** (time-alert defaults, roughness default, WS-J rounding, etc.) — Andrew: "there's probably a ton of things the tutor should be able to configure." Scope WS-Q as the time-alert copy/config fix; note the settings surface as a parent theme. Origin: item 7 (PARTIAL).

- **WS-R — Pencil/freedraw roughness no-op** · P2 · plan: **PLANNED (investigation done, [readonly probe](661ddf53-8276-42cb-b8d6-6fedbb612ebd))** · chrome-only, NOT fragile · smokebook item 19.
  **Root cause = (a) genuinely inapplicable, NOT a wiring bug.** Excalidraw ^0.18.1 renders freedraw ink via **perfect-freehand `getStroke()`** (no rough.js); `roughness` is persisted on the element but a **visual no-op** for pencil. Native Excalidraw only shows Sloppiness/roughness for `hasStrokeStyle` types (rectangle/ellipse/diamond/arrow/line) and only shows edge-roundness for `canChangeRoundness` types — **both exclude freedraw**. Our chrome shows both for pencil = dead knobs.
  **⚠️ FALSE-GREEN CAUGHT (proactive-defect-hunt tally):** overnight WS-E **E5 [`7511dd9`](https://github.com/Arangarx/tutoring-notes/commit/7511dd9)** "fixed" this by setting `currentItemRoughness` and its teeth spec `wb-roughness-style.spec.ts` asserts `element.roughness===2` **on the data model only** — it passes even though the stroke looks identical, so it never validated Andrew's actual (visual) complaint. Exemplar of the "test to spec, not to code" directive.
  **FIX (additive, chrome-only — no `src/lib/whiteboard/` sync/apply-path touch):** add `showRoughness`/`showRoundness` flags (default true) to `WbStrokePropsPanel.tsx`; compute them in `WhiteboardWorkspaceClient.tsx` from active tool (+ selected els under selection tool) mirroring Excalidraw's `hasStrokeStyle`/`canChangeRoundness`; hide the roughness + edge-sharpness sections **and** the compact-summary chips (desktop 4810–4856 + mobile flyout 6706–6776) when false. Keep `updateStrokeStyle` wiring (4690–4718) UNCHANGED — shape tools still get roughness.
  **TEETH (replace the false-green spec):** (1) Pencil active → roughness/sharpness controls NOT rendered; (2) Rectangle/Line active → roughness controls visible AND `element.roughness` changes on a shape; (3) selection tool + freedraw selected → hidden; + rectangle selected → shown. Origin: item 19 (N/A-with-notes).
  **HOLD:** file-overlaps nothing in flight, but touches `WhiteboardWorkspaceClient.tsx` (large shared file) → dispatch only when no other code-writer is active in the worktree.

- **WS-S — Review overlay actually loads session data** · P1 verify · plan: **none yet** · smokebook item 13.
  Andrew: End "goes to the review screen but I'm not sure it's loading ANY data." Verify `SessionReviewMode` populates strokes + audio + notes on ALL three End paths (in-live / roster / gate). May be a WS-N symptom (no audio to load) or a distinct review-hydrate bug. Investigate + add test asserting the review overlay is **non-empty** on each path. Origin: item 13 (PASS-but-doubted).

---

## Cross-cutting workstreams (woven through the queue — first-class scope)

These run **alongside** the lettered WS-* items above; a fresh orchestrator must treat them as standing obligations, not optional polish.

- **WS-T — Proactive defect hunt** · cross-cutting · plan: **this queue (record findings here)**
  Woven into **every** workstream **plus** a dedicated adversarial sweep during the site-wide coverage audit. Review thoroughly enough to surface misses/bugs Andrew did **NOT** flag. **Decision rule:** clear/unambiguous bug → **FIX** with a behavior teeth-test and **LOG** in this queue what was caught; ambiguous/product-judgment → do **NOT** guess, **BATCH** into grouped questions for Andrew; fragile-surface finding (recorder FSM / upload-outbox / whiteboard sync / auth-ownership boundary / DB migration) → **FLAG** before touching per tripwire discipline. Record found-bugs + open-questions durably in this file. Origin: Andrew 2026-07-04 wave-5 plan.

- **WS-U — UX / human-experience heuristic review (whole app)** · cross-cutting · plan: **this queue (prioritized findings list)**
  Evaluate every flow/screen from a real paying user's eyes; target emotional range **neutral-when-invisible** to **DELIGHTED-on-recovery**, **NEVER** confused/frustrated/trapped. **Axes:** escapability (no trapped screens; exits not buried/tiny/invisible), comprehension (obvious button purpose, no jargon copy e.g. "Waiting for transcript", feedback on silent states), affordance placement (expected controls present; rarely-used not crowding primary; destructive actions not too-easy/too-close-to-common), safety/recoverability (tab-close, misclick, accidental End, bad network → app catches them before a non-recoverable wall; undo/confirm/recovery a reasonable paying user assumes exists), and pre-empt-the-complaint delight. **NO "well akshually" justifications** — if a user will be confused or frustrated, it is a defect, full stop. **AUTO-FIX** objective failures (trapped/no-exit, invisible/buried exit, dead/no-op buttons, missing destructive-confirm, unrecoverable data-loss paths, jargon/broken copy) with behavior teeth-tests. **BATCH** taste/judgment items (repositioning, rarely-used moves, net-new affordances/safeguards, brand-voice copy rewrites) as a **PRIORITIZED** findings list (**Trapped/Broken → Confusing → Polish/Delight**) for Andrew. **WS-F** (waiting-room exit) is an exemplar of the trapped-screen class. Motivation: the more solid the **ENTIRE** app is when Sarah returns from her July-4 trip, the better the impression. Origin: Andrew 2026-07-04 wave-5 plan.

- **WS-V — Site-wide mechanical-coverage audit (feeds Part-2 buildout)** · cross-cutting · plan: **this queue + TEST COVERAGE INVENTORY below**
  Enumerate every component/flow/API route/DB-write/gate/guard site-wide (use `docs/INDEX.md` + the smokebook + the app tree as the enumeration source), map each to existing test coverage, and list the gaps as behavior-test **BUILD** tasks. The smokebook-item map in **TEST COVERAGE INVENTORY** is the **FLOOR**, not the ceiling. All tests must be **behavior/contract** tests (user-observable requirement), **NOT** implementation/component-coupled, so they survive the coming full component-deduplication audit. Runs after the P1/P2 fix train; output = Part-2 test buildout task list. Origin: Andrew 2026-07-04 wave-5 plan.

---

## TEST COVERAGE INVENTORY — Part-2 build target ("test absolutely everything mechanical")

**SCOPE (Andrew 2026-07-04, expanded):** NOT just the flagged items and NOT just this smokebook — **EVERY mechanical action site-wide** gets an automated test. Anything that could appear in a final comprehensive smoke and is mechanical (any click, state transition, data-flow, DB write/read, API contract, gate/guard, consent projection, ownership assertion, persistence path) → automated. "Half a day is fine as long as it's done correctly." Only genuinely-human things (real A/V, iOS, thermal, subjective audio quality, visual/copy/theme) stay in the slimmed smokebook.

**WHY THIS MATTERS — dedup-audit safety net (Andrew 2026-07-04):** a **FULL COMPREHENSIVE component-deduplication audit of every component on the site** is coming **before release**. These tests are the **regression net that makes that refactor safe**. Therefore:

> **HARD PRINCIPLE — behavior/contract tests, NOT implementation/component-coupled.** Assert the **user-observable requirement** (what happens), never "component X calls handler Y" or a specific DOM structure that dedup will collapse. A test coupled to a component **breaks the moment dedup merges it into a shared primitive** and becomes noise; a behavior test **survives** the component being rebuilt underneath. This is the `.cursor/rules/composition-no-duplication.mdc` companion: the suite must ENABLE consolidation, not fight it. Prefer role/testid/behavior oracles + real render (relay/Playwright for geometry/audio/DOM) over shallow unit assertions on internals.

**Approach:** (1) fix each bug with its behavior teeth test; (2) systematic site-wide mechanical-coverage audit — inventory every component/flow from `docs/INDEX.md` + the smokebook + the app tree → map to existing coverage → BUILD behavior tests for gaps; (3) slimmed human-only smokebook. The smokebook-item map below is the STARTING point, not the ceiling.

Map of every smokebook item → coverage action. **BUILD** = write/strengthen a red-before/green-after behavior teeth test. **HAVE** = coverage exists, verify still green. **HUMAN** = genuinely needs hardware (goes in the slimmed smokebook).

- **Item 6 VAD segment count + mid-session register** — HAVE (`wb-vad-per-speaker-durability.spec.ts`). Verify green post-fixes.
- **Item 7 time-alert** — BUILD: unit test for chime fire on **session-elapsed** (pause-aware) threshold + copy assertion (WS-Q).
- **Item 8 8-hour hard-stop** — BUILD: drive session clock via seam / mock `SESSION_SAFETY_MAX_SECONDS` (NO 8h wait) → assert `shouldHardStopSession` fires. (Andrew explicitly asked for this.)
- **Item 9 replay-mix invariant** — STRENGTHEN: assert replay segment set contains **only** mixdown rows, **no** `student:peer-*` / transcription-only rows (step 5b exists — make the source-set assertion explicit). Re-verify after WS-L.
- **Item 10 per-speaker lanes** — HAVE (transcriptionOnly upload + lane); Whisper-on-real-audio stays HUMAN (item 24).
- **Item 11 tab-kill audio survival** — BUILD (WS-N teeth): block/slow upload + `context.close()` mid-backlog → resume → End → assert pre-kill segments present via `/api/test/.../recording-count` + transcript.
- **Item 12 persist-failure warning** — HAVE (unit); verify.
- **Item 13 review loads data** — BUILD (WS-S): assert `SessionReviewMode` non-empty (strokes+audio+notes) on all 3 End paths.
- **Item 14 server hydrate** — HAVE (`wb-resume-from-backend.spec.ts`).
- **Item 15 IDB-ahead auto-merge** — HAVE (unit + relay).
- **Item 16 notes shimmer** — STRENGTHEN (WS-K): current test only checks DOM presence; assert **computed style / animation actually runs** (the undefined-CSS-var bug was invisible to presence check) + reduced-motion branch.
- **Item 17 PDF no dup strokes** — HAVE (headless pdfjs caveat noted).
- **Item 18 replay active-board tab** — HAVE.
- **Item 19 roughness** — BUILD or REMOVE (WS-R): assert roughness applies to a shape (and, if kept for pencil, to freedraw) OR assert control hidden for freedraw.
- **Item 20 student mic persist** — HAVE (jest round-trip); rejoin slot-swap = fake-media limit; WS-H hardens.
- **Item 31 replay single + multi-segment seek** — BUILD (WS-L): real-browser scrub-drop lands at position, single AND multi-segment, not t=0.
- **Item 32 notes ready ≤2-3s + save/finalize** — BUILD (WS-K): assert finalize fast-path (no LLM call, done on first poll) + no legacy monolithic button.
- **Items 25-30, 33-38 standing regression** — HAVE via existing suites (auth, identity-e2e, consent projection, sal share-access, erasure, tfa, wb-sync). Verify green; no per-theme automation (theme visual = HUMAN spot-check).
- **HUMAN-only (→ slimmed smokebook):** 21 (WebRTC A/V reconnect real network), 22 (iOS AudioContext backgrounding), 23 (mobile thermal), 24 (Whisper on real audio), 37 (legal copy accuracy), theme/visual/copy spot-checks, subjective audio quality, real multi-device mic UX.

## GATE / HARNESS FINDINGS (2026-07-04, discovered during WS-I)

- **(a) MERGE GATE = `wb-regression` project ONLY** — explicit allowlist in `playwright.config.ts` `projects[].testMatch`. **STANDING RULE:** every new teeth spec MUST be (1) added to `wb-regression.testMatch`, (2) tagged `@wb-*` from `tests/test-tags.ts`, (3) verified enrolled via `npx playwright test --project=wb-regression --list <file>`. A spec merely under `tests/integration/` runs only in the broad `integration` project (NOT the gate) and silently protects nothing. Reference: prior overnight bug where 9 teeth specs weren't wired in.

- **(b) BLOB-TOKEN SELF-SKIP (HIGH — 'looks tested, isn't')** — several `wb-regression` specs (`wb-vad-per-speaker-durability`, `wb-notes-shimmer`, replay, PDF upload, `wb-end-from-gate`/`roster`) `test.skip` when `BLOB_READ_WRITE_TOKEN` is unset, and the gate webServer does NOT set it. Risk: the 'green' gate may be silently SKIPPING real durability coverage. **ACTION owed (WS-T/coverage audit):** quantify how many gate specs skip without the token; determine whether the harness should provide a token or a blob mock so durability specs actually RUN at the gate.

- **(c) HARNESS HEALTH** — `integration-setup` (`auth.setup.ts`) failed once during WS-I verify — `/login` returned `Unexpected end of JSON input`, `#email` never rendered (likely transient dev-server startup race; the same spec had passed minutes earlier under the `integration` project). **MUST** confirm `integration-setup` passes (harness healthy) before the final merge-gate relay run.

## Deferred / tracked (not this pass)

- **WS-A F-1** (outbox register-failure has no attempt cap → unbounded retries on persistently-failing register server; log-spam only, NO data loss). 5-axis rated SHOULD-FIX / next-wave-acceptable. **~10-line in-flight-Set fix + reuse `permanentFailAfter` + dedupe log, with its own 5-axis, before the v1-redesign merge.** F-2/F-3 fold in.

## Cleanup debt

- **DUPLICATE plan files:** `solo_recording_always-on_f2f0970e.plan.md` and `solo_recording_always-on_5ba5984e.plan.md` are identical — delete one when out of plan mode. Solo/in-person stroke capture appears LANDED (Andrew "strokes recover now") — verify + close.

## "Known issues & roadmap" page (Andrew request)

Andrew wants a Sarah/pilot-facing "Known issues and roadmap" page. Not yet planned — track here so it isn't lost. Populate from this queue's P1/P2 items once they're finalized.
