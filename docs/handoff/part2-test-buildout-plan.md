# PART 2 — Site-wide behavior/contract test buildout plan

> **Source:** WS-V consolidation pass ([gap-consolidation](34c4d972-fc28-4633-ad95-5e1f55153db4), 2026-07-05) synthesizing `docs/handoff/site-wide-coverage-audit.md` + the wave-5 queue TEST COVERAGE INVENTORY + `docs/INDEX.md` + an app-tree spot-check. This is the authoritative PART-2 execution list. **Branch:** `wb-wave5-polish` · **Worktree:** `tutoring-notes-polishwt`.
>
> **Governing principle (HARD):** behavior/contract oracles ONLY — DB rows, HTTP status, `data-testid`/role visibility, independent math. NEVER component wiring, import paths, private hooks, or CSS-class internals. The suite must ENABLE the coming component-dedup refactor, not fight it.

## 🚨 DISPATCH-SAFETY CORRECTION (orchestrator, overrides the source plan's "parallel waves")

The source plan lists "Wave 1 = ~8 parallel agents." **Do NOT fan out multiple code-writing subagents in the shared `tutoring-notes-polishwt` worktree** — default subagents share ONE working tree with no git isolation; concurrent writers clobber each other's uncommitted files and race the git index (the 2026-05-27 Wave-A lesson, `AGENTS.md` § Model usage protocol). File-disjointness of the *plan* does NOT make concurrent shared-worktree writers safe.

**Safe execution options:**
1. **SERIAL in-worktree (default, reliable):** one code-writing subagent at a time; commit its additive test files before dispatching the next. This is how the whole wave-5 train ran.
2. **TRUE parallel = isolated worktrees:** `best-of-n-runner` subagents (auto per-run worktree + branch), merged `--no-ff` after. BUT worktrees do NOT isolate shared runtime services — the local Postgres test DB, the relay (port 3002), and the dev-server (3100) are single-instance. So any batch that runs jest **integration** (real test DB), `test:wb-sync` (relay), or Playwright against the dev-server **must still serialize** even across worktrees. Only pure jest-unit/DOM (no DB) batches are safe to truly parallelize.

**Practical overnight cadence:** dispatch ONE batch (or a small coherent cluster of same-pattern file-disjoint test files) per subagent, serially; commit between; run `npx tsc --noEmit` + the targeted jest each time; run the full relay `test:wb-sync` once at the merge boundary, not per batch.

## Harness facts (current tip)
`playwright.config.ts` webServer sets `BLOB_HARNESS_LOCAL=1` + `BLOB_READ_WRITE_TOKEN=playwright-harness`; specs gate on `blobIntegrationEnabled()` (`src/lib/blob-harness.ts`). **Every new `wb-regression` spec MUST** be enrolled in `playwright.config.ts` `wb-regression.testMatch` + tagged `@wb-*` from `tests/test-tags.ts` + verified with `npx playwright test --project=wb-regression --list <file>` — else it silently protects nothing.

## Per-batch acceptance gate
1. Behavior oracle stated in test name/docblock.
2. No assertions on component import paths, private hooks, or CSS module class names.
3. Red-before / green-after for new coverage (or documented RED-ONLY with linked issue).
4. wb-regression: enrolled + `@wb-*` tag + `blobIntegrationEnabled()` not self-skipping.
5. No production edits on FRAGILE surfaces without orchestrator + 5-axis sign-off.

---

## Section A — REWRITE / false-green (dedup-fragile)

| ID | Existing spec | Problem | REWRITE contract | Target | Batch |
|----|---------------|---------|------------------|--------|-------|
| RW-1 | `src/__tests__/dom/StudentLiveWorkspaceClient.dom.test.tsx` L321 (`describe.skip`) | Skipped chrome / ARIA-tab internals | Student shell: join → board visible; sign-out → `/students/login` | unskip + behavior oracles | RW-B1 |
| RW-2 | `src/__tests__/impersonation-d.test.ts` | Source-string asserts on `AdminNav` | Playwright: admin → impersonate → banner → exit → no fresh 2FA | NEW `tests/integration/identity/impersonation-round-trip.spec.ts` | RW-B2 SERIAL (identity-e2e) |
| RW-3 | `src/__tests__/dom/BoardTabStrip.test.tsx` | Props/CSS coupling | Delete redundant unit asserts; rely on `wb-board-tab-overflow.spec.ts` | test-only | RW-B3 |
| RW-4 | `notes-session-bridge.test.ts` (query-shape) | DB-query oracle, not user-visible | Superseded by P1-J4 review-payload round-trip | — | P1-J4 |
| RW-5 | `src/__tests__/dom/MainPanel.dom.test.tsx` | IC text match for billing milestone | `data-testid` milestone banner on `activeMs` threshold (timer seam) | same file | RW-B4 |
| RW-6 | `tests/smoke/whiteboard-workspace.spec.ts` L22–131 | Stale `/workspace` redirect (consent modal removed) | Create WB → student detail w/ session row visible | same file | P2-J1 |
| RW-7 | `tests/audio-upload.spec.ts` | `ai-transcribe-btn` disabled — harness upload doesn't enable | Enable after harness upload OR honest documented skip | same file | P2-J2 |
| RW-8 | `wb-end-from-roster.spec.ts` | legacy `test.skip` if present | Remove dead skip; keep N4 outbox-only oracle (no `seedSessionRecording` fallback) | same file | P1-WB-7 |
| RW-9 | `identity-2fa-management.test.ts` | Source/oracle, not user flow | Complement w/ P1-ID-2 browser gate; trim source-only asserts | — | P1-ID-2 |

WS-R (`wb-roughness-style.spec.ts`) already rewritten — verify green only.

## Section B — HUMAN-only (slim smokebook, NOT automated)
Real WebRTC A/V reconnect (21), iOS AudioContext (22), mobile thermal (23), Whisper-on-real-speech (24), legal copy accuracy (37), theme/visual/copy spot-checks, subjective audio + two-device student boost (WS-M), `e2e/audio-rollover.spec.ts` 50-min, `useLiveAV` real mic/cam perms, PDF inv-8 viewport quarantine, WS-X product fix (spec stays RED on `wb-wave5-ws-x-wip`).

## Section C — FRAGILE (gate separately; test-writers use seams/mocks only)
| Surface | Anchor | Batch | Note |
|---------|--------|-------|------|
| IN_PERSON + full consent → no audio | `lifecycle-machine.ts` L636–646 (no `sessionMode`) | P1-WB-10 RED-ONLY | Andrew product call (FOR-ANDREW-U13-b) before greening |
| WS-X tombstone rebroadcast | `applyRemoteToCanvas` / v3 broadcast | PARKED `wb-wave5-ws-x-wip` | 2nd attempt exhausted |
| WS-P deliverable 2 | `WhiteboardWorkspaceClient.tsx` ~2093 | DEFERRED | WS-P-B ack |
| Reachability / dead Start (WS-U 1.2) | `useLiveAV.ts` / `peer-mesh.ts` | P2-FRAGILE-1 | design first |

---

## P1 — core promise / data-integrity / auth / consent / erasure

**PARALLEL-tagged = disjoint files (still serialize execution per dispatch-safety note above; these are the no-production-touch jest batches, lowest risk to author).**

- **P1-J1** Share access API contracts — `api/share/mark-seen/route.ts` (valid→`noteView` row, revoked→403, wrong note→404) + `api/audio/[recordingId]/route.ts` (share-scoped 200+`Accept-Ranges`, revoked→403). NEW `src/__tests__/api/share-mark-seen-route.integration.test.ts`, `src/__tests__/api/share-audio-proxy-route.test.ts`. No production touch.
- **P1-J2** WB timer + asset proxy routes — `whiteboard/[sessionId]/timer-anchor` (owner→`{activeMs,lastActiveAt}`, cross-tenant→403), `w/[joinToken]/wb-asset` (valid token+in-scope→200, bad→403), `sessions/[sessionId]/wb-asset`. 3 NEW route tests.
- **P1-J3** Student roster CRUD + ownership — `admin/students/[id]/actions.ts` rename/delete/create; CRUD reflects in DB, cross-tenant `assertOwnsStudent`→throw. NEW `src/__tests__/admin/student-crud-actions.integration.test.ts`.
- **P1-J4** Review payload server contract (WS-S) — `notes-actions.ts loadSessionReviewPayload`: seeded audio+events+note → `hasAudio`/`eventCount>0`/note `found`; + `attachWhiteboardToNoteAction`. 2 NEW integration tests. Replaces RW-4.
- **P1-J5** Replay mixdown + concat route auth — EXTEND `wsg-replay-concat.test.ts` (replay set = tutor:mic mixdown ONLY, no peer/transcriptionOnly); NEW `concat-audio` + `public-concat-audio` route tests (owner/share-scoped, DB-origin blob only, no SSRF).
- **P1-J6** Identity durable throttle cold-start — AH login rate-limit row survives module reload. NEW `src/__tests__/identity/ah-login-throttle-durability.integration.test.ts` (pattern: `learner-pin-throttle-durability.test.ts`).
- **P1-J7** Session safety hard-stop UI seam (item 8) — `segment-policy.ts shouldHardStopSession` + workspace consumer w/ `__SESSION_SAFETY_MAX_SECONDS_OVERRIDE` (no 8h wait). EXTEND `segment-policy.test.ts`; NEW `WhiteboardWorkspaceHardStop.dom.test.tsx`.
- **P1-J8** WS-K notes shimmer computed style (item 16) — shimmer element non-transparent computed animation + reduced-motion branch. NEW `TutorNotesShimmer.dom.test.tsx`.

**SERIAL-ONLY relay (`wb-regression`) — one at a time (~90 min total):**
- **P1-WB-1** lifecycle + billing oracle (EXTEND `wb-session-lifecycle.spec.ts`: `activeMs` vs independent timer-anchor poll; replay mixdown-only; fix brittle role-regex confirm).
- **P1-WB-2** VAD per-speaker durability (EXTEND: tab-kill mid-backlog → resume → End → `recording-count`≥pre-kill, tutor:mic rows).
- **P1-WB-3** recording end-to-end (EXTEND; un-skip `recording-resilience.spec.ts` preview).
- **P1-WB-4** replay scrub/seek (EXTEND: single+multi-segment lands at target ms not t=0; active-board-tab).
- **P1-WB-5** notes ≤2–3s (EXTEND `wb-notes-shimmer.spec.ts`: note `done` in poll budget; zero-LLM fast path via spy seam).
- **P1-WB-6** tab-kill audio survival (WS-N teeth).
- **P1-WB-7** End guards gate/roster (WS-C precondition; N4 outbox-only survives; remove `seedSessionRecording` fallback = RW-8).
- **P1-WB-8** review overlay non-empty on 3 End paths (in-live/gate/roster; non-empty when seeded, honest empty-state when not = WS-S).
- **P1-WB-9** admin cost dashboard auth (`integration`: TUTOR→denied, ADMIN→breakdown).
- **P1-WB-10** IN_PERSON audio quadrant — **FRAGILE · RED-ONLY**. Prod flags (solo env unset): IN_PERSON+full consent → Start → End → `recording-count`≥1 (+ waiting-room banner ABSENT for IN_PERSON, SMOKE-BUG-10). NEW `tests/integration/wb-in-person-audio-start.spec.ts`, enrolled, **must FAIL until Andrew authorizes the FSM fix** — do NOT patch `lifecycle-machine.ts` in the test batch.

**SERIAL-ONLY identity-e2e:** P1-ID-1 learner PIN lockout; P1-ID-2 tutor 2FA login→land (+ QR local-gen, no external URL in net log); P1-ID-3 erasure post-grace purge; P1-ID-4 share-page audio scrub (`integration` project).

## P2 — important flows
P2-J1 stale smoke oracles (RW-6/RW-7); P2-J2 manual note time 5-min snap; P2-J3 consent waiting-room gate (DOM + `wb-capture-gate-live.spec.ts`); P2-J4 share mark-seen client (`SeenTracker` viewport→POST); P2-ID-1 claim wizard happy path; P2-ID-2 parent dashboard + child-notes scoping; P2-ID-3 JWT role-refresh browser; P2-J5 outbox drain UI (FRAGILE-adjacent — UI oracle + mocked IDB); P2-J6 WS-P deliverable 2 (BLOCKED on WS-P-A/B); P2-WB-1 WS-X (PARKED RED on wip branch); P2-WB-2 wave5 review thumbnail.

## P3 — polish / marketing
P3-J1 marketing landing smoke; P3-J2 multitutor handle display (4 surfaces); P3-J3 Gmail disconnect; P3-J4 tutor approvals UI; P3-J5 time-alert chime (WS-Q deferred slice, FRAGILE-adjacent `useAudioRecorder` seam).

---

## Summary stats
| Tier | Gaps | SERIAL-ONLY batches |
|------|------|---------------------|
| P1 | ~28 → 12 jest + 10 playwright | 10 |
| P2 | ~12 | 4 |
| P3 | ~6 | 3 |
| REWRITE | 9 specs | 1 (impersonation E2E) |

**Total: 24 batches** (14 disjoint jest/DOM authorable + 10 serial relay/identity execution groups). Floor from the ~85-surface WS-V audit; excludes HUMAN-only + Andrew-gated fragile fixes, but writes RED specs where a bug is confirmed (in-person audio P1-WB-10, WS-X).

## Execution status (orchestrator-maintained)
- **2026-07-05:** plan captured. Executing SERIALLY (dispatch-safety note).
  - **P1-J1** ✅ DONE — `1a60d5a` ([impl](5c1f0db1-91f0-400c-a5d8-b13a7b6afdfe)). share mark-seen (200+`noteView` upsert / revoked→403 / wrong-note→404 / missing→400) + share audio proxy (200+`Accept-Ranges` / Range→206 / revoked→403 / missing→401 / out-of-scope→404). Red-before proven; 10/10 jest; tsc clean; contract-level oracles (blob stream mocked at boundary).
  - **P1-J2** ✅ DONE — `18918c5` ([impl](714e2896-9f97-48a8-8597-d488d6a21296)). 16 tests: timer-anchor (owner→200 `{bothConnectedAt,activeMs,lastActiveAt}`+no-store / cross-tenant→`notFound` 404 / unauth→redirect), `w/[joinToken]/wb-asset` (valid→200 png+private cache / revoked|out-of-scope→404 / missing u→400 / ended→410), `sessions/[sessionId]/wb-asset` (participant→200 / unauth→401 / non-participant→404 / AH-self-learner→200 / ended→410). Tested to REAL contract (denials are 404/401/410, not the plan's approx 403). tsc clean.
  - **P1-J3** ✅ DONE — `336b890` ([impl](e6d1ee9f-b2ea-4b3b-bb18-b2ed6640d380)). 8/8: create (row+adminUserId scope / empty-name err / null-session→redirect), rename (DB effect / cross-tenant→NEXT_NOT_FOUND, unchanged), hard-delete (row gone + SessionNote cascade / cross-tenant→NEXT_NOT_FOUND, preserved). Ownership rejection red-before proven. tsc clean.
  - **P1-J4** ✅ DONE — `d3cb511` ([impl](7174c575-fa9e-47be-b0f9-5d94b114d513)). 5/5: `SessionReviewPayload` real fields (`hasAudio`/`eventCount`/`initialNote.found`+content/`audioSegments`) non-empty when seeded + honest-empty (WS-S, no throw) + cross-tenant→NEXT_NOT_FOUND; `attachWhiteboardToNoteAction` sets `WhiteboardSession.noteId` + links orphan segments, cross-tenant→NEXT_NOT_FOUND. RW-4 superseded. tsc clean.
  - **P1-J5** ✅ DONE — `8778e46` ([impl](7c4bfdb2-973b-4e8e-9a15-cfffbe201c27)). 21/21: REPLAY-MIX invariant (`assembleEndSessionSegments`→tutor:mic only, excludes transcriptionOnly peer rows, chains to `selectMixdownSegmentsForConcat`); concat-audio route (owner→200 streams DB `concatBlobUrl` / cross-tenant→404 / no-`concatBlobUrl`→404 / no-SSRF: `?url=` ignored); public-concat-audio (valid share→200 / revoked→403 / missing→401 / live→404 / same DB-origin gate). tsc clean.
  - **P1-J6** ✅ DONE — `9676b26` ([impl](f0ccf01f-4ea4-4789-ac30-a08099eafb02)). 6/6: AH login throttle **IS DB-durable** (Neon `AuthThrottle` kind=ah-login, 10/60s) — NOT a memory-only gap. Independent DB oracle + `jest.resetModules` cold-start (attempt 11 still blocked from DB) + route 429 w/ Retry-After. Red-before proven. tsc clean.
  - **P1-J7** ✅ DONE — `bb381f2` ([impl](da0815aa-2ae3-496a-b679-76cb0e225950)). 19/19: `shouldHardStopSession` independent-oracle threshold via `__SESSION_SAFETY_MAX_SECONDS_OVERRIDE=25` (false@24/true@25/85) + DOM at `RecordingControlPanel`+real `useAudioRecorder` (below cap→controls no-Start; at/after→`audio-record-done` "Recording saved", Start absent). Red-before proven (no override → cap never reached). Boundary note: full WWC not mounted (live board hides panel; bridge auto-resets on `done`). tsc clean.
  - **P1-J8** ✅ DONE — `171b0bf` ([impl](130fe7b7-e37d-49f7-aaf2-5229004cf06f)). 3/3: layered jsdom shimmer oracle — `:root` tokens `--surface-2/3`/`--accent-soft` defined (guards undefined-var regression), gradient probe non-`none`, parsed `.tn-notes-generating-wrap::after` declares `tn-notes-shimmer` animation, wrapper `position:relative`/`isolation:isolate`; reduced-motion `::after`→`animation:none`. Red-before: old `--surface-muted`/`--surface-hover` absent from `:root`. Actual motion → Playwright P1-WB-5. **✅ FULL P1-J pure-jest batch (J1–J8) COMPLETE.**
  - **P2-J2 + P2-J4** ⏳ IN FLIGHT ([impl](f1fda2f5-1ad9-4b81-ab90-e5587ba73764)) — note-time 5-min snap (unit + DOM) + SeenTracker viewport→POST client behavior.
  - NEXT: remaining pure-jest P2 (P2-J3 consent waiting-room DOM) + REWRITE RW-B1/B3/B4/B5; **then a FULL `npx jest` checkpoint** (confirm the ~8 new DB-hitting integration files don't cross-pollute) before the SERIAL-ONLY relay (P1-WB-*) + identity-e2e (P1-ID-*) groups (one at a time; need relay/dev-server).
