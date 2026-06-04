# Testing coverage map (Mynk / tutoring-notes)

> **Source of truth** for what is covered by automated tests *with teeth* vs what still depends on manual smoke. Branch audited: **`identity-p2-multitutor`** (2026-06-03). Re-audit when a major surface ships or the test harness changes.
>
> **Andrew's driver:** full manual regression does not scale; this doc names gaps and prioritizes Playwright automation.

---

## Summary (headline numbers)

| Metric | Count | Notes |
|--------|------:|-------|
| **User-facing features audited** | **62** | Rows in the matrix below (one row per distinct surface or flow) |
| **Manual-only (tier M only, or M + shallow visual)** | **24** | No Jest/Playwright behavior assertion; may have screenshot-only or none |
| **High-blast-radius manual-only ("teeth gaps")** | **11** | Auth boundaries, claim/identity, lockout UX, consent lattice, full recording lifecycle on device, marketing IA |
| **Features with integration teeth (I and/or E/RB)** | **38** | Includes identity `src/__tests__/identity/*` (real test DB) |

**High-blast-radius teeth gaps (automate first):**

1. **AccountHolder login + 2FA** — logic tested (U/I); **no browser enroll/verify/manage**; AH login still uses **in-memory IP limiter** (cold-start gap).
2. **Claim wizard UI** — strong **I** on APIs/state; **no E2E** through interstitial → add-new / attach-existing / connect-self / setup.
3. **Child PIN login + cooldown UX** — **I** on limiter math + durability; **M** for `/students/login` UI countdown and hardware timing.
4. **Consent / attestation (Phase 3)** — **stub only** (`assertEffectiveConsent` P2a); whiteboard tutor checkbox has **U + partial E**.
5. **Full tutor recording lifecycle (in-person)** — FSM/outbox **U**; **E** partial (integration + opt-in rollover); Sarah-class hardware still **M**.
6. **Parent dashboard + child detail UI** — ownership **I**; pages **M** (no Playwright).
7. **Marketing `/` + `/features` + nav** — **M** (Phase D copy smokes queued).
8. **Impersonation round-trip in browser** — **U** on actions; **M** for dashboard → impersonate → exit (Andrew smoke).
9. **Verify-email + AH forgot/reset in browser** — route handlers **I**; forms **M**.
10. **Live transcription (spike)** — timeline assembly spec **intentionally RED**; capture path **M** (hardware-gated).
11. **Multitutor UX** (handle display, spacing) — schema/rules **I**; preview polish **M**.

---

## How to read tiers

| Tier | Meaning | Where it runs |
|------|---------|---------------|
| **U** | Unit — pure logic, mocks, jsdom components; no real DB | `src/__tests__/**` via `npm test` |
| **I** | Integration — Jest against **local Docker Postgres** (`jest.global-setup.ts`) | `src/__tests__/identity/**`, some route/action tests |
| **E** | E2E — Playwright against **localhost:3100** (+ Docker relay for wb) | `tests/smoke/**`, `tests/integration/**`, `tests/e2e/**`, `tests/visual/**` |
| **RB** | Real-browser — two Excalidraw clients + relay; viewport oracle | `npm run test:wb-sync` → `tests/integration/whiteboard-live-sync-regression.spec.ts` |
| **M** | Manual-only — no automated behavior coverage (gap) | Pilot smoke, preview deploy, hardware |

**Honesty notes:**

- **Shallow U** = source checks, mocked handlers, or stubbed consent — called out in Notes.
- **`test:regression`** is **not** the full Jest suite — it runs only `src/__tests__/regressions/*` (6 files). Gates often also run targeted patterns (`identity`, `whiteboard`, etc.) per branch README / handoff.
- **Playwright is excluded from `test:regression`** by design: `jest.config.ts` sets `testPathIgnorePatterns` to include `<rootDir>/tests/`.

---

## Test harness (current state)

| Script | What it runs |
|--------|----------------|
| `npm test` | All Jest under `src/__tests__/` (excludes `tests/`) |
| `npm run test:regression` | **Only** `src/__tests__/regressions/*.test.ts` (pilot-visible regressions) |
| `npm run test:e2e` | Playwright default projects: **desktop/mobile smoke** + **visual** + **e2e** (not integration) |
| `npm run test:integration` | Playwright `integration` project (+ `integration-setup` auth) |
| `npm run test:wb-sync` | `test:wb-jest` + Playwright `wb-regression` (Docker Postgres + relay + dev server) |
| `npm run test:e2e:smoke` | `tests/smoke/**` only |

**Playwright config:** `playwright.config.ts` — forces local DB (`127.0.0.1:5432/tutoring_notes`), port **3100**, wb relay **3002**, `auth.setup.ts` → `tests/integration/.auth/tutor.json` for integration/wb-regression.

**Playwright specs that exist today:**

| Path | Project | Coverage character |
|------|---------|-------------------|
| `tests/smoke/*.spec.ts` | desktop + mobile | Console-clean smoke; wb consent+mount needs `BLOB_*` |
| `tests/smoke-admin-student-detail.spec.ts` | desktop | Note + outbox + share link; auth redirect; forgot-password load |
| `tests/visual/pages.spec.ts` | desktop | Screenshot + axe; login, signup, share, feedback, admin list/detail |
| `tests/integration/*.spec.ts` | integration | Recording e2e, resilience, live-av, group presence (tutor auth) |
| `tests/integration/whiteboard-live-sync-regression.spec.ts` | wb-regression | **RB** sync invariants |
| `tests/e2e/audio-rollover.spec.ts` | e2e | **Opt-in** (`RUN_AUDIO_ROLLOVER_E2E=1`) |
| `tests/audio-upload.spec.ts`, `tests/ai-panel.spec.ts` | (default e2e project if matched) | Legacy paths; verify before relying on CI |

**Why Playwright is not in `test:regression`:** separate toolchain, Docker/webServer startup cost, and intentional split — regression folder guards **fast, deterministic** production bugs; Playwright is the **slow browser net** (smoke/integration/wb-sync).

---

## Coverage matrix

| Feature | Area | Tier(s) | Where covered | Notes / gap |
|---------|------|---------|---------------|-------------|
| Tutor credentials login | Tutor/admin | U, I | `auth-sec1.test.ts`, `identity-2fa.test.ts` | NextAuth `authorize`, test-account block, JWT claims — **not** full `/login` UI submit |
| Tutor Google OAuth sign-in | Tutor/admin | U | `auth-sec1.test.ts` | Callback rejects unknown/test emails — **M** for OAuth redirect UI |
| 2FA TOTP enroll (setup QR, secret local) | Tutor/admin | U | `identity-2fa.test.ts` | Encryption, no external QR URL, otpauth label — **M** for `/admin/settings/2fa/setup` UI |
| 2FA verify gate (middleware) | Tutor/admin | U | `identity-2fa.test.ts` | Cookie/JWT `twoFactorVerified` — **M** for verify page navigation |
| 2FA manage (rotate, backup codes) | Tutor/admin | U | `identity-2fa-management.test.ts` | Source/oracle tests — **M** for acknowledge UX in browser |
| 2FA admin reset | Tutor/admin | U | `identity-2fa-management.test.ts` | ADMIN-only guard — **M** operator flow |
| Admin vs tutor role routing | Tutor/admin | U | `admin-routing.test.ts`, `auth-sec1.test.ts` | `getAdminSessionMode` — **M** for post-login landing |
| Admin dashboard (`/admin`) | Tutor/admin | M | — | SEC-1 C smoked manually; no Playwright |
| Impersonation start/exit | Tutor/admin | U | `impersonation-b.test.ts`, `impersonation-c.test.ts`, `impersonation-d.test.ts` | Banner, session mint, forbidden cases — **M** dashboard round-trip |
| Impersonation role guards (TUTOR cannot impersonate) | Tutor/admin | U | `auth-sec1.test.ts`, `impersonation-b.test.ts` | — |
| Student list (`/admin/students`) | Tutor/admin | E (visual) | `tests/visual/pages.spec.ts` | Screenshot + a11y only — **M** for data/actions |
| Student detail | Tutor/admin | U, E | `note-and-share.test.ts`, `tests/visual/pages.spec.ts`, `tests/smoke-admin-student-detail.spec.ts` | Note create + outbox + share **E**; not all detail actions |
| Create / send claim invite (tutor) | Tutor/admin | I | `identity-p2b.test.ts` (P2B-CLM), `identity-p2a.test.ts` | API/state — **M** for "Send invite" UI behind flag |
| In-person audio record (student page) | Tutor/admin | U, E | `useAudioRecorder.dom.test.tsx`, `lifecycle-machine.test.ts`, `tests/smoke/audio-recording.spec.ts` | Hook + smoke with mocked media — **M** real mic/iOS |
| Audio upload tab + transcribe | Tutor/admin | E | `tests/audio-upload.spec.ts`, `tests/ai-panel.spec.ts` | Playwright; not in default pre-merge gate |
| Whiteboard session create (consent checkbox) | Tutor/admin | U, E | `createWhiteboardSession.test.ts`, `tests/smoke/whiteboard-workspace.spec.ts` | Server rejects missing consent — **E** needs Blob token |
| Whiteboard workspace lifecycle (draw, pause, end) | Tutor/admin | U, E, RB | `endWhiteboardSession.test.ts`, `recorder-lifecycle.test.ts`, `tests/integration/recording-*.spec.ts`, `whiteboard-live-sync-regression.spec.ts` | End-session atomicity **U**; full path **E/RB** local only |
| Whiteboard share / parent replay | Tutor/admin | U, E | `joinToken.test.ts`, `tests/visual/pages.spec.ts` (`/s/token`) | Share page visual — **M** for replay scrub on device |
| Email outbox + share link from outbox | Tutor/admin | U, E | `upload-outbox.test.ts`, `tests/smoke-admin-student-detail.spec.ts` | Outbox row logic **U**; click-through **E** |
| Revoke / rotate share links | Tutor/admin | U | `note-and-share.test.ts` | — |
| Tutor settings profile / change password | Tutor/admin | M | — | **M**; policy drift vs signup backlogged |
| Tutor settings email (Gmail OAuth) | Tutor/admin | M | — | **M** (pilot); integration smoke manual |
| Tutor forgot / reset password | Tutor/admin | U, E (shallow) | `password-reset.test.ts`, `tests/smoke-admin-student-detail.spec.ts` | Tutor reset **U**; smoke loads forgot page only |
| Live A/V (mic/cam, mesh) | Tutor/admin | U, E | `peer-mesh.test.ts`, `useLiveAV.dom.test.tsx`, `tests/integration/live-av-4d-regressions.spec.ts` | **M** for student tile/camera on hardware |
| AI assist panel → note form | Tutor/admin | E | `tests/ai-panel.spec.ts` | Not wired to `test:regression` |
| AccountHolder signup | Identity/parent | I, M | `identity-p2b.test.ts` (P2B-AHSIGN) | Route validation **I**; confirm-password field **M** (smoke queued `96c6a6b`) |
| AccountHolder login | Identity/parent | I, M | `identity-p2a.test.ts` (session, cookies) | **M** UI; **in-memory** IP limiter not durable |
| Verify email (AH) | Identity/parent | I | `identity-p2b.test.ts` (P2B-REDIR) | Redirect origin — **M** full verify flow |
| AH forgot / reset password | Identity/parent | I | `identity-p2b.test.ts` (P2B-RESET), `identity-p2a.test.ts` (revoke sessions) | **M** forms in browser |
| Parent dashboard | Identity/parent | M | — | **M** |
| Child detail + Change PIN | Identity/parent | I, M | `identity-p2b.test.ts` (P2B-PIN), `assertOwnsLearnerProfile.test.ts` | Credential PATCH **I**; ChangePinForm UI **M** |
| Device session list + revoke one/all | Identity/parent | I | `identity-p2b.test.ts` (P2B-DEV) | — |
| Claim interstitial (existing AH session) | Identity/parent | I, M | `identity-p2b.test.ts` (P2B-INT) | **M** for radio UX / spacing (smoked favorably) |
| Claim add-new-child | Identity/parent | I, M | `identity-p2a.test.ts`, `identity-p2-multitutor.test.ts` | Atomic claim **I** — **M** wizard UI |
| Claim attach-existing profile | Identity/parent | I, M | `identity-p2-multitutor.test.ts` (IAC-3) | Andrew smoked — **M** for e2e automation |
| Claim connect-self (adult learner) | Identity/parent | I, M | `identity-p2-multitutor.test.ts` (IAC-8) | **M** UI |
| Claim setup / credential + weak PIN | Identity/parent | I, M | `identity-p2b.test.ts` (P2B-PINWEAK) | **M** setup page |
| Child PIN login | Identity/parent | I, M | `identity-p2b.test.ts` (P2B-LOCK), `learner-pin-throttle-durability.test.ts` | Limiter **I** with teeth; **SMOKED-PASS** on hardware 2026-06-03 |
| Learner hard lock + parent unlock | Identity/parent | I, M | `learner-pin-throttle-durability.test.ts`, `identity-p2a.test.ts` | ~13 failures, durable — UI message **M** |
| Learner soft cooldown (4→30s, 7→5min) | Identity/parent | I, M | `learner-pin-throttle-durability.test.ts` (LRL-COL-*) | **SMOKED-PASS** hardware; autofocus/disabled submit **M** |
| accessMode mismatch guard | Identity/parent | I | `identity-p2-multitutor.test.ts` (IAC-6) | **Unreachable in UI** by design — dead-code path |
| Multitutor: one profile → many tutor Students | Identity/parent | I | `identity-p2-multitutor.test.ts` | — |
| Family-scoped username + login handle | Identity/parent | I, M | `identity-p2-multitutor.test.ts` (IAC-2, IAC-7) | **M** for handle display on 4 surfaces |
| `assertOwnsLearnerProfile` | Cross-cutting | I | `assertOwnsLearnerProfile.test.ts` | Denials + `lpr=` logging |
| Session fixation / cross-cookie admin gate | Cross-cutting | I | `identity-p2a.test.ts` | AH cookie vs NextAuth JWT |
| Tombstoned AH / learner rejection | Cross-cutting | I | `identity-p2a.test.ts` | — |
| Consent scope (`assertEffectiveConsent`) | Cross-cutting | U (stub) | `identity-p2a.test.ts` | **Phase 3 stub** — not real lattice |
| Whiteboard tutor consent checkbox | Cross-cutting | U, E | `createWhiteboardSession.test.ts`, wb smokes | Not parent/tutor attestation records |
| Capture attestation (in-person) | Cross-cutting | M | — | `interim-capture-attestation` branch — **M** |
| Recording FSM (`evaluateLifecycle`) | Cross-cutting | U | `lifecycle-machine.test.ts`, `recording-state.test.ts` | Strong unit teeth |
| Upload outbox (IndexedDB + drain) | Cross-cutting | U | `upload-outbox.test.ts`, `upload-outbox-instance.helpers.test.ts` | **M** for offline throttle UI |
| Recording draft store (IDB) | Cross-cutting | U | `recording-draft-store.test.ts` | — |
| End-session atomic compose | Cross-cutting | U | `endWhiteboardSession.test.ts`, `compose-bridge-state.test.ts` | — |
| Live transcription timeline assembly | Cross-cutting | U (RED) | `ltx/ltx-timeline-assembly.test.ts` | **6 RED** by design until implementation |
| CSP / middleware security headers | Cross-cutting | U | `regressions/csp-headers.test.ts` | Part of `test:regression` |
| Upload route privacy / client-direct | Cross-cutting | U | `regressions/upload-*.test.ts`, `api/upload-audio-route.test.ts` | — |
| API rate buckets | Cross-cutting | U | `api-rate-buckets.test.ts` | — |
| Marketing landing `/` | Marketing | M | — | Phase D `56dcde7` — smoke queued |
| Marketing `/features` | Marketing | M | — | Smoke queued |
| Header/footer nav (marketing) | Marketing | M | — | **M** |
| Public `/login`, `/signup` (tutor) | Marketing | E (visual) | `tests/visual/pages.spec.ts` | Pixel/a11y — not auth behavior |
| Privacy / terms facades | Marketing | M | — | Legal sync manual |
| Public feedback page | Marketing | E | `tests/visual/pages.spec.ts`, smoke-admin | — |

---

## Part 2 — Smoke automation roadmap

Prioritize **(hand-test frequency) × (blast radius)**. Target: **Playwright E2E** against **local harness** (existing `playwright.config.ts`) first; add **scheduled preview smoke** once secrets + `playwright@test.local` exist on preview-dev.

### Phase 0 — Harness (1–2 days)

1. **Document and script** `npm run test:e2e:smoke` + `npm run test:integration` as the **browser gate** in `docs/DEPLOY.md` / branch handoff (already exist; not pre-merge today).
2. **Recreate `playwright@test.local`** on preview-dev (called out in ORCHESTRATOR-STATE) before preview-targeted runs.
3. Add **`test:e2e:identity`** project (new Playwright project, `testMatch: tests/e2e/identity/**`) with **storageState** for tutor, AH, and learner — mirror `integration-setup` pattern.

### Phase 1 — Highest ROI flows (automate first)

| Priority | Flow | Why | Approach |
|----------|------|-----|----------|
| **P0** | Tutor login → 2FA verify → land `/admin` or students | Every deploy; auth boundary | Extend `auth.setup.ts`; add `tests/e2e/auth-tutor-2fa.spec.ts` using TOTP test secret from seed |
| **P0** | AccountHolder signup (confirm password) → verify-email stub → dashboard | New identity epic | Seed AH + mailcatcher or token injection; assert dashboard |
| **P0** | Claim token: interstitial → add-new-child → setup PIN → success | Multi-tenant core | Single happy-path **E**; reuse `identity-p2b` seed helpers via API |
| **P0** | Child PIN login → 4 wrong → 30s cooldown UI → unlock via parent API | Just validated on hardware | Playwright + DB seed throttle row; assert disabled button + countdown text |
| **P1** | AH login + forgot/reset password | Parent path | Same harness as P0 AH |
| **P1** | Recording: open student → Record tab → short capture → segment visible | Sarah-critical | Extend `recording-resilience.spec.ts` patterns; fake media already in config |
| **P1** | Impersonation: admin dashboard → impersonate test1 → exit → dashboard | SEC-1 regression | One **E** on ADMIN seed |
| **P2** | Marketing `/` + `/features` links + hero CTAs | Phase D churn | Visual or DOM assertions (lighter than full auth) |
| **P2** | Claim attach-existing + connect-self | Less frequent | Two additional **E** specs |

### Phase 2 — Gate wiring

| Gate | Recommendation |
|------|----------------|
| **Pre-merge (branch)** | Keep: `tsc`, `next build` (build-surface), `npm test` + identity patterns, `test:regression`, **`test:wb-sync`** if wb touched. **Add:** `npm run test:integration` when Playwright identity/recording specs exist and are stable (&lt;10 min). |
| **Pre-merge (do NOT yet)** | Full `test:e2e` visual baselines — UI churn; baselines not committed (`BACKLOG` operational item). |
| **CI / scheduled** | Nightly or post-deploy workflow: `test:integration` + `test:e2e:smoke` against **preview URL** with `PLAYWRIGHT_BASE_URL` override + Neon preview DB seed job. |
| **Production** | Manual Sarah matrix + iOS doc until Phase 2 CI green for 2 weeks. |

### Phase 3 — Durable limiters + consent

1. **AH login + 2FA IP limiters** → Neon table (same pattern as `LearnerLoginThrottle`) — add **I** cold-start tests, then **E** login throttle.
2. **Phase 3 consent lattice** — replace P2a stub; add **I** for `assertEffectiveConsent` + **E** for capture attestation modal when branch merges.

### Explicit non-goals (stay manual for now)

- **iOS Safari** matrix (`docs/PHASE-2-IOS-SMOKE-MATRIX.md`) — Playwright WebKit ≠ real WebKit; keep hardware rows.
- **Long-form 60–90 min transcribe** — `docs/SMOKE-LONG-FORM-TRANSCRIBE.md`; scheduled manual or dedicated job.
- **PDF inv 8 in wb-regression** — quarantined until pdfjs headless fix (`BACKLOG`).

---

## Maintenance

- When adding a feature: add a row here in the same PR (or orchestrator docs pass).
- When adding a test with teeth: update tier + path; remove **M** if behavior is truly asserted.
- Quarterly: reconcile row count with `npm test --listTests` and `find tests -name '*.spec.ts'`.

**Related:** [`docs/BACKLOG.md`](BACKLOG.md) § `[TESTING]` · [`docs/handoff/ORCHESTRATOR-STATE.md`](handoff/ORCHESTRATOR-STATE.md) · [`src/__tests__/regressions/README.md`](../src/__tests__/regressions/README.md)
