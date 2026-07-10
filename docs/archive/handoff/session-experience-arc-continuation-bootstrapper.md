# Session-experience arc — continuation bootstrapper (2026-07-01, tip `aeab4cd`)

> **Andrew:** paste this ENTIRE file into a fresh chat to continue the session-experience arc. It is the pasted prompt; the chat will read the durable docs itself. Nothing below assumes the new chat remembers anything.

---

You are the orchestrator/executor for the **session-experience arc** on the `tutoring-notes` app — the arc that ends at the **Sarah merge gate**. Do NOT ask me for catch-up. `@`-reference the prior chat (**"Consent blocker execution — safe erasure + doc re-anchor"** and its continuation where erasure + CF-2/CF-4 shipped) and read these first, in order — authoritative and current:

- `docs/handoff/ORCHESTRATOR-STATE.md` — canonical bootstrap; **head dated 2026-07-01, milestone tip `aeab4cd`** (code tip `b7c88ac`). Its head (Last action / Next action / Open Andrew-confirms / In-flight / Uncommitted) is the single source of current truth. **Read it first.**
- `docs/handoff/consent-honesty-safe-erasure-plan.md` — the erasure executor contract (Workstreams B/C, Option A, 9 BLOCKERs, Step 0..8). **Steps 0–6 are DONE** (see "What's done").
- `~/.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md` — the canonical Sarah-gate plan.
- `docs/handoff/consent-honesty-smoke-findings-2026-07-01.md` — my smoke results + MB-1..MB-6 triage.
- `docs/handoff/consent-blocker-5axis-review-2026-06-30.md` — erasure BLOCKERs.
- `docs/RECORDER-LIFECYCLE.md` + `docs/LIVE-AV.md` — **read before touching blob/segment/session-revoke/audio/recorder-FSM/whiteboard-recorder paths.**
- `docs/BACKLOG.md` — includes the 2 deferred erasure items just filed (`ERASURE-INFLIGHT-CHECKPOINT`, `ERASURE-ADMIN-METADATA`).

Use `git log` for commit truth.

## Branch / worktree / platform (unchanged — do not re-litigate)

- Work ONLY in the worktree **`tutoring-notes-polishwt`** on branch **`wb-wave5-polish`** (current tip `aeab4cd`; all pushed). Do NOT switch branches. Do NOT touch the main `tutoring-notes` checkout (it is on `v1-redesign`) or any `.cursor/plans/*.plan.md`.
- Windows **PowerShell 5.x**: use `;` not `&&`.
- This is a git worktree — real git dir is `…/tutoring-notes/.git/worktrees/tutoring-notes-polishwt`. **Commit via** (message through a temp file — PS 5.x mangles `-m`):
  ```powershell
  $msg = "<subject>`n`n<body>"
  $gitdir = git rev-parse --absolute-git-dir
  $tmp = Join-Path $gitdir COMMIT_MSG_DRAFT.txt
  [System.IO.File]::WriteAllText($tmp,$msg,(New-Object System.Text.UTF8Encoding $false))
  git add <files>
  git commit -F $tmp
  ```
  then delete `$tmp` in a SEPARATE sequential command (never parallel with the commit); then `git push origin wb-wave5-polish`.

## THE MERGE GATE (do not re-litigate)

Full arc, **NO interim merge**. A SINGLE `git merge --no-ff wb-wave5-polish → v1-redesign` happens ONLY after the entire session experience (consent + erasure + Part 3 notes) passes a **both-themes hardware smoke**. The consent/erasure re-smoke is a **CHECKPOINT, not a merge trigger**.

## TESTING CONTRACT — this is the primary directive, read twice

I must NOT be asked to smoke anything mechanical or deterministic — and not merely because you omit it from the smokebook, but because it is covered by a **RELIABLE automated test that is GREEN before anything reaches me.** (The consent "Save preferences" button once shipped as a visual stub I had to catch by hand — never again.)

1. For EVERY surface you touch, ship the test in the SAME wave/commit. Anything deterministic — server actions + their DB effects, ownership/consent/erasure guards, routing, state machines, phase transitions, button→action wiring, tombstone/soft-disable, credential disable/re-enable — gets an action-level integration test AND/OR a Playwright e2e that asserts it ACTUALLY does the thing (not that a handler exists). **Red-before / green-after** or it doesn't count.
2. **Playwright e2e is Workstream C** — build it incrementally per-flow as you go, NOT deferred to the end. Consent save (parent + claim-setup), waiting-room Start gates, erasure request/cancel/restore, tutor content-route 404 post-erasure, student-vs-parent routing — all e2e-covered.
3. Before ANY smokebook reaches me, self-audit every item: "could this be an automated test?" If yes, it MUST be automated and REMOVED from the smokebook. The smokebook may contain ONLY genuine **jsdom-blind-spot / hardware / perceptual** items: real-audio mixdown, layout/geometry, WebRTC peer audio, multi-tab cookie behavior, cross-device timing, and **stroke↔audio replay alignment** (see the CF-2.1 hardware item below).
4. **Green gate before declaring a wave smoke-ready:** `npm run test:wb-jest` (inner loop), `npx jest` (full), `npx next build` (any build-surface change), `npm run test:wb-sync` (any file under `src/lib/whiteboard`, `src/components/whiteboard`, or the apply paths — merge-boundary gate), plus the Playwright e2e for the touched flow.

## Test environments (I authorize this)

Spin up as many LOCAL test environments as you need (extra Postgres on separate ports, parallel dev servers on separate ports) to run integration/e2e reliably. **TWO hard rules:** (a) never point writes at production Neon without an explicit greenlight from me; (b) CLEAN UP after yourself when the wave is done. **Mandatory DB override for any DB-touching jest** (the repo `.env` points at a REMOTE Neon preview-dev endpoint — writing to it corrupts shared data): in the SAME shell, `$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/tutoring_notes_test" ; $env:DIRECT_URL=$env:DATABASE_URL`, verify the host is `127.0.0.1` (NOT `*.neon.tech`) before running. Shared single-instance services: local Postgres 5432, docker relay `wb-relay-local`, dev port 3100 — give parallel work its own DB/port; never run two live-stack tasks against the shared services at once.

## What's DONE this arc (nothing here needs redoing — verify via `git log` if in doubt)

**Erasure feature COMPLETE** (all 9 BLOCKERs A–I + UI/copy/docs), on `wb-wave5-polish`:
- `d3458f9` — Step 1 / BLOCKER B: additive `LearnerCredential.disabled` migration (**live on preview-dev**; production apply still MY greenlight, not needed until master cut) + fail-closed learner login.
- `ac963a3` — Step 2 / ER-1 / BLOCKER I: tombstone helpers THROW on `not_found` + `DELETE`-path existence validation.
- `11a812c` — Step 3 / ER-2/ER-5/ER-7, BLOCKERs A/C/D/E/F: reversible tombstone (Option A) — soft-disable creds + preserve PII through grace; hard-redact at grace-expiry purge; atomic `$transaction` cancel-restore; `advancePhase` conditional-update TOCTOU guard; `pg_advisory_xact_lock`. **Sonnet 5-axis PASS.**
- `6631b5e` — Step 3.5: folded 5-axis findings (log-key fix, `soft_disable_credential` event, `advancePhase`-abort test, AH-PII purge oracle, `account_holder` cancel-restore test).
- `6e46e16` — Step 4 / ER-3, BLOCKERs G/H: access-suspension guards (session create/start + `assertStudentNotErased`(+Api) extended to active `ErasureJob`). **Sonnet 5-axis: safe, found 1 HIGH share-link gap.**
- `dd37288` — Step 4.5: closed that HIGH — all 6 family share-link surfaces guarded + fail-closed on DB error + denial logs.
- `51e5bfd` — Step 5/6 / ER-4+ER-6+ER-7: tutor pending-erasure UI (composed from existing primitives), operator copy, `ers=`/`sal=` logging docs; Cancel wiring tested.

**Consent-flow fixes COMPLETE:**
- `183f09b` (CF-1, earlier) + `7a9514f` (CF-3, earlier).
- `853bba4` — CF-2 / MB-4: decouple WB event recording from audio-capture policy so IN_PERSON replays.
- `3c326d9` — CF-4 / MB-5: `triggerNotesGenerationAction` returns `{ok,error?}` + surfaces failure (was silently `.catch`-swallowed) + tutor_only→TutorNote reduce test.
- `b7c88ac` — CF-2.1: mode-aware `wbSignal` — audio modes keep FSM `recordingActive` (pause-aligned), IN_PERSON keeps `wbEventsActive`. **Fixes a Sonnet-5-axis-found HIGH stroke↔audio desync** the first CF-2 cut would have introduced.

Every fragile-surface change stayed **additive** (no edits to `lifecycle-machine.ts`, `useWhiteboardRecorder` internals, `WhiteboardWorkspaceAudioBridge`, `upload-outbox`, atomic `endWhiteboardSession`, or `src/lib/whiteboard/`). All green on the local test DB; both `next build` exit 0.

## What's NEXT (exact sequence — pick up here)

1. **Re-confirm MB-1 / CF-1 Start regression.** CF-1 shipped @ `183f09b` (impersonation-exit corrupting the shared NextAuth cookie). Assess whether the fix has automated regression coverage; if the impersonation-exit / shared-cookie path is jsdom/integration-testable, ADD a test (testing contract). Otherwise mark it a hardware/multi-tab smoke item. FYI: my students are typically NOT under impersonation on their own machines.
2. **Workstream C — Playwright e2e** (build incrementally per-flow, ship as you go): consent save (parent + claim-setup, CC-1/CC-2), waiting-room Start gates, erasure request/cancel/restore, tutor content-route 404 post-erasure, student-vs-parent routing, and the family share-link erasure denial (the Step 4.5 surfaces).
3. **Checkpoint re-smoke (NOT a merge trigger)** — full `npx jest` + `npx next build` + **`npm run test:wb-sync`** (WhiteboardWorkspaceClient is a wb-surface — CF-2/CF-2.1 touched it) + regenerated smokebooks. Smokebook = ONLY jsdom-blind/hardware items, notably: **LIVE participant-disconnect → resume: strokes replay ALIGNED with audio** (the CF-2.1 alignment can't be jsdom-tested), IN_PERSON replay-with-no-audio, tutor_only real-audio mixdown (student absent from recording but heard live).
4. **Part 3 reliability spine** (fresh chat OK): `p3-clock` → per-speaker capture → VAD → incremental map → model abstraction → finalize. **Notes QUALITY is a PRE-MERGE bar** — ship a genuine high-quality first-crack map/reduce that materially leverages per-voice-stream labeled transcripts + the swappable model abstraction; notes must be GOOD, not "they exist, expect editing." ONLY the formal eval harness + the flywheel iteration loop are deferred post-master.
5. **Full-arc both-themes hardware smoke** (FINAL Sarah gate) → then the single `git merge --no-ff wb-wave5-polish → v1-redesign`.

## Open Andrew-confirms (surfaced, proceeding on defaults unless I redirect — all additive to change later)

Erasure UX defaults from Step 5/6: (1) **Cancel is operator-only** (Admin→Erasure); tutors see pending/suspended state + "contact operator", no tutor cancel button (no ADMIN role). (2) **No parent self-service deletion UI** — erasure is operator-mediated only. (3) Post-purge roster badge reads "Deleted". (4) Suspended student-detail Start CTA → status text. Standing confirms are in `ORCHESTRATOR-STATE.md` § Open Andrew-confirms (debounced-disconnect pause trigger at `p3-clock`, WB-LABEL-PARENT-SIGNIN, Sarah primary device, Ship-to-Sarah gate, iOS student WB/A/V).

## Guardrails

- **Additive-only migrations**; never drop/rename a column without a multi-step migration. The `LearnerCredential.disabled` migration is live on preview-dev; **production apply is MY explicit greenlight** (not needed until master cut).
- **Fragile / high-blast-radius surfaces** (recorder FSM `lifecycle-machine.ts`, `upload-outbox`, atomic `endWhiteboardSession`, live-A/V peer-mesh, whiteboard sync/apply/viewport, `useWhiteboardRecorder`, auth/ownership boundaries): **additive-only**. On a **2nd failed attempt** at the same fix, or a real design fork, STOP and step back into plan mode before pushing through. For fragile changes, dispatch a read-only `explore` to root-cause FIRST, then a Sonnet 5-axis review of the diff AFTER.
- **Per-session ID logging is mandatory** — erasure `ers=<jobId>` / share-access `sal=<token:8>`; whiteboard `wbsid`/`wba`; notes `nsi`/`tnt`. Log every state transition; register new prefixes in `docs/RECORDER-LIFECYCLE.md`.
- **Dispatch execution to Composer 2.5 subagents** (`explore` for read-only investigation, Sonnet `claude-4.6-sonnet-medium-thinking` for 5-axis / large-diff review). **Serialize code-writing subagents that share the worktree** (one file at a time / one branch in flight; two writers racing the git index clobber each other). A single subagent doing 2 sequential commits is fine.
- **Keep `docs/handoff/ORCHESTRATOR-STATE.md` current on EVERY turn that materially changes state** (head: Last action / Next action / Open confirms / In-flight / Uncommitted). This is what makes the chat swap-safe.
- **Smokebook dispatches** MUST follow `docs/handoff/SMOKEBOOK-TEMPLATE.md` and the fetch-don't-guess preview-URL rule (`.cursor/rules/smokebook-template.mdc`): fetch the real Vercel `branchAlias` via the Vercel MCP `list_deployments` for the branch — never invent a `tutoring-notes-git-*` URL.
- **MCP write-safety:** default read-only; name any write op in chat and wait for my "go". Never write to production Neon without explicit greenlight.

## Known merge-blockers status (from my smoke)

- **MB-1** Start regression (impersonation-exit shared-cookie) — CF-1 done; **re-confirm** (item 1 above).
- **MB-2** full-family erasure ineffective — FIXED (ER-1 validate+throw, `ac963a3`).
- **MB-3** erasure access-suspension — FIXED (ER-3 `6e46e16` + share-link `dd37288`).
- **MB-4** IN_PERSON no replay — FIXED (CF-2 `853bba4` + CF-2.1 `b7c88ac`).
- **MB-5** tutor_only no notes — FIXED (CF-4 `3c326d9`).
- **MB-6** — see findings doc; confirm status during checkpoint.

## Housekeeping note

There are THROWAWAY UNTRACKED copies in the main `tutoring-notes` (v1-redesign) working tree: `docs/handoff/{consent-honesty-premerge-smoke-index, wb-block-b-consent-gate-smokebook-2026-06-30, cc1-cc2-consent-gate-smokebook, erasure-smokebook}.md`. The tracked authoritative copies are on `wb-wave5-polish`. Delete the untracked main-checkout copies before the merge.

**Start by** reading `ORCHESTRATOR-STATE.md` + confirming the `wb-wave5-polish` tip via `git log`, then proceed to item 1 (MB-1/CF-1 reconfirm) — assess test coverage and either ship a regression test or classify it a hardware smoke item — and begin Workstream C.
