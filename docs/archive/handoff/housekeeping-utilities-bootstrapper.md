# Housekeeping utilities — executor briefing (Vercel Blob cleanup + stale-branch sweep)

> **Recommended model: Composer** (two small standalone Node scripts; well-trodden patterns — git porcelain commands + Vercel Blob SDK; no novel architecture; safety-by-default via `--dry-run`). Opus is overkill for this scope.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the deliverables in order. No further confirmation needed; begin work.

You are building two Phase 2 housekeeping utilities for the tutoring-notes app. ~1-1.5 hour scope combined. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `scripts/blob-cleanup.mjs` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\blob-cleanup.mjs`. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name.

## Branch discipline

**You are starting in a workspace where the active branch may be ANYTHING.** Cursor's per-workspace git state persists across chats; do not assume `master`. Your FIRST action after the read-first reads is to set up the branch correctly.

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                # if uncommitted changes exist, STOP and ask the user
git fetch origin                                          # retry on transient DNS failures (Andrew's git-push-retry rule applies)
git checkout master                                       # switch to master
git pull origin master                                    # fast-forward
git log -1 --format='%H %s'                               # expect a tip that includes the cost-events merge (or later); if older, STOP
git checkout -b chore/housekeeping-utilities              # branch off master
git status                                                # confirm clean tree on new branch
```

**After branch setup:**
- Push after Commit 1: `git push -u origin chore/housekeeping-utilities`. Triggers Vercel Preview deploy.
- Smoke happens locally for these scripts (they're CLI tools, not user-facing app code). No Preview URL interaction required.
- **NEVER push directly to master.** Branch → commit → push → smoke → wait for Andrew → merge.

## Project context

Live commercial-pilot app. Two small operational utilities, both purely additive (zero touch to app code, zero migration, zero CSP/middleware changes):

1. **Vercel Blob cleanup utility** (`scripts/blob-cleanup.mjs`) — finds orphaned blobs in Vercel Blob storage that no longer have a DB reference, supports dry-run + delete modes with safety guards. Pre-existing Phase 2 task 11; promoted ahead of full Phase 2 because test data is stacking up.
2. **Stale-branch sweep utility** (`scripts/branch-sweep.mjs`) — identifies merged or stale branches (local + remote) and supports dry-run + delete modes with safety guards. Pre-existing Phase 2 task 12.

Both follow the same "destructive op with safety guards" pattern: `--dry-run` default, explicit `--delete` to actually do work, hardcoded refusals on critical resources.

**Critical safety constraint #1 from Andrew (per master plan task 11)**: blob cleanup is destructive against PROD blob storage. It MUST be tested against a prod-DB-mirror in dev BEFORE running against prod. The script supports that workflow (dev DB URL + prod Blob read-only access for orphan detection); actual `--delete` against prod must run with explicit prod env vars during a low-traffic window. Bake this into the script's safety documentation, NOT just into the runbook.

**Critical safety constraint #2 from Andrew (2026-05-17 5:14 PM clarification — DUAL-DB REFERENCE CHECK MANDATORY)**: Vercel Blob is a single shared store across all environments (no per-env splitting yet — slotted as a separate Phase 2 task). Vercel Preview deploys now point at the Neon **dev** branch DB, so blobs uploaded during Preview testing have references ONLY in dev DB, not prod DB. From prod DB's perspective these look like orphans, but they are LIVE in dev DB and deleting them would break dev. **The cleanup utility MUST query BOTH prod and dev DBs for blob references and only delete if NEITHER references the blob.** This is non-negotiable safety; do not ship a single-DB-check version. Implementation: require BOTH `PROD_DATABASE_URL` and `DEV_DATABASE_URL` env vars (or `--prod-db-url` and `--dev-db-url` CLI flags); script HARD-EXITs if either is missing (no "I'll just skip the missing one" fallback). When a blob is detected, run the orphan check against BOTH DBs; orphan = not referenced in prod AND not referenced in dev. Log clearly which DB references each non-orphan blob (`[blob-cleanup] blb=<id> KEEP url=<url> referenced-in=prod` or `referenced-in=dev` or `referenced-in=prod,dev`).

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions: per-session ID logging (you'll add 3-letter prefixes for your scripts' logs; suggest `blb` for blob cleanup, `brs` for branch sweep), CSP discipline (n/a — no app code), the merging convention.
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\scripts\` — list existing scripts to match style/conventions:
   ```powershell
   Get-ChildItem scripts | ForEach-Object { $_.Name }
   ```
   Existing: `build-b3b4-transcript-doc.mjs`, `copy-pdfjs-worker.mjs`, `create-admin.mjs`, `migrate-with-retry.mjs`, `push-schema-neon.ps1`. Read 1-2 of the `.mjs` ones to match patterns: import style (likely ESM `.mjs`), argv parsing, `console.log` format, error handling.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\blob.ts` — read fully. This is the canonical Vercel Blob client wrapper. The cleanup script reuses its `@vercel/blob` SDK pattern (LIST + DELETE operations).
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\prisma\schema.prisma` — find the three blob-storing entity fields:
   - `SessionRecording.blobUrl`
   - `WhiteboardAsset.blobUrl` (verify exact name)
   - `WhiteboardSession.snapshotBlobUrl` (verify exact name)
   These are the three DB columns the cleanup script must cross-reference against the Blob LIST to find orphans.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\package.json` — confirm `@vercel/blob` is in dependencies (it is; used by `src/lib/blob.ts`). No new deps needed.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\LOCAL-DEV.md` — read briefly; you'll add a section on the prod→dev DB mirror harness for safe destructive-op testing.

## YOUR SCOPE — what is IN this chat

### Group A: Vercel Blob cleanup utility (`scripts/blob-cleanup.mjs`) — ~45-60 min

**Commit 1 — Core script** at `scripts/blob-cleanup.mjs`.

Behavior:
1. **Inputs (env or CLI)**: `PROD_DATABASE_URL` AND `DEV_DATABASE_URL` (both REQUIRED — see safety constraint #2 above; script HARD-EXITs if either is missing), `BLOB_READ_WRITE_TOKEN` (Vercel Blob token — single shared store across envs), `--dry-run` (default true), `--delete` (must be explicit), `--min-age-days N` (default 7 — never touch blobs younger than this; protects against race conditions where blob exists but DB row pending), `--max-deletions N` (default 50 — safety cap; explicit `--no-limit` to override), `--prefix <path>` (optional; restrict to blobs under a prefix).
2. **Logic**:
   - (a) Open TWO PrismaClient instances — one against `PROD_DATABASE_URL`, one against `DEV_DATABASE_URL`. Wrap in try/finally so both `$disconnect()` no matter what.
   - (b) LIST all blobs in the configured Vercel Blob store.
   - (c) Pre-load reference sets from BOTH DBs: `prodRefs = Set<url>` = union of `SessionRecording.blobUrl`, `WhiteboardAsset.blobUrl`, `WhiteboardSession.snapshotBlobUrl` from prod DB; `devRefs = Set<url>` = same union from dev DB. Use `SELECT blobUrl FROM ...` (NOT full-object fetches; URLs only).
   - (d) For each blob URL: if in `prodRefs` → log `KEEP referenced-in=prod` (also log `+dev` if also in devRefs); if in `devRefs` only → log `KEEP referenced-in=dev`; if in NEITHER and blob older than `--min-age-days` → mark as orphan candidate.
   - (e) Print full orphan list with size + age + which DBs were checked (proves dual-check ran).
   - (f) If `--delete`, delete each (with rate-limit aware backoff: 100ms between calls, 10s on 429); if `--dry-run`, just print "WOULD DELETE: <url> (age=Xd, size=Y)".
3. **Safety refusals** (the script HARD-EXITs on these, no override unless noted):
   - Refuse if EITHER `PROD_DATABASE_URL` or `DEV_DATABASE_URL` is missing. NO fallback to single-DB mode — operator must explicitly provide both. Exit message must say "DUAL-DB CHECK REQUIRED: both PROD_DATABASE_URL and DEV_DATABASE_URL must be set; see bootstrapper safety constraint #2".
   - Refuse if `PROD_DATABASE_URL === DEV_DATABASE_URL` (operator misconfiguration — would make the dual-check a no-op).
   - Refuse if both `--dry-run` AND `--delete` are passed (contradictory).
   - Refuse to delete more than `--max-deletions` per run without `--no-limit`.
   - Refuse to start if either DB connection fails the initial `$connect()` — better to fail fast than mid-stream after partial deletes.
4. **Logging**: every action logged with `[blob-cleanup] blb=<scriptRunId> ...` prefix per AGENTS.md. Generate a `scriptRunId` UUID at script start. At start, log the dual-DB hostnames so the operator can confirm scoping: `[blob-cleanup] blb=<id> prod-db-host=<hostname> dev-db-host=<hostname> blob-store-token-prefix=<first 8 chars>`. Print summary at end: `LISTED <n>, REF-PROD <p>, REF-DEV <d>, REF-BOTH <b>, ORPHANS <m>, DELETED <k> (or WOULD-DELETE if dry-run)`.

**Commit 2 — Documentation** at `docs/handoff/` is NOT the right place (that's for executor briefings); put the runbook directly in the script header as a multi-line JSDoc-style comment, OR a sibling `scripts/blob-cleanup.README.md`. Cover:
- The required env vars + how to set them (point at `.env` discipline).
- The recommended workflow: (i) snapshot prod Neon to dev DB; (ii) run `--dry-run` against dev DB + prod Blob; (iii) inspect the orphan list manually; (iv) only THEN run `--delete` with prod DB + prod Blob during low-traffic.
- Examples: `node scripts/blob-cleanup.mjs` (dry-run default), `node scripts/blob-cleanup.mjs --delete --max-deletions 10`, etc.

**Commit 3 — Unit tests (light)** in `src/__tests__/scripts/blob-cleanup.test.ts` (if test directory structure supports — otherwise inline in the script via a `--self-test` flag that runs the orphan-detection logic against mock data). Verify: (a) orphan detection correctly identifies blobs not referenced in EITHER prod or dev DB (across all 3 columns each); (b) `--min-age-days` filter excludes recent blobs; (c) `--max-deletions` enforces the cap; (d) safety refusal triggers when both `--dry-run` and `--delete` are passed; (e) safety refusal triggers when `PROD_DATABASE_URL` is missing; (f) safety refusal triggers when `DEV_DATABASE_URL` is missing; (g) safety refusal triggers when prod and dev DB URLs are identical; (h) a blob referenced ONLY in dev DB is correctly preserved (NOT marked orphan) — this is the critical case that the dual-DB check exists to handle; (i) a blob referenced in prod is preserved regardless of dev DB state.

### Group B: Stale-branch sweep utility (`scripts/branch-sweep.mjs`) — ~30-45 min

**Commit 4 — Core script** at `scripts/branch-sweep.mjs`.

Behavior:
1. **Inputs (CLI only)**: `--dry-run` (default true), `--delete` (must be explicit), `--stale-days N` (default 30 — branches with last-commit-date older than this are flagged as "stale"), `--keep <pattern>` (repeatable; defaults to `master`, `HEAD`, current-checked-out).
2. **Logic**: (a) `git fetch --prune origin`; (b) list all local branches + all `origin/*` branches (excluding `--keep` patterns); (c) for each branch, check `git merge-base --is-ancestor <branch-tip> master` — if yes, branch is "merged"; (d) for branches NOT merged, check last-commit-date — if older than `--stale-days`, flag as "stale-not-merged"; (e) print grouped output: `## MERGED LOCAL`, `## MERGED REMOTE`, `## STALE-NOT-MERGED (no auto-delete)`; (f) if `--delete`, run `git branch -d <branch>` for merged-local and `git push origin --delete <branch>` for merged-remote; **never auto-delete stale-not-merged** (those need human judgment).
3. **Safety refusals** (HARD-EXIT, no override):
   - Refuse to delete `master` or `origin/master` or `origin/HEAD` even if in delete-candidate list (logic bug guard).
   - Refuse to delete currently-checked-out branch.
   - Refuse to delete any branch matching `--keep` patterns.
4. **Logging**: `[branch-sweep] brs=<scriptRunId> ...` prefix. Generate UUID at start. Print summary: `LOCAL: deleted <n>/<total>, REMOTE: deleted <m>/<total>, STALE-NOT-MERGED: flagged <k>`.

**Commit 5 — Documentation** — runbook in script header or sibling `scripts/branch-sweep.README.md`. Examples: `node scripts/branch-sweep.mjs` (dry-run), `node scripts/branch-sweep.mjs --delete`, `node scripts/branch-sweep.mjs --stale-days 60 --delete --keep 'feature/long-running-*'`.

**Commit 6 — Unit tests (light)** if practical — mostly the safety refusals (master, current-branch, keep-patterns). The git-porcelain parts are hard to unit-test cleanly; skip if it'd require heavy git fixture setup.

### Group C: Docs + ID-prefix registration — ~10 min

**Commit 7 — Update `AGENTS.md`** to register `blb` and `brs` ID prefixes in the per-session-ID-logging section. ONE-LINE addition each; don't restructure.

**Commit 8 — Add to `docs/LOCAL-DEV.md`** a brief section on the prod→dev DB mirror harness for safe destructive-op testing (pg_dump | psql pattern or Neon branch copy). This is a reusable pattern: any future destructive-op script should follow this discipline.

## SMOKE CHECKLIST FOR USER

Run locally — these are CLI utilities, no Preview URL needed.

### Blob cleanup
- [ ] Set up env: `PROD_DATABASE_URL` = Neon prod branch, `DEV_DATABASE_URL` = Neon dev branch (BOTH required), `BLOB_READ_WRITE_TOKEN` = shared Vercel Blob store token.
- [ ] **Dual-DB enforcement check**: Run `node scripts/blob-cleanup.mjs` with ONLY `PROD_DATABASE_URL` set (unset `DEV_DATABASE_URL`) → script HARD-EXITs with the dual-DB-required message. Symmetric: only `DEV_DATABASE_URL` set → also HARD-EXITs.
- [ ] **Identical-URL refusal check**: Run with `PROD_DATABASE_URL === DEV_DATABASE_URL` → script HARD-EXITs.
- [ ] Run `node scripts/blob-cleanup.mjs` (dry-run with both DBs). Verify start-of-run log shows BOTH DB hostnames (`prod-db-host=... dev-db-host=...`). Verify output: lists blobs, identifies orphans (only those not in EITHER DB), no actual deletes. No errors.
- [ ] Spot-check 2-3 of the listed orphans — query BOTH prod AND dev DBs for their URLs to confirm they really have no reference in either.
- [ ] **Dual-DB safety smoke (the critical one)**: Take one blob URL that's referenced in dev DB but NOT prod DB (likely exists since recent Preview testing wrote to shared Blob store + dev DB) and verify the script logs it as `KEEP referenced-in=dev` — NOT as an orphan candidate. If it shows up as an orphan, the dual-DB check is broken; STOP and fix before any deletion.
- [ ] Try `node scripts/blob-cleanup.mjs --delete --dry-run` → script refuses (contradictory flags).
- [ ] Try `node scripts/blob-cleanup.mjs --delete --max-deletions 0 --no-limit` (carefully) — verify it's willing to delete but encounters 0 candidates if env is clean.
- [ ] Do NOT run `--delete` against prod yet. That's a separate operational step Andrew runs during a maintenance window, with dual-DB enforcement providing the safety net.

### Branch sweep
- [ ] Run `node scripts/branch-sweep.mjs` (dry-run). Verify output: lists merged-local + merged-remote + stale-not-merged groups. Counts make sense vs `git branch -a`.
- [ ] Sanity-check: `master` is NOT in any delete candidates; current branch (`chore/housekeeping-utilities`) is NOT in candidates.
- [ ] Try `node scripts/branch-sweep.mjs --delete --keep master --keep chore/housekeeping-utilities` on a non-critical local merged branch (e.g. an old phase branch you already merged) — verify it deletes one and reports success. Confirm the branch is gone via `git branch`.
- [ ] Verify the script handles the duplicate `phase-4*` / `pdf-*` / `live-av-*` branches Andrew has piled up — they should ALL show up as merged-local + merged-remote candidates if their merge commits landed in master.

### Tests + lint
- [ ] `npx jest src/__tests__/scripts` (or wherever you placed tests) → green.
- [ ] `npx tsc --noEmit` clean (scripts are `.mjs` but TS may still validate via JSDoc).
- [ ] `npx eslint scripts/` 0 errors (warnings from pre-existing files OK).

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin chore/housekeeping-utilities`.
4. Report back to Andrew with:
   - **Branch name**: `chore/housekeeping-utilities`
   - **Test counts** (passed / failed; flag new failures)
   - **Scripts delivered** (the two `.mjs` files + their `--help` output as a quick reference)
   - **Smoke checklist** (full list above)
   - **Notable findings** (e.g. number of orphan blobs detected during dry-run; number of stale branches found)
   - **Deferred items** (nothing should be deferred at this scope; flag if you ran out of time on Group C)
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff chore/housekeeping-utilities
   git push origin master
   ```

## STOP CONDITIONS

- **Don't change app behavior.** Scripts only. No `src/` file modifications (except light test files under `src/__tests__/scripts/` if your test convention puts them there).
- **Don't run `--delete` against prod blobs as part of this build.** That's an operational step Andrew runs explicitly. Your smoke is dry-run + small-scope local tests only.
- **Don't run `--delete` against any branch you didn't intentionally pick** during smoke. Andrew's test would be on a known-merged branch he can recreate if needed.
- **Don't bypass safety refusals.** If a safety refusal triggers during smoke, that's correct behavior — don't add an override flag to "make it work."
- **Don't add new package.json deps.** Both scripts must work with already-installed packages (`@vercel/blob`, Node built-ins, `@prisma/client`).
- **Don't touch `prisma/schema.prisma` or generate migrations.** Pure runtime queries against the existing schema.
- **Don't merge to master yourself.** Branch + push + smoke + WAIT for Andrew's go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation.
- Per-session ID logging mandatory. Use `blb` for blob-cleanup logs, `brs` for branch-sweep logs.
- Safety-by-default: `--dry-run` is the default mode for BOTH scripts.
- Refuse-by-default on critical resources: `master`, currently-checked-out branch, prod-DB + prod-Blob combo without explicit allow flag.
- Reuse existing patterns. Both scripts should look and feel like the existing `scripts/*.mjs` files.
