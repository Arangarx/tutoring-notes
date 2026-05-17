# Cost-event logging skeleton — executor briefing (Phase 9 early action)

You are running a Phase 9 early-action build for the tutoring-notes app. Composer-class. ~2-4 hour scope. **Branch + smoke + direct merge to master per AGENTS.md merging convention** — NO PR step.

## Workspace + path discipline (read carefully)

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `prisma/schema.prisma` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\prisma\schema.prisma`. Verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`).

## Branch discipline (read carefully)

**You are starting in a workspace where the active branch may be ANYTHING.** Cursor's per-workspace git state persists across chats; do not assume `master`. Your FIRST action after the read-first reads is to set up the branch correctly.

Run in PowerShell, sequentially, verifying each succeeds:

```powershell
git status                                                    # observe state; if uncommitted changes exist, STOP and ask the user
git fetch origin                                              # pull latest refs (may DNS-hiccup; retry once if so)
git checkout master                                           # switch to master
git pull origin master                                        # fast-forward; if conflict, STOP and ask
git log -1 --format='%H %s'                                   # expect ac92137 (live-av merge) or 7927a94 (Mynk doc cleanup) or later
git checkout -b feat/cost-event-logging-skeleton              # branch off current master
git status                                                    # confirm clean tree on new branch
```

If `git log -1` shows master older than `ac92137`, STOP and tell the user — master is older than expected.

**After branch setup:**
- Push after Commit 1: `git push -u origin feat/cost-event-logging-skeleton`. Triggers a Vercel Preview deploy.
- ALL verification happens against the **branch Vercel Preview URL**, NEVER against `tutoring-notes.vercel.app` (production where Sarah's real sessions live).
- **NEVER push directly to master.** Branch → commit → push → smoke → wait for Andrew → merge to master (merge step is in FINAL STEPS; do NOT run it until Andrew confirms).

## Project context

Live commercial-pilot app. This is the **Phase 9 early action** — laying the cost-observability foundation so that when the admin dashboard (Phase 9 proper) and billing platform (Phase 10) land, we already have months of cost data. Without this skeleton in place, every OpenAI call goes into the void and we have no idea what each session actually costs.

**This is foundation work, not user-facing.** No UI changes. No app-behavior changes (the existing recording/transcription/notes flow is untouched except for additive `logCostEvent` calls). Smoke surface is small: verify the migration applies cleanly, verify cost events log correctly when transcription + notes generation run, verify unit tests pass.

**Why this is the right "early action" before Phase 9 proper**: by the time we build the actual cost dashboard in Phase 9 proper, we want historical data already in the table. Slotting this in now means weeks-to-months of real cost-per-session data is sitting in the DB ready to query when the dashboard arrives.

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions, especially: per-session ID logging (you'll add `cev` as the cost-event prefix), additive migration discipline, the merging convention.
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\prisma\schema.prisma` — read the full file to understand the existing model/enum patterns. `CostEvent` will follow the existing patterns (uuid PK, indexed FKs, timestamps).
3. **Find OpenAI call sites via grep.** Run:
   ```powershell
   Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String -Pattern "openai|OpenAI|whisper|Whisper" -List | Select-Object -ExpandProperty Path
   ```
   Or use the Grep tool with pattern `openai|OpenAI|whisper|Whisper` on `src/`. Expected hits include (but verify):
   - `src/lib/transcribe-ffmpeg.ts` — Whisper transcription call path (the big one — every session's audio goes through here).
   - `src/app/admin/students/[id]/transcribe-result.ts` — transcription result handling.
   - `src/app/admin/students/[id]/whiteboard/actions.ts` — server actions for whiteboard recordings (notes generation likely lives here).
   - `src/app/admin/students/[id]/actions.ts` — server actions for sessions.
   - Possibly `src/lib/env.ts` (just env reading; not a call site).
   - Tests files matching those patterns can be ignored as call-site insertion targets but read them for shape expectations.
4. Read each call site you identify and understand:
   - WHAT model is being called (Whisper-1, GPT-4o, GPT-4o-mini, etc. — capture the model name as a string).
   - WHAT it costs per unit (input tokens / output tokens / audio minutes for Whisper).
   - WHERE you can intercept to capture token counts / minute counts from the response.
   - Whether the OpenAI client is shared (likely one factory) or instantiated per-call.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\RECORDER-LIFECYCLE.md` — for the `wbsid`/`rid` per-session-ID patterns (skim only — you'll mimic the prefix scheme with `cev`).

## YOUR SCOPE — what is IN this chat

**Goal**: Add a `CostEvent` table + a `logCostEvent()` utility + insertions at every server-side OpenAI call site. Zero behavior change for users; we just start logging cost-relevant metadata to the DB.

### Schema design (Commit 1)

Add to `prisma/schema.prisma`:

```prisma
enum CostEventKind {
  WHISPER_TRANSCRIPTION
  GPT_NOTES_GENERATION
  GPT_ASSESSMENT_EXTRACTION
  // Add more as new OpenAI features are wired; never remove.
}

model CostEvent {
  id              String         @id @default(uuid())
  kind            CostEventKind
  model           String         // e.g. "whisper-1", "gpt-4o-mini-2024-07-18" — capture the exact model string from the OpenAI response
  
  // Usage metrics (nullable so different kinds populate different fields)
  inputTokens     Int?
  outputTokens    Int?
  audioSeconds    Float?         // for Whisper — captured from input duration, not response
  
  // Computed cost (nullable — fill if you can compute deterministically from a price table; null if pricing data not available)
  estimatedCostUsd Decimal?      @db.Decimal(10, 6)  // 6 decimal places (millionths of a dollar)
  
  // Provenance
  adminUserId     String?        // who triggered the call (multi-tenant scoping for the future)
  adminUser       AdminUser?     @relation(fields: [adminUserId], references: [id], onDelete: SetNull)
  studentId       String?        // which student's session this was for
  student         Student?       @relation(fields: [studentId], references: [id], onDelete: SetNull)
  sessionRecordingId String?     // optional FK to SessionRecording if applicable
  sessionRecording SessionRecording? @relation(fields: [sessionRecordingId], references: [id], onDelete: SetNull)
  whiteboardSessionId String?    // optional FK to WhiteboardSession if applicable
  whiteboardSession WhiteboardSession? @relation(fields: [whiteboardSessionId], references: [id], onDelete: SetNull)
  
  // Debug / future analysis
  metadata        Json?          // free-form: prompt hash, response truncation flag, retry count, etc.
  
  createdAt       DateTime       @default(now())
  
  @@index([kind, createdAt])
  @@index([adminUserId, createdAt])
  @@index([studentId, createdAt])
  @@index([createdAt])
}
```

Add the back-relations on `AdminUser`, `Student`, `SessionRecording`, `WhiteboardSession`:

```prisma
// In AdminUser model:
costEvents      CostEvent[]

// In Student model:
costEvents      CostEvent[]

// In SessionRecording model:
costEvents      CostEvent[]

// In WhiteboardSession model:
costEvents      CostEvent[]
```

Generate the migration with `npx prisma migrate dev --name add_cost_events`. **Migration MUST be additive** (per AGENTS.md) — verify the generated SQL only does `CREATE TABLE` + `CREATE INDEX`, no `DROP` or `RENAME`. If the migration tries to drop anything, STOP and ask.

**Commit 1**: `feat(cost-events): add CostEvent table for OpenAI cost observability`

### Utility lib (Commit 2)

Create `src/lib/observability/cost-events.ts`:

```ts
import { prisma } from "@/lib/prisma";  // verify the actual import path during read-first
import type { CostEventKind } from "@prisma/client";

export interface LogCostEventInput {
  kind: CostEventKind;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;  // utility wraps to Decimal for storage
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Log an OpenAI cost event. Best-effort; failures are caught + logged but NEVER throw,
 * so the calling path (transcription, notes generation, etc.) is not affected by
 * observability infrastructure issues.
 *
 * Per-session ID logging: emits `[cost-events] cev=<uuid> kind=<kind> model=<model> ...` on success
 * and `[cost-events] cev=FAIL kind=<kind> error=<msg>` on failure.
 */
export async function logCostEvent(input: LogCostEventInput): Promise<void> {
  try {
    const created = await prisma.costEvent.create({
      data: {
        kind: input.kind,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        audioSeconds: input.audioSeconds,
        estimatedCostUsd: input.estimatedCostUsd != null ? new Prisma.Decimal(input.estimatedCostUsd) : null,
        adminUserId: input.adminUserId,
        studentId: input.studentId,
        sessionRecordingId: input.sessionRecordingId,
        whiteboardSessionId: input.whiteboardSessionId,
        metadata: input.metadata as any,
      },
    });
    console.log(`[cost-events] cev=${created.id} kind=${input.kind} model=${input.model} inTokens=${input.inputTokens ?? "n/a"} outTokens=${input.outputTokens ?? "n/a"} audioSec=${input.audioSeconds ?? "n/a"} costUsd=${input.estimatedCostUsd ?? "n/a"}`);
  } catch (err) {
    console.error(`[cost-events] cev=FAIL kind=${input.kind} model=${input.model} error=${err instanceof Error ? err.message : String(err)}`);
    // Swallow — observability MUST NOT break the calling path.
  }
}
```

Pricing table — add a separate exported helper `estimateCostUsd()` for common models. Even rough estimates are useful; capture the actual OpenAI pricing at time of writing (Whisper $0.006/min, gpt-4o-mini $0.00015/1K input tokens + $0.0006/1K output tokens, etc. — verify current OpenAI pricing during build). Mark pricing constants with a comment indicating when they were captured + a TODO to keep them updated.

Add unit tests in `src/lib/observability/__tests__/cost-events.test.ts`:
- Happy path: `logCostEvent` writes a row with correct fields.
- Error path: if Prisma throws, `logCostEvent` does not throw + logs the error.
- Pricing helper: each known kind+model combo computes a sensible non-negative cost.
- Pricing helper: unknown model returns `undefined` (caller stores null estimatedCostUsd).

**Commit 2**: `feat(cost-events): logCostEvent utility + pricing helper + unit tests`

### Call site insertions (Commit 3 — or batched/split per call site, executor's call)

For EACH OpenAI call site identified in read-first, add a `logCostEvent` call IMMEDIATELY after the OpenAI response is received (BEFORE any downstream processing that might throw). Capture:

- **Whisper transcription**: `kind: WHISPER_TRANSCRIPTION`, `model` from response or the model string passed to the call, `audioSeconds` from the audio file duration (you may need to capture this earlier in the flow), `estimatedCostUsd` via the helper, contextual FKs (`adminUserId`, `studentId`, `sessionRecordingId` or `whiteboardSessionId` if available).
- **GPT notes generation**: `kind: GPT_NOTES_GENERATION`, `model`, `inputTokens` + `outputTokens` from `response.usage`, `estimatedCostUsd`, contextual FKs.
- **GPT assessment extraction (if separate from notes)**: `kind: GPT_ASSESSMENT_EXTRACTION`, same fields.

**Critical**: `logCostEvent` is fire-and-forget — `await` it (so the promise is exercised), but if it throws (it shouldn't, the utility swallows), the call site MUST proceed. **Do NOT wrap any caller in try/catch around `logCostEvent`** — the utility handles its own errors. Adding extra try/catch at call sites is noise.

If a call site doesn't have easy access to `adminUserId` / `studentId` / etc., pass `null` — partial provenance is fine, the cost still gets logged.

**Commit 3** (or split per call site): `feat(cost-events): instrument <call-site>` — one commit per call site is fine if it keeps history clean.

### Docs (Commit 4)

Update `AGENTS.md` "Per-session ID logging" section to register `cev` (cost event) as a new prefix. ONE-LINE addition; don't restructure the surrounding content.

Optional: add a brief `docs/COST-OBSERVABILITY.md` summarizing:
- What `CostEvent` captures + why it exists (foundation for Phase 9 admin dashboard).
- Where call sites are (so the Phase 9 dashboard build knows where data comes from).
- How to query cost-per-session, cost-per-tutor, cost-per-student via Prisma examples.
- TODO list for future cost tracking (e.g., Vercel function compute cost, Neon DB cost, Blob storage cost — out of scope for this skeleton).

**Commit 4**: `docs(cost-events): register cev ID-prefix + add cost observability primer`

## SMOKE CHECKLIST FOR USER

Andrew runs this against the branch Preview URL. Don't merge until Andrew confirms.

### Migration applies
- [ ] Branch Preview build green on Vercel.
- [ ] Production migration runs cleanly on the Neon preview DB (Vercel build logs show `prisma migrate deploy` succeeded — additive `CREATE TABLE costevent` + indexes only).
- [ ] No existing data affected.

### Cost events log on transcription
- [ ] Start a recording in a test session, end-session with a short audio clip (~30s is fine — small enough to transcribe quickly).
- [ ] Wait for transcription to complete.
- [ ] Open Prisma Studio (`npx prisma studio`) OR query DB directly. Verify a `CostEvent` row exists with `kind = WHISPER_TRANSCRIPTION`, sensible `audioSeconds`, sensible `estimatedCostUsd`, correct FK back to the session.

### Cost events log on notes generation
- [ ] Trigger AI notes generation for that test session.
- [ ] Verify a second `CostEvent` row appears with `kind = GPT_NOTES_GENERATION`, sensible token counts, sensible cost.

### Failure path
- [ ] Optional: temporarily break the DB connection mid-flight (e.g., wrong DATABASE_URL in a test env), verify transcription + notes still complete (cost event silently failed-logged, app behavior unchanged).

### Regression non-regressions
- [ ] Transcription completes correctly (cost-events instrumentation didn't break it).
- [ ] AI notes generation completes correctly.
- [ ] Session recording end-to-end still works.

### Tests + lint
- [ ] `npx jest src/lib/observability` → green.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint` 0 errors (warnings from pre-existing files OK).

## WRAP-UP

1. Full test suite: `npx jest` (modulo documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin feat/cost-event-logging-skeleton`.
4. Report back to Andrew with:
   - **Branch name**: `feat/cost-event-logging-skeleton`
   - **Preview URL** (deterministic from branch name; confirm in Vercel dashboard if different)
   - **Test counts** (passed / failed; flag new failures)
   - **Call sites instrumented** (which files + which OpenAI operation each covers)
   - **Pricing constants captured** (which OpenAI prices you used, when captured)
   - **Smoke checklist** (full list above)
   - **Deferred items** (e.g., Vercel function compute cost, Blob storage cost, DB cost — note these as future work)
5. **STOP and wait for Andrew's smoke confirmation. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**:
   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff feat/cost-event-logging-skeleton
   git push origin master
   ```

## STOP CONDITIONS

- **Don't change app behavior.** This is observability-only. No UI changes, no transcription/notes logic changes, no error-handling changes outside the additive `logCostEvent` calls.
- **Don't make `logCostEvent` throw.** Ever. It must swallow + log its own errors. The transcription/notes path MUST proceed regardless of observability infrastructure state.
- **Don't add a try/catch around `logCostEvent` at call sites.** Adding redundant error handling is noise.
- **Don't drop or rename existing schema fields.** Migration must be purely additive per AGENTS.md.
- **Don't restructure AGENTS.md.** Add the `cev` line in the existing per-session-ID-logging section; don't touch anything else.
- **Don't touch `scripts/`** — that's reserved for a different concurrent or upcoming chat.
- **Don't touch live-A/V or whiteboard or recording feature code.** Cost-events is server-side observability; AV/whiteboard/recording is client-side feature code. Disjoint by design.
- **Don't merge to master yourself.** Branch + push + smoke + WAIT for Andrew's go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation.
- Per-session ID logging mandatory. Use the `cev` prefix you're registering.
- Migration must be additive (no DROP, no RENAME).
- Smoke against the **branch Vercel Preview URL** only. Never smoke against production.
- Best-effort observability. Cost-event logging failures NEVER block the calling path.
