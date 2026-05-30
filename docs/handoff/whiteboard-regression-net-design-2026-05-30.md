# Whiteboard regression-net design — 2026-05-30

**Repo:** tutoring-notes · **HEAD at design time:** `ce9719d`  
**Author:** Opus orchestrator (design pass only — no implementation)  
**Status:** DESIGN DOC — executor briefing for the Composer 2.5 implementation sprint  
**Companion docs:** [docs/WHITEBOARD-STATUS.md](../WHITEBOARD-STATUS.md) · [docs/PLATFORM-ASSUMPTIONS.md](../PLATFORM-ASSUMPTIONS.md)

---

## Why this doc exists

A viewport-center coordinate bug haunted the whiteboard for ~2 weeks and ~10–20 fix iterations because every unit test ran in jsdom — where `offsetLeft`/`offsetTop` always return 0 — making the buggy and correct formulas indistinguishable. The fix (`123e60e`) was found only via manual real-hardware smoke and an on-screen debug HUD. The real-browser Playwright harness that *could* have caught this class of bug existed but was **inert**: it skips unless `WHITEBOARD_SYNC_URL` is set, requires a seeded DB + tutor auth, and is wired into **no automated gate** — Vercel `buildCommand` runs only `npm run test:regression` (the `src/__tests__/regressions/` folder), and no GitHub workflows exist.

This document designs a **hermetic, automated real-browser whiteboard regression net** with real teeth.

---

## Decision 1 — Hermetic relay

### What the relay actually is

The sync server is a pinned build of [`excalidraw-room`](https://github.com/excalidraw/excalidraw-room) (SHA `03ff435860b508d7cd9e005cfc90f7977ae2a593`) — a small Node.js Express + Socket.IO app. It has no persistent state and no database. Its only job is to forward opaque encrypted binary payloads between connected room members via five socket events: `join-room`, `server-broadcast`, `init-room`, `first-in-room`, `new-user`, `room-user-change`, `client-broadcast`. It is trivially runnable locally. The existing `whiteboard-sync/` sibling repo already has a Dockerfile and the README explicitly documents local testing via `docker run -p 3002:3002 --env PORT=3002 ...`.

### Options and tradeoffs

| Option | Description | Upside | Downside |
|---|---|---|---|
| **A — Real relay in Docker (recommended)** | `docker build -t wb-relay-local ../whiteboard-sync` once; `docker run --rm -p 3002:3002 -e PORT=3002 -e CORS_ORIGIN=http://localhost:3100 wb-relay-local` in Playwright `webServer` | Exercises the real protocol: Socket.IO handshake, `join-room` sequence, encrypted `client-broadcast` fan-out. Same code that runs in production. First build ~60s (clones excalidraw-room from GitHub), subsequent runs ~2s. Docker is already required for `npm run db:up` (Postgres). | Requires Docker daemon running; adds ~30s relay startup to the first test run. |
| **B — Node process from source** | Clone excalidraw-room at pinned SHA, `npm install`, `node dist/index.js` | No Docker dependency | Adds a second node_modules to manage; makes pin drift easier to miss; less isolated than a container. |
| **C — In-process Socket.IO mock** | Implement a minimal in-memory relay in the test helpers | No external process | Reintroduces the exact "tests can't see the real bug" failure mode that caused the saga. Any mock relay deviation from the real `client-broadcast` fan-out or `new-user` sequence can mask real regressions. **Reject.** |

### Recommendation: Option A

Use the existing `whiteboard-sync/Dockerfile` to build a local image tagged `wb-relay-local`. Wire it into Playwright's `webServer` array as a second entry. The relay's HTTP health endpoint (`http://localhost:3002/` → `"Excalidraw collaboration server is up :)"`) serves as the readiness URL.

**CORS**: The relay respects `CORS_ORIGIN` env var (comma-separated). Set `CORS_ORIGIN=http://localhost:3100` when running tests.

**Residual risk**: The relay image is built from the pinned SHA at `docker build` time. If the pinned SHA becomes unreachable on GitHub (force-push/deletion), the build fails. Mitigation: commit the pinned SHA to `PLATFORM-ASSUMPTIONS.md` and verify it in the 90-day pin cadence already on the backlog.

**Wire protocol**: The relay does NOT need to understand the encrypted payloads — it just fans them to all room members. There is no TURN/STUN equivalent; the relay is purely a WebSocket fan-out broker with room membership tracking.

---

## Decision 2 — DB + auth seeding

The existing infrastructure already covers everything needed. The setup sequence is:

```
Step 1: npm run db:up
        → docker compose up -d postgres (existing)
        → waits for Postgres to accept connections

Step 2: npx prisma db push --skip-generate
        → applies schema to dev Postgres (already in playwright.config webServer command)

Step 3: Playwright integration-setup project (auth.setup.ts)
        → seedTestAdmin() + seedTestStudent() (idempotent)
        → logs in via the UI, writes tests/integration/.auth/tutor.json

Step 4: wb-regression project
        → each test calls seedWbLiveSyncSession() (already exists, idempotent)
        → WhiteboardJoinToken created fresh per test (unique token)
        → No inter-test state: each test gets its own WhiteboardSession row
```

**Key points**:
- `seedWbLiveSyncSession()` already creates admin, student, open WhiteboardSession, and WhiteboardJoinToken in one call. It is fully idempotent and isolated per test.
- The `auth.setup.ts` storageState (`tutor.json`) is already a project dependency in `playwright.config.ts` via `dependencies: ["integration-setup"]`.
- No `BLOB_READ_WRITE_TOKEN` is required for the core invariants (only invariant 5/8 PDF path needs it; those tests already self-skip when the token is absent).
- No fixture changes are needed for the hermetic relay path — the relay URL is injected via env var `WHITEBOARD_SYNC_URL=ws://localhost:3002`.

---

## Decision 3 — Gate location

### Constraint: Vercel buildCommand is NOT the gate

Vercel's `buildCommand` runs `npm run test:regression && npm run build`. The Vercel build environment has no browsers, no Docker daemon, no relay process, and a 300s wall-clock ceiling. Real-browser whiteboard sync tests can take 3–5 minutes for the full suite. **No Playwright whiteboard tests can run in Vercel buildCommand.** This is a hard constraint.

### Options

| Option | Description | Upside | Downside |
|---|---|---|---|
| **A — Local pre-merge `npm run test:wb-sync` (recommended now)** | Owner runs this before `git merge --no-ff` on the whiteboard branch. Matches the current "branch + smoke + merge" solo-pilot convention. | No new infra; works today; fits documented merging convention. | Can be forgotten; relies on owner discipline. |
| **B — GitHub Actions workflow (recommended later)** | `.github/workflows/wb-regression.yml`: `ubuntu-latest` runner, Postgres service container, Docker for relay, Playwright browsers installed, triggered on push to any branch touching `src/lib/whiteboard/` or `src/components/whiteboard/` or `tests/integration/whiteboard*`. | Zero-miss automation; PRs blocked if net is red. | New infra (GitHub Actions minutes cost: ~$0.008/min = ~$0.08–0.40 per run at current suite size); needs secrets (DB URL, WHITEBOARD_SYNC_URL override, playwright browser cache). |

### Recommendation: A now, B later (phased path)

**Phase 1 (implement immediately)**: Add `npm run test:wb-sync` as the local pre-merge gate. The script runs:
1. Jest whiteboard suites (`npx jest --testPathPattern="whiteboard|sync-client"`)
2. Playwright wb-regression project (`npx playwright test --project=integration-setup && npx playwright test --project=wb-regression`)

Add a mandatory bullet to the merge checklist in AGENTS.md (under "Merging convention"): `- [ ] npm run test:wb-sync passed on the branch before merge --no-ff`.

**Phase 2 (when team grows or misses start accumulating)**: GitHub Actions workflow triggered on `push` to branches touching whiteboard code paths. Uses Postgres service container + Docker relay (Docker-in-Docker via `docker/setup-buildx-action`) + `npx playwright install --with-deps chromium`. Approximately 5–8 minutes per run.

### Whiteboard Jest suite gate

The whiteboard Jest suite currently runs during `npm test` but is NOT in the Vercel buildCommand. The `test:wb-sync` script should include it explicitly. This covers:
- `sync-client.test.ts` (13 tests: protocol events, throttle, crypto, presence)
- `whiteboard-live-sync.helpers.ts` indirect coverage via integration tests
- Unit tests for `viewport-align.ts` (the offset-invariance math)

These tests catch API-contract regressions that the real-browser net is too slow to cover (e.g., `validateWireMessage` rejecting malformed payloads). The jsdom blind spot for coordinate math is now explicitly documented — the Jest viewport tests must use the offset-invariance pattern (vary offsetLeft/offsetTop, assert center unchanged) rather than snapshot-matching the formula.

---

## Decision 4 — Invariant coverage gaps

### Coverage map of the current spec

| Invariant | Description | Current coverage |
|---|---|---|
| 1 | tutor→student live stroke (new ID) | ✅ inv 1 |
| 1b | stroke continuation (same-ID growStroke, version growth) | ✅ inv 1b |
| 2 | student→tutor live | ✅ inv 2 |
| **3** | **live object MOVE propagation** | ❌ absent |
| 4 | viewport center offset-invariant follow | ✅ inv 4 (was the proven-teeth test) |
| **5** | **pan follow (explicit pan, student tracks)** | ⚠️ partially covered by inv 4 but not asserted directly |
| **6** | **zoom follow (zoom must NOT move center)** | ❌ absent |
| **7** | **student sees REAL image not placeholder** | ❌ absent |
| **8** | **PDF page opens centered+fit; student lands on it** | ⚠️ inv 5 checks pages appear but not centering |
| 9 | page isolation / no bleed | ✅ inv 3 |
| **10** | **follow gating (sync ON/OFF, one-shot snap, default ON)** | ❌ absent |

### Full invariant table (all 10 including new)

| # | Name | What to assert | Independent oracle (NOT the production formula) | Tolerance |
|---|---|---|---|---|
| 1 | tutor→student stroke (new ID) | `readSceneElementIds(student)` contains tutor strokeId within deadline | `window.__TN_WB_E2E__[student].getElements()` (real Excalidraw scene) | 12 s delivery |
| 1b | stroke continuation (growStroke) | `readStrokeWidth(student, strokeId)` ≥ finalWidth − 1 after N version bumps | `widthOf()` from real bridge element | ±1 unit |
| 2 | student→tutor stroke | `readSceneElementIds(tutor)` contains student strokeId | same bridge | 12 s |
| 3 | live MOVE propagation | Move element on tutor (bridge `moveElement(id, newX, newY)`) → student `getElements().find(id).x` matches newX | bridge `getElements()` before/after; verify delta == intended move, NOT a re-read of the production move calculation | ±2 scene units |
| 4 | viewport center offset-invariant | Place marker at tutor viewport center → student aligns → `markerCenterOffsetFromViewportCenter(student, id)` < 80 screen px | `viewportSceneCenterFromScroll(scrollX, scrollY, zoom, w, h)` from `viewport-align.ts` (independent of appState.offset*) | < 80 px screen |
| 5 | pan follow | Tutor pans to arbitrary scrollX/Y → `readViewportSnapshot(student)` scroll matches `studentScrollFromFollowCenter(followWire, student.w, student.h)` | `studentScrollFromFollowCenter` as oracle (computes expected from center coords, not the production tutor-side formula) | ±8 scene units |
| 6 | zoom-invariant center | Tutor zooms in (2×) then out (0.5×) → compute `viewportSceneCenterFromScroll(before)` and `viewportSceneCenterFromScroll(after)` on student side → assert centers match within tolerance | `viewportSceneCenterFromScroll` as oracle — the invariant is that zoom changes viewport box size, NOT scene center | ±4 scene units |
| 7 | real image not placeholder | Tutor inserts an image asset (PNG fixture); student receives it; bridge `getElements().find(id)` shows element is NOT `{ customData: { isPlaceholder: true } }` and has a non-empty `fileData` or `fileId` | Bridge `getElements()` field inspection; does not trust the DOM rendering, only the scene data | none — pass/fail |
| 8 | PDF page centered+fit on student | After PDF insert + page switch, student's `readViewportSnapshot()` scroll/zoom means the PDF image element's bbox is within the visible viewport using the oracle formula | Compute whether `(el.x − scrollX)*zoom` is within `[0, viewportW]` and Y analog, using real element coords from bridge and real viewport from `getAppState()` | element center within viewport |
| 9 | page isolation / no bleed | Stroke on page N absent from student scene on page M (already covered by inv 3) | `readSceneElementIds` | pass/fail |
| 10a | sync OFF blocks follow | Check sync-OFF checkbox → tutor pans/zooms → student viewport does NOT change | read student viewport before and after tutor move; assert delta < 2 units | < 2 scene units |
| 10b | one-shot snap on sync re-enable | Re-enable sync → student viewport snaps to tutor position within 3 s | `readViewportSnapshot(student)` matches oracle within 3 s | 3 s, ±8 units |
| 10c | sync ON by default on fresh load | Fresh student page load → follow checkbox pre-checked without any user action | DOM assertion: `page.getByRole("checkbox", { name: /keep pan.*zoom synced/i }).isChecked()` | immediate |

### New bridge methods needed for inv 3, 6

The `wb-e2e-scene-bridge.ts` needs two new methods:

- **`moveElement(id: string, deltaX: number, deltaY: number): void`** — reads current element, sets x/y + bumps version, calls `updateScene`. Triggers `invokeSceneMutationHook`.
- **`appStateCenterXY(): { x: number, y: number }`** — calls `viewportSceneCenterFromScroll(...)` using the live appState. Exposes the oracle result without going through the production HUD path. (For invariant 6, both sides call this and we compare before/after zoom.)

The executor should add these to both the `WbE2eSceneBridge` type and the `registerWbE2eSceneBridge` factory.

---

## Decision 5 — Anti-flake / reliability of the net itself

Five reliability axes applied to the harness:

### Axis 1 — Determinism

**Risk**: Arbitrary `waitForTimeout(N)` sleeps introduce timing coupling that can pass on a fast machine and fail on a slow one.

**Current state**: `waitForTutorStudentConnected` waits for `"student connected"` text → good. `waitForWbE2eBridge` waits for the function to exist → good. `waitForElementOnPeer` polls with 250ms intervals → good. BUT invariant 4 has `peers.tutorPage.waitForTimeout(500)` after clicking "match tutor" — this is an arbitrary sleep.

**Fix**: Replace all `waitForTimeout(N)` between action and assertion with:
- `waitForFunction` polling the bridge until the expected state resolves, OR
- `waitForElementOnPeer` / `waitForViewportAligned(studentPage, expectedScroll, tolerance, timeoutMs)`

**New helper needed**: `waitForViewportAligned(page, role, expectedScrollX, expectedScrollY, toleranceUnits = 8, timeoutMs = 12000)` — polls `readViewportSnapshot` until scroll delta ≤ tolerance. Same pattern as `waitForElementOnPeer`.

### Axis 2 — Timing / connection waits

**Startup sequence** (must be respected in every test):
1. `waitForWbE2eBridge(tutorPage, "tutor")` — ensures Excalidraw API and bridge registered
2. `waitForWbE2eBridge(studentPage, "student")` — same for student
3. `ensureStudentFollowsTutor(studentPage)` — sets follow checkbox (already in place)
4. `waitForTutorStudentConnected(tutorPage)` — `"student connected"` banner visible

This sequence guarantees: relay connected, both bridges registered, follow mode active, room member count ≥ 2. All four steps must complete before ANY drawing action.

**Relay connection**: The sync client has auto-reconnect with exponential backoff (500ms → 10s). The `waitForTutorStudentConnected` assertion (90s timeout) is the de facto relay-connected gate — it waits for the `room-user-change` count to reach 2 as surfaced in the UI. This is correct; keep it.

### Axis 3 — Relay startup race

**Risk**: Playwright's `webServer` for the relay starts it and waits for the URL to respond. If the Docker container is slow to start (image pull, first build), the app server may start before the relay is ready, causing the first test's WebSocket connection to fail.

**Mitigation**:
- Set relay webServer `timeout: 60_000` (Docker container typically starts in <30s after first build).
- Use the relay's `/` health endpoint as the readiness URL (`http://localhost:3002/`).
- The existing `reconnectionAttempts: Infinity` in `sync-client.ts` means the app will retry until the relay is up — as long as `waitForTutorStudentConnected` has a generous timeout (90s), the race is survivable even if the relay takes 20s.

**Build-once, reuse pattern**: Document `npm run relay:build` as a one-time step in `docs/LOCAL-DEV.md`. The webServer `docker run` command uses the pre-built image (`wb-relay-local`) — it does NOT rebuild on every test run. If the image doesn't exist, the `docker run` fails with a clear error, prompting the developer to run `relay:build` first. This is acceptable UX for a local gate.

### Axis 4 — Retry policy

**Current**: `retries: process.env.CI ? 1 : 0` in `playwright.config.ts`. The wb-regression project should override to `retries: 1` unconditionally. Real WebSocket integration tests have a small, irreducible probability of transient failure (relay connection blip, Docker startup jitter). One retry absorbs this without masking real bugs.

**Retry is not a correctness substitute**: A true regression should fail on BOTH attempts. The teeth-verification plan (see below) confirms this: the reverted offset fix should fail invariant 4 on both tries.

**Per-test timeout**: `test.setTimeout(180_000)` is appropriate for core sync tests. The PDF test (inv 5/8) needs `300_000` due to Blob upload and PDF render time. Keep `test.skip(!BLOB_READ_WRITE_TOKEN)` guard — PDF tests are optional.

### Axis 5 — Clear red (regression produces unambiguous failure)

**Problem class**: A harness that "validates" by re-deriving expected values from the production formula will pass when the production formula is wrong. This is the jsdom failure mode applied to real-browser tests.

**Rule**: Every assertion must use an **independent oracle**:
- `viewportSceneCenterFromScroll` (viewport-align.ts pure function) — used as oracle for viewport center invariants 4, 5, 6
- `studentScrollFromFollowCenter` (viewport-align.ts) — oracle for scroll alignment in inv 5
- `getElements()` bridge (reads the real Excalidraw scene, not a mock) — oracle for element position in inv 3, 7, 8
- DOM checkbox state — oracle for follow gating inv 10c

**Forbidden pattern**: Asserting `student.scrollX === tutor.scrollX` (the viewports have different heights so this is ALWAYS wrong). `expectedAlignedStudentScroll()` in the helpers module correctly uses the oracle formula — use it consistently.

---

## Hermetic environment setup sequence

Complete setup sequence from scratch on a fresh dev machine:

```powershell
# Prerequisites:
#   - Docker Desktop running
#   - .env has DATABASE_URL pointing to local Postgres (or db:up docker compose)
#   - Node 20+, npm ci run already

# 1. Start local Postgres (if not already running)
npm run db:up

# 2. Build the local relay image (one-time, ~60s on first run; ~2s on cache hit)
npm run relay:build
# → runs: docker build -t wb-relay-local ../whiteboard-sync

# 3. Run the full wb regression gate
npm run test:wb-sync
# → runs steps below in sequence (see "New npm scripts" section)
```

The Playwright config's second `webServer` entry (for the relay) runs:
```
docker run --rm -p 3002:3002 -e PORT=3002 -e CORS_ORIGIN=http://localhost:3100 wb-relay-local
```

Playwright waits for `http://localhost:3002/` to respond before launching tests. The relay's HTTP response at `/` is the health signal.

---

## New npm scripts

Add to `package.json` `scripts`:

```json
{
  "relay:build": "docker build -t wb-relay-local ../whiteboard-sync",
  "test:wb-jest": "jest --testPathPattern=\"whiteboard|sync-client|viewport-align\"",
  "test:wb-playwright": "playwright test --project=integration-setup && playwright test --project=wb-regression",
  "test:wb-sync": "npm run test:wb-jest && npm run test:wb-playwright"
}
```

Add to `playwright.config.ts`:

```typescript
// In webServer array (second entry):
{
  command: "docker run --rm -p 3002:3002 -e PORT=3002 -e CORS_ORIGIN=http://localhost:3100 wb-relay-local",
  url: "http://localhost:3002/",
  timeout: 60_000,
  reuseExistingServer: !process.env.CI,
},
```

Add new Playwright project:

```typescript
{
  name: "wb-regression",
  dependencies: ["integration-setup"],
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
    storageState: "tests/integration/.auth/tutor.json",
    permissions: ["microphone"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
      env: {
        WHITEBOARD_SYNC_URL: "ws://localhost:3002",
      },
    },
  },
  retries: 1,
  testMatch: ["**/integration/whiteboard-live-sync-regression.spec.ts"],
}
```

**Env injection note**: `WHITEBOARD_SYNC_URL` must be set for the Next.js dev server (the webServer command in `playwright.config.ts` already does `set NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1`). Add `WHITEBOARD_SYNC_URL=ws://localhost:3002` to that command string for hermetic runs. The test's `readLocalEnv()` check at the top of the spec should be updated to also accept this value — OR the `.env` file should have this set for local test runs (add to `docs/LOCAL-DEV.md`).

---

## Gate recommendation

### Immediate (merge-blocking)

Add to AGENTS.md "Merging convention" section:

```markdown
- **Whiteboard sync changes** (any file touching `src/lib/whiteboard/`,
  `src/components/whiteboard/`, or `tests/integration/whiteboard*`) MUST
  pass `npm run test:wb-sync` locally before `git merge --no-ff`. The
  relay image must be pre-built (`npm run relay:build`) on the dev machine.
  Green output proves real-browser coverage, not just jsdom coverage.
```

### Later (Phase 2 gate automation)

`.github/workflows/wb-regression.yml` outline:
- Trigger: `push` to any branch where `git diff origin/master...HEAD --name-only` matches `src/lib/whiteboard/**` or `src/components/whiteboard/**` or `tests/integration/whiteboard*`
- Runner: `ubuntu-latest`
- Services: `postgres:16` service container
- Steps: checkout → Node 20 setup → `npm ci` → `npm run relay:build` → `npx playwright install --with-deps chromium` → `prisma db push` → `playwright test --project=integration-setup` → `playwright test --project=wb-regression`
- Secrets needed: `DATABASE_URL` (GitHub Actions secret, points to the service container), `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3100`
- Estimated runtime: 6–10 minutes. Cost: ~$0.05–0.08 per run (GitHub Actions free tier: 2000 min/mo on public repos; private: $0.008/min).

Do NOT add Phase 2 until: (a) a regression slips past the local gate, OR (b) the team grows beyond solo.

---

## Teeth-verification plan

**Purpose**: Prove that the harness actually goes red when the known regression is present. Red-before/green-after is mandatory — a green-only history proves nothing.

**Protocol** (runs BEFORE the gate is declared active):

```powershell
# Step 1: Start from a clean working tree on master
git stash  # if any uncommitted changes

# Step 2: Temporarily revert the offset-fix commit (no-commit mode)
git revert 123e60e --no-commit
# This restores the buggy formula: (viewportWidth/2 - scrollX) / zoom
# which contaminates center with scrollX when zoom ≠ 1

# Step 3: Run ONLY invariant 4 (the viewport-center test)
npx playwright test --project=wb-regression --grep "invariant 4"
# Expected result: RED — markerCenterOffsetFromViewportCenter > 80px

# Step 4: Record the failure output in this doc / the commit message

# Step 5: Restore the fix
git restore .

# Step 6: Run invariant 4 again
npx playwright test --project=wb-regression --grep "invariant 4"
# Expected result: GREEN — offset < 80px

# Step 7: Record the green output; declare the gate active
```

This same protocol should be run for each NEW invariant added in Phase 3:
- **Inv 3 (MOVE)**: Temporarily remove the `updateScene` call in the student's `onRemoteScene` handler → inv 3 should go red.
- **Inv 6 (zoom-invariant center)**: Restore the pre-fix zoom formula (which moved the center on zoom) → inv 6 should go red.
- **Inv 10 (follow gating)**: Remove the `syncEnabled` check in the student apply path → inv 10a should go red.

Document each red/green run in `docs/whiteboard-smoke-log.md` with the commit hash, the reverted change, and the failure output.

---

## New PLATFORM-ASSUMPTIONS entries

Add to `docs/PLATFORM-ASSUMPTIONS.md` under section 9 ("OS / development environment"):

### 9.4 Docker required for whiteboard regression net (wb-regression harness)

- **Assumption**: `npm run test:wb-sync` and `npm run relay:build` require Docker Desktop (or equivalent daemon) running on the dev machine. The local relay container (`wb-relay-local`) wraps the same `excalidraw-room` sha used in production (`03ff435860b508d7cd9e005cfc90f7977ae2a593`).
- **Where baked in**: `package.json` `relay:build` script; `playwright.config.ts` wb-regression `webServer` entry; `docs/LOCAL-DEV.md` setup steps.
- **What breaks if violated**: `npm run relay:build` fails; the Playwright wb-regression project's webServer fails to start; tests skip or fail immediately. The fallback is to use the production relay (`WHITEBOARD_SYNC_URL=wss://wb.mortensenapps.com`) — but this creates a production dependency for local tests, which is the anti-pattern we're explicitly avoiding.
- **Migration check**: If moving to GitHub Actions (Phase 2 gate), use `docker/setup-buildx-action` + `docker/build-push-action` to build the relay image in CI. The Dockerfile is already present in `whiteboard-sync/`.

### 9.5 Local relay CORS allowlist for test runs

- **Assumption**: When `wb-relay-local` runs locally for tests, it is started with `CORS_ORIGIN=http://localhost:3100`. This must match the `baseURL` in `playwright.config.ts`.
- **Where baked in**: `package.json` `test:wb-playwright` script (or the Playwright webServer command string); `docs/LOCAL-DEV.md`.
- **What breaks if violated**: Socket.IO WebSocket connections from `http://localhost:3100` are rejected by the relay with a CORS error; both peers fail to connect; all wb-regression tests fail with timeout.
- **Migration check**: If the dev server port changes from 3100, update the relay docker command's `CORS_ORIGIN` value in `package.json` and `playwright.config.ts`.

---

## Open questions for the owner (Andrew)

1. **Docker availability**: Is Docker Desktop consistently running on your Windows dev machine? If not, should we add a fallback that uses the production relay (`wss://wb.mortensenapps.com`) when `wb-relay-local` image is absent? (Downside: test passes can become environment-dependent on Fly.io uptime.)

2. **`markerCenterOffsetFromViewportCenter` tolerance**: The current threshold is 80 screen px. This was chosen to be tight enough to catch the real bug (which drifted 150–300px in practice) but loose enough to tolerate different student viewport heights (1280×640 vs 1280×900). Is 80px the right bar, or would you prefer tighter (e.g., 40px) now that the fix is solid?

3. **Invariant 7 (image assertion)**: Asserting "student sees REAL image not placeholder" requires a concrete PNG fixture in `tests/fixtures/`. Is there a small test PNG already in the repo we should reuse, or should the executor create one (e.g., a 64×64 red square)?

4. **Phase 2 gate timing**: The GitHub Actions gate adds ~$0.05–0.08 per whiteboard-touching push. With current development pace (~2–4 whiteboard PRs/week), that's ~$0.50–1.20/week — negligible. But it requires adding GitHub secrets. Do you want to add Phase 2 now while setting up Phase 1, or defer explicitly?

5. **`webServer` array**: `playwright.config.ts` currently has a single `webServer` object. Adding a second (relay) requires changing it to an array. Playwright supports this as of v1.32. Current project is `@playwright/test@^1.55.0` — no compat issue. Confirm this config change is acceptable.

---

## Sequenced Composer 2.5 execution plan

### Phase 1 — Hermetic environment (prerequisite; do this first)

**Goal**: The wb-regression project can run against a local relay with no prod dependency. Tests that already pass on prod relay still pass locally.

**Executor scope**:
1. Add `relay:build`, `test:wb-jest`, `test:wb-playwright`, `test:wb-sync` scripts to `package.json`
2. Extend `playwright.config.ts`: change `webServer` to an array (existing entry + new relay entry); add `wb-regression` project with `retries: 1`, correct env, student viewport `1280×640`
3. Update `playwright.config.ts` webServer command string to inject `WHITEBOARD_SYNC_URL=ws://localhost:3002`
4. Add `docs/LOCAL-DEV.md` section: "Running the whiteboard regression net locally" (relay:build, db:up, test:wb-sync)
5. Add new PLATFORM-ASSUMPTIONS entries §9.4 and §9.5 (above)
6. Add `docs/whiteboard-smoke-log.md` stub entry for this sprint
7. Verify: `npm run test:wb-sync` runs and the existing 5 invariants pass with the local relay (not the prod relay)

**Acceptance criterion**: Running `npm run test:wb-sync` with relay:build on a clean checkout + `npm run db:up` produces green for all existing invariants. The spec's `readLocalEnv()` WHITEBOARD_SYNC_URL check passes because the dev server command now injects it.

---

### Phase 2 — Teeth-verification

**Goal**: Prove the harness has real teeth before declaring it a gate.

**Executor scope**:
1. Follow the teeth-verification protocol (above) for invariant 4
2. `git revert 123e60e --no-commit` → run `npx playwright test --project=wb-regression --grep "invariant 4"` → record red output
3. `git restore .` → run again → record green output
4. Add entry to `docs/whiteboard-smoke-log.md`: "teeth-verify inv4 red/green, 2026-05-30"
5. Commit the smoke log update (docs-only, master, temp-file pattern)

**Acceptance criterion**: Human-readable before/after output shows `markerCenterOffsetFromViewportCenter` goes from >80px (red) to <80px (green) without any code changes other than the reverted commit.

---

### Phase 3 — Fill invariant gaps

**Goal**: Add the 5 missing invariants (3, 6, 7, 8, 10) and the 2 new bridge methods.

**Executor scope**:
1. Add `moveElement(id, deltaX, deltaY)` and `appStateCenterXY()` to `WbE2eSceneBridge` type and `registerWbE2eSceneBridge` factory in `wb-e2e-scene-bridge.ts`
2. Add `waitForViewportAligned(page, role, expectedScrollX, expectedScrollY, tolerance, timeout)` to `whiteboard-live-sync.helpers.ts`
3. Add new `test()` blocks in `whiteboard-live-sync-regression.spec.ts`:
   - `"invariant 3 — live object MOVE propagation"`
   - `"invariant 6 — zoom does not move viewport scene center"`
   - `"invariant 7 — student sees real image element (not placeholder)"`
   - `"invariant 8 — PDF page opens centered+fit on student viewport"`
   - `"invariant 10 — follow gating (sync ON/OFF/snap)"`
4. Run teeth-verify for each new invariant (revert the relevant production behavior, confirm red; restore, confirm green) per the teeth-verification protocol
5. Add a PNG fixture (`tests/fixtures/tiny-red-square.png`, 64×64) for invariant 7 if no existing fixture
6. Replace `waitForTimeout(500)` in invariant 4 with `waitForViewportAligned`

**Acceptance criterion**: All 10 invariants (1, 1b, 2, 3, 4, 5, 6, 7, 8, 10a/b/c) pass in `npm run test:wb-sync` on master HEAD. Each new invariant has at least one documented teeth-verify run in `docs/whiteboard-smoke-log.md`.

---

### Phase 4 — Wire the gate

**Goal**: Make the net mandatory before any whiteboard branch merge.

**Executor scope**:
1. Add the merge-gate bullet to `AGENTS.md` "Merging convention" section (text above under "Immediate")
2. Update `docs/WHITEBOARD-STATUS.md` §1.12 from `partial` to `done — Playwright wb-regression net active, N/10 invariants covered`
3. Update `docs/INDEX.md` to add the regression net as a reference under "Testing / smoke"
4. If Andrew greenlights Phase 2 (CI): add `.github/workflows/wb-regression.yml` per the outline above

**Acceptance criterion**: The AGENTS.md merge convention explicitly names `npm run test:wb-sync` as a required pre-merge step for whiteboard branches. A fresh developer reading AGENTS.md knows exactly what to run before merging.

---

## Summary of headline decisions

| Decision | Recommendation |
|---|---|
| Relay | Real local relay in Docker (`wb-relay-local` from existing Dockerfile), NOT a mock |
| DB/auth | Reuse existing infrastructure: `db:up` + `seedWbLiveSyncSession` + `auth.setup.ts` storageState |
| Gate | Local `npm run test:wb-sync` pre-merge now; GitHub Actions later |
| Jest gate | Include whiteboard Jest suite in `test:wb-sync` (catches API-contract regressions cheaply) |
| New invariants | Add 3 (MOVE), 6 (zoom-invariant center), 7 (real image), 8 (PDF center+fit), 10 (follow gating) |
| Anti-flake | No arbitrary sleeps — use bridge-ready/connected waits; `retries: 1` for wb-regression; relay startup via Playwright webServer URL polling |
| Teeth-verify | Revert `123e60e`, confirm inv 4 goes red; restore, confirm green; run same protocol for each new invariant |
