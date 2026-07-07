# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** Single source of current orchestrator state for tutoring-notes. A **brand-new orchestrator chat** reads this + its reading list + `git log` — **no catch-up from Andrew** on what's done, where we are, what's next, or how we work.
>
> **Operating contract** ([`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)): state durability is a **primary reliability obligation**. Sessions can be lost at any moment; keep this file continuously current. Treat "I'll update state later" as a silent failure.

---

## HEAD

**✅ F2 relay-shards (F2a build + F2b attended validation) DONE + VALIDATED (2026-07-07). Merge-gate #1 now runs end-to-end and its verdict is trustworthy.** Three attended runs to get here:
- **Run #1** aborted instantly — F2a runner gave Playwright spec paths where it expected `--project=wb-regression` (Windows `spawnSync shell:true` arg-concat) → **FIXED [`38ce3c3`](https://github.com/Arangarx/tutoring-notes/commit/38ce3c3)** (combined `--project=wb-regression` + positional filters).
- **Run #2** — shards 1–5 clean (135 pass/0 fail on fresh per-shard :3100 servers; WS-T #7 lifecycle confirmed green), but surfaced two runner defects: shard-6 collapsed (0 pass — the 6th shard re-ran `integration-setup` which timed out under cumulative load → dependency-skipped all 22) and the isolation pass OVER-COLLECTED ("99" — `parseFailures` matched every `[wb-regression]` stdout progress line, not just reds). Runaway stopped safely (:3002 untouched).
- **Round-2 runner fixes [`e535cca`](https://github.com/Arangarx/tutoring-notes/commit/e535cca):** isolation now reads merged **blob JSON**, collecting only `projectName=wb-regression && status=unexpected` (no passed/skipped/flaky); shards + isolation run `--no-deps` (setup runs once upfront, not per shard); + 8s inter-shard cooldown + orphaned :3100/:3101 node cleanup.
- **Run #3 (post-fix) — CLEAN GATE VERDICT:** jest pre-gate **856/856**; all 163 ran across **6 fully-completing shards** (lifecycle 47+1flaky, shard-2 21, shard-3 21, shard-4 22, shard-5 18, shard-6 19 — shard-6 no longer collapses); isolation correctly narrowed to **3 genuine `unexpected` failures (not 99)** → classified **REAL-FAIL: 3, ENV-FLAKE: 0**. Full log: `terminals/889258.txt`.

**🔴 The 3 REAL-FAILs are GENUINE deterministic failures (NOT exhaustion) — confirmed by a fresh/idle-machine isolated re-run (`terminals/193129.txt`, 3 failed / 1 passed):**
1. **`audio-upload.spec.ts:86`** — "Upload tab visible + dropzone": the `audio-upload-dropzone` element is PRESENT in the DOM but `hidden` after clicking the Upload tab (8× resolved hidden, 5s timeout). Real, repeatable.
2. **`audio-upload.spec.ts:101`** — "transcribe + generate populates note form": the `ai-transcribe-btn` ("Transcribe & generate notes") is **`disabled`** so the click times out (120s). Real, repeatable. **⚠️ notes/transcribe surface — Ship-to-Sarah-gate-adjacent.**
3. **`wb-e2-apply-remote-pdf-stroke-leak.spec.ts:83`** — WS-X fingerprint-guard = **known test-only Bug B** (F3; stale/mistimed oracle — spec dies at preconditions, guard proven sound 3/3; see A4 WS-X row).

**Bug A `wb-tutor-recording-mute` did NOT appear in the failure set** (run #2 shard-4 23/23; run #3 shard-4 22 pass) — consistent non-repro; mute-before-graph-ready race is timing/environment-sensitive; **re-confirm reproduction before touching that fragile surface.**

**✅ TRIAGE DONE ([explore](ec500d9d-e4de-475f-b34b-9da8ec6ec28c)) — all 3 relay reds are TEST-ONLY; ZERO tutor-facing product regressions on `wb-wave5-polish`** (mirrors the earlier full-suite finding: product clean, harness needed hardening). (1) **`audio-upload:86`** = stale oracle — B3 always-mount upload pane is `display:none` until `activeTab==="upload"` (default `"record"`); test clicks tab but doesn't wait for pane visible. Behavior pre-exists on `master`; only *exposed* by harness-gate `eb3fb5d`. Fix = test realignment (wait for `audio-tab-upload-pane` visible / `aria-selected`; scroll Notes section into view). (2) **`audio-upload:101`** = stale oracle / already-tracked **RW-7** (`wb-wave5-execution-queue.md` item (b)) — test's upload stub returns legacy Vercel JSON, but harness uses mint+PUT blob flow (`a1cc2bd`/`2278013`) → upload never completes → `pendingAudios` empty → transcribe btn correctly disabled; weak `.or(ai-transcribe-btn)` assertion. Fix = harness-aware stub + assert `toBeEnabled()`. **GUARDRAIL: do NOT enable the transcribe btn without an upload — that breaks real gating.** (3) **`apply-remote:83`** = known **test-only Bug B / F3** (WS-X) — keep its own careful/attended pass (A4 WS-X row: settle L146 onChange-leak question first, then realign).

**✅ audio-upload realignment DONE (test-only, [`a12d1da`](https://github.com/Arangarx/tutoring-notes/commit/a12d1da), Composer):** :86 → scroll `#student-section-notes` + `switchToUploadTab()` waits for `audio-tab-upload-pane` visible before dropzone assert; :101 (RW-7) → harness-aware upload stub (`route.continue()` mint+PUT) + assert `pending-segment-list` visible + `ai-transcribe-btn` `toBeEnabled()`. Green: 3 passed, 1 retry-recovered flake on :101 (`switchToUploadTab` first-try scroll-spy timing — watch in relay). Product unchanged. Dedup debt logged (BACKLOG: `installControllableUploadStub` now 3× inline → extract).

**F3 STEP-BACK DONE ([explore](50bc5027-340d-4f04-81c9-eede3f5e41a5)) — verdict: NO product bug; both reds test-only, BUT realignment touches a WS-X product seam.** L159 (`fingerprintActive===true`) = deterministic **stale oracle** (fingerprint cleared by design on first legit post-switch onChange, WWC L4672-4675; spec checks seconds too late). L146 (`every type==="image"`) = **duplicate** of canonical `wb-e2-pdf-stroke-leak.spec.ts` (passes 3/3) — not a real leak. `ef5fb1a` applyRemote guard is sound-by-review, all in `WhiteboardWorkspaceClient.tsx` (NO `src/lib/whiteboard/` change). **CATCH:** the spec's real oracle (`__WBX_INJECT_APPLY_REMOTE__` L205-219) has NEVER executed (spec dies at L159 precondition); current injection fires *after* fingerprint clears → doesn't exercise the guard. Correct realignment = retime injection to fire *inside* the fingerprint window → needs a NEW E2E-gated test seam inside WWC `selectTutorPage`/`releaseGuard` (restore the parked `5d80ea8` pre-arm pattern). That's a product-file seam on the most-fragile surface → per WS-X doctrine NOT a blind Composer edit. **AWAIT ANDREW: pick approach — (A rec) Sonnet-authored seam + realignment, attended, red-before/green-after proof (revert WWC L1046 guard → oracle must fail) — properly discharges A4; (B) minimal test-only drop L146+L159 (risk: injection oracle fires post-clear → misleading pass or confusing red, leaves guard unproven); (C) quarantine spec for go-to-Sarah cut as tracked post-Sarah follow-up (guard sound-by-review + canonical covers steady-state) → unblocks merge gate now.**

**NEXT:** (a) **F3** — execute chosen approach (A/B/C above). (b) **Confirming attended relay run** (`test:wb-sync`, ~50min) — best run *after* F3 so it can go fully green in one shot; watch the :101 flake. Alternatively run now to lock the audio-upload fixes (expect only apply-remote:83 red). (c) **Bug A** `wb-tutor-recording-mute` (WS-I-PRESTART-MUTE, BACKLOG reliability-gap) — NOTE non-repro in relay runs #2/#3; **re-confirm reproduction first**, then (if real) fragile: plan-mode → Sonnet 5-axis → fix; green spec = merge bar before WS-I→master. (d) Then **Tranche E** (P2-WB-2 → P3).

| Field | Value |
|---|---|
| **Last action completed** | **✅ Tranche F / F1 RESOLVED-via-defer (Andrew 2026-07-06, Option A).** Diagnosis-recommended global per-test `afterEach` `TRUNCATE ... CASCADE` on `tutoring_notes_test` **FAILED** (~40 failed suites/run × 3 consecutive `jest --workers=1` runs vs ~1-flake baseline) — `40P01` deadlocks + FK / "Engine is not yet connected" races. **Reframed root cause:** TRUNCATE's `AccessExclusiveLock` collides with **in-flight fire-and-forget async DB work that outlives test bodies** (same stragglers behind `Cannot log after tests are done` + `CostEvent_..._fkey` leaks). Failed attempt preserved in `git stash@{0}` on `wb-wave5-polish` (message: "F1 truncate attempt (FAILED...)"). **Salvaged + committed [`647ec35`](https://github.com/Arangarx/tutoring-notes/commit/647ec35):** `transcription-worker.test.ts` — `jest.mock("@/lib/recording/extract-chunk")` + `afterEach` microtask flush (stops map-phase async leak past teardown; green in isolation; tsc clean). **Dropped (reverted, stays in stash):** `upload-outbox.test.ts` observation-timing change (5000ms wait budget = Jest default timeout → timed out before diagnostic; T1+S1 markers never appeared). **Heavy jest-isolation DEFERRED** as tracked debt; merge-gate jest stays `--workers=1` + retry (~1-flake = loud stale-red, NOT false-green). **Standing gate convention (6)** added to execution-queue test doctrine (docs `971af78`). **✅ F2a BUILT + COMMITTED [`13c7522`](https://github.com/Arangarx/tutoring-notes/commit/13c7522):** serial sharded `wb-regression` relay runner (`scripts/wb-relay-shard-run.cjs` — fresh dev server per shard, manifest-from-config, union-asserted == `--list`, isolation re-run REAL-FAIL/ENV-FLAKE classifier) + safety port helper (`scripts/free-wb-dev-server-ports.cjs` — frozen allowlist [3100,3101], throws on any other incl. CLI, **never :3002**) + `test:wb-sync`→sharded (monolithic `test:wb-playwright` kept for bisect) + `playwright.config.ts` (`workers:1` on wb-regression, `:3101` webServer gated on `WB_SKIP_3101_WEBSERVER`). **163 enrollment verified static** (manifest union == `--list`); node --check + tsc clean. Orchestrator-reviewed: port allowlist safe, enrollment preserved. **NOT yet validated with a live relay run (F2b, attended).** Caveat to confirm in F2b: per-shard blob output env-var names (`PLAYWRIGHT_BLOB_OUTPUT_DIR/NAME`) — `merge-reports` may need adjustment; the gate VERDICT (shard exit + isolation re-run) does NOT depend on the merged HTML report. |
| **🟨 FULL-SUITE BASELINE result (2026-07-06, tip `c941247`, [run](8dbb2ff3-3ebd-47c8-831a-1af13d6e91d5))** | **NO product bugs / regressions / stale oracles found** beyond those already fixed (reassuring for product quality). **BUT the harness cannot currently run clean end-to-end** — a genuine confidence + merge-gate blocker, NOT product rot: (1) **jest `--workers=1` is NOT reliably green** — `claim-setup-consent-decline.test.ts` H-1 red on a **fixture email unique-constraint collision** (`createClaimedInviteFixture`), i.e. cross-test DB pollution even single-worker (wider than the previously-documented parallel-only "record not found" race); suite now 288/3083 (grew from the stale 283/3062 claim). (2) **`test:wb-sync` never reached the relay** — its wb-jest pre-gate flaked on the SAME fixture-email pattern (`register-audio-segment-action` `seedActiveSession` adminUser email). (3) **`auth.setup.ts` timed out** (signout/`/api/auth/csrf` `Unexpected end of JSON input`) → blocked ALL 163 wb-regression specs → **`wb-session-lifecycle` (our WS-T #7 fix) UNVERIFIED this run**; this is a RECURRENCE of the known harness-health flake (queue § (c)), now gating the entire relay. **Conclusion:** the test INFRA (fixture email uniqueness + no per-test cleanup + flaky auth.setup) — not product code — is what blocks "trust the suite wholesale" + merge-gate #1. Elevates **Tranche D jest-isolation + auth.setup hardening** to highest-leverage confidence work. |
| **🟥 HARNESS-HARDENING result (2026-07-06, [exec run](2f615c58-260f-4962-aca5-686cb2cacb12)) — partial + a NEW headline finding** | **Committed `3cb9a7b`** (shared globally-unique `uniq()` helper `src/__tests__/helpers/unique-test-token.ts` → 28 files; email-collision class GONE) + **`8a381ce`** (auth.setup erasure-admin leg now uses NextAuth **API-credentials** login, not flaky UI-signout — deviation from the diagnosed `clearCookies()` which itself hung on `/setup-required`; API-login matches parent/learner legs, verified 3×, auth.setup passes ~7.7s). Both pushed. **TWO open problems, NEITHER caused by these test-only changes:** (1) **jest `--workers=1` still can't hold 2 consecutive greens** — email red gone, but a SECOND isolation class remains (~1 flake/run, different DB-integration test each time: upload-outbox, share-audio-proxy, erasure-lifecycle, whiteboard-public-concat-audio, claim-setup — consistent with the diagnosis's un-done option (ii) "no per-test DB cleanup"). (2) **🚨 relay now RUNS and shows 22 HARD wb-regression failures + 14 flaky** (124 pass / 4 skip); `wb-session-lifecycle` itself = 48 pass/1 skip (4 flaky-passed-on-retry, WS-T #7 fix holds). These 22 were **MASKED** for an unknown period because auth.setup aborted all 163 specs — so the merge-gate relay has NOT been green. **Provably not from this session:** email fix is jest-only (can't touch Playwright specs); auth.setup passes (124 specs ran). ⇒ 22 reds are **pre-existing-masked and/or environmental** — under triage. |
| **22-red triage DONE ([classify run](88c2d0a2-eb37-46ec-a165-c6d20184b47e))** | **~65-75% ENVIRONMENTAL** (dev-server exhaustion over the 20-min serial marathon: log full of `ECONNRESET`, blob/transcribe 500s, ffmpeg-unavailable, `webpack.cache ENOENT`; 10/22 share the SAME `wb-session-review-mode`-never-renders-after-End symptom; smoke-workspace 2 = login `waitForURL` stalls). **NOT a branch-wide functional regression.** But **6 specs have concrete assertion failures** worth isolated confirmation, 2 on fragile surfaces: `wb-end-from-roster` (#9 `endedAt=null` after finalize — END-SESSION), `wb-tutor-recording-mute` (#19 gain 1≠0), `wb-review-overlay-3paths` roster-VAD (#17 "No audio" shown when VAD seeded), `wb-wave5-polish` item13 (#20 pill "Solo rehearsal" vs `/live/i` — LIKELY STALE ORACLE), `wb-e2-apply-remote-pdf-stroke-leak` (#7 fingerprint invariant false — WB SYNC), `audio-upload` dropzone (#1 hidden). |
| **🟥 6-spec isolated re-run DONE ([run](62b75c67-aa14-492f-a176-5b83c7d513f2)) — DEFINITIVE** | Fresh dev server per spec, `--workers=1`. **2 CONFIRMED REAL bugs** (deterministic, fail initial+retry — both FRAGILE surfaces, STOP before fixing): **(A) `wb-tutor-recording-mute` #19 — CONFIRMED REAL ([root-cause 81813fa3](81813fa3-b908-4363-8a48-600387a70c50)).** Mute BEFORE audio graph ready leaves recording-branch gain=**1** (expected 0) → tutor recorded at full gain when they expected muted. Root cause: WS-I mute contract lives at hook layer (`tutorRecordingMutedRef` + `useAudioRecorder.ts:1136`), but real UI path (`WbTopBarMicControl.tsx:63` awaits `onAcquireMic()` before `onToggleMute()`) delivers mute intent only via an async effect (`WhiteboardWorkspaceClient.tsx:2582`), while mount `acquireMic` finishes during the await and graph init hardcodes gain 1 (`mic-recorder-audio.ts:387`) with ref still false. **Branch-introduced (WS-I `f748ef7`, NOT on master — master has no recording mute gate at all ⇒ not Sarah-facing today), but means WS-I is INCOMPLETE for pre-start mute (a real completeness gap before WS-I merges).** Fix (fragile): synchronous `setTutorRecordingMute` on the mute click (not effect-only) and/or reorder toggle-before-acquire; optional `createMicAudioGraph` init param; add workspace-bridge DOM test. Composer step-back plan → Sonnet review if changing acquire ordering; do NOT merge without green `wb-tutor-recording-mute.spec.ts`. **(B) `wb-e2-apply-remote-pdf-stroke-leak` #7 — REFINED by root-cause ([83b45842](83b45842-d250-4c37-99fa-ffb4a661a3ad)): NOT a confirmed product bug.** The `fingerprintActive=false` (L159) failure is a **stale/mistimed TEST ORACLE** — the fingerprint is cleared by design once PDF import settles, so `false` is correct steady state; product guard (`ef5fb1a`) is logically sound but the spec never reaches its real `__WBX_INJECT_APPLY_REMOTE__` oracle (fix-a unproven, not disproven). **Branch-introduced (spec + fix both in `ef5fb1a`, NOT on master ⇒ not Sarah-facing).** L146 RESOLVED ([fda8a070](fda8a070-3faa-423b-a41e-43fa877d711f)): canonical guard spec `wb-e2-pdf-stroke-leak.spec.ts` passed **3/3 isolated** (fresh server each) → NO real onChange stroke leak; L146 was intermittent test-setup timing. **⇒ Bug B is ENTIRELY test-only** (guard/apply-path sound). Fix = realign `wb-e2-apply-remote-pdf-stroke-leak.spec.ts` (Composer, test-only: inject during fingerprint window / drop mistimed steady-state L159 check). **1 STALE ORACLE** (test-only): **`wb-wave5-polish` item13 #20** — expects `/live/i` but product correctly shows **"Solo rehearsal"** during solo grace (verified vs `lifecycle-machine.ts:627` + its unit test); oracle should assert "Solo rehearsal"/"Recording". **3 ENVIRONMENTAL** (pass in isolation): #1 audio-upload dropzone, #3 review-overlay roster-VAD, #9 wb-end-from-roster `endedAt`. **⇒ FINAL tally of 22 relay reds: exactly 1 REAL product bug (A, mute-gain — branch-only WS-I gap, confirmed [81813fa3]); Bug B = test-only (L159 stale oracle + L146 test-timing, guard proven sound 3/3); stale oracle #20 FIXED (`0118359`); ~18 environmental (marathon exhaustion).** Net: the relay-unblock surfaced ONE genuine product defect (WS-I pre-start mute), and it's not on master. |
| **Next action(s)** | **✅ F2a DONE (`13c7522`).** **🎯 IMMEDIATE — F2b, Andrew approved attended-run 2026-07-07 (do this first in the fresh chat):** run the first live sharded relay validation. Command: `npm run test:wb-sync` (or `node scripts/wb-relay-shard-run.cjs`; run `node scripts/wb-relay-shard-run.cjs --manifest-only` first to eyeball the 6-shard split). **Preconditions:** Docker relay :3002 + Postgres :5432 UP; **NEVER free/kill :3002** (only :3100/:3101). **Watch for:** (a) each shard gets a FRESH :3100 dev server (proves no marathon exhaustion — the whole point), (b) isolation re-run classifies REAL-FAIL vs ENV-FLAKE correctly, (c) **blob-output caveat** — if `merge-reports` finds no zips, fix the per-shard blob env-var names (`PLAYWRIGHT_BLOB_OUTPUT_DIR/NAME`) in `wb-relay-shard-run.cjs`; the gate VERDICT (shard exit + isolation) is unaffected. **Expected 1 real red:** `wb-tutor-recording-mute` (Bug A, WS-I pre-start mute). **Then F3 (Bug B — apply-remote spec realignment; author + red→green IN this same relay session, test-only, Composer)** → then **Bug A** (fragile; plan-mode → Sonnet 5-axis → fix; Andrew GO given; green `wb-tutor-recording-mute.spec.ts` = merge bar) → then **Tranche E** (P2-WB-2 → P3-J1..5). **F1 jest-isolation-class-2:** heavy straggler-elimination pass **DEFERRED** (tracked in BACKLOG + GATE/HARNESS § (f)); correct fix = await/mock all fire-and-forget DB paths across ~45 integration suites, THEN per-suite/per-test cleanup works; medium alt = scoped `afterAll` on aggressive-deleter suites only (`note-and-share.test.ts`, erasure-lifecycle, student-crud cascade deletes). **Merge-gate jest:** `--workers=1` + retry; any RED must be re-run in isolation and classified per standing doctrine rule (6) before merge. **Still owed pre-master (gated):** Bug A WS-I pre-start mute fix (Andrew go; fragile surface), Bug B apply-remote spec realignment (test-only), A4 WS-X relay red/green (deferred), WS-T #9 outbox self-heal (design-first), Tranche C WS-G-A poll. Docker relay :3002 + Postgres :5432 UP. |
| **Open Andrew-confirms** | Known-issues in-app page [`89d8d02`](https://github.com/Arangarx/tutoring-notes/commit/89d8d02) — **tone/copy sign-off** + remaining content calls (WS-I/WS-N inclusion, WS-O minor-ness). **RESOLVED 2026-07-05:** WS-G concat-lag → **OMIT** from the Sarah-facing page. **Governing principle (Andrew):** *don't call attention to a transient unless it's a bug we intend to fix* (concat-lag is being fixed by WS-G-A → not a standing issue → omit). **WS-U13-a likely MOOT:** in-person fix `3bf3a7e` starts recording on Start w/o a peer, so in-person no longer sits in `awaiting_first_participant` → the "Waiting for your student…" copy WS-U13-a targeted is unreachable for in-person (confirm-and-close, not pick-wording). **WS-P O3 (FYI):** `endingState==="error"` keeps deferring reload; unmount clears — flag if disagree. Prior standing: map/reduce wording sign-off; SMOKE-PRIV-2; VERIFY-ACCT-1; **Vercel Skew-Protection dashboard toggle (Andrew action).** |
| **🟡 A4 WS-X relay RED → verdict SPEC/SEAM (~90%), fix (a) UNPROVEN (2026-07-05)** | `wb-e2-apply-remote-pdf-stroke-leak.spec.ts` **RED 0/3** ([run](a1f7ec5b-11c6-440d-bdfc-dc8bb0e7f758)). **Root-cause ([verdict](05e8b160-af6e-46d7-985b-3ceae9d62b14)): shipped fix `ef5fb1a` (fix (a) applyRemote fingerprint-guard) NEITHER proven nor disproven** — spec dies at preconditions, never reaches the `__WBX_INJECT_APPLY_REMOTE__` oracle. **(1) Spec mistimed (~95%):** L159 checks `fingerprintActive===true` AFTER import UI settles, but Excalidraw's onChange clears the fingerprint by design (WWC L4678) → `false` is expected steady state. Spec (authored WITH `ef5fb1a`) dropped WIP `5d80ea8`'s pre-armed `releaseGuard`-synchronous injection for post-import `page.evaluate` which can't observe an active fingerprint. Realign: restore synchronous-injection timing / add `__WBX_ON_GUARD_RELEASE__` seam; split steady-state oracle into `wb-e2-pdf-stroke-leak.spec.ts`. **(2) L146 ~60% SEPARATE onChange-path leak** (live board-3 `line` on PDF board pre-injection, NOT tombstone artifact — `getSceneElements()` excludes deleted) — orthogonal to fix (a); if real = genuine BUG-3 recurrence → needs own instrumented steady-state run. **WS-X = most fragile surface + multi-attempt history → NO blind 3rd fix; both parts = attended + careful (Andrew + Sonnet on any product seam).** **🅿️ DEFERRED per Andrew 2026-07-05 to a dedicated attended session / design pass** (order: instrumented steady-state run to settle the L146 onChange-leak question FIRST → then realign the apply-remote spec to actually prove fix (a)). **§6 WS-X proof NOT discharged; WS-X NOT proven.** |
| **A2 WS-P fix — ✅ DONE (5-axis SHIP)** | Prod-inert PW-gated reload seam in `triggerDeployReload()` (`capture-defer-registry.ts` L47-52) + spec tidy (dropped redundant `Location.prototype.reload` patch) — [impl](d4b5c4a3-fa52-4352-8083-18556e782c6a). **A2 Playwright PASSES 2/2** (confirms WS-P reload path genuinely fires — seam verdict validated, NOT product bug). tsc clean; 25/25 deploy jest. **Sonnet 5-axis = SHIP, no fixes** ([review](bc6ca5be-4182-432f-a239-ffa4269a4949)): prod-inert (build-time gate; `location.reload()` unconditional), no security surface, test now structurally false-green-proof (flag set by product, not test). **COMMITTED [`4b085db`](https://github.com/Arangarx/tutoring-notes/commit/4b085db). §6 A2 proof DISCHARGED.** |
| **WS-T #8/#9 bug context (P1-WB-8)** | **✅ WS-T #8 FIXED [`a37e9b3`](https://github.com/Arangarx/tutoring-notes/commit/a37e9b3) + PUSHED (2026-07-06).** Option B 3-state honest overlay: (1) `hasAudio` → "▶ Replay session"; (2) `!hasAudio && eventCount>0` → CTA + `wb-review-no-audio-note`; (3) nothing → `wb-review-no-recording`. Sonnet 5-axis = SHIP [sa](cfc78841-f623-493b-95b5-86ccc90107c2). jest 8/8; relay 6-pass/1-skip (gate no-VAD stays fixme=WS-T #9). **MINOR follow-up (verify-not-fix):** roster no-VAD state-2 branch possibly test-unreachable — reconcile if needed. **✅ WS-T #9 gate-IDB-crash investigation [sa](2094ba5a-4669-4ace-9d08-0d9353a3c204) DONE (root-cause):** crash **DOMINANTLY test-harness poison** — spec helper `countUploadedTutorMicOutbox` (+ `wb-end-from-gate.spec.ts:76-85`) opens `tutoring-notes-upload-outbox` v1 WITHOUT `onupgradeneeded` → empty-v1 DB poisons subsequent product open; intermittency = shared Playwright IDB. **Real product fragility (narrower):** `upload-outbox.ts` lazy schema assumes first opener runs `onupgradeneeded`; gate-only End is first opener (no mount) → any v1-empty outbox DB bricks gate/roster finalize. **Fix (design-first, DEFERRED):** version-bump self-heal in `upload-outbox.ts openDb` (additive, NEVER drop rows — Pillar 2) + gate finalize try/catch + de-poison test helpers. Store: `tutoring-notes-upload-outbox`/`rows`/v1. **WS-T #7 (`d9a6c4d`):** 4 pre-existing `wb-session-lifecycle` reds, triage owed before master-cut. |
| **⚠️ Relay re-run gotcha (2026-07-05, learned the hard way)** | **NEVER kill/free port :3002** to unblock a Playwright webServer — :3002 is the **persistent Docker relay / Docker backend pipe**; killing its process wedges Docker Desktop (needs manual restart) AND takes Postgres down. Correct pattern: **leave :3002 alone**, use `$env:CI='1'` (fresh webServer lifecycle w/ `reuseExistingServer` off) or only free dev-server ports **:3100/:3101** between serial runs. Re-dispatch A2→A3→A4 with this constraint after Docker is healthy. |
| **Uncommitted / unmerged** | Branch **`wb-wave5-polish`** @ tip [`13c7522`](https://github.com/Arangarx/tutoring-notes/commit/13c7522) (F2a sharded runner), worktree **`tutoring-notes-polishwt`**; tree **CLEAN**, **fully pushed (0 ahead / 0 behind origin)**. **NOT merged** to `v1-redesign`/`master` (Andrew hard stop). Failed F1 truncate attempt preserved in **`git stash@{0}`** (recoverable; not applied). **Merge-gate proofs:** A1 `next build` ✅, A2 WS-P defer-reload seam ✅, A3 in-person relay ✅; **A4 WS-X relay OWED/deferred; full sharded `test:wb-sync` (F2b) OWED on integrated tip.** |

**Autonomy posture (2026-07-05):** **LIMITED** — proceed unattended only on safe non-fragile work (jest-isolation, state/docs, pure-jest batches). **Park** anything fragile/gated for Andrew.

**Andrew decisions ledger (2026-07-06):** approved Tranche E → then chose fix+baseline → then harden-now → then root-cause-both-bugs → then swap → **(post-swap) approved Tranche F infra-first:** F1 jest-isolation-2 → F2 relay-shards → F3 Bug B (test-only); **Bug A = GO** with plan-mode design → Sonnet 5-axis → fix (green `wb-tutor-recording-mute.spec.ts` = merge bar); then resume Tranche E (P2-WB-2 → P3). **F1 scope decision (Andrew, Option A):** salvage good test-only fix(es), revert truncate, **DEFER** heavy jest-isolation as tracked debt, keep merge-gate jest at `--workers=1`+retry → **F2 relay-shards** then Tranche E. **(2026-07-07) F2a built+committed+pushed (`13c7522`, orchestrator-reviewed); Andrew approved: run the attended sharded `test:wb-sync` validation NOW (F2b) + swap to a fresh chat.** F2b is conductor-tier Composer/Sonnet (known-loop attended validation, not Opus).

**✅ F1 RESOLVED-via-defer (2026-07-06, post-swap) — global per-test TRUNCATE mechanism FAILED; Andrew chose Option A.** Diagnosis ([b638f945](b638f945-7db5-4ac6-88f0-c3c3a93a3497)) recommended a global `afterEach` `TRUNCATE ... CASCADE` on `tutoring_notes_test`; implementation produced **~40 failed suites/run × 3** consecutive `jest --workers=1` runs (vs ~1-flake baseline) — `40P01` deadlocks + FK/"Engine is not yet connected" races. **Reframed root cause:** TRUNCATE's `AccessExclusiveLock` collides with **in-flight fire-and-forget async DB work that outlives test bodies** (same stragglers as `Cannot log after tests are done` + `CostEvent_..._fkey` leaks) → *any* between-test cleanup races them. **Correct fix (deferred):** eliminate stragglers (await/mock all fire-and-forget DB paths across ~45 integration suites), THEN simple per-suite/per-test cleanup works. **Medium alt:** scoped per-suite `afterAll` on aggressive-deleter suites only (`note-and-share.test.ts` unscoped `deleteMany`, erasure-lifecycle, student-crud cascade deletes). Failed attempt in `git stash@{0}` on `wb-wave5-polish` ("F1 truncate attempt (FAILED...)") — `reset-test-database.ts` + `jest.setup-db-cleanup.ts` + `jest.config.ts` wiring + `note-and-share.test.ts` cleanup removal (NOT committed). **Salvaged [`647ec35`](https://github.com/Arangarx/tutoring-notes/commit/647ec35):** transcription-worker extract-chunk mock + microtask flush only. **Dropped:** upload-outbox observation-timing (5000ms wait = Jest timeout; T1+S1 never appeared; not shippable). Baseline restored; tree clean @ [`647ec35`](https://github.com/Arangarx/tutoring-notes/commit/647ec35).

**Worktree discipline:** execute on **`tutoring-notes-polishwt`** / **`wb-wave5-polish`**. Default checkout `tutoring-notes` is on `v1-redesign` — do not use it for wave-5 work.

**Wave-5 queue (authoritative backlog):** [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md). **Andrew's smoke results:** [`go-to-sarah-master-cut-smokebook.md`](go-to-sarah-master-cut-smokebook.md) (do not edit).

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Strategic posture:** Experience-driven wedge — WB + reliability = ground floor (GATE); the win = accreting honest tutor-first continuity. [`experience-driven_wedge_ae2776e1.plan.md`](../../../../.cursor/plans/experience-driven_wedge_ae2776e1.plan.md).

**Active execution:** **go-to-Sarah master-cut** on `wb-wave5-polish` — durability pillars WS-A..D landed; P1/P2 fix trains largely complete; fragile-fix train done; parked at **merge gate** for Andrew hardware re-smoke + relay proofs. **Ship-to-Sarah gate** governs cut to `v1-redesign → master` (see below).

---

## Branch layering

```
master  ←  v1-redesign  (integration base; Wave 4 merged; held for Sarah gate)
              ↑
                    └── wb-wave5-polish @ 8ff2553  (active; worktree tutoring-notes-polishwt)
                    ├── wb-av-reachability-detection-fix @ a962171  (isolated; PARKED)
                    └── wb-wave5-ws-x-wip @ 5d80ea8  (WIP seam preserved; superseded by ef5fb1a on polish)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; not yet merged to `master` | [`bf1a2c3`](https://github.com/Arangarx/tutoring-notes/commit/bf1a2c3) |
| **`wb-wave5-polish`** | **Active** — Wave 5 + master-cut plan + Part-2 test buildout | [`8ff2553`](https://github.com/Arangarx/tutoring-notes/commit/8ff2553) (code tip; state-doc [`b357ebb`](https://github.com/Arangarx/tutoring-notes/commit/b357ebb)) |
| **`wb-av-reachability-detection-fix`** | SMOKE-BLOCK-1 reachability; Andrew parked 2026-07-03 | [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) |

**Merge discipline:** single `merge --no-ff` to `v1-redesign` only after comprehensive both-theme master-cut smoke PASS. No interim merge. Ledger: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

---

## Wave-5 status (reconciled with execution queue)

### Landed on branch (do not re-do)

| Area | Status | Tip / note |
|---|---|---|
| **Durability pillars** | ✅ WS-A (VAD + per-speaker + outbox mid-session register `234c6d7`), WS-B (~1s persist), WS-C (end→review), WS-D (resume-from-backend) | Overnight wave; relay @ `c2ca8f5` workers=4 honest |
| **P1 fix train** | ✅ WS-I, WS-N/N4, WS-L, WS-G (`d20ea9a`), WS-K (`859f695`), WS-W (`610ee90`), WS-P 1/3/4 (`b386ef6`), **WS-P 2** (`9ca410e`→`2c7a7bd`, 5-axis'd) | Each fragile item 5-axis reviewed |
| **P2 UX train** | ✅ WS-F, WS-H, WS-J (`1d23fc6`), WS-M, WS-Q copy, WS-R, WS-U-COPY (`dfe1bf4`), WS-U-FRAGILE 2.4+2.5 (`65f6a93`) | P2 train **COMPLETE** |
| **Fragile-fix train** | ✅ In-person audio `3bf3a7e`; WS-X BUG-3 `ef5fb1a` | See § Fragile-fix outcomes |
| **Known-issues page** | ✅ In-app `/admin/settings/known-issues` | `89d8d02`; FOR ANDREW: copy/tone |
| **PART-2 pure-jest tranche** | ✅ P1-J1..J8, P2-J2/J3/J4, RW-B1/B3/B4 | `jest --workers=1` green (283 suites / 3062); parallel-DB flake debt |
| **Blob-gate harness** | ✅ Phase 1+2 (`a1cc2bd`→`eb3fb5d`); build-green `2278013` | 5-axis SHIP-WITH-FIXES; SF applied |
| **Master-cut smokebook** | ✅ Authored; CUT-3 filled | PARKED at merge gate |

### Open / next tranche

| Item | Priority | Notes |
|---|---|---|
| **WS-P deliverable 2** | P1 | Version poll + capture-defer registry; WS-P-A tutor-only defer + WS-P-B WWC read-only `useEffect` **acknowledged** — implementation queued |
| **WS-G-A** | P1 polish | "Preparing seamless replay…" poll when concat async; default was ship core + defer UX |
| **WS-A F-1** | Pre-merge SHOULD-FIX | Outbox register-failure attempt cap (~10 lines); own 5-axis before merge |
| **WS-N5** | P1 follow-up | Resume FSM armed stroke window |
| **WS-U-FRAGILE 1.2** | PARKED | Dead Start / SMOKE-BLOCK-1 reachability — hardest; peer-mesh surface |
| **WS-U-FRAGILE 1.3 copy** | PARKED | In-person waiting copy mooted by in-person fix (no longer sits in `awaiting_first_participant`) |
| **PART-2 relay/identity** | In flight | P1-WB-1..10, P1-ID-*, RW-B2, P2/P3 batches — **serial**, attended + Docker |
| **Jest isolation** | Infra | `--workers=1` gate until dedicated pass; do not rush unattended |
| **PART 3 slim smokebook** | After PART-2 | Human-only surfaces |

**Standing rules:** new teeth specs → enroll in `wb-regression.testMatch` + `@wb-*` tag + `--list` verify. Merge-gate jest → `--workers=1` until isolation pass lands.

---

## Fragile-fix train outcomes (durable)

### In-person audio — BACKLOG SMOKE-BLOCK-5 resolved

- **Product call (Andrew):** treat IN_PERSON like solo — start tutor mic on Start, no remote peer required.
- **Implementation [`9740b1b`](https://github.com/Arangarx/tutoring-notes/commit/9740b1b) + fold [`3bf3a7e`](https://github.com/Arangarx/tutoring-notes/commit/3bf3a7e):** additive `LifecycleInputs.inPersonMode?` + step-3b in `lifecycle-machine.ts` (after `!syncEnabled`, before `!networkOk`); `derivePresentation` guard; two WWC call-site lines. **No engine rewrite.**
- **Teeth:** 4 jest units (authoritative); Playwright `wb-in-person-audio-start.spec.ts` in **`wb-in-person-unmasked`** project (port 3101, no solo env flag) — **not** `wb-regression` (solo flag masks → synthetic green).
- **5-axis:** SHIP-WITH-FIXES; SHOULD-FIXes folded (`clock_start` log `mode=`, spec enrollment fix).
- **Owed:** relay run for `wb-in-person-unmasked` at attended merge boundary.

### WS-X BUG-3 — PDF stroke leak resolved

- **Root cause:** stale scene merged via `applyRemoteToCanvas` during post-page-switch fingerprint window; v3 broadcast tombstone rebroadcast class (filter-isDeleted on broadcast was **rejected** — breaks erasure propagation).
- **Fix [`ef5fb1a`](https://github.com/Arangarx/tutoring-notes/commit/ef5fb1a):** additive guard — `onTargetReadTime` also requires `!pageSceneSetFingerprintRef.current.has(targetId)` → falls back to clean `pageDataRef[targetId]` during window. Prerequisite infra from WIP branch (`pageSceneSetFingerprintRef`, stale-onChange rejection). **No v3 broadcast filter change.**
- **Teeth:** `wb-e2-apply-remote-pdf-stroke-leak.spec.ts` + `__WBX_*` seams (prod-inert double-gate).
- **5-axis:** **CLEAN** — no over-suppression; tombstone/erase path unchanged.
- **Owed:** relay red/green at attended `test:wb-sync`.

**Serialize rule preserved:** in-person, WS-X, and WS-P deliverable-2 all touch WWC — never two code-writers at once.

---

## Settled Andrew decisions (2026-07-05)

Resolved FOR-ANDREW batch — treat as facts, not open questions:

| Topic | Resolution |
|---|---|
| **IN_PERSON audio** | Start recording on Start without remote peer (`inPersonMode` boolean; LIVE→IN_PERSON mid-session toggle N/A — mode fixed at creation) |
| **WS-K/G tuning** | No pre-flush; 5-chunk/2min debounce; full reduce; libopus re-encode; cap 400; duration free-ride |
| **WS-G-A** | **POLL** — "preparing seamless replay…" when concat ready (follow-up, not blocking core) |
| **WS-N4** | Defaults ratified; NO concurrent-tab End-block |
| **WS-J** | Nearest/5 + `America/Denver`; IN_PERSON wall-elapsed incl. pauses; ≥1-increment min; prod migration apply = merge HARD STOP |
| **WS-P-A/B** | Tutor-only defer; read-only-of-FSM `useEffect` in WWC approved → deliverable 2 unblocked |
| **WS-X** | Fix (a) fingerprint-guard approved (filter-isDeleted reversal accepted) — **shipped `ef5fb1a`** |
| **Known-issues** | IN-APP (Help/Settings); internal WS-* appendix excluded |
| **`.env` → preview-dev** | Informational; prod verified clean for WS-K/G/J migrations |

---

## Merge-gate items owed (before master)

1. **`npm run test:wb-sync`** once on integrated tip — branch cumulatively touches whiteboard/apply-adjacent surfaces. **Component proofs (2026-07-06):** A2 WS-P defer-reload seam ✅ **DISCHARGED** (committed [`4b085db`](https://github.com/Arangarx/tutoring-notes/commit/4b085db)); in-person `wb-in-person-unmasked` ✅ **PROVEN** (A3); **WS-X `wb-e2-apply-remote-pdf-stroke-leak` ❌ RED (A4) — deferred, NOT proven**. Full-suite `test:wb-sync` still owed on integrated tip.
2. ~~**`npx next build`** — build-surface touched (`next.config.ts` WS-P).~~ **✅ DISCHARGED 2026-07-05** — exit 0 on code-tip `2c7a7bd`/`21378c9` (no TS/ESLint errors; `/api/version` + `/admin/settings/billing` present). Re-run only if the tip advances with further build-surface edits.
3. **WS-M** — two-device real-hardware A/V smoke (jsdom cannot verify tutor hears student).
4. **WS-A F-1** — outbox register attempt cap (~10 lines) + own 5-axis (SHOULD-FIX deferred from `234c6d7` review).
5. **Migrations** — WS-K/G/J additive nullable authored; applied on preview-dev only; **prod apply = Andrew greenlight** at cut.
6. **Andrew hardware re-smoke** — master-cut smokebook [`go-to-sarah-master-cut-smokebook.md`](go-to-sarah-master-cut-smokebook.md).

**HARD STOPS:** merge to master; Neon/prod migrations; account reset; force-push.

**Harness note:** Playwright workers 14→4 recommended (contention resolved at w=4 on `c2ca8f5`); not yet applied to config.

---

## Ship-to-Sarah gate (governing)

Andrew wants Sarah on `v1-redesign` once waiting room → WB → end is stable for tutor **and** student — backend pipeline included. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** per-chunk notes only (no legacy monolithic); End/Continue never silently deletes recording; single-segment seek at every review entry; consent UI honesty (`CONSENT-HONESTY-SARAH-MERGE-BLOCKER`). Deferral ledger: [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

Sarah remains on production `master` until gate passes.

---

## Parked / deferred (not blocking next tranche)

| Item | Notes |
|---|---|
| **E3 reconnect pill** | PARKED — conflicts with Andrew 2026-07-03 park of `a962171`; BUG-8/BUG-9 fragile A/V; needs hardware |
| **Reachability branch** | `wb-av-reachability-detection-fix` @ `a962171` — revisit only if base at risk |
| **WS-U-FRAGILE 1.2** | SMOKE-BLOCK-1 dead Start — peer-mesh/presence |
| **Post-Sarah** | SMOKE-NOTES-2 live notes display; SMOKE-UX-3 ±10s scrub; perspeaker-C runtime wiring; eval harness |
| **SEC** | `tutor-asset/route.ts` any-origin blob URL — pre-existing; backlog |

---

## How we work (pointers)

- **Orchestration:** [`AGENTS.md`](../../AGENTS.md) § Model usage protocol; dispatch boundary [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Conductor tier:** Opus for fragile durability design + judgment; Composer 2.5 executes; Sonnet 5-axis on fragile diffs. **Fragile-serial** in one worktree.
- **Merging:** smokeable branch → Andrew smoke → `merge --no-ff`; WB sync at merge boundary; build-surface → `npx next build`
- **Smokebooks:** [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guessed)
- **Process:** preview links in pairs (Vercel `branchAlias` + `preview.usemynk.com` when repointed); behavior tests to spec not code; swap chats ~60–70% context

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. **This file** — HEAD first
3. [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md) — wave-5 backlog
4. [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md) — executor spec
5. [`part2-test-buildout-plan.md`](part2-test-buildout-plan.md) — Part-2 test batches
6. [`docs/LIVE-AV.md`](../LIVE-AV.md) — before A/V / per-speaker
7. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before FSM/outbox/end-session
8. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
9. [`docs/BACKLOG.md`](../BACKLOG.md)
10. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Heavy-restructure template: [`orchestrator-state-template.md`](orchestrator-state-template.md). Commit truth: `git log --oneline -30 wb-wave5-polish`.

**2026-07-05 crash recovery (resolved):** Andrew's machine crash zeroed loose ref `refs/heads/wb-wave5-polish` (41 null bytes); recovered via reflog to `970aa18`, no committed work lost. CRLF-flip artifact on `EndedUnsavedSessionsList.tsx` later reverted; tree clean.
