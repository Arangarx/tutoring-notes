# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** Single source of current orchestrator state for tutoring-notes. A **brand-new orchestrator chat** reads this + its reading list + `git log` — **no catch-up from Andrew** on what's done, where we are, what's next, or how we work.
>
> **Operating contract** ([`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)): state durability is a **primary reliability obligation**. Sessions can be lost at any moment; keep this file continuously current. Treat "I'll update state later" as a silent failure.

---

## HEAD

| Field | Value |
|---|---|
| **Last action completed** | **P1-WB-9 admin cost-dashboard auth committed (`965256c`, 2026-07-06) → ✅ Tranche B P1-WB COMPLETE 9/9.** Auth boundary holds (TUTOR→404, ADMIN→breakdown), no security hole; role→observable-outcome oracle. Then dispatched the 2 read-only bug investigations (WS-T #8 design_now, WS-T #9 design_only) per Andrew. Prior: **P1-WB-8** (`b1391df`) caught 2 real bugs (WS-T #8/#9) — `test.fixme`'d + surfaced. Prior: **A2 WS-P defer-reload seam fix committed (2026-07-05):** prod-inert PW-gated reload seam in `triggerDeployReload()` + spec tidy — A2 Playwright green 2/2 on relay, Sonnet 5-axis SHIP, committed [`4b085db`](https://github.com/Arangarx/tutoring-notes/commit/4b085db); §6 A2 proof DISCHARGED. Prior: **WS-P deliverable 2 done (2026-07-05):** deploy-freshness version poll + live-session capture-defer. Impl [`9ca410e`](https://github.com/Arangarx/tutoring-notes/commit/9ca410e) (ref-counted `capture-defer-registry`, `useDeployFreshness`, read-only tutor `useEffect` in WWC, `note-recording` writer, chunk-recovery defer parity). Sonnet 5-axis → SHIP-WITH-FIXES; fixes folded [`2c7a7bd`](https://github.com/Arangarx/tutoring-notes/commit/2c7a7bd) (F1 defer-flicker effect-split w/ red-before/green-after, F2 chunk-recovery SPA-nav clear, O1 reload-commit logging). 25/25 deploy jest; `lifecycle-machine.ts` untouched; WWC effect read-only. **Preceded by fragile-fix train** (in-person `3bf3a7e`, WS-X `ef5fb1a`, both 5-axis'd) + heavy state restructure [`fb2a7f1`](https://github.com/Arangarx/tutoring-notes/commit/fb2a7f1). |
| **Next action(s)** | **Tranche A DISCHARGED (2026-07-05, attended):** A1 build ✅, A2 WS-P defer-reload ✅ (seam fix committed), A3 in-person ✅ relay-proven. **A4 WS-X DEFERRED** to a dedicated attended pass (fragile surface, no blind 3rd fix). **IN FLIGHT → Tranche B PART-2 relay burndown, SERIAL one-at-a-time (each: Composer authors behavior/contract oracles → relay-green → orchestrator reviews directive-B quality → commit):** **✅ Tranche B P1-WB COMPLETE 9/9** (`965256c` last). **IMMEDIATE:** await the 2 read-only investigation reports → bring WS-T #8 fix plan to Andrew for go (design_now); deliver WS-T #9 root-cause + blast-radius (design_only, no fix this session). **NEW BUGS from P1-WB-8 (both `test.fixme` in `wb-review-overlay-3paths.spec.ts` pending fix):** WS-T #8 roster End overlay dishonesty (count===0 but Replay CTA, fragile-ADJACENT `loadSessionReviewPayload`); WS-T #9 gate-only End "IDB object store not found" crash (fragile-CORE, ~2/3). **Queue next:** P1-ID-* identity-e2e (SERIAL), RW-B2; then Tranche C WS-G-A poll UX (design-first); Tranche D jest-isolation. **WS-T #7 triage owed before master-cut.** P1-WB-10 IN_PERSON already discharged via A3. Then P1-ID-* identity-e2e, RW-B2. **Also open:** Tranche C WS-G-A "preparing seamless replay…" poll (design-first); Tranche D jest-isolation pass. |
| **Open Andrew-confirms** | Known-issues in-app page [`89d8d02`](https://github.com/Arangarx/tutoring-notes/commit/89d8d02) — **tone/copy sign-off** + remaining content calls (WS-I/WS-N inclusion, WS-O minor-ness). **RESOLVED 2026-07-05:** WS-G concat-lag → **OMIT** from the Sarah-facing page. **Governing principle (Andrew):** *don't call attention to a transient unless it's a bug we intend to fix* (concat-lag is being fixed by WS-G-A → not a standing issue → omit). **WS-U13-a likely MOOT:** in-person fix `3bf3a7e` starts recording on Start w/o a peer, so in-person no longer sits in `awaiting_first_participant` → the "Waiting for your student…" copy WS-U13-a targeted is unreachable for in-person (confirm-and-close, not pick-wording). **WS-P O3 (FYI):** `endingState==="error"` keeps deferring reload; unmount clears — flag if disagree. Prior standing: map/reduce wording sign-off; SMOKE-PRIV-2; VERIFY-ACCT-1; **Vercel Skew-Protection dashboard toggle (Andrew action).** |
| **🟡 A2 WS-P defer-reload spec RED → verdict TEST/SEAM (~75%, 2026-07-05)** | `deploy-freshness-defer.spec.ts` (WS-P del-2 `2c7a7bd`) failed on dev-server ([run](d8580b13-85e8-44e8-80f9-ca30a5577275)): `__TN_PW_RELOAD_REQUESTED__` never set after defer cleared. **Root-cause ([verdict](c06ebb2d-fabc-40f3-ba1b-c424e39a9db8)): NOT a product bug — the spec observes reload by patching `Location.prototype.reload`, which real Chromium often bypasses.** Product path is jest-proven; toast appeared in the failing run (= detect→defer→latch→subscribe all ran). **Disambiguator:** check the A2 trace for `[dfr] action=reload_commit source=poll deferred=true` — present ⇒ seam confirmed (~90%); absent ⇒ possible product bug (pathname-cleanup drops latched reload). **Recommended fix:** add a prod-inert PW-gated reload seam in `triggerDeployReload()` (`if NEXT_PUBLIC_PLAYWRIGHT_TEST==="1" → window.__TN_PW_RELOAD_REQUESTED__=true` before `location.reload()`), mirroring the existing `__TN_CAPTURE_DEFER__`/`__TN_PW_CLIENT_SHA__` seams; spec asserts the flag directly. Fragile-ADJACENT (WS-P) → Composer impl + Sonnet 5-axis + Andrew gate. **PLAN:** after A3/A4 free the live-stack, re-run A2 with browser-console capture to confirm the `[dfr] reload_commit` log, then apply the seam + prove green. **§6 A2 proof NOT yet discharged.** |
| **A3 in-person relay proof ✅ PASS (2026-07-05)** | `wb-in-person-audio-start.spec.ts` on **`wb-in-person-unmasked`** GREEN (2/2, 90.5s, real relay) — [run](a1f7ec5b-11c6-440d-bdfc-dc8bb0e7f758). Start w/ no student → Recording pill, no autopause banner, `SessionRecording`≥1. **SMOKE-BLOCK-5 fix `3bf3a7e` PROVEN on hardware; §6 in-person proof DISCHARGED.** |
| **🟡 A4 WS-X relay RED → verdict SPEC/SEAM (~90%), fix (a) UNPROVEN (2026-07-05)** | `wb-e2-apply-remote-pdf-stroke-leak.spec.ts` **RED 0/3** ([run](a1f7ec5b-11c6-440d-bdfc-dc8bb0e7f758)). **Root-cause ([verdict](05e8b160-af6e-46d7-985b-3ceae9d62b14)): shipped fix `ef5fb1a` (fix (a) applyRemote fingerprint-guard) NEITHER proven nor disproven** — spec dies at preconditions, never reaches the `__WBX_INJECT_APPLY_REMOTE__` oracle. **(1) Spec mistimed (~95%):** L159 checks `fingerprintActive===true` AFTER import UI settles, but Excalidraw's onChange clears the fingerprint by design (WWC L4678) → `false` is expected steady state. Spec (authored WITH `ef5fb1a`) dropped WIP `5d80ea8`'s pre-armed `releaseGuard`-synchronous injection for post-import `page.evaluate` which can't observe an active fingerprint. Realign: restore synchronous-injection timing / add `__WBX_ON_GUARD_RELEASE__` seam; split steady-state oracle into `wb-e2-pdf-stroke-leak.spec.ts`. **(2) L146 ~60% SEPARATE onChange-path leak** (live board-3 `line` on PDF board pre-injection, NOT tombstone artifact — `getSceneElements()` excludes deleted) — orthogonal to fix (a); if real = genuine BUG-3 recurrence → needs own instrumented steady-state run. **WS-X = most fragile surface + multi-attempt history → NO blind 3rd fix; both parts = attended + careful (Andrew + Sonnet on any product seam).** **🅿️ DEFERRED per Andrew 2026-07-05 to a dedicated attended session / design pass** (order: instrumented steady-state run to settle the L146 onChange-leak question FIRST → then realign the apply-remote spec to actually prove fix (a)). **§6 WS-X proof NOT discharged; WS-X NOT proven.** |
| **A2 WS-P fix — ✅ DONE (5-axis SHIP)** | Prod-inert PW-gated reload seam in `triggerDeployReload()` (`capture-defer-registry.ts` L47-52) + spec tidy (dropped redundant `Location.prototype.reload` patch) — [impl](d4b5c4a3-fa52-4352-8083-18556e782c6a). **A2 Playwright PASSES 2/2** (confirms WS-P reload path genuinely fires — seam verdict validated, NOT product bug). tsc clean; 25/25 deploy jest. **Sonnet 5-axis = SHIP, no fixes** ([review](bc6ca5be-4182-432f-a239-ffa4269a4949)): prod-inert (build-time gate; `location.reload()` unconditional), no security surface, test now structurally false-green-proof (flag set by product, not test). **COMMITTED. §6 A2 proof DISCHARGED.** |
| **⚠️ CRASH + RECOVERY (2026-07-05 ~22:10)** | Andrew's computer crashed mid-burndown. Crash zeroed the loose ref `refs/heads/wb-wave5-polish` (41 null bytes) → git "broken ref". **RECOVERED:** reflog intact; verified `970aa18` valid + full 1834-commit ancestry clean; rewrote the loose ref file to `970aa18a5a...` (BOM-free, LF). `HEAD` restored, working tree clean except 2 uncommitted files (below). **NO committed work lost.** **P1-WB-5 subagent [sa](5d24fc22-86e6-4a04-9dda-0ae12ed2fc95) died with the crash — no durable output → RE-DISPATCHED fresh.** **Open uncommitted artifact:** `src/app/admin/students/[id]/whiteboard/EndedUnsavedSessionsList.tsx` = **LF→CRLF line-ending flip only** (byte check: code identical to HEAD, `consecutiveLFLF=0` — NOT corruption; my earlier "doubled-newline" alarm was a `git show` CRLF display artifact) — **left untouched pending Andrew's revert call** (skip≠consent). **Also awaiting Andrew:** push 8 local commits to origin (owed; not yet pushed). |
| **✅ P1-WB-6 tab-kill WS-N teeth — DONE (`6cf196c`); verdict (B) TEST-MODEL error CONFIRMED, NO product dup** | Corrected-oracle fix [sa](47f820f0-5339-49f8-87ee-b90bace48ae8) **relay 3/3 GREEN** (~76-84s). **`distinctBlobUrlCount===count` passed EVERY run → definitively NO duplicate blobUrl persistence → closes the 12% product-dup hypothesis; no fragile-surface escalation.** Final teeth = survival (`>=`, tutor:mic-only) + no-dup-blobUrl (definitive) + End-dedupe accounting (`final.count===beforeEnd.count+novelBlobUrls.length`; each mid-registered blobUrl appears exactly once) + no-ghost (`postEndOutbox===[]`, the `6799aa4` teeth). `recording-count` route additive (`blobUrls`/`distinctBlobUrlCount`; `count`/`byStream` intact, gate byte-identical → P1-WB-1/2/4 unaffected). **Note:** assertion-#3 uses `+novelBlobUrls.length` not strict `===beforeEnd.count` because End's `stopAndUpload` adds 1 legit final segment (no test-only stop seam on live board); could tighten if a stop-capture route is added. | 
| **In-flight subagents** | **1 read-only investigation in flight:** **WS-T #8 roster-overlay design investigation [sa](e62a9d3f-00bc-4661-b3b2-6ca2af30b5c7)** — Andrew chose design_now: plan comes back for orch review → Andrew before any product change. **✅ WS-T #9 gate-IDB-crash investigation [sa](2094ba5a-4669-4ace-9d08-0d9353a3c204) DONE (root-cause):** crash is **DOMINANTLY a test-harness poison** — spec helper `countUploadedTutorMicOutbox` (+ `wb-end-from-gate.spec.ts:76-85`) opens `tutoring-notes-upload-outbox` v1 WITHOUT `onupgradeneeded` → empty-v1 DB (no `rows` store) → poisons subsequent product open; intermittency = shared Playwright IDB (workspace-mount tests heal it). **Real product fragility (narrower):** `upload-outbox.ts` lazy schema assumes first opener runs `onupgradeneeded`; gate-only End is first opener (no mount) → any v1-empty outbox DB bricks gate/roster finalize. **Fix (design-first, DEFERRED per design_only):** version-bump self-heal in `upload-outbox.ts openDb` (additive, NEVER drop rows — Pillar 2) + gate finalize try/catch + de-poison test helpers. Store: `tutoring-notes-upload-outbox`/`rows`/v1. **To present to Andrew w/ WS-T #8.** **✅ Tranche B P1-WB COMPLETE 9/9** (`95acb3f`/`398a4c2`/`507c8ce`/`970aa18`/`c46662f`/`6cf196c`/`8343a5f`/`b1391df`/`965256c`). WS-T #7 (`d9a6c4d`): 4 pre-existing `wb-session-lifecycle` reds, triage owed. **Tranche B progress (8/9 committed green):** P1-WB-1..7 ✅ (`95acb3f`/`398a4c2`/`507c8ce`/`970aa18`/`c46662f`/`6cf196c`/`8343a5f`), P1-WB-8 ✅ `b1391df` (WS-S overlay honesty — 4 green teeth + 2 bug-revealing cases `test.fixme`, see NEW-BUGS row). WS-T #7 (`d9a6c4d`): 4 pre-existing `wb-session-lifecycle` reds, triage owed. **P1-WB-9 = last Tranche B P1-WB.** After: P1-ID-* identity-e2e, RW-B2. |
| **⚠️ Relay re-run gotcha (2026-07-05, learned the hard way)** | **NEVER kill/free port :3002** to unblock a Playwright webServer — :3002 is the **persistent Docker relay / Docker backend pipe**; killing its process wedges Docker Desktop (needs manual restart) AND takes Postgres down. Correct pattern: **leave :3002 alone**, use `$env:CI='1'` (fresh webServer lifecycle w/ `reuseExistingServer` off) or only free dev-server ports **:3100/:3101** between serial runs. Re-dispatch A2→A3→A4 with this constraint after Docker is healthy. |
| **⚠️ Env correction (2026-07-05)** | State/queue said **Docker/relay/dev-server unavailable in worktree** — **NO LONGER TRUE.** Docker **29.5.3 running**, `wb-relay-local:latest` image **present**. The relay/dev-server phase (§6 proofs + PART-2 relay burndown) is **unblocked** — gated now only on an **attended** session, not on tooling. |
| **Uncommitted / unmerged** | Branch **`wb-wave5-polish`** @ [`970aa18`](https://github.com/Arangarx/tutoring-notes/commit/970aa18) (worktree **`tutoring-notes-polishwt`**; **8 commits ahead of origin — session commits NOT yet pushed**, push owed once burndown settles). Wave-5 train + fragile fixes + WS-P del-2 + A2 seam + P1-WB-1..4 committed; **NOT merged** to `v1-redesign`/`master` (Andrew hard stop). **Merge-gate proofs:** A1 build ✅, A2 ✅, A3 ✅; **A4 WS-X OWED** (deferred). **Uncommitted working-tree:** `EndedUnsavedSessionsList.tsx` = crash newline-corruption artifact (code == HEAD; awaiting revert call). |

**Autonomy posture (2026-07-05):** **LIMITED** — proceed unattended only on safe non-fragile work (jest-isolation, state/docs, pure-jest batches). **Park** anything fragile/gated for Andrew.

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
                    └── wb-wave5-polish @ 4b085db  (active; worktree tutoring-notes-polishwt)
                    ├── wb-av-reachability-detection-fix @ a962171  (isolated; PARKED)
                    └── wb-wave5-ws-x-wip @ 5d80ea8  (WIP seam preserved; superseded by ef5fb1a on polish)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; not yet merged to `master` | [`bf1a2c3`](https://github.com/Arangarx/tutoring-notes/commit/bf1a2c3) |
| **`wb-wave5-polish`** | **Active** — Wave 5 + master-cut plan + Part-2 test buildout | [`4b085db`](https://github.com/Arangarx/tutoring-notes/commit/4b085db) |
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

1. **`npm run test:wb-sync`** once on integrated tip — branch cumulatively touches whiteboard/apply-adjacent surfaces. **Component proofs (2026-07-05):** in-person `wb-in-person-unmasked` ✅ **PROVEN** (A3); **WS-X `wb-e2-apply-remote-pdf-stroke-leak` ❌ RED (A4) — NOT proven, root-cause in flight**; A2 WS-P defer spec 🟡 seam-fix pending. Full-suite `test:wb-sync` still owed after these resolve.
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
