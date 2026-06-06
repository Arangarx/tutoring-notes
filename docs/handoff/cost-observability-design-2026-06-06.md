# Cost / Usage Observability Design — 2026-06-06

> **Status:** Design pass complete. Awaiting Andrew ratification of Q1–Q10 (recommended defaults provided).
>
> **Epic:** V1-GATING — full usage tracking + per-call cost tracking ships WITH v1. Admin dashboard integration.
>
> **First need (upfront):** A defensible per-session cost estimate Andrew can price against TODAY, before v1 ships.

---

## Contents

1. [Cost model + worked per-session example](#1-cost-model--worked-per-session-example)
2. [Rate-card design](#2-rate-card-design)
3. [Instrumentation design — expanding `cev`](#3-instrumentation-design--expanding-cev)
4. [Admin dashboard surfaces](#4-admin-dashboard-surfaces)
5. [Reconciliation vs provider billing](#5-reconciliation-vs-provider-billing)
6. [Phasing](#6-phasing)
7. [5-axis reliability note](#7-5-axis-reliability-note)
8. [Open questions (Q1–Q10)](#8-open-questions-q1q10)

---

## 1. Cost model + worked per-session example

### 1.1 The stack's cost sources

| Source | Billing unit | Who measures it | Variable per session? |
|--------|-------------|-----------------|----------------------|
| **OpenAI Whisper** (transcription) | $/audio-minute | OpenAI API (usage in response) | ✅ Yes — proportional to session length |
| **OpenAI GPT-4o-mini** (notes gen) | $/1M tokens (input + output) | OpenAI API (usage in response) | ✅ Yes — proportional to transcript length |
| **Vercel Blob** (audio storage) | $/GB/month | Vercel dashboard / API | ✅ Yes — proportional to recording size × retention |
| **Vercel Blob egress** (audio playback) | $/GB transferred | Vercel dashboard / API | ✅ Yes — per playback |
| **Vercel compute** (function execution) | $/GB-hr provisioned memory | Vercel dashboard | Mostly flat ($20/seat credit) |
| **Vercel Fast Data Transfer** (HTML/JS/API) | $/GB after 1 TB included | Vercel dashboard | Negligible per session |
| **Neon** (Postgres) | $/CU-hour + $/GB-month storage | Neon dashboard | Near-zero variable; dominated by fixed active compute |

### 1.2 Current pricing (verified June 2026)

> **All rates below have been independently verified from provider documentation as of 2026-06-06. Rates are locked in the rate-card (§2) and flagged for staleness review. See source citations at each line.**

| Line item | Rate | Source (verified 2026-06-06) |
|-----------|------|------------------------------|
| whisper-1 transcription | **$0.006 / audio-minute** | [OpenAI API docs — whisper-1 model](https://developers.openai.com/api/docs/models/whisper-1); also confirmed at [costgoat.com](https://costgoat.com/pricing/openai-transcription) |
| gpt-4o-mini-transcribe (future) | $0.003 / audio-minute | Same sources — available for migration if quality acceptable |
| gpt-4o-mini chat input | **$0.15 / 1M tokens** | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing); [pricepertoken.com](https://pricepertoken.com/pricing-page/model/openai-gpt-4o-mini) |
| gpt-4o-mini chat output | **$0.60 / 1M tokens** | Same sources |
| Vercel Blob storage | **$0.023 / GB-month** | [Vercel pricing page](https://vercel.com/pricing) |
| Vercel Blob egress (data transfer) | **$0.05 / GB** | Vercel pricing page |
| Vercel Fast Data Transfer overage | $0.15 / GB above 1 TB/month | Vercel pricing page |
| Vercel provisioned memory | **$0.0212 / GB-hr** | Vercel pricing page |
| Vercel base plan | $20 / seat / month (includes $20 usage credit) | Vercel pricing / Pro plan docs |
| Neon compute (Launch) | **$0.106 / CU-hour** | [Neon pricing page](https://neon.com/pricing) |
| Neon storage (Launch) | **$0.35 / GB-month** | Neon pricing page |
| Neon egress (Launch) | 500 GB/month included, then **$0.10/GB** | Neon pricing page |

**⚠️ Uncertainty flags:**
- Vercel compute metering for long-running serverless functions (>30s, up to the 300s Pro ceiling) involves both active CPU time and provisioned memory — **billing details in the Vercel dashboard are the authoritative source; per-session compute cost below is an upper-bound estimate**.
- Neon compute for a tutoring app with intermittent load will be dominated by scale-to-zero behavior; the estimate below uses active hours only.
- GPT-4o-mini prompt caching (input at $0.075/M for cache hits) is not reflected below — a conservative worst case.

---

### 1.3 Worked example: 60-minute whiteboard session

This is the **pricing-floor anchor** — the minimum Andrew needs to recover per session before any markup.

#### Inputs (representative session)

| Parameter | Value | Notes |
|-----------|-------|-------|
| Session duration | 60 minutes | Live whiteboard + audio |
| Audio bitrate | ~64 kbps Opus (browser-recorded WebM) | Typical browser MediaRecorder Opus output |
| Final audio blob size | ~28 MB | 64 kbps × 3600s / 8 = 28.8 MB |
| Transcript length | ~3,000 tokens | ~50 words/min average speech → 3,000 words → ~4,000 characters → ~1,000 tokens at 4 chars/token. Add Whisper verbose_json overhead: ~3,000 total input context tokens |
| Notes generation | 1 call to gpt-4o-mini | Single post-session call |
| Playback count | 2× (tutor reviews + parent view) | Per-session assumption |
| Blob retention | 30 days | Before cleanup |

> **Note on current pipeline:** Whisper currently runs via ffmpeg-split into 240-second (4-minute) chunks, up to 25 MB each, with inner-parallel 6 / outer 3 concurrency. For a 60-min session: 15 chunks × ~22 MB = ~330 MB pre-split. Whisper **costs on total audio duration**, not file size — the chunking cost is the same as one 60-min file. Storage cost is for the **final consolidated blob** only (per the re-architecture design).

#### Per-call cost breakdown

```
── OpenAI: Whisper transcription ─────────────────────────────────────
  60 audio-minutes × $0.006/min                         = $0.3600

── OpenAI: GPT-4o-mini notes generation ──────────────────────────────
  Input:  ~3,000 tokens × $0.15/1M                      = $0.00045
  Output: ~400 tokens   × $0.60/1M                      = $0.00024
  Notes subtotal                                         = $0.0007

── Vercel Blob: storage (1 session × 28 MB × 30-day retention) ───────
  0.0273 GB × $0.023/GB-month                           = $0.0006
  (amortized for 30-day hold; negligible if bulk cleanup runs)

── Vercel Blob: egress (2 playbacks × 28 MB) ─────────────────────────
  0.0547 GB × $0.05/GB                                  = $0.0027

── Vercel compute (function execution, upper-bound estimate) ─────────
  Transcription endpoint: ~90s @ 512 MB provisioned
  0.5 GB × (90s / 3600s/hr) × $0.0212/GB-hr            = $0.0003
  (typically within the $20/month credit — shown for completeness)

── Neon (variable per session) ───────────────────────────────────────
  DB writes ~few KB; compute is idle-suspended between sessions
  Variable cost per session                              ≈ $0.0001
  (Dominated by monthly fixed cost — see §1.4)

── TOTAL VARIABLE COST PER 60-MIN SESSION ────────────────────────────
                                                         ≈ $0.364
```

**Headline: ~$0.36 per 60-minute session in direct variable costs. Whisper transcription is the dominant cost (>98% of the OpenAI spend).**

#### Sensitivity table (session length)

| Session length | Whisper | GPT | Blob egress (2×) | Total variable |
|---------------|---------|-----|-----------------|----------------|
| 30 min | $0.18 | ~$0.001 | ~$0.001 | ~**$0.182** |
| 45 min | $0.27 | ~$0.001 | ~$0.002 | ~**$0.273** |
| 60 min | $0.36 | ~$0.001 | ~$0.003 | ~**$0.364** |
| 90 min | $0.54 | ~$0.001 | ~$0.004 | ~**$0.545** |

The linear Whisper cost is the overwhelming driver. GPT and storage are rounding errors at pilot scale.

---

### 1.4 Fixed platform costs (monthly, shared across all sessions)

These are not per-session but must be factored into pricing math:

| Cost | Amount/month | Notes |
|------|-------------|-------|
| Vercel Pro (1 seat) | **$20** | Includes $20 usage credit; covers current usage |
| Neon Launch (compute) | **~$5–15** | Depends on active hours; estimate 0.25 CU × 50 active-hours/month + idle = ~$1.32 compute + $0.35 × ~2 GB storage = ~$2–5/month. The dev/preview branches add ~$1.50/branch-month each; with 5-10 branches, $7.50–$15/month is realistic. |
| **Platform total** | **~$27–35/month** | |

---

### 1.5 Pricing-floor calculation (the number Andrew can price against)

**Scenario: one tutor running 20 sessions/month**

```
Variable costs:    20 sessions × $0.364             = $7.28
Fixed platform:                                      = $30  (midpoint estimate)
Total cost base:                                     = $37.28

At 2× margin (absorb miscalculation):               ≈ $75/month
Per session at 2× margin:                           ≈ $3.75/session
Per session at 3× margin (recommended for pricing): ≈ $5.60/session

Monthly SaaS price recommendation:
  - Floor (2× margin): $75/month/tutor
  - Conservative (3× margin): $113/month/tutor
  - Rounded to "safe floor": ~$79–$99/month/tutor
```

**Key insight for pricing:**
- **Cost grows linearly with session-hours.** A tutor running 40h/month of sessions doubles the variable cost.
- **If Andrew charges per session (add-on model):** floor is $2–4/session depending on margin.
- **If Andrew charges flat monthly:** floor scales with tutor's session volume. A "heavy" tutor (40 sessions/month) costs ~$50/month in variable + $30 fixed = $80. Price the flat plan above $80 for that profile.
- **The critical uncertainty is Vercel compute for long sessions.** If transcription/notes calls regularly hit 180–300s of serverless time, compute costs may exceed the $20 credit and add ~$1–5/month at typical usage. Monitor via Vercel dashboard at launch.

---

## 2. Rate-card design

### 2.1 Shape

A single versioned rate-card is the **single source of truth for `dollars = usage × rate`**. It does NOT auto-fetch from provider APIs (they don't expose machine-readable price lists). It is manually updated on provider price changes, with a staleness-flag job that alerts when verification is overdue.

**Recommended location: `src/lib/observability/rate-card.ts`** — a TypeScript constant object, committed to the repo, versioned by date in a comment.

```typescript
// src/lib/observability/rate-card.ts
// Rate-card version: 2026-06-06
// Sources: see docs/handoff/cost-observability-design-2026-06-06.md §1.2
// Next verification due: 2026-09-06 (90 days) — see staleness job in this file.

export const RATE_CARD_VERSION = "2026-06-06";
export const RATE_CARD_VERIFIED_AT = new Date("2026-06-06T00:00:00Z");
export const RATE_CARD_STALE_DAYS = 90; // flag after 90 days

// OpenAI
export const WHISPER_1_USD_PER_AUDIO_MINUTE = 0.006;
export const GPT_4O_MINI_TRANSCRIBE_USD_PER_AUDIO_MINUTE = 0.003; // future option
export const GPT_4O_MINI_INPUT_USD_PER_MTOK = 0.15;
export const GPT_4O_MINI_OUTPUT_USD_PER_MTOK = 0.60;

// Vercel (Pro plan, us-east-1 default region)
export const VERCEL_BLOB_STORAGE_USD_PER_GB_MONTH = 0.023;
export const VERCEL_BLOB_EGRESS_USD_PER_GB = 0.05;
export const VERCEL_FAST_DT_OVERAGE_USD_PER_GB = 0.15; // after 1 TB included
export const VERCEL_PROVISIONED_MEMORY_USD_PER_GB_HR = 0.0212;

// Neon (Launch plan)
export const NEON_COMPUTE_USD_PER_CU_HR = 0.106;
export const NEON_STORAGE_USD_PER_GB_MONTH = 0.35;
export const NEON_EGRESS_USD_PER_GB = 0.10; // after 500 GB included
```

### 2.2 Where it lives

| Concern | Design decision |
|---------|-----------------|
| **Source of truth** | `src/lib/observability/rate-card.ts` (TypeScript constants). Committed to repo. |
| **Update mechanism** | PR/commit when rates change — a one-line date + number update per rate. The git log is the audit trail. |
| **DB mirroring** | Not needed in Phase 1. If we eventually want historical cost reports that survive rate changes, add a `RateCardSnapshot` table (Phase 3+). For now, `CostEvent.estimatedCostUsd` is computed at event-write time using the then-current rate-card. |
| **Staleness flag** | A lightweight check in the admin dashboard: `if (now - RATE_CARD_VERIFIED_AT > RATE_CARD_STALE_DAYS × 86400000)` → show a warning banner. No cron needed; this runs on page render of the cost dashboard. |
| **Who updates it** | Andrew or orchestrator — after any OpenAI/Vercel/Neon pricing email or quarterly review. |

### 2.3 Staleness flag implementation (no cron required)

```typescript
// In the admin cost dashboard server component:
import { RATE_CARD_VERIFIED_AT, RATE_CARD_STALE_DAYS } from "@/lib/observability/rate-card";

function isRateCardStale(): boolean {
  const msSince = Date.now() - RATE_CARD_VERIFIED_AT.getTime();
  return msSince > RATE_CARD_STALE_DAYS * 24 * 60 * 60 * 1000;
}
```

A yellow banner in the cost view: "Rate card last verified 2026-06-06 (N days ago) — review [provider pricing links] and update `rate-card.ts`."

---

## 3. Instrumentation design — expanding `cev`

### 3.1 Current state (seed)

The existing `CostEvent` model (schema as of `a644ddd`) already has:
- `id`, `kind` (`CostEventKind` enum), `model` (string), `inputTokens`, `outputTokens`, `audioSeconds`, `estimatedCostUsd`
- FK provenance: `adminUserId`, `studentId`, `sessionRecordingId`, `whiteboardSessionId`
- `metadata JSON`, `createdAt`
- Three `CostEventKind` values: `WHISPER_TRANSCRIPTION`, `GPT_NOTES_GENERATION`, `GPT_ASSESSMENT_EXTRACTION`

Both `ai.ts` and `transcribe.ts` already call `logCostEvent()` after every AI call.

### 3.2 Schema additions (all additive — zero destructive changes)

#### 3.2.1 New `CostEventKind` values

```prisma
enum CostEventKind {
  WHISPER_TRANSCRIPTION
  GPT_NOTES_GENERATION
  GPT_ASSESSMENT_EXTRACTION
  // Phase 1 additions:
  BLOB_STORAGE           // monthly snapshot — GB-months consumed
  BLOB_EGRESS            // per-access egress event
  VERCEL_COMPUTE         // function execution GB-hr (Phase 2, when Vercel exposes usage API)
  NEON_COMPUTE           // CU-hour (Phase 3, when Neon billing API available)
}
```

#### 3.2.2 New `CostEvent` columns (additive migration)

```sql
-- Migration: 20260606000000_cost_event_v2
ALTER TABLE "CostEvent" 
  ADD COLUMN IF NOT EXISTS "bytesTransferred" FLOAT,     -- for BLOB_EGRESS: bytes sent
  ADD COLUMN IF NOT EXISTS "gbMonths" FLOAT,             -- for BLOB_STORAGE: GB-months consumed
  ADD COLUMN IF NOT EXISTS "computeGbHr" FLOAT,          -- for VERCEL_COMPUTE / NEON_COMPUTE
  ADD COLUMN IF NOT EXISTS "rateCardVersion" TEXT,        -- e.g. "2026-06-06" — which rate-card was used
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT;              -- denormalized logical session ID for grouping
-- All columns are nullable; existing rows unaffected.
```

> **Note on `sessionId`:** The `whiteboardSessionId` FK serves whiteboard sessions; `sessionId` is a denormalized string to cover future standalone audio sessions (post re-architecture) and cross-session aggregation before the unified session model lands. It is NOT a FK to avoid coupling to schema-in-flux.

#### 3.2.3 `logCostEvent` expanded interface

```typescript
export interface LogCostEventInput {
  kind: CostEventKind;
  model: string;
  // existing
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  estimatedCostUsd?: number;
  adminUserId?: string | null;
  studentId?: string | null;
  sessionRecordingId?: string | null;
  whiteboardSessionId?: string | null;
  metadata?: Record<string, unknown>;
  // new (Phase 1)
  bytesTransferred?: number;        // BLOB_EGRESS
  gbMonths?: number;                // BLOB_STORAGE
  computeGbHr?: number;             // VERCEL_COMPUTE, NEON_COMPUTE
  rateCardVersion?: string;         // e.g. RATE_CARD_VERSION constant
  sessionId?: string | null;        // logical session grouping
}
```

### 3.3 New cost sources to instrument

#### 3.3.1 BLOB_EGRESS — audio playback

Every time a session recording is served (admin review, share link playback), log a `BLOB_EGRESS` event. The blob URL response for audio includes `Content-Length`; use that as `bytesTransferred`.

**Where to add:** the server action or route that generates the Blob access URL (currently the admin notes/replay page data loader and the `/s/[token]` share route). Exact call site: when `SessionRecording.blobUrl` is returned to the client, the download will happen; log optimistically at URL-generation time (conservative — we log even if the user doesn't play, but it's a best-effort approximation accepted in the design's accuracy posture).

**Cost estimate:**
```typescript
const costUsd = (bytesTransferred / 1e9) * VERCEL_BLOB_EGRESS_USD_PER_GB;
```

#### 3.3.2 BLOB_STORAGE — monthly snapshot

This is a periodic (monthly or weekly) log of total blob storage consumed. Run as a cron-style server action (or Next.js Route Handler + Vercel Cron) that:
1. Lists all active `SessionRecording.blobUrl` rows from the DB (these are the blobs we own).
2. For each blob, hits the Vercel Blob `head()` API to get `size` (bytes).
3. Sums to total GB; logs one `BLOB_STORAGE` event with `gbMonths = totalGB × (daysInPeriod / 30)`.
4. Also logs per-recording rows if we want fine-grained attribution.

**Cost estimate:**
```typescript
const costUsd = gbMonths * VERCEL_BLOB_STORAGE_USD_PER_GB_MONTH;
```

> **Phase 1 shortcut:** Until we build the cron, derive blob size from `SessionRecording.durationSeconds` × average bytes/second (a rough estimate). This covers the pricing-floor math without a full cron build.

#### 3.3.3 VERCEL_COMPUTE — function execution (Phase 2)

Vercel does NOT expose a per-invocation billing API today. The Vercel dashboard shows aggregate GB-hour usage. Phase 2: periodically read the Vercel API (`/v1/usage` or billing events) and log one `VERCEL_COMPUTE` event per period as a reconciliation row.

**Cost estimate per call (instrumented at call site):**
```typescript
const elapsedSec = (Date.now() - startMs) / 1000;
const memoryGb = 0.5; // 512 MB provisioned = 0.5 GB (typical Vercel function)
const computeGbHr = memoryGb * (elapsedSec / 3600);
const costUsd = computeGbHr * VERCEL_PROVISIONED_MEMORY_USD_PER_GB_HR;
```

Instrument inside the transcription route handler and the notes generation action, after the AI call completes. This gives per-session compute cost attribution without waiting for a Vercel API.

#### 3.3.4 NEON_COMPUTE — database compute (Phase 3)

Neon provides a usage API (`/v1/consumption_history_per_project`). Phase 3: daily cron reads this and logs `NEON_COMPUTE` events. Low priority — Neon cost per session is effectively zero at pilot scale.

### 3.4 The `rateCardVersion` field — cost accuracy over time

Every `logCostEvent` call MUST pass `rateCardVersion: RATE_CARD_VERSION`. This lets us:
- Re-compute estimated costs in the future if rates change.
- Query "all events logged under rate-card 2026-06-06" vs "events logged after the next rate change."
- Flag events with unknown rate-card version as "cost uncertain."

**Update `logCostEvent` to default to `RATE_CARD_VERSION` if not provided.**

### 3.5 `cev` logging discipline (per `AGENTS.md` prefix convention)

Every `logCostEvent` call emits:
```
[cost-events] cev=<uuid> kind=<kind> model=<model> audioSec=<n> inTok=<n> outTok=<n> bytesXfr=<n> costUsd=<n> rateCard=<ver> session=<id>
```

**Failures** always emit:
```
[cost-events] cev=FAIL kind=<kind> error=<msg>
```

`cev` is already registered in `AGENTS.md` — no new prefix needed.

---

## 4. Admin dashboard surfaces

### 4.1 Design principles

- **Two audiences:** Andrew (operator) wants total cost-of-service. Future: surfacing a per-session cost insight to tutors (Phase 4+, deferred).
- **Not a billing UI** — this is an observability and pricing-floor tool, not an invoice. It shows computed estimates, clearly labeled as estimates.
- **Rate-card staleness banner** always visible if stale.

### 4.2 Page: `/admin/cost` (new, Phase 1)

**Summary cards (top row):**
- Total estimated cost this month (sum of all `estimatedCostUsd` in current billing period)
- Avg estimated cost per session (last 30 days)
- Total sessions this month
- Rate card last verified date + staleness warning if applicable

**By cost source (bar or table):**
- OpenAI Whisper (transcription minutes + cost)
- OpenAI GPT-4o-mini (notes tokens + cost)
- Blob storage + egress
- Vercel compute (if instrumented)

**By tutor (Phase 1, grouped by `adminUserId`):**
- Tutor name | Sessions | Whisper-minutes | Total estimated cost

**By student (Phase 2, if desired):**
- Student name | Sessions | Avg session length | Avg cost

**Time series (Phase 1, simple):**
- Monthly bar chart: total cost by month for the last 6 months.

### 4.3 Per-session cost drill-down (Phase 1)

In the existing admin session detail (`/admin/students/[id]` → session detail), add a collapsible "Session cost" section showing:
- Whisper minutes charged + cost
- GPT tokens + cost
- Blob egress events + cost
- Estimated total cost for that session

Query: `SELECT * FROM CostEvent WHERE whiteboardSessionId = <id> ORDER BY createdAt`

### 4.4 Existing admin dashboard integration

The current admin dashboard redesign (on `v1-redesign`) will add a "Usage" card alongside the session-log. That card becomes the entry point to `/admin/cost`. The cost page itself is a new route.

**Routing:** `/admin/cost` → only accessible to `AdminRole === ADMIN` (the `assertIsAdmin()` guard). Tutor accounts do not see this.

### 4.5 Data freshness and display caveats

All cost figures carry an "estimated — based on API usage data and verified rate-card" label. The UI never shows these as "exact billing." The Vercel/Neon reconciliation section (§5) shows when the last reconciliation ran and the delta vs computed.

---

## 5. Reconciliation vs provider billing

### 5.1 What providers expose

| Provider | Billing/usage API? | What it gives you |
|----------|--------------------|-------------------|
| **OpenAI** | ✅ Yes — `/v1/usage` (token & audio usage by day/model) | Per-day aggregate usage; matches invoice line items |
| **Vercel** | ⚠️ Partial — dashboard API returns aggregate usage metrics; no per-invocation billing breakdown | Aggregate GB-hr, GB transferred, blob GB — can reconcile totals but not per-session |
| **Neon** | ✅ Yes — `/v1/consumption_history_per_project` | CU-hours by project by period; reconciles compute |

### 5.2 Reconciliation approach

**Phase 1 (v1):** No automated reconciliation. The admin `/admin/cost` page shows **computed estimates only** (CostEvent rows × rate-card). A manual reconciliation SOP lives in this doc (§5.3).

**Phase 2:** OpenAI reconciliation cron (weekly): hit `/v1/usage?date=<YYYY-MM-DD>` for each day in the prior week, compare to sum of `CostEvent.estimatedCostUsd` WHERE `kind IN (WHISPER_TRANSCRIPTION, GPT_NOTES_GENERATION, GPT_ASSESSMENT_EXTRACTION)` AND `createdAt` in that day. Log the delta as a `metadata` row or a separate reconciliation event. Surface the delta % in the cost dashboard.

**Phase 3:** Vercel + Neon reconciliation crons (monthly). Lower priority — these are small costs at pilot scale.

### 5.3 Manual reconciliation SOP (for Phase 1)

1. Pull the OpenAI API usage report for the billing period (OpenAI dashboard → Usage).
2. Query the local DB: `SELECT SUM(audioSeconds)/60 AS whisperMinutes, SUM(estimatedCostUsd) FROM CostEvent WHERE kind='WHISPER_TRANSCRIPTION' AND createdAt >= <period_start>`.
3. Compare. Delta > 10% → investigate missing cev rows (un-instrumented call sites, failed writes).
4. Do the same for GPT tokens.
5. Check Vercel dashboard for actual blob storage GB and compute GB-hr. Compare to cev `BLOB_STORAGE` snapshots.

---

## 6. Phasing

### Phase 0 — Pricing-floor NOW (no code needed)

**Deliverable: this document.** The worked example in §1.3 gives Andrew a pricing-floor anchor today. Rate-card constants exist in `cost-events.ts` (captured 2026-05-17); they match the verified rates.

**Action for Andrew:** Price v1 assuming ~$0.36 per 60-minute session in variable costs. At a 3× safety margin, the break-even point before any profit is ~$1.10/session in AI+storage costs. Factor in ~$35/month shared platform cost divided across sessions.

### Phase 1 — v1-gating instrumentation (ships WITH v1)

**Acceptance criteria for v1:**
- [ ] All existing `cev` call sites updated to pass `rateCardVersion`
- [ ] New `CostEventKind` values added to schema (additive migration `20260606000000_cost_event_v2`)
- [ ] `logCostEvent` updated with new fields (`bytesTransferred`, `gbMonths`, `computeGbHr`, `rateCardVersion`, `sessionId`)
- [ ] `rate-card.ts` extracted (constants moved from `cost-events.ts`)
- [ ] BLOB_EGRESS events logged at audio URL generation points
- [ ] VERCEL_COMPUTE events logged inline at transcription + notes call sites (elapsed × provisioned-memory estimate)
- [ ] `/admin/cost` page live with: summary cards, by-source table, by-tutor table, rate-card staleness banner
- [ ] Per-session cost drill-down in session detail page
- [ ] 5 unit tests: rate-card staleness, estimateCostUsd (all kinds), BLOB_EGRESS cost formula

**NOT in Phase 1:** blob storage cron, automated reconciliation, per-student cost, Neon cron.

**Blast radius:** additive schema migration only. No existing behavior changed. The `logCostEvent` call is fire-and-forget (already wrapped in try/catch — non-blocking).

### Phase 2 — Automated reconciliation (post-v1, ~1 month after launch)

- OpenAI usage API cron (weekly) — compare computed vs actual
- Blob storage inventory cron (weekly) — list all SessionRecording blobs, sum sizes, log BLOB_STORAGE events
- Delta reporting in cost dashboard

### Phase 3 — Full accuracy (2–3 months post-launch)

- Neon compute cron (monthly)
- `RateCardSnapshot` DB table for historical rate reconstruction
- Per-recording cost drill-down with actual Blob sizes
- Multi-tutor aggregate cost report (if platform grows)

---

## 7. 5-axis reliability note

Cost observability is mostly fire-and-forget, but three axes merit attention:

### 7.1 Axis 1: Data loss (cost events not written)

**Risk:** `logCostEvent` catches and silently logs failures. If Neon is briefly unavailable during a long transcription run, the `cev` row is lost. At pilot scale this is acceptable (best-effort, not billing-critical). **Mitigation:** the `cev=FAIL` log line in production logs is the recovery signal; a weekly log grep for `cev=FAIL` catches silent failures.

**Phase 1 hardening (optional):** A lightweight write-retry with 1 backoff could reduce loss during transient Neon hiccups. Not gating v1.

### 7.2 Axis 2: Not blocking the AI call path

**Critical invariant (already holds):** `logCostEvent` is always `await`-ed AFTER the AI response is processed, and its failure path never propagates to the caller. The AI call is NOT gated on cev write success. This is correct and must never regress.

**Code pattern to preserve:**
```typescript
// CORRECT — cev write after success, failure swallowed
const response = await openai.chat.completions.create(...);
await logCostEvent({...}); // may fail silently
return processResponse(response);
```

### 7.3 Axis 3: Rate-card drift (silent cost undercount)

**Risk:** If rates increase and `rate-card.ts` is not updated, `estimatedCostUsd` silently understates cost. The staleness banner in the dashboard is the primary mitigation. **Secondary:** the reconciliation SOP in §5.3 catches this quarterly.

### 7.4 Axes 4 & 5 (cascade + availability)

No new external dependencies added. Cost events write to Neon — same availability posture as the rest of the app. No new third-party services.

---

## 8. Open questions (Q1–Q10)

Each has a **recommended default** — reply "ratify defaults" to authorize Phase 1, or override individually.

| # | Question | Recommended default | Rationale |
|---|----------|--------------------|-----------| 
| **Q1** | Extract `rate-card.ts` as separate file, or keep constants in `cost-events.ts`? | **Separate `rate-card.ts`** | Cleaner separation; the rate-card is a config artifact, not business logic. Makes the staleness check easy to co-locate. |
| **Q2** | Add `rateCardVersion`, `bytesTransferred`, `gbMonths`, `computeGbHr`, `sessionId` columns via one migration, or only add what Phase 1 actually uses? | **One migration adds all** | Additive cost is the same; avoids a second migration later. All columns nullable. |
| **Q3** | Log BLOB_EGRESS at URL-generation time (optimistic) or actual download completion (exact)? | **URL-generation time (optimistic)** | Vercel Blob serves directly from edge; there's no server hook on download completion. Optimistic logging slightly overcounts unplayed recordings — acceptable at this accuracy tier. |
| **Q4** | Log VERCEL_COMPUTE inline at call sites (estimated, Phase 1) or wait for Vercel API (exact, Phase 2)? | **Inline estimate in Phase 1** | Gets cost attribution immediately; the Vercel API approach is additive (Phase 2 can refine without touching call sites). |
| **Q5** | Admin `/admin/cost` dashboard: ship with v1, or post-v1? | **Ship with v1** (the requirement) | V1-GATING per Andrew 2026-06-06. The page itself is a simple DB-query + render with no external calls. |
| **Q6** | Per-session cost drill-down (§4.3): in Phase 1 or Phase 2? | **Phase 1** | One extra query on a page that already loads session data. Low effort, high value for pricing validation. |
| **Q7** | Monthly blob storage cron: Phase 1 or Phase 2? | **Phase 2** | Requires a Vercel Cron + Blob API integration. Not blocking v1 pricing-floor. Phase 2 is ~1 month post-launch. |
| **Q8** | Should estimated cost be surfaced to **tutors** (not just admin)? | **No, admin-only for v1** | Tutor-facing cost creates expectations and potential confusion at pilot stage. Revisit when moving to multi-tutor scale. |
| **Q9** | Rate-card staleness threshold: 90 days or 30 days? | **90 days** | OpenAI and Vercel pricing is relatively stable; 90 days matches quarterly planning cadence without being noisy. |
| **Q10** | Should the blob cleanup CLI (`blb` log prefix) write a `BLOB_STORAGE` event showing reclaimed storage? | **Yes** | The cleanup operation is already logged with `blb` prefix; adding a `BLOB_STORAGE` event (negative `gbMonths`) creates a complete storage cost timeline. |

---

## Appendix: Existing `CostEvent` indexes

```sql
@@index([kind, createdAt])
@@index([adminUserId, createdAt])
@@index([studentId, createdAt])
@@index([createdAt])
```

These cover the main admin dashboard queries (by-source, by-tutor, by-period). Phase 1 will need: `@@index([whiteboardSessionId, createdAt])` (per-session drill-down) and `@@index([sessionId, createdAt])` (logical session grouping). Add to the `20260606000000_cost_event_v2` migration.

---

## Appendix: Current `cost-events.ts` rate constants (seed state)

The existing `cost-events.ts` already has:
```typescript
// Captured 2026-05-17
const WHISPER_USD_PER_MINUTE = 0.006;
const GPT_4O_MINI_INPUT_PER_MTOK_USD = 0.15;
const GPT_4O_MINI_OUTPUT_PER_MTOK_USD = 0.6;
```

These match the verified 2026-06-06 rates — no rate change since May 2026. The `rate-card.ts` extraction (Q1) moves these constants there and adds the new Vercel/Neon rates.

---

*Design authored: 2026-06-06. Author: Composer 2.5 (subagent). Scope blob from Opus orchestrator.*
*Pricing verified from: [OpenAI API docs](https://developers.openai.com/api/docs/pricing), [Vercel pricing](https://vercel.com/pricing), [Neon pricing](https://neon.com/pricing) — all checked 2026-06-06.*
