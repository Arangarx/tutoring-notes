# Platform assumptions

> **Purpose**: a single discoverable inventory of every load-bearing infrastructure, runtime, browser, and OS assumption baked into this codebase. Read this BEFORE migrating to a different compute platform (AWS, Cloudflare, self-hosted), changing managed-service tiers, or onboarding a new external dependency. Each assumption lists *what it is*, *where it's baked in*, and *what breaks if it's violated*.
>
> **Maintenance rule**: any commit that introduces a new platform-level assumption (a hardcoded timeout cap, a per-tier limit dependency, a new external origin, a new runtime requirement) MUST update this doc in the same PR. The orchestrator owns this gate during executor handoffs.
>
> **Last audited**: 2026-05-17 (post-Vercel-Pro upgrade).

---

## Quick reference — current platform stack

| Layer | Service | Tier / version | Notes |
|---|---|---|---|
| Compute | Vercel | **Pro** ($20/mo + $20 metered-usage credit) | Upgraded from Hobby 2026-05-17 ~9:00 PM to unblock long-form transcribe. See §1. |
| Database | Neon Postgres | **Launch** (~$19/mo) | Branched: prod branch + dev branch. Preview deploys → dev; Production → prod. Re-pointed 2026-05-17 per Phase 2 task 13. |
| Object storage | Vercel Blob | included in Vercel Pro | **Single shared store across all envs** (per-env split slotted as Phase 2 task 15). |
| Live A/V signaling | `wb.mortensenapps.com` (excalidraw-room fork) | self-hosted WebSocket | Pinned upstream SHA; verify every 90 days. |
| Auth | NextAuth | v4.24.x | Credentials + Google OAuth. Session JWT. |
| AI | OpenAI API | Tier 1 paid (presumed) | Whisper for transcribe; gpt-4o-mini for notes/AI assist. |
| Email | SMTP (optional) | depends on operator config | Falls back to no-op when unset. |
| Domain | (operator-managed) | n/a | NEXTAUTH_URL must match. |

**Total fixed/mo as of this audit**: ~$39 (Neon $19 + Vercel $20). OpenAI variable, tracked via `CostEvent`.

---

## 1. Compute platform — Vercel Pro tier

### 1.1 Server-action / serverless function `maxDuration`

- **Assumption**: Vercel **Pro** tier (300-second hard ceiling on serverless function execution).
- **Where baked in**:
  - `src/app/admin/students/[id]/page.tsx:41` — `export const maxDuration = 300;`
  - `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx:18` — `export const maxDuration = 300;`
  - `src/lib/transcribe.ts` — Whisper-per-part loop parallelized with concurrency cap 6 (`WHISPER_INNER_CONCURRENCY`) post-Tier-1 (shipped 2026-05-17). Assumes 300s wall-clock budget at the action boundary.
  - `src/app/admin/students/[id]/actions.ts` — `transcribeAndGenerateAction` outer per-segment loop, parallelized with cap 3 (`TRANSCRIPT_OUTER_CONCURRENCY`) post-Tier-1.
  - `src/app/admin/students/[id]/whiteboard/actions.ts` — whiteboard transcribe path, same outer-cap-3 pattern (`WB_TRANSCRIPT_OUTER_CONCURRENCY`).
- **What breaks if violated**:
  - **Hobby tier (60s ceiling)**: long-form transcribe (>5 min audio) silently times out. Sarah's April 24 50-min recording hit this. `maxDuration = 300` declarations are silently plan-capped to 60s without any warning. **Re-introducing Hobby = re-breaking long-form transcribe for the pilot.**
  - **AWS Lambda default (~15 min hard max, but 30s default)**: depends on configured timeout per function. If migrating, every `maxDuration` declaration must be re-validated against the new platform's per-function timeout config. Lambda's 900s ceiling is generous, but the per-invocation cost model changes.
  - **Cloudflare Workers (CPU-time limits, ~30s wall-clock)**: incompatible without major refactor — long-running synchronous transcribe loops would never fit. Would force Tier 2 background queue work.
- **Migration check**: confirm new platform's per-function/per-action wall-clock ceiling ≥ 300s before deploying. Re-test `transcribeAndGenerateAction` with a 60-min audio fixture against the new platform's Preview URL.

### 1.2 Function runtime (Node.js, not Edge)

- **Assumption**: Routes that read/write binary buffers (audio, blobs, ffmpeg) run on **Node.js runtime**, NOT Edge runtime.
- **Where baked in** (explicit `export const runtime = "nodejs"`):
  - `src/app/api/whiteboard/[sessionId]/tutor-asset/route.ts:12`
  - `src/app/api/w/[joinToken]/wb-asset/route.ts:14`
  - `src/app/api/whiteboard/[sessionId]/math/render/route.ts:32`
  - Other API routes default to Node.js implicitly; explicit declaration is for clarity where binary handling is critical.
- **What breaks if violated**:
  - Edge runtime lacks `Buffer`, full `fs`, `node:child_process` (used by `ffmpeg-static`), and the Prisma client (without Edge-compatible driver).
  - `transcribe-ffmpeg.ts` literally cannot run on Edge — it spawns ffmpeg subprocess.
- **Migration check**: any platform that doesn't support Node.js-runtime serverless (e.g. Workers-only) requires extracting ffmpeg-bound work into a separate compute (container, dedicated worker).

### 1.3 Edge function `maxDuration`

- **Assumption**: No Edge functions in current code (all explicitly Node.js or default Node.js).
- **What breaks if violated**: n/a today; flag for future. If anyone migrates a route to Edge runtime to gain global distribution, Vercel's Edge `maxDuration` is 25s (Hobby) / 30s (Pro) — much tighter than Node.js function ceiling.

### 1.4 Build execution

- **Assumption**: Build environment has **git** and **Node** available. `ignoreCommand` runs `node scripts/vercel-ignore-build.cjs`, which shells out to `git diff $VERCEL_GIT_PREVIOUS_SHA HEAD --name-only`.
- **Where baked in**: `vercel.json` (`ignoreCommand`), `scripts/vercel-ignore-build.cjs`.
- **Env var**: `VERCEL_GIT_PREVIOUS_SHA` — last commit deployed on this branch. When unset (first deploy on a branch), the script **builds** (fail-safe).
- **Polarity**: exit **0 = skip** deploy, exit **1 = run** build (Vercel convention; inverted polarity previously shipped — see `docs/BACKLOG.md` Vercel ignored build step).
- **What breaks if violated**: docs/rule-only commits re-trigger full builds (cost + time). Missing git/Node or `VERCEL_GIT_PREVIOUS_SHA` on a new platform → script fails safe to BUILD. Wrong exit polarity would skip real code deploys.
- **Migration check**: confirm new platform exposes a previous-deploy SHA env var and supports an `ignoreCommand`-equivalent with the same exit-code semantics; port or reimplement `scripts/vercel-ignore-build.cjs`.

### 1.5 Prisma migrate at deploy time

- **Assumption**: `npm run build` runs `node scripts/migrate-with-retry.mjs` which calls `prisma migrate deploy` against `DATABASE_URL` BEFORE `next build`.
- **Where baked in**: `package.json:7`
- **What breaks if violated**:
  - If `DATABASE_URL` is misconfigured (e.g. Preview pointing at prod — see Phase 2 task 13 incident), migrations apply to the WRONG database. Caught 2026-05-17 when cost-events migration landed on prod from a Preview build. Additive migrations are harmless; DROP/RENAME/NOT NULL would have broken prod.
  - Phase 2 task 13 (env-scoping audit + `scripts/safe-migrate.mjs` guard) is the structural hardening; not yet shipped.
- **Migration check**: any new platform must support per-environment `DATABASE_URL` scoping AND run migrate-deploy with strict env separation. Add the `safe-migrate.mjs` guard if not already shipped.

---

## 2. Database — Neon Postgres

### 2.1 Branching model (prod vs dev)

- **Assumption**: Neon has a **production branch** and a **development branch**. Production deploys read/write prod; Preview deploys read/write dev.
- **Where baked in**: Vercel environment variable scoping (Preview overrides `DATABASE_URL` + `DIRECT_URL` to dev branch values).
- **What breaks if violated**: Preview testing writes to prod, OR Production reads from dev. Either is catastrophic.
- **Migration check**: any DB platform needs equivalent branch / namespace separation. RDS would need separate instances or schemas with separate URLs.

### 2.2 Connection pooling (`pgbouncer=true`)

- **Assumption**: `DATABASE_URL` uses Neon's pooled connection (with `?pgbouncer=true`); `DIRECT_URL` uses non-pooled (for migrations).
- **Where baked in**: `.env` (gitignored), `src/lib/env.ts` (DATABASE_URL + DIRECT_URL both required by Zod schema).
- **What breaks if violated**:
  - Without pooled `DATABASE_URL`: Prisma exhausts Neon's connection limit under serverless concurrency.
  - Without separate `DIRECT_URL`: Prisma migrations fail (PgBouncer doesn't support some migration-time queries).
- **Migration check**: replicate the pooled/direct split on any new Postgres provider. RDS Proxy is the AWS equivalent.

### 2.3 Idle connection timeout

- **Assumption**: Neon aggressively closes idle connections (~30-60s of inactivity). Scripts that hold a connection while doing long external work (e.g. Vercel Blob LIST) need defensive reconnect.
- **Where baked in**:
  - `scripts/blob-cleanup.mjs` — `withConnectionRetry` wrapper added after the housekeeping smoke surfaced "Server has closed the connection" on `prisma.sessionRecording.findMany()` post-`listAllBlobs()`.
  - Pattern: load DB reference sets immediately after `$connect()`, before any long external call.
- **What breaks if violated**: similar timeouts on other managed Postgres (Supabase, Render) can produce identical symptoms. Self-hosted Postgres typically has more generous defaults but still applies under load.
- **Migration check**: validate idle timeout on new provider; either configure longer timeout or add `withConnectionRetry` wrapper to any script holding a connection during external API calls.

### 2.4 Additive migrations policy

- **Assumption**: Migrations are **strictly additive**. No DROP COLUMN, no RENAME, no NOT NULL on existing tables without a multi-step migration. Per AGENTS.md convention.
- **Where baked in**: `prisma/migrations/` directory; all historical migrations are additive.
- **What breaks if violated**: production data loss; old deployed code can't read renamed columns; outbox-in-flight rows reference dropped fields.
- **Migration check**: this is a policy, not a platform constraint — preserve the policy across providers.

### 2.5 The duplicate `_prisma_migrations` row (pre-existing issue)

- **Assumption**: There's a known duplicate row for `20260418000000_multi_recording` in both prod and preview-dev `_prisma_migrations` tables (one with `finished_at` set, one with NULL). Currently harmless; flagged in Phase 2 task 14 as "investigate + clean up."
- **What breaks if violated**: future `prisma migrate deploy` may retry the NULL-finished_at migration unexpectedly.

---

## 3. Object storage — Vercel Blob

### 3.1 Single shared blob store across environments

- **Assumption**: One Vercel Blob store serves both Production and Preview deploys. Blob URLs created during Preview testing are referenced by dev DB only; from prod DB's perspective they look like orphans.
- **Where baked in**: `BLOB_READ_WRITE_TOKEN` is the same token across all envs.
- **What breaks if violated** (or rather, the current safety constraint): `scripts/blob-cleanup.mjs` REQUIRES `PROD_DATABASE_URL` AND `DEV_DATABASE_URL` and only marks a blob as orphan if NEITHER references it. Removing the dual-DB check would risk deleting live dev-environment blobs.
- **Roadmap**: Phase 2 task 15 (separate Blob store per env) is the cleaner architecture. Until then, dual-DB-check is the safety net.
- **Migration check**: any new object storage (S3, R2) should either (a) have per-env buckets from day one, or (b) maintain the dual-reference-check pattern.

### 3.2 Token-based blob auth (no public URLs for student content)

- **Assumption**: Blob URLs require `BLOB_READ_WRITE_TOKEN` for read access; share links use tokenized + revocable URLs (NOT public blob URLs).
- **Where baked in**:
  - `src/lib/blob.ts` — wrapper around `@vercel/blob` SDK.
  - `src/app/api/whiteboard/[sessionId]/tutor-asset/route.ts` etc. — proxies blob reads with auth assertion.
  - `src/lib/whiteboard/resolve-asset-read-url.ts` — resolves tokenized read URLs.
- **What breaks if violated**: student / parent / session-recording content becomes publicly accessible if Blob URLs leak. Critical privacy / safety violation per AGENTS.md "Share links are tokenized + revocable" convention.
- **Migration check**: S3-style migration must replicate signed-URL pattern with short expiry.

### 3.3 Protected path patterns (orphan detection)

- **Assumption**: Two pathname patterns under the blob store are NEVER detected as orphans because their references live inside the events.json blob (not in any DB column):
  - `whiteboard-sessions/{sid}/{wsid}/assets/...` — tutor-inserted image assets, referenced via `customData.assetUrl` in Excalidraw scene state.
  - `whiteboard-checkpoints/...` — IndexedDB checkpoints, no DB reference by design.
- **Where baked in**: `scripts/blob-cleanup-logic.mjs:isPathProtected`.
- **Roadmap**: Phase 2 task 16 — events.json content-aware orphan detection (Option B follow-up) — would allow safe cleanup of genuinely-orphaned asset blobs.
- **Migration check**: replicate this defensive pattern when porting cleanup logic to a new object store. Loosening it requires implementing events.json parsing.

### 3.4 Direct client-to-blob upload (audio)

- **Assumption**: Audio segments upload **client → Vercel Blob directly** via a token issued by our server. Our server never sees the audio bytes during upload.
- **Where baked in**:
  - `src/lib/recording/upload.ts:uploadAudioDirect`
  - `src/app/api/upload/audio/route.ts`
- **What breaks if violated**: rate-limit + bandwidth on our server for large audio uploads. Critical for Sarah's 60-90 min sessions.
- **Migration check**: S3 pre-signed PUT URLs are the equivalent pattern.

---

## 4. External APIs

### 4.1 OpenAI Whisper

- **Assumption**: Whisper `whisper-1` model. Per-call file size limit **25 MB** (`WHISPER_MAX_BYTES` in `src/lib/transcribe-constants.ts`). Rate limit: ~50 RPM at Tier 1 paid.
- **Where baked in**:
  - `src/lib/transcribe.ts:transcribeSinglePart` — calls `client.audio.transcriptions.create`.
  - `src/lib/transcribe-ffmpeg.ts:splitAudioIntoWhisperParts` — splits files over 25 MB via ffmpeg.
  - `CHUNK_TARGET_BYTES = 22 MB` — ffmpeg-split target leaves 3 MB margin.
- **What breaks if violated**:
  - Larger files than 25 MB → 413 from OpenAI.
  - Concurrency above rate limit → 429; current code does NOT retry (Tier 1 bootstrapper adds retry).
- **Migration check**: if switching to AWS Transcribe, Whisper.cpp self-hosted, or any other STT — file size limits + concurrency limits differ. Re-validate splitter constants.

### 4.2 OpenAI Chat Completions (gpt-4o-mini)

- **Assumption**: `gpt-4o-mini` model for AI notes + AI form-fill. Token limits per request: 128k input / 16k output.
- **Where baked in**:
  - `src/lib/ai.ts` — main GPT call sites.
  - `src/lib/observability/cost-events.ts:estimateCostUsd` — pricing table baked in (captured 2026-05-17). **If OpenAI changes prices, this table is stale.**
- **What breaks if violated**: cost estimates drift from actual OpenAI invoice; long transcripts (>128k tokens, ~100k words) silently truncate.
- **Migration check**: model changes require updating the pricing table; provider changes (Anthropic, etc.) require new estimate logic + a new `CostEvent.model` enum entry.

### 4.3 Google OAuth (Connect Gmail)

- **Assumption**: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` configured at the deployer level; OAuth callback URL must match Google Cloud Console allowed redirect URIs.
- **Where baked in**: `src/lib/env.ts` (optional env vars); `GMAIL_CONNECT_ALLOWLIST` for per-admin gating.
- **What breaks if violated**: Gmail send fails; degrades gracefully (no email sent, no crash).
- **Migration check**: changing `NEXTAUTH_URL` (e.g. moving to a new domain) requires re-adding the callback URL in Google Cloud Console.

### 4.4 SMTP (real email)

- **Assumption**: SMTP server is optional. When unset (`SMTP_HOST` empty), emails are skipped (no error, no crash). Per `src/lib/env.ts:isEmailConfigured`.
- **Migration check**: if email becomes mandatory for any feature (e.g. dunning in Phase 10), `isEmailConfigured` check needs to fail-loud not fail-silent.

---

## 5. Networking, security, real-time

### 5.1 Whiteboard sync server (excalidraw-room fork)

- **Assumption**: WebSocket relay at `WHITEBOARD_SYNC_URL` (currently `wss://wb.mortensenapps.com`). Self-hosted (separate `whiteboard-sync` repo); upstream SHA pinned in `whiteboard-sync/README.md`.
- **Where baked in**:
  - `src/lib/env.ts` — `WHITEBOARD_SYNC_URL` validated to start with `wss://` or `ws://`.
  - `src/lib/whiteboard/sync-client.ts` — WebSocket client.
  - `src/lib/security/csp.ts` — `connect-src` includes this origin (built dynamically at module load).
- **What breaks if violated**:
  - Wrong protocol (http vs wss) → CSP block + connection failure.
  - Origin not in `connect-src` → browser refuses WebSocket.
  - Stale upstream SHA → protocol drift; phase 2 task 9 covers the 90-day verification cadence.
- **Migration check**: a managed alternative (Liveblocks, Pusher) would need protocol-shape adaptation. Self-hosted on AWS/GCP would just need DNS + TLS termination.

### 5.2 WebRTC peer-mesh signaling + STUN

- **Assumption**: Peer mesh (≤5 participants — Sarah's realistic max). Signaling tunneled through the existing sync-client WebSocket (additive `webrtc-signal` envelope). Public Google STUN servers; no TURN configured.
- **Where baked in**:
  - `src/lib/av/peer-mesh.ts`, `src/lib/av/signaling.ts`
  - `src/lib/av/webrtc-ice-from-env.ts` — pulls ICE config from env (currently STUN-only).
  - `docs/LIVE-AV.md` — 11 numbered invariants (canonical reference).
- **What breaks if violated**:
  - Cellular peers behind symmetric NAT → ICE-failure with no TURN fallback. Currently a known gap; slotted for "TURN deployment when NAT issues surface."
  - More than ~5 peers → mesh fan-out becomes O(N²) bandwidth on the tutor's connection; would need SFU.
- **Migration check**: if launching paid plans (Phase 10), provision a TURN service (Twilio, Xirsys, self-hosted coturn) before tutors at scale hit it.

### 5.3 CSP — site-wide, locked

- **Assumption**: Content-Security-Policy is built once at module load from `WHITEBOARD_SYNC_URL`. Every external origin (sync server, embed, font CDN) must be added explicitly in `src/lib/security/csp.ts`.
- **Where baked in**:
  - `src/middleware.ts:CONTENT_SECURITY_POLICY`
  - `src/lib/security/csp.ts:buildContentSecurityPolicy` + `buildPermissionsPolicy`
  - Regression pinned: `src/__tests__/regressions/csp-headers.test.ts`
- **What breaks if violated**: any new external origin (e.g. embedding a YouTube video, adding a font CDN, calling a new third-party API) silently fails until added to CSP. Per AGENTS.md convention, document the addition in the feature's STATUS doc.

### 5.4 Permissions-Policy MUST be site-wide (not per-route)

- **Assumption**: `Permissions-Policy: camera=(self), microphone=(self), geolocation=()` is applied site-wide.
- **Why**: Next.js App Router server-action redirects perform a CLIENT-SIDE navigation that reuses the existing document, and Permissions-Policy is per-document. Per-route policy would let `camera=()` from a non-AV page persist after soft-nav into the workspace, blocking `getUserMedia({video:true})` until hard refresh.
- **Where baked in**: `src/middleware.ts` (via `buildPermissionsPolicy` with site-wide returns); `src/lib/security/csp.ts` JSDoc explains the regression history.
- **What breaks if violated**: live A/V mounting silently fails after server-action soft-nav; users see a permission-denied prompt with no obvious cause.
- **Migration check**: any framework with server-action-style soft-nav (Remix, etc.) has the same gotcha. Apply site-wide.

### 5.5 NextAuth session domain

- **Assumption**: `NEXTAUTH_URL` matches the deployed origin. Session cookies are scoped to that origin.
- **What breaks if violated**: login redirects loop; sessions don't persist; Google OAuth callback fails.
- **Migration check**: changing primary domain requires updating `NEXTAUTH_URL` AND Google OAuth redirect URIs simultaneously.

### 5.6 Server-action ownership assertions

- **Assumption**: Every server action that touches student data calls `assertOwnsStudent(adminUserId, studentId)` (or equivalent) before mutation/read.
- **Where baked in**: `src/app/admin/students/[id]/actions.ts`, `src/app/admin/students/[id]/whiteboard/actions.ts`, ownership-assertion helpers.
- **What breaks if violated**: cross-tenant data leak between admin users sharing the same deployment.
- **Migration check**: this is a code-discipline assumption, not a platform one. Preserve across any backend.

### 5.7 Rate-limit middleware

- **Assumption**: In-memory rate-limit (process-local, NOT distributed). Per `src/middleware.ts`:
  - Auth bucket: 10 req/min per IP (Phase 2 task 10 wants to bump to 30).
  - Setup bucket: 5 req/min per IP.
  - API buckets: per-path via `src/lib/security/api-rate-buckets.ts`.
- **What breaks if violated**:
  - Multi-instance deployment (e.g. multiple Vercel regions, K8s pods): rate-limit is process-local, so attackers could distribute across instances. Acceptable today (Vercel typically single-region per function); flag if scaling to multi-region.
  - Bumping `AUTH_RATE_LIMIT.max` from 10→30 is Phase 2 task 10 (Andrew trip-points during normal use).
- **Migration check**: distributed deployments need Redis-backed rate-limiting.

---

## 6. Build + deploy

### 6.1 `npm run test:regression` runs before build

- **Assumption**: `vercel.json:buildCommand` is `npm run test:regression && npm run build`. Regression tests gate every Vercel build.
- **Where baked in**: `vercel.json:2`, `package.json:18`.
- **What breaks if violated**: regressions slip into Production deploys.
- **Migration check**: replicate the test-gate on any new build platform.

### 6.2 `prisma generate` runs postinstall + prebuild

- **Assumption**: Prisma Client is regenerated on `npm install` AND on build. Platform must support `postinstall` hooks.
- **Where baked in**: `package.json:8` (`postinstall`), `:7` (`build` chain).

### 6.3 `scripts/copy-pdfjs-worker.mjs` runs postinstall

- **Assumption**: pdf.js worker (~1 MB) is copied from `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdfjs/` at install time. `public/pdfjs/` is gitignored.
- **Where baked in**: `package.json:8` (`postinstall`), `scripts/copy-pdfjs-worker.mjs`.
- **What breaks if violated**: PDF-page picker (Phase 5 task 1) fails — workers can't load from `node_modules` directly via the Next.js public-asset pattern.

### 6.4 Vercel `ignoreCommand` for docs/rules-only commits

- **Assumption**: Commits whose diff contains **only** non-build-affecting paths skip the Vercel deploy: `docs/**`, `.cursor/**`, `*.md`, `*.mdc`. Mixed diffs (any `src/`, `package.json`, etc.) always build. Script fails safe to BUILD when `VERCEL_GIT_PREVIOUS_SHA` is missing, git fails, or the diff is empty.
- **Where baked in**: `vercel.json` (`ignoreCommand`), `scripts/vercel-ignore-build.cjs`, `src/__tests__/vercel-ignore-build.test.ts`.
- **What breaks if violated**: orchestrator/doc churn re-triggers full builds (wasteful); or, if polarity/safe-set regresses, real code changes could be skipped (dangerous — predicate is unit-tested).

### 6.5 Branch + smoke + direct merge (no PR ceremony)

- **Assumption**: Solo-pilot stage convention per AGENTS.md "Merging convention" section. Executors deliver smokeable branches; merge happens via `git merge --no-ff` directly to master after smoke pass.
- **What breaks if violated**: re-introducing PR ceremony adds overhead without review value at current team size. Revisit when team grows or adversarial CI lands.

---

## 7. Runtime dependencies

### 7.1 Node.js version (implicit)

- **Assumption**: Node.js 20+ (ES modules with `.mjs`, modern fetch API, Web Crypto). No explicit `engines` pin in `package.json`.
- **What breaks if violated**: `scripts/*.mjs` files require modern Node; `@vercel/blob` requires modern fetch; `@prisma/client` 6.x requires Node 18+.
- **Migration check**: add `"engines": { "node": ">=20.0.0" }` to `package.json` BEFORE migrating to any platform with older default Node.

### 7.2 ffmpeg (`ffmpeg-static`)

- **Assumption**: `ffmpeg-static` npm dep provides the binary; falls back to `FFMPEG_BIN` env var if set.
- **Where baked in**: `src/lib/transcribe-ffmpeg.ts:getFfmpegPath`.
- **What breaks if violated**: long-audio transcribe (>25 MB) silently degrades to a friendly error message ("This recording is too large to split automatically"). Long-form transcribe becomes unusable.
- **Migration check**: any platform that strips binary-dep node modules (some serverless runtimes do) needs ffmpeg shipped separately. AWS Lambda layers are the typical fix.

### 7.3 pdfjs-dist (PDF page picker)

- **Assumption**: `pdfjs-dist` 5.6.x; worker version must match main library version (worker is copied at install via `copy-pdfjs-worker.mjs`).
- **What breaks if violated**: version drift = silent PDF parse failures. The copy-script approach is specifically to avoid drift.

### 7.4 ffmpeg-static binary OS compatibility

- **Assumption**: Vercel builds on Linux; `ffmpeg-static` ships the right binary for Linux x64. Local dev on Windows uses the Windows binary (same npm package, OS-conditional download).
- **What breaks if violated**: ARM-only runtimes (Graviton, Apple Silicon serverless) may have ffmpeg-static support issues; verify on first deploy to such a platform.

### 7.5 Excalidraw API surface

- **Assumption**: Excalidraw `^0.18.1`. `excalidrawAPI.getAppState()` returns `{ scrollX, scrollY, zoom: { value }, ... }`. `updateScene({ appState: {...} })` accepts partial appState.
- **Where baked in**: per-page view state code, scene-paint engine, replay viewport tier-c-lite (all shipped 2026-05-17 in merge `2cccc04`).
- **What breaks if violated**: any Excalidraw version bump that changes `appState` shape breaks page-switch viewport restoration + replay viewport tracking. Pin major version; test on bump.

### 7.6 socket.io-client (sync transport)

- **Assumption**: `socket.io-client` 4.8.x for the WebSocket relay. Protocol-compatible with the `whiteboard-sync` server's pinned upstream excalidraw-room SHA.
- **What breaks if violated**: major version bumps risk protocol drift. The 90-day pin-verification cadence (Phase 2 task 9) catches this.

---

## 8. Browser support

### 8.1 iOS Safari MediaRecorder quirks

- **Assumption**: iOS Safari requires `audio/mp4` mimeType (not `audio/webm`). `MediaRecorder.isTypeSupported` is checked at recording-start.
- **Where baked in**: `src/lib/recording/...` (mime selection logic).
- **What breaks if violated**: recording fails silently on iPhone. Phase 2 task 2 (iOS Safari matrix) covers exhaustive testing.
- **Draft durability (`timeslice`, W1 Surface 1, 2026-05-30)**: The whiteboard workspace enables `MediaRecorder.start(30000)` plus a 30s `setInterval` draft checkpoint to IndexedDB (`tutoring-notes-recording-draft`). iOS Safari may **not** emit intermediate `ondataavailable` events on the timeslice interval before `stop()` — the hook logs a warning and still checkpoints on `stop()` / `pagehide` (stop-only path). Mid-recording crash recovery on iOS without timeslice events is **coarser** (only data flushed at last interval or tab hide). **Gate:** Andrew validates on a real iPhone that `timeslice: 30000` fires at least once before `stop()`; if not, accept stop-only + interval checkpoints and document the smoke finding here.

### 8.2 Excalidraw mount lifecycle (canvas wipe race)

- **Assumption**: There's an Excalidraw-internal post-mount effect that resets scene + scroll + zoom within one rAF after `updateScene`. Live-recording mode masks this via the audio play loop's re-push; replay-without-audio + preview-before-Start surfaces it as blank-until-scrub.
- **Where baked in**: `src/components/whiteboard/WhiteboardReplay.tsx:148`, `WorkspacePreviousSessionPreview.tsx` (deferred).
- **Roadmap**: Phase 3 task 1 (scrub-without-audio + canvas wipe race fix).

### 8.3 Browser autoplay policies (AVTile "Tap to hear")

- **Assumption**: Modern browsers block autoplay of audio without user gesture. Phase 4d Commit 10 added "Tap to hear" overlay for autoplay-blocked remote audio. Asymmetric on iOS (per 2026-05-15 smoke).
- **Where baked in**: `src/components/av/AVTile.tsx`.

### 8.4 sessionStorage limits

- **Assumption**: ~5 MB per origin. Per-page view state drafts + recording outbox fit comfortably; PDF-page draft state is the upper bound risk.
- **What breaks if violated**: tab-reload draft restoration fails silently. Add quota-exceeded error handling if it ever fires.

### 8.5 IndexedDB for upload outbox + checkpoints

- **Assumption**: IndexedDB available with reasonable storage budget. iOS Safari ITP (Intelligent Tracking Prevention) may evict storage after 7 days of inactivity for non-installed PWAs.
- **Where baked in**: `src/lib/recording/upload-outbox.ts`, `src/lib/recording/recording-draft-store.ts` (`tutoring-notes-recording-draft`), whiteboard checkpoint paths (`tutoring-notes-checkpoints`).
- **What breaks if violated**: cross-day recording session resumption fails on iOS Safari. Acceptable today (sessions are intra-day); flag if persistence across days becomes a feature. The **recording draft** store is subject to the same 7-day ITP eviction risk as the outbox; intra-day sessions are safe.

---

## 9. OS / development environment

### 9.1 Windows-first dev environment (Andrew)

- **Assumption**: Andrew develops on Windows; PowerShell is the default shell. Scripts must work cross-platform but Windows is the primary local env.
- **Where surfaced**:
  - `scripts/branch-sweep.mjs` — early Windows-specific `spawnSync` cwd bug (`6e77ba7` fix).
  - `.gitignore` includes `.git-commit-msg.tmp` for PowerShell multi-line commit message handling.
  - PowerShell can't chain commands with `&&` (use `;` or `if ($?)`).
- **Migration check**: Linux/Mac contributors must verify scripts on their platform; CI runs on Linux so prod-build path is Linux-tested by default.

### 9.2 Git available locally + in build env

- **Assumption**: `git` binary available in dev + Vercel build env. Required by `vercel.json:ignoreCommand` (`git diff`) and by housekeeping scripts (`git fetch --prune`, `git merge-base`).

### 9.3 DNS resolution flakiness

- **Assumption**: Transient `Could not resolve host: github.com` failures happen during `git fetch` / `git push`. Pattern: retry once before failing.
- **Where baked in**: AGENTS.md `git-push-retry` rule; should be ported to `scripts/branch-sweep.mjs` (open follow-up).
- **Migration check**: any CI / dev environment with restrictive networking needs the retry pattern; firewalled environments may need a git proxy.

### 9.4 Docker required for whiteboard regression net (wb-regression harness)

- **Assumption**: `npm run test:wb-sync` and `npm run relay:build` require Docker Desktop (or equivalent daemon) on the dev machine. The local relay container (`wb-relay-local`) wraps the same `excalidraw-room` sha used in production (`03ff435860b508d7cd9e005cfc90f7977ae2a593`).
- **Where baked in**: `package.json` `relay:build` script; `playwright.config.ts` wb-regression `webServer` entry; `docs/LOCAL-DEV.md` setup steps.
- **What breaks if violated**: `npm run relay:build` fails; Playwright's relay `webServer` fails to start; wb-regression tests fail immediately. Fallback to production relay (`wss://wb.mortensenapps.com`) reintroduces prod dependency for local tests — explicitly avoided by the regression net.
- **Migration check**: GitHub Actions Phase 2 gate should use `docker/setup-buildx-action` + build `../whiteboard-sync/Dockerfile`. Image already exists in sibling `whiteboard-sync/` repo.

### 9.5 Local relay CORS allowlist for test runs

- **Assumption**: `wb-relay-local` runs with `CORS_ORIGIN=http://localhost:3100`, matching Playwright `baseURL`.
- **Where baked in**: `playwright.config.ts` relay `webServer` docker command (`-e CORS_ORIGIN=http://localhost:3100`).
- **What breaks if violated**: Socket.IO connections from `http://localhost:3100` are rejected; both peers fail to connect; all wb-regression tests time out on `"student connected"`.
- **Migration check**: If dev server port changes from 3100, update relay `CORS_ORIGIN` in `playwright.config.ts` and document in `docs/LOCAL-DEV.md`.

---

## 10. Operational + secrets

### 10.1 `.env` is gitignored; secrets never in source control

- **Assumption**: `.env`, `.env.local`, `.env.*.local` are gitignored per `.gitignore:3-5`.
- **What breaks if violated**: API keys, DB credentials, OAuth secrets leak via git history. Catastrophic.
- **Migration check**: GitHub secret-scanning + pre-commit hook recommended. Andrew's current `.env` files contain real secrets — DO NOT commit, screenshot, or paste into chat.

### 10.2 Cost-events accumulating since 2026-05-17

- **Assumption**: `CostEvent` table receives a row per Whisper / GPT call. Pricing table baked into `src/lib/observability/cost-events.ts:estimateCostUsd`.
- **Where baked in**: `prisma/schema.prisma:CostEvent`, `src/lib/observability/cost-events.ts`.
- **What breaks if violated**:
  - Pricing-table drift: when OpenAI changes prices, cost estimates drift. Acceptance criterion per master plan: reconcile within 5% of OpenAI's monthly invoice.
  - Migration to a different AI provider: requires new `CostEvent.model` enum entries + new estimate logic.

### 10.3 Per-session ID logging mandatory

- **Assumption**: Every state transition logs a 3-letter prefix + session-scoped ID per AGENTS.md. Registry: `rid` (audio), `wbsid` (whiteboard), `obx` (outbox), `snp` (snapshot), `pvw` (preview), `pvs` (per-page view state), `avx` (live A/V), `cev` (cost event), `blb` (blob cleanup CLI), `brs` (branch sweep CLI).
- **What breaks if violated**: prod debugging becomes impossible. Sarah-reported bug ("my session lost audio") can't be traced without per-session IDs.
- **Migration check**: this is a code-discipline assumption; preserve across phases. Each new feature with a state machine MUST register a prefix.

---

## Migration checklist — copy + check yes/no before deploying to a new platform

> When considering AWS, Cloudflare, self-hosted, or any other platform migration, walk this list. Every "no" or "unsure" is a regression risk.

### Compute

- [ ] New platform supports **≥300s** wall-clock per server-action / per-function invocation. (§1.1)
- [ ] **Node.js runtime** (not Edge-only) for all blob/audio/ffmpeg routes. (§1.2)
- [ ] Build hook supports `ignoreCommand`-equivalent for docs-only commit skipping. (§1.4)
- [ ] Build runs `prisma migrate deploy` with strict per-env `DATABASE_URL` scoping. (§1.5)
- [ ] Build command can chain `npm run test:regression && npm run build` (or equivalent). (§6.1)
- [ ] `postinstall` hooks supported (Prisma generate + pdfjs worker copy). (§6.2, §6.3)

### Database

- [ ] Per-environment (prod / dev) DB branch or instance separation. (§2.1)
- [ ] Pooled + direct connection split supported (PgBouncer or RDS Proxy equivalent). (§2.2)
- [ ] Idle connection timeout validated; `withConnectionRetry` pattern in place for long-running scripts. (§2.3)
- [ ] Additive-migrations policy preserved. (§2.4)

### Object storage

- [ ] Per-env buckets OR dual-reference-check pattern preserved. (§3.1)
- [ ] Tokenized + revocable share URLs supported (no public student content). (§3.2)
- [ ] Direct client → storage upload supported (signed PUT URL pattern). (§3.4)

### External APIs

- [ ] OpenAI API key valid for new deployment; rate-limit tier validated. (§4.1, §4.2)
- [ ] Cost-events pricing table audited for current OpenAI prices (or new provider). (§10.2)
- [ ] Google OAuth callback URL updated in Google Cloud Console. (§4.3, §5.5)

### Networking + security

- [ ] CSP `connect-src` includes new sync server origin if changing. (§5.1, §5.3)
- [ ] Permissions-Policy applied **site-wide** (not per-route). (§5.4)
- [ ] WebRTC ICE config valid; TURN provisioned if NAT failures expected. (§5.2)
- [ ] Ownership-assertion helpers preserved on all student-data server actions. (§5.6)
- [ ] Rate-limit middleware re-architected as Redis-backed if multi-instance deployment. (§5.7)
- [ ] `NEXTAUTH_URL` matches new domain; session cookies scoped correctly. (§5.5)

### Runtime

- [ ] Node.js ≥20 (add explicit `engines` pin in `package.json` if migrating). (§7.1)
- [ ] ffmpeg-static binary works on new platform's OS + arch (or ffmpeg shipped separately via Layers / image). (§7.2, §7.4)
- [ ] Excalidraw + socket.io-client major versions unchanged unless re-tested. (§7.5, §7.6)

### Browser support

- [ ] iOS Safari recording matrix re-verified post-migration (mimetype handling unchanged). (§8.1)
- [ ] Autoplay-block UI ("Tap to hear") still triggers correctly. (§8.3)

### Operational

- [ ] `.env` discipline preserved; no secrets in source control. (§10.1)
- [ ] Per-session ID logging preserved across all new code paths. (§10.3)
- [ ] Cost-events instrumentation continues firing on new AI call sites. (§10.2)

---

## Change log

- **2026-05-17** — initial inventory. Audited post-Vercel-Pro upgrade. Captures: Vercel Pro 300s ceiling now real (§1.1), housekeeping smoke lessons (§2.3, §3.1, §3.3, §9.1), cost-events shipped (§10.2), per-page view state shipped (§7.5).
