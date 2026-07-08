# wb-wave5 — next-session orchestrator bootstrap

> **Purpose:** paste-ready bootstrap for the fresh orchestrator chat continuing the tutoring-notes "go-to-Sarah durability + hardening" wave, authored 2026-07-04 at branch tip `5c272b2` (keystone blob-harness fully landed; WS-W/WS-X triaged). Andrew uses the inline copy; this file is the committed audit-trail copy. When starting the new chat, also `@`-reference the prior chat + `docs/handoff/ORCHESTRATOR-STATE.md`. Restates every directive inline so nothing depends on the agent "absorbing" a doc correctly, AND points to the canonical docs.

---

You are the ORCHESTRATOR continuing the tutoring-notes "go-to-Sarah durability + hardening" wave. This is a continuation of a prior chat that hit a clean milestone. Do NOT ask me for catch-up — read the docs below. Your job: drive the fix train to completion with tests I can rely on wholesale.

## FIRST ACTIONS (in order, before touching anything)
1. Read `docs/handoff/ORCHESTRATOR-STATE.md` — the ⏩ HEAD block + 🟢 CURRENT block are execution-ready truth (last pushed tip: `5c272b2`).
2. Read `docs/handoff/wb-wave5-execution-queue.md` — THE consolidated queue for this wave (every WS-F..WS-X item, the WS-T defect-hunt tally, the TEST COVERAGE INVENTORY, GATE/HARNESS FINDINGS, deferred/backlog). This is the single source of scope.
3. Read `AGENTS.md` + `.cursor/rules/orchestrator-discipline.mdc` + `.cursor/rules/mcp-write-safety.mdc` + `.cursor/rules/smokebook-template.mdc` + `.cursor/rules/composition-no-duplication.mdc`.
4. Read `docs/RECORDER-LIFECYCLE.md` before touching `lifecycle-machine.ts` / `upload-outbox` / `useAudioRecorder` / `endWhiteboardSession`, and `docs/LIVE-AV.md` before touching `peer-mesh.ts` / `useLiveAV.ts` / `mic-recorder-audio.ts`.

## WHERE TO WORK
- Worktree: `tutoring-notes-polishwt` (DO NOT use the default `tutoring-notes` checkout — it's on v1-redesign; a subagent got lost on this once).
- Branch: `wb-wave5-polish` @ tip `5c272b2` (pushed). NOT merged — parked at the merge gate for my hardware re-smoke.
- Windows / PowerShell 5.x: chain commands with `;` NOT `&&`. Multi-line commit messages via a temp file at the WORKTREE ROOT + `git commit -F`, then delete the temp file in a SEPARATE sequential call (never parallel — it races the commit).
- `git add <explicit paths>` ONLY, NEVER `git add -A` (it sweeps stray temp files into commits).
- Push after substantive work; retry transient network failures (5 attempts, backoff) per `.cursor/rules/git-push-retry.mdc`.

## CURRENT STATE (what's done, what's next)
DONE + pushed this wave: WS-I (tutor mute silences tutor in recording), WS-N (tab-kill audio durability + F-2 double-transcribe guard), WS-L (scrubber lands on drop), WS-O (board-tab overflow scroll), WS-S (review-overlay hydration verified), the WS-N admin multi-segment audio-loss fix (`2278013`), and the KEYSTONE hermetic blob test-harness (built → Sonnet 5-axis SHIP-WITH-FIXES → build-green → phase-2 rollout). Durability specs now RUN hermetically at the gate instead of silently blob-skipping.

The keystone exposed TWO REAL fragile-surface bugs (triaged, root-caused, committed RED on this parked branch, documented in queue WS-T tally #4/#5) — **FIX THESE FIRST**:
- **WS-W** (P1, FRAGILE replay surface): in-shell replay auto-starts at ~7.3s instead of t=0. Root cause: WS-L (`6799aa4`) persists `durationSeconds` so `audioTimeline.totalMs>0` on first paint → `audioDurationSettled` (`useReplayTimelineController.ts` ~L230) is TRUE before the WebM duration-fix (`webm-duration-fix.ts`, the `1e101` scan from `f311431`) resets `currentTime` to 0 → `WhiteboardReplayInFrame.tsx` entry effect runs `seek(0,{play:true})` while parked at the measured end. Same family as my original "scrub drops to t=0" complaint. Existing spec `recording-end-to-end.spec.ts` test 2 is the red-before/green-after oracle. Confirm with `[avx]` logs first.
- **WS-X** (P1, FRAGILE WB apply-path, 2ND ATTEMPT at BUG-3 — extra care, do NOT loop): a board-3 `line` stroke leaks onto a freshly-imported PDF board via a stale `handleExcalidrawChange` after `releasePdfBatchGuard`; overnight E2 fix `34f650a` is insufficient. CONFIRM FIRST with one instrumented isolated run dumping `pdfBoardSummary` types+ids (expect a leaked `line` + `board3StrokeId`) before designing the apply-path fix.

THEN the P1 product fix train, in order:
- **WS-K** (P1, HARD REQUIREMENT — see below; plan locked in queue): live incremental map+reduce so the tutor has notes within 2–3s. Waiting-state copy = "Preparing your notes..." (I chose this).
- **WS-G** (P1): seamless replay concatenation at finalize (server-side FFmpeg) — kills the hitch/drift and the "multi-part recording" warning; shares root cause with WS-L/WS-W.
- **WS-N4** (P1): gate/roster "End and review" drops outbox-only (unregistered) segments + client `events.json` → partial/empty review. **WS-N5** (lower): resume FSM armed stroke-capture window.
- **WS-P** (P1 infra): always-fresh code on load (Vercel Skew Protection [MY dashboard action], `/api/version` poll→reload, `ChunkLoadError` handler, commit SHA in prod footer; DEFER auto-reload during a live recording session).

THEN P2 UX/affordance: **WS-F** (waiting-room exit: student "Leave session" + tutor "Cancel session" — FLAG the tutor-cancel delete-vs-exit semantics to me), **WS-H** (mic persistence hardening — groupId/label correlate, don't wipe pref on transient OverconstrainedError), **WS-J** (billable time rounding — tutor sets increment + round up/down, frozen into WhiteboardSession at close), **WS-M** (student-side mic boost — build student publish-only audio graph + reuse MicControls slider; tutor control deferred), **WS-Q** (time-alert copy "Time alert volume:" + tutor-configurable defaults; signals a broader tutor-settings surface with WS-J), **WS-R** (roughness is a genuine Excalidraw freedraw no-op — UI-HIDE roughness + edge-sharpness for pencil/freedraw matching native Excalidraw; REPLACE the false-green `wb-roughness-style.spec` which only asserted the data-model value).

THEN: build the Sarah/pilot-facing "Known issues & roadmap" page (populate from this queue). THEN PART 2 (site-wide test buildout — below). THEN PART 3 (slim human-only smokebook — below).

Also owed: 3 phase-2 test-harness follow-ups (test-only, not product bugs) — `whiteboard-workspace` create-session stale redirect oracle (consent modal was removed from product), `audio-upload` transcribe-btn-disabled-after-harness-upload stub gap, `recording-resilience` preview stale oracle. And WS-A **F-1** (outbox register-failure attempt cap, ~10-line, its own 5-axis) before any v1-redesign merge.

## HARD REQUIREMENTS / INVARIANTS — DO NOT VIOLATE OR "REINTERPRET"
(These are the things prior agents misunderstood and made me furious. Read them literally.)
1. **NOTES LATENCY (WS-K):** MAP AND REDUCE AS-IT-GOES WAS NEVER DEFERRED. The ONLY deferred thing was SHOWING notes live to the tutor DURING the session. Under typical network the tutor must have their notes within AT MOST 2–3 seconds after end. This is a HARD REQUIREMENT, INVARIANT, NON-NEGOTIABLE. Do not conflate "map/reduce live" with "display live."
2. **TUTOR MUTE** = the tutor mutes THEMSELVES, live AND in the recording. It does NOT mute the whole session and has NOTHING to do with consent. Do not over-complicate this. (Already fixed in WS-I — do not regress it.)
3. **SOLO RECORDING ALWAYS WORKS.** It is a required feature, not optional, not flag-gated. We are NOT testing in prod and `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` should not be relied on.
4. **NO DRIFT WARNING.** There must be no "Multi-part recording — timing may drift at part boundaries" warning. If there is human-noticeable drift, we are NOT done, period (that's what WS-G fixes).
5. **REPLAY-MIX INVARIANT:** what ends up in replay audio must NOT change — it stays the tutor:mic Web Audio mixdown (tutor + consented learner). Do NOT touch the mixdown graph, consent gates, or gain wiring. New per-speaker lanes are `transcriptionOnly=true` and MUST be excluded from replay assembly. VAD changes segment TIMING, never segment CONTENT.
6. **CHIME PRESERVED:** keep the approaching-time chime re-anchored to SESSION elapsed time (pause-aware). KEEP the 8-hour hard-stop. (The 50-min rollover was already removed.)
7. **FRAGILE SURFACES ARE ADDITIVE-ONLY:** recorder FSM (`lifecycle-machine.ts`), `useAudioRecorder`, `upload-outbox`, `useWhiteboardRecorder`, whiteboard apply-path/sync (`src/lib/whiteboard/`, `useStudentWhiteboardCanvas.ts`), `peer-mesh.ts`/`useLiveAV.ts`/`mic-recorder-audio.ts`, auth/ownership boundaries, DB migrations, replay timeline controller. ADD state/handlers/wiring — do NOT rewrite/remove existing engine logic. "Do not touch the engine" does NOT mean zero changes — adding is fine; BEHAVIORAL rewrites are the hard stop.
8. **MIGRATIONS ADDITIVE ONLY** (never drop/rename a column; multi-step). No IndexedDB DB_VERSION bump this wave.
9. Ownership assertions on every student-data read/mutation; share links tokenized + revocable; CSP stays tight (new origin → `middleware.ts` + STATUS doc). Per-session ID logging on every new state transition (registry in `RECORDER-LIFECYCLE.md`).
10. Legal copy stays synced with the umbrella (`docs/LEGAL-SYNC.md`) — do not edit `/privacy` or `/terms` without following the sync protocol.

## TESTING BAR — THE ACCEPTANCE CRITERION I CARE ABOUT MOST
- I need to rely WHOLESALE on the tests. I cannot re-regress this site on every change. I want to act only as a product manager, not keep catching your directive violations.
- **TEST EVERYTHING MECHANICAL.** Not just the items I flagged — ANYTHING mechanical: every click, state transition, data-flow, DB write/read, API contract, gate/guard, consent projection, ownership assertion, persistence path. "Half a day is fine as long as it's done correctly." (PART 2.)
- Every touched surface gets a test written TO THE SPEC (the user-observable requirement), NEVER to the code just written. RED-BEFORE / GREEN-AFTER, real-browser-verified. A workstream is NOT done until its teeth-test is green.
- **BEHAVIOR/CONTRACT TESTS, NOT implementation/component-coupled.** A FULL COMPREHENSIVE component-deduplication audit is coming before release; these tests are the safety net that makes it safe. A test coupled to a component breaks when dedup merges it; a behavior test survives. Prefer role/testid/behavior oracles + real render (relay/Playwright for geometry/audio/DOM cadence) over shallow unit assertions on internals.
- jest/jsdom is NECESSARY-NOT-SUFFICIENT — it is BLIND to geometry/layout/coordinates and event cadence. Prove those in a real browser (`npm run test:wb-sync` relay / Playwright / WebKit).
- The ONLY surface allowed to ship untested is one explicitly annotated `[human-only]` WITH A STATED REASON (realistically only real-Safari/iOS WebRTC A/V reconnect, iOS AudioContext, mobile thermal, Whisper on real audio, subjective audio quality, legal/visual/copy/theme spot-checks). Do NOT use `[human-only]` to dodge a writable test — first prove it can't be exercised in the harness.
- **GATE ENROLLMENT (STANDING RULE):** the merge gate runs ONLY the `wb-regression` Playwright project (explicit allowlist in `playwright.config.ts`). Every NEW teeth spec MUST be (1) added to `wb-regression.testMatch`, (2) tagged `@wb-*` from `tests/test-tags.ts`, (3) verified via `npx playwright test --project=wb-regression --list <file>`. A spec merely under `tests/integration/` protects NOTHING.
- The blob harness now makes blob-gated specs run hermetically (`blobIntegrationEnabled()` from `tests/helpers/blob-gate.ts` + `PLAYWRIGHT_TEST=1` & `BLOB_HARNESS_LOCAL=1`). Use it; per-test store flush via the `./fixtures` page fixture.
- My smoke bar: I must catch ZERO mechanical bugs that a test could have caught.

## CROSS-CUTTING WORKSTREAMS (first-class scope, not optional polish)
- **WS-T PROACTIVE DEFECT HUNT:** review thoroughly enough to surface misses/bugs I did NOT flag. Clear/unambiguous bug → FIX with a behavior teeth-test and LOG it in the queue tally. Ambiguous/product-judgment → do NOT guess, BATCH into grouped questions for me. Fragile-surface finding → FLAG before touching.
- **WS-U UX / HUMAN-EXPERIENCE HEURISTIC REVIEW** (whole app, a real paying user's eyes; target neutral-when-invisible → DELIGHTED-on-recovery, NEVER confused/frustrated/trapped). Axes: escapability (no trapped screens; exits not buried/tiny/invisible), comprehension (obvious button purpose, no jargon copy, feedback on silent states), affordance placement (expected controls present; rarely-used not crowding primary; destructive not too-easy), safety/recoverability (tab-close, misclick, accidental End, bad network → caught before a non-recoverable wall; undo/confirm/recovery a paying user assumes), and pre-empt-the-complaint delight. NO "well akshually" justifications — if a user will be confused or frustrated, it is a defect, full stop. AUTO-FIX objective failures (trapped/no-exit, invisible/buried exit, dead buttons, missing destructive-confirm, unrecoverable data loss, jargon/broken copy) with behavior teeth-tests. BATCH taste/judgment items (repositioning, net-new affordances, brand-voice copy) as a PRIORITIZED list (Trapped/Broken → Confusing → Polish/Delight) for me. WS-F is an exemplar. Motivation: the more solid the ENTIRE app is when Sarah returns from her July-4 trip, the better the impression.
- **WS-V SITE-WIDE MECHANICAL-COVERAGE AUDIT** (feeds PART 2): enumerate every component/flow/API route/DB-write/gate/guard (`docs/INDEX.md` + smokebook + app tree), map to coverage, list gaps as behavior-test BUILD tasks. The smokebook-item map is the FLOOR, not the ceiling.

## PART 2 / PART 3 (after the fix train)
- **PART 2:** behavior/contract test for EVERY mechanical action across the WHOLE app (not just smokebook items). Dedup-audit safety net (see testing bar).
- **PART 3:** produce a NEW smokebook with ONLY genuinely-human items. Follow `docs/handoff/SMOKEBOOK-TEMPLATE.md` EXACTLY; fetch the preview URL from the Vercel MCP (`list_deployments`, match `meta.githubCommitRef`) — NEVER guess a `tutoring-notes-git-*` URL. Annotate any `[human-only]` item with its reason.

## BACKLOG (record, do not do this wave unless I say)
- Stand up a real agentic audit pipeline (build on the agenticPipeline project): agents auditing agents — one agent writes tests-to-spec, a DIFFERENT agent makes them green, DIFFERENT agents review both; every plan auto-audited for hard-enforcement of my guidelines; every fix auto-audited for spec-tests independent of the code author. Goal: the pipeline catches directive drift, not me.
- Learner sign-out must not leave someone else's session running (currently falls back into the parent account). Revisit when learner session-switching lands.
- Duplicate cross-role account creation (tutor `AdminUser` vs parent `AccountHolder`, e.g. arangarx@hotmail.com) is unguarded across tables — leave backlogged with the OAuth-signup wave ("one email = one account").
- Pre-existing SSRF-adjacent `tutor-asset/route.ts` any-origin blob URL (flagged by the keystone 5-axis; NOT harness-introduced) — pin the allowed blob origin. Promote to `docs/BACKLOG.md` security section.
- vad-min-tune: lower `VAD_MIN_SEGMENT_SECONDS` 25→~8–10s (`segment-policy.ts`) AFTER WS-G concat (else worse multi-segment replay); watch Whisper call volume/CostEvents.

## HARD STOPS — build fully, then PARK for me (do NOT do these autonomously)
- `merge --no-ff` to v1-redesign or master.
- Applying migrations to PRODUCTION (main Neon), the account reset, or any destructive/irreversible production action.
- `git push --force` / history rewrite.
- Enabling Vercel Skew Protection (WS-P) — that's my dashboard action.
Build right up to these, keep `ORCHESTRATOR-STATE.md` current, and STOP at the gate.

## HOW WE WORK (process — non-negotiable)
- **PLANS ARE SCAFFOLDING, NOT RATIFIED INTENT.** A decision appearing in an approved plan is NOT evidence I endorsed it. Surface material product/scope/UX decisions to me EXPLICITLY; never bury them in a plan and treat them as approved-by-silence.
- **A MISSED OR UN-ACTED PROMPT IS NOT CONSENT.** Inaction/silence/a scrolled-past prompt means I didn't see it, not that I agreed. Re-surface material decisions directly.
- **WHEN IN DOUBT, ASK ME.** I'll try to be around today. If I'm away, I answer in chat (Cursor doesn't deliver my answer if the tool times out under the hood), so batch grouped questions rather than blocking on one.
- **FRAGILE-SURFACE / 2ND-ATTEMPT / CONCURRENCY-GEOMETRY / MULTI-APPROACH** work: step back into plan mode first; escalate model tier by tripwire (Composer→Sonnet→Opus). Do NOT attempt a 3rd time at the same bug — that regression loop has cost weeks.
- **MODEL/COST DISCIPLINE:** Opus's default verb is DISPATCH. Dispatch Composer 2.5 for execution (explicit `model=` every time), `explore` for investigation, Sonnet for 5-axis / large fragile diffs. Fragile diffs get a Sonnet 5-axis review before the orchestrator commits. Composer conductors CANNOT dispatch Anthropic models — if a tripwire trips, STOP and tell me to switch the chat's model up.
- **SUBAGENT GIT SAFETY:** subagents must never `git restore` / `reset --hard` / `checkout -- <file>` / `stash drop` to "unblock" (my uncommitted edits may be hand-entered work — if a checkout is blocked, STOP and report). Subagents never merge/pull into shared branches. Commit my hand-entered artifacts promptly.
- **KEEP `ORCHESTRATOR-STATE.md` CONTINUOUSLY CURRENT** (lightweight head every material turn; heavy restructure at milestones). A stale state doc is a silent failure. Push feature-branch commits as you go.

**Confirm you've read the state doc + queue, give me a one-paragraph tell-back of the plan and the top invariants in your own words (so I can catch any misunderstanding BEFORE you touch code), then start with WS-W** (confirm the `[avx]` end-park trace, then the settle-gate fix, real-browser red→green, Sonnet 5-axis, then commit).
