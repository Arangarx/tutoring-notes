# Site-wide test coverage audit (FLOOR map)

> **Branch:** `wb-wave5-polish`
> **Tip commit:** [6799aa4](https://github.com/Arangarx/tutoring-notes/commit/6799aa4) (audited); wave has since advanced (WS-O `82c0d40`).
> **Worktree:** `tutoring-notes-polishwt`
> **Audited:** 2026-07-04
> **Purpose:** PART 2 build-out inventory — behavior/contract tests that survive component dedup.
> **Supersedes (partially):** `docs/TESTING-COVERAGE.md` (stale: `identity-p2-multitutor` @ 2026-06-03).

This is the FLOOR-mapping inventory that drives the site-wide test build-out (PART 2). It is not the fix — it is the map of what exists, what's shallow, what self-skips, and where the gaps are, prioritized. Tests built from this MUST assert user-observable behavior / API contracts (DB oracles, status codes, `data-testid` visible state, independent math), NOT component internals — so they survive the coming component-deduplication refactor.

### Coverage tier legend

| Tier | Meaning |
|------|---------|
| **B** | Behavior — user-observable or API contract with independent oracle |
| **U** | Unit logic — pure functions / mocked deps; no real DB/browser |
| **S** | Shallow — source grep, screenshot/axe, or mock-only component |
| **A** | Absent |
| **SG** | Skip-gated — spec exists but `test.skip` without env (looks-tested-isn't) |
| **IC** | Implementation-coupled — asserts component internals / CSS classes |

### Harness facts (gate enrollment)

- Playwright `webServer` sets local DB, relay, harness secrets — **does NOT set `BLOB_READ_WRITE_TOKEN`** (`playwright.config.ts` L45–48).
- `integration` project excludes `identity/**` and `wb-regression` specs; those run under `identity-e2e` / `wb-regression` projects.
- `npm run test:regression` = only 6 files under `src/__tests__/regressions/`.
- **~284** test files total (~170 Jest, ~37 Playwright `.spec.ts`).

---

## 1. Flow / feature inventory

| ID | Area | User-facing flow | Routes / entry | Coverage tier | Primary tests | Quality |
|----|------|------------------|----------------|---------------|---------------|---------|
| **AUTH-01** | Auth | Tutor email/password login | `/login` | U, S | `auth-sec1.test.ts`, `auth.test.ts`, `visual/pages.spec.ts` | S — no submit→land E2E |
| **AUTH-02** | Auth | Tutor Google OAuth | `/login` | U | `auth-sec1.test.ts` | A browser |
| **AUTH-03** | Auth | Tutor logout | Admin nav | S | `impersonation-d.test.ts` (source) | A E2E |
| **AUTH-04** | Auth | 2FA enroll (setup QR local) | `/admin/settings/2fa/setup` | U | `identity-2fa.test.ts` | A browser; no secret egress tested in UI |
| **AUTH-05** | Auth | 2FA verify gate (middleware) | `/admin/settings/2fa/verify` | U | `identity-2fa.test.ts`, `two-factor-step-up.test.ts` | A navigation E2E |
| **AUTH-06** | Auth | 2FA manage (rotate, backup codes) | `/admin/settings/2fa` | U, S | `identity-2fa-management.test.ts` | IC/source |
| **AUTH-07** | Auth | 2FA admin reset | Admin action | U | `identity-2fa-management.test.ts` | A operator E2E |
| **AUTH-08** | Auth | Trusted device check | `/api/auth/2fa/trusted-device-check` | U | `trusted-device-check-route.test.ts` | B at route |
| **AUTH-09** | Auth | Role refresh (JWT re-fetch) | NextAuth jwt callback | U | `auth-role-refresh.test.ts` | B logic; A browser stale-role |
| **AUTH-10** | Auth | Admin vs tutor routing | `/admin/*` | U | `admin-routing.test.ts`, `regressions/middleware-admin-routing.test.ts` | A post-login land |
| **AUTH-11** | Auth | Tutor signup | `/signup` | U | `auth-sec1.test.ts` | A browser |
| **AUTH-12** | Auth | First admin setup | `/setup` | U | `auth.test.ts` | A browser |
| **AUTH-13** | Auth | Tutor forgot/reset password | `/forgot-password`, `/reset-password` | U, S | `password-reset.test.ts`, `smoke-admin-student-detail.spec.ts` | S — loads page only |
| **AUTH-14** | Auth | AccountHolder signup | `/account/signup` | I | `identity-p2b.test.ts` | A browser confirm-password |
| **AUTH-15** | Auth | AccountHolder login | `/account/login` | I | `identity-p2a.test.ts` | A browser; in-memory IP limiter |
| **AUTH-16** | Auth | AH forgot/reset | `/account/forgot-password` | I | `identity-p2b.test.ts` | A browser |
| **AUTH-17** | Auth | Verify email (AH) | email link | I | `identity-p2b.test.ts` (P2B-REDIR) | A full flow |
| **AUTH-18** | Auth | Child PIN login | `/students/login` | I, S | `identity-p2b.test.ts`, `learner-login-disabled-credential.test.ts` | A cooldown UI E2E |
| **AUTH-19** | Auth | Learner hard lock + parent unlock | `/students/login`, parent | I | `learner-pin-throttle-durability.test.ts`, `account/children/[id]/actions` | A lock message UI |
| **AUTH-20** | Auth | Learner soft cooldown (4→30s, 7→5min) | `/students/login` | I | `learner-pin-throttle-durability.test.ts` | A countdown/disabled submit |
| **AUTH-21** | Auth | Learner logout | student shell | B | `student-shell.spec.ts` | B sign-out→login |
| **AUTH-22** | Auth | Session fixation / cross-cookie | AH vs NextAuth | I | `identity-p2a.test.ts` | B |
| **AUTH-23** | Auth | Tombstoned AH/learner rejection | APIs | I | `identity-p2a.test.ts`, `tombstone.test.ts` | B |
| **ROSTER-01** | Roster | Student list | `/admin/students` | S | `visual/pages.spec.ts` | S screenshot |
| **ROSTER-02** | Roster | Create student | `/admin/students` | U | `admin/students/actions` via mocks | A E2E |
| **ROSTER-03** | Roster | Student detail (notes, WB, outbox) | `/admin/students/[id]` | U, B | `note-and-share.test.ts`, `smoke-admin-student-detail.spec.ts` | Partial B |
| **ROSTER-04** | Roster | Rename / delete student | detail actions | U | mocked in action tests | A E2E |
| **ROSTER-05** | Roster | Disconnect learner profile | detail | I | `iac-13-tutor-disconnect.test.ts` | B API |
| **ROSTER-06** | Roster | In-person audio record (student page) | Record tab | U, S | `useAudioRecorder.dom.test.tsx`, `smoke/audio-recording.spec.ts` | S mocked media |
| **ROSTER-07** | Roster | Audio upload + transcribe | Upload tab | SG, S | `audio-upload.spec.ts`, `ai-panel.spec.ts` | SG without BLOB |
| **WB-01** | Whiteboard | Create session (consent checkbox) | student detail | U, SG | `createWhiteboardSession.test.ts`, `smoke/whiteboard-workspace.spec.ts` | SG Blob path |
| **WB-02** | Whiteboard | Start session (PENDING→ACTIVE) | workspace | U, B | `startWhiteboardSession.test.ts`, `wb-session-lifecycle.spec.ts` | B phase gate |
| **WB-03** | Whiteboard | Issue join token / waiting room | `/w/[joinToken]` | U, B | `joinToken.test.ts`, `WaitingRoomOverlay.consent-gate.dom.test.tsx`, `wb-end-from-gate.spec.ts` | Mixed |
| **WB-04** | Whiteboard | Student join (new shell) | `/w/[joinToken]` | B, IC | `student-shell.spec.ts`, `StudentLiveWorkspaceClient.dom.test.tsx` | B chrome height; IC contract skipped |
| **WB-05** | Whiteboard | Live sync (draw, viewport) | workspace | RB | `whiteboard-live-sync-regression.spec.ts` | B real-browser |
| **WB-06** | Whiteboard | End session (workspace) | workspace | U, B | `endWhiteboardSession.test.ts`, `wb-end-session-confirm.spec.ts` | B |
| **WB-07** | Whiteboard | End from roster | student detail | B, SG | `wb-end-from-roster.spec.ts` | SG WS-C guard needs BLOB |
| **WB-08** | Whiteboard | End from resume gate | gate overlay | B, SG | `wb-end-from-gate.spec.ts` | SG |
| **WB-09** | Whiteboard | Resume open session | workspace | B | `wb-resume-from-backend.spec.ts`, `WorkspaceResumeGate.dom.test.tsx` | B |
| **WB-10** | Whiteboard | Stale session end | actions | U | `endWhiteboardSession.test.ts` | U |
| **WB-11** | Whiteboard | Tab-kill scene persist | workspace | B | `wb-live-persist-tab-kill.spec.ts` | B (no BLOB skip) |
| **WB-12** | Whiteboard | Chrome interactions (tools, tabs) | workspace | B, IC | `wb-chrome-interactions.spec.ts`, `BoardTabStrip.test.tsx` | B interactions |
| **WB-13** | Whiteboard | Wave5 polish regressions | workspace | B, SG | `wb-wave5-polish.spec.ts` | SG thumbnail needs BLOB |
| **WB-14** | Whiteboard | Phantom stroke | workspace | B | `wb-phantom-stroke-regression.spec.ts` | wb-regression only |
| **WB-15** | Whiteboard | Roughness/style | workspace | B | `wb-roughness-style.spec.ts` | B |
| **WB-16** | Whiteboard | Student exit/rejoin | `/w/*` | B | `wb-student-exit-rejoin.spec.ts` | B |
| **WB-17** | Whiteboard | Board-tab overflow scroll (WS-O) | workspace | B | `wb-board-tab-overflow.spec.ts`, `BoardTabStrip.test.tsx` | B (added 82c0d40) |
| **REC-01** | Recording | FSM lifecycle | workspace | U | `lifecycle-machine.test.ts`, `recorder-lifecycle.test.ts` | U |
| **REC-02** | Recording | VAD segment cut | workspace | U, SG | `segment-policy.test.ts`, `wb-vad-per-speaker-durability.spec.ts` | SG |
| **REC-03** | Recording | Per-speaker streams | workspace | U, SG | `perspeaker-identity.test.ts`, `wb-vad-per-speaker-durability.spec.ts` | SG |
| **REC-04** | Recording | Outbox enqueue/drain | IDB | U | `upload-outbox.test.ts`, `upload-outbox-instance.helpers.test.ts` | U; A offline UI |
| **REC-05** | Recording | Tab-kill audio durability | workspace | B | `wb-tab-kill-audio-durability.spec.ts` | B (uses upload stub; real Blob optional) |
| **REC-06** | Recording | Register segment server-side | action | B | `register-audio-segment-action.integration.test.ts` | B integration |
| **REC-07** | Recording | Tutor mute | workspace | B | `wb-tutor-recording-mute.spec.ts` | B |
| **REC-08** | Recording | Student mic persistence | workspace | B | `wb-student-mic-persistence.spec.ts` | B |
| **REC-09** | Recording | Recording draft IDB | client | U | `recording-draft-store.test.ts` | U |
| **REC-10** | Recording | End-to-end record→register | workspace | SG | `recording-end-to-end.spec.ts`, `recording-resilience.spec.ts` | SG |
| **REC-11** | Recording | Remote mic (live A/V) | workspace | U | `useRemoteMicRecorders.dom.test.tsx`, `mic-recorder-audio.test.ts` | U |
| **REC-12** | Recording | Audio rollover (50min) | opt-in E2E | SG | `e2e/audio-rollover.spec.ts`, `useAudioRecorder.dom.test.tsx` | SG + skipped timer test |
| **REPLAY-01** | Replay | Scrubber/seek timeline | review/replay | U, SG | `replay.test.ts`, `useReplayTimelineController.scrub.test.ts`, `wb-replay-scrub-seek.spec.ts` | SG E2E |
| **REPLAY-02** | Replay | Multi-segment audio | replay | U, SG | `replay-audio-timeline.test.ts`, `wb-replay-scrub-seek.spec.ts` | SG E2E |
| **REPLAY-03** | Replay | Active board tab on scrub | replay | SG | `wb-replay-active-board-tab.spec.ts` | SG |
| **REPLAY-04** | Replay | Share-page replay | `/s/[token]/whiteboard/*` | S | `SharePage.whiteboard.dom.test.tsx`, `visual/pages.spec.ts` | S mocked |
| **NOTES-01** | Notes | Map (chunk extract) | worker | U | `extract-chunk.test.ts`, `transcribe-chunk.test.ts` | U mocked |
| **NOTES-02** | Notes | Reduce (notes worker) | worker | U | `notes-worker.test.ts` | U mocked |
| **NOTES-03** | Notes | Auto SessionNote bridge | end-session | U | `notes-session-bridge.test.ts` | U mocked; B contracts |
| **NOTES-04** | Notes | Trigger generation | workspace | U | `triggerNotesGeneration-consent.test.ts` | U |
| **NOTES-05** | Notes | Save/finalize READY | review | U, S | `notes-session-bridge.test.ts`, `TutorNotesSection.dom.test.tsx` | A E2E shimmer |
| **NOTES-06** | Notes | DRAFT→READY / parent visibility | share | U | `notes-session-bridge.test.ts` | U query-oracle |
| **NOTES-07** | Notes | Delete session+data | review | U | `notes-session-bridge.test.ts` | U |
| **NOTES-08** | Notes | Notes shimmer UI | workspace | SG | `wb-notes-shimmer.spec.ts` | SG |
| **NOTES-09** | Notes | Manual note CRUD (student page) | `/admin/students/[id]/notes` | U | `note-and-share.test.ts` | A E2E |
| **NOTES-10** | Notes | AI assist → note form | student detail | S | `ai-panel.spec.ts`, `ai.test.ts` | S; not in gate |
| **PDF-01** | PDF | Import + page boards | workspace | U, SG | `pdf-render.test.ts`, `page-strip-pdf.test.ts`, `wb-e2-pdf-stroke-leak.spec.ts` | SG + fixture |
| **PDF-02** | PDF | PDF viewport center (inv-8) | sync | SG | `whiteboard-live-sync-regression.spec.ts` inv-8 | SG race + BLOB |
| **SHARE-01** | Share | Token access decisions | `/s/[token]` | B | `share-access-scope.test.ts`, `share-link-erasure-guard.integration.test.ts` | B |
| **SHARE-02** | Share | Revoke/rotate link | student detail | U | `note-and-share.test.ts` | U DB only |
| **SHARE-03** | Share | Mark note seen | `/api/share/mark-seen` | A | — | A |
| **SHARE-04** | Share | Proxy audio on share page | `/api/audio/[recordingId]` | U | `share-access-scope` (partial) | A range/scrub E2E |
| **SHARE-05** | Share | Parent dashboard notes | `/account/children/[id]/notes` | A | — | A |
| **IMP-01** | Impersonation | Start/exit/banner | `/admin` | U, S | `impersonation-b/c/d.test.ts` | A browser round-trip |
| **COST-01** | Cost | logCostEvent persistence | server | U | `cost-events.test.ts` | U |
| **COST-02** | Cost | Cost on transcribe/AI/notes | workers | U | `extract-chunk.test.ts`, `ai.test.ts`, `notes-worker.test.ts` | U mocked |
| **COST-03** | Cost | Admin cost dashboard auth | `/admin/cost` | U | `auth-role-refresh.test.ts` (getSessionCostBreakdown) | A UI E2E |
| **CONSENT-01** | Consent | CC-1/CC-2 claim setup save | `/claim/[token]/setup` | B | `consent-save.spec.ts`, `claim-setup-consent-*.test.ts` | B |
| **CONSENT-02** | Consent | Parent consent page | `/account/children/[id]/consent` | I, B | `parent-consent-save.test.ts`, `consent-save.spec.ts` | B partial |
| **CONSENT-03** | Consent | Mode-aware server gates | WB actions | U | `consent-mode-aware-server.test.ts`, `consent-cc1/b2.test.ts` | U |
| **CONSENT-04** | Consent | Waiting room capture gate | `/w/*` | U, S | `WaitingRoomOverlay.consent-gate.dom.test.tsx`, `wb-capture-gate.test.ts` | S/IC |
| **CONSENT-05** | Consent | Tutor checkbox on create | create WB | U | `createWhiteboardSession.test.ts` | U |
| **ERASE-01** | Erasure | Admin request/cancel UI | `/admin/erasure` | B | `identity/erasure.spec.ts`, `erasure-lifecycle.integration.test.ts` | B |
| **ERASE-02** | Erasure | Purge job worker | internal API | U | `process-erasure-job.test.ts` | U integration |
| **ERASE-03** | Erasure | Access suspension during grace | read paths | B | `erasure-access-suspension.integration.test.ts` | B |
| **ERASE-04** | Erasure | Share link guard during erasure | `/s/*` | B | `share-link-erasure-guard.integration.test.ts` | B |
| **BILL-01** | Billing | active-ping accumulation math | API | U | `active-time.test.ts`, `session-phase-guards.test.ts` | B pure math |
| **BILL-02** | Billing | Phase-gated billing (PENDING off) | workspace | B | `wb-session-lifecycle.spec.ts` | B |
| **BILL-03** | Billing | Display timer between heartbeats | client | U | `active-time.test.ts` (`computeDisplayActiveMs`) | U |
| **BILL-04** | Billing | 5-min snap for manual time entry | note form | U | `time-snap.test.ts` | U; A Wyzant export E2E |
| **BILL-05** | Billing | Session milestone warning UI | workspace | S | `MainPanel.dom.test.tsx` | IC text match |
| **BILL-06** | Billing | End-to-end activeMs DB after session | workspace | A | — | **P1 gap** |
| **AV-01** | Live A/V | Peer mesh signaling | workspace | U, B | `peer-mesh.test.ts`, `wb-av-mesh.spec.ts`, `live-av-4d-regressions.spec.ts` | B sans real HW |
| **AV-02** | Live A/V | Mic/cam permissions | workspace | **[human-only]** | `useLiveAV.dom.test.tsx` | M hardware |
| **AV-03** | Live A/V | Group presence | workspace | B | `group-session-presence.spec.ts` | B |
| **CLAIM-01** | Identity | Claim interstitial | `/claim/[token]` | I | `identity-p2b.test.ts` | A wizard E2E |
| **CLAIM-02** | Identity | Add-new / attach / connect-self | claim flow | I | `identity-p2-multitutor.test.ts` | A E2E |
| **CLAIM-03** | Identity | Send claim invite (tutor) | student detail | I | `identity-p2b.test.ts` | A UI |
| **ID-01** | Identity | Multitutor handle display | 4 surfaces | I | `identity-p2-multitutor.test.ts` | A UI |
| **ID-02** | Identity | Parent dashboard | `/account/dashboard` | A | — | A |
| **ID-03** | Identity | Device revoke UI | child devices | I | `identity-p2b.test.ts` | A E2E |
| **ADMIN-01** | Admin | Tutor approvals | `/admin/tutor-approvals` | I | `tutor-approval.test.ts` | A UI |
| **ADMIN-02** | Admin | Gmail OAuth connect | settings | A | — | A |
| **ADMIN-03** | Admin | Outbox drain UI | `/admin/outbox` | S | `smoke-admin-student-detail.spec.ts` | Partial |
| **ADMIN-04** | Admin | Dev-tools fixtures | `/admin/dev-tools` | A | — | A (intentional) |
| **MKT-01** | Marketing | Landing `/`, `/features` | public | A | — | A |
| **MKT-02** | Marketing | Privacy/terms facades | `/privacy`, `/terms` | A | — | A |
| **MKT-03** | Marketing | Feedback submit | `/feedback` | S | `visual/pages.spec.ts` | S |
| **LTX-01** | Live TX | Timeline assembly | spike | A (RED) | none found | Unbuilt |

---

## 2. API / DB-write inventory

| Route / action | Mutates? | Ownership / auth gate | Tested? |
|----------------|----------|----------------------|---------|
| **Server actions — tutor student scope** | | | |
| `createStudent` | C | `requireStudentScope` | U partial |
| `regenerateShareLink`, `revokeShareLink` | U | `assertOwnsStudent` | U `note-and-share` |
| `createNote`, `updateNote`, `deleteNote`, `setNoteStatus` | CRUD | `assertOwnsStudent` | U partial |
| `generateNoteFromTextAction`, `transcribeAndGenerateAction` | C | `assertOwnsStudent` | U `ai.test` |
| `renameStudent`, `deleteStudent` | U/D | `assertOwnsStudent` | A |
| `disconnectLearnerProfile` | U | `assertOwnsStudent` | I |
| `sendUpdateEmail` | U | `assertOwnsStudent` | U partial |
| **Whiteboard actions** | | | |
| `createWhiteboardSession` | C | `assertOwnsStudent` + consent | U `createWhiteboardSession` |
| `startWhiteboardSession`, `issueJoinToken` | U | `assertOwnsWhiteboardSession` | U |
| `endWhiteboardSession`, `endStale*`, `endOpen*` | U | `assertOwnsWhiteboardSession` | U + B E2E |
| `finalizeWhiteboardSessionFromBackend` | U | `assertOwnsWhiteboardSession` | U |
| `revokeJoinTokensForSession` | U | `assertOwnsWhiteboardSession` | U |
| `registerWhiteboardSessionAudioSegmentAction` | C | `assertOwnsWhiteboardSession` | B integration |
| `enqueueChunkTranscriptionAction` | C | `assertOwnsWhiteboardSession` | U |
| `generateNotesFromWhiteboardSessionAction` | C | `assertOwnsWhiteboardSession` | U |
| `attachWhiteboardToNoteAction` | U | `assertOwnsWhiteboardSession` | A |
| **notes-actions** | | | |
| `kickSessionChunksAction`, `triggerNotesGenerationAction`, `regenerateNotesAction` | C/U | `assertOwnsWhiteboardSession` | U |
| `saveSessionNotesAction`, `deleteWhiteboardSessionAndDataAction` | U/D | `assertOwnsWhiteboardSession` | U `notes-session-bridge` |
| `loadTutorNoteForReview`, `loadSessionReviewPayload` | R | `assertOwnsWhiteboardSession` | A |
| **Erasure** | | | |
| `requestErasureByAdminAction`, `cancelErasureByAdminAction` | C/U | Admin session | B `erasure.spec` |
| **Consent** | | | |
| `saveParentConsentAction` | C | `assertOwnsLearnerProfile` | I + B |
| **Account** | | | |
| `createChildLearnerAction` | C | AH session | I |
| `unlockChildPinAction` | U | `assertOwnsLearnerProfile` | I |
| **2FA actions** | U | Admin session + step-up | U |
| **Impersonation** | U | `assertIsAdmin` | U |
| **API — whiteboard (tutor)** | | | |
| `POST .../checkpoint` | C | `assertOwnsWhiteboardSession` | B integration |
| `GET .../events`, `snapshot`, `tutor-asset` | R | `assertOwnsWhiteboardSession` | U route tests |
| `POST .../active-ping` | U | `assertOwnsWhiteboardSession` | U math + dom |
| `GET .../timer-anchor`, `session-ended` | R | `assertOwnsWhiteboardSession` | A route E2E |
| `POST .../math/render` | R | `assertOwnsWhiteboardSession` | A |
| `GET .../join-timer` | R | learner/AH session | U `whiteboard-join-timer-route` |
| **API — upload** | | | |
| `POST /api/upload/audio` | C | `assertOwnsStudent` | U regressions |
| `POST /api/upload/blob` | C | student/WB/learner/AH paths | U partial |
| **API — share/public** | | | |
| `GET .../public-events`, `public-snapshot` | R | join token / share scope | U partial |
| `GET /api/audio/[recordingId]` | R | `checkApiShareAccess` | A E2E |
| `POST /api/share/mark-seen` | C | `checkApiShareAccess` + note∈student | A |
| `GET /api/w/[joinToken]/wb-asset` | R | join scope | A |
| `GET /api/sessions/[sessionId]/wb-asset` | R | learner/AH | A |
| **API — identity** | | | |
| `POST /api/auth/learner/login` | session | throttle + credential | I |
| `POST/PATCH /api/learner-profiles/[id]/credentials` | U | `assertOwnsLearnerProfile` | I |
| Device revoke routes | U | `assertOwnsLearnerProfile` | I |
| `POST /api/claim/[token]/complete`, `setup` | C | AH session + ownership | I |
| `POST /api/students/[studentId]/claim-invites` | C | tutor scope | I |
| **API — auth** | | | |
| AH login/signup/reset/forgot | C/R | rate limits | I |
| Tutor reset/forgot | U | — | U |
| Gmail connect/callback | U | admin | A |
| **API — workers** | | | |
| `POST /api/queues/chunk-transcribe` | C | worker auth | U partial |
| `GET /api/cron/transcribe-sweep` | C | cron secret | A |
| `GET/POST /api/internal/erasure/process` | U | worker auth | U |
| **API — test harness** | | | |
| `/api/test/whiteboard/*` | C/R | `PLAYWRIGHT_TEST_SECRET` | B (harness only) |

---

## 3. Coverage map (by subsystem)

| Subsystem | Behavior tests (B) | Unit only (U) | Shallow (S) | Skip-gated (SG) | Absent (A) |
|-----------|-------------------|---------------|-------------|-----------------|------------|
| Auth tutor 2FA | 0 | 8 files | 2 | 0 | browser flows |
| Auth identity | 12+ I tests | — | 0 | 0 | AH/learner UI |
| Roster/notes page | 1 smoke | 2 | 2 | 2 | rename/delete E2E |
| WB lifecycle | 15+ Playwright | 20+ Jest | 3 dom | 4 | legacy intent |
| Recording/outbox | 6 Playwright | 12 Jest | 2 dom | 5 | offline UI |
| Replay | 0 E2E | 4 Jest | 1 dom | 3 | share replay |
| Notes pipeline | 0 E2E | 6 Jest | 2 dom | 2 | map→reduce E2E |
| PDF | 0 | 2 Jest | 0 | 2 | inv-8 quarantined |
| Share/access | 3 integration | 2 Jest | 2 visual | 0 | mark-seen, audio proxy |
| Consent | 2 Playwright + 6 Jest | — | 1 dom | 0 | waiting room E2E |
| Erasure | 4 integration | 3 Jest | 0 | 0 | — |
| Billing | 1 lifecycle E2E | 3 Jest | 1 dom | 0 | E2E activeMs oracle |
| Live A/V | 3 Playwright | 4 Jest | 0 | 0 | hardware |
| Cost | 0 | 2 Jest | 0 | 0 | admin UI |
| Impersonation | 0 | 4 Jest | source | 0 | browser |
| Marketing | 0 | 0 | 3 visual | 0 | `/`, `/features` |

---

## 4. Prioritized gap list (PART 2 build tasks)

### P1 — durability / auth / money

| # | Surface | Behavior to assert | Runner | Gate note |
|---|---------|-------------------|--------|-----------|
| P1-01 | **Blob-gated wb-regression suite** | Recording E2E specs actually execute in `npm run test:wb-sync` | Playwright | Enroll `BLOB_READ_WRITE_TOKEN` in `webServer` env OR fixture upload stub that doesn't need real Blob |
| P1-02 | **Tab-kill → register segments** | After tab-kill mid-upload, resume + end → N `SessionRecording` rows with audio | Playwright wb-regression | `wb-tab-kill-audio-durability.spec.ts` exists; ensure gate runs it |
| P1-03 | **VAD per-speaker durability** | Tutor+student VAD cuts survive tab-kill; both streams registered | Playwright | `wb-vad-per-speaker-durability.spec.ts` — SG today |
| P1-04 | **Recording end-to-end** | Start→VAD cut→Blob upload→`registerWhiteboardSessionAudioSegmentAction`→DB row | Playwright | `recording-end-to-end.spec.ts` — SG |
| P1-05 | **Replay scrub/seek** | Scrub bar moves audio + board state; multi-segment boundaries | Playwright | `wb-replay-scrub-seek.spec.ts` — SG |
| P1-06 | **Replay active board tab** | Scrub updates selected board tab (user-visible) | Playwright | `wb-replay-active-board-tab.spec.ts` — SG |
| P1-07 | **Notes pipeline E2E** | End session → shimmer → READY note text visible in review | Playwright | `wb-notes-shimmer.spec.ts` — SG; needs map+reduce teeth |
| P1-08 | **Billing activeMs E2E** | After simulated both-connected session, DB `activeMs` matches oracle (not just unit math) | Playwright + DB oracle | Extend `wb-session-lifecycle.spec.ts` |
| P1-09 | **Tutor login → 2FA → land** | Full browser auth boundary every deploy | Playwright identity-e2e | New spec; seed TOTP secret |
| P1-10 | **Child PIN lockout UX** | 4 failures → disabled submit + countdown; parent unlock restores | Playwright | DB seed throttle row |
| P1-11 | **Share audio proxy** | Parent on `/s/*` can scrub audio; revoked token 403 | Playwright | Independent of tutor auth |
| P1-12 | **AH login durable throttle** | Cold-start IP limit persists in Neon | Jest integration | Pattern: `LearnerLoginThrottle` |
| P1-13 | **Role refresh browser** | Demoted tutor loses admin routes on next navigation | Playwright | Complements `auth-role-refresh.test.ts` |
| P1-14 | **Erasure purge E2E** | Post-grace purge → share 404 + learner login denied | Playwright | Extend `erasure.spec.ts` with time mock |
| P1-15 | **Cost dashboard auth** | TUTOR sees denied; ADMIN sees breakdown | Playwright | `auth-role-refresh` logic only today |

### P2 — core UX mechanics

| # | Surface | Behavior to assert | Runner |
|---|---------|-------------------|--------|
| P2-01 | Claim wizard happy path E2E | interstitial → add-child → setup PIN → dashboard | Playwright |
| P2-02 | Impersonation round-trip | admin → impersonate → banner → exit → restore 2FA | Playwright |
| P2-03 | PDF import no stroke leak | board-3 strokes stay on board-3 after PDF board-4 created | Playwright wb-regression |
| P2-04 | WS-C end guards | End blocked from gate/roster when preconditions fail | Playwright — SG today |
| P2-05 | Student create/rename/delete | CRUD reflects in list + ownership denied cross-tenant | Playwright |
| P2-06 | Manual note time 5-min snap | User enters 14:07 → stored/snapped 14:05 visible | Jest + Playwright |
| P2-07 | Outbox offline drain UI | Pending rows visible; drain on reconnect | Playwright |
| P2-08 | Parent dashboard + child notes | AH sees only owned children | Playwright |
| P2-09 | Share mark-seen | Viewport fire → `noteView` row | Playwright |
| P2-10 | Gmail disconnect | Settings reflects disconnected state | Playwright (mock OAuth) |

### P3 — polish / marketing

| # | Surface | Behavior to assert | Runner |
|---|---------|-------------------|--------|
| P3-01 | Marketing `/` + `/features` CTAs | Links resolve; hero visible | Playwright smoke |
| P3-02 | Multitutor handle on 4 surfaces | Consistent `family:username` display | Playwright |
| P3-03 | PDF inv-8 viewport center | Student PDF page centered+fit | Playwright — quarantined |
| P3-04 | Wave5 review thumbnail | End-session review shows snapshot | Playwright — SG |
| P3-05 | Theme plumbing regression | Light/dark token swap on key surfaces | Jest `theme-plumbing` + visual |

---

## 5. "Looks-tested-isn't" (skip-gated / IC specs)

### 5.1 `BLOB_READ_WRITE_TOKEN` skip-gated (gate does NOT set token)

| Spec | Skipped tests | User behavior NOT exercised in gate |
|------|---------------|-----------------------------------|
| `tests/smoke/whiteboard-workspace.spec.ts` | create with Blob upload | WB create + consent + mount |
| `tests/integration/recording-end-to-end.spec.ts` | 2 | Full record→upload→register |
| `tests/integration/recording-resilience.spec.ts` | 1 | Snapshot integration |
| `tests/integration/wb-vad-per-speaker-durability.spec.ts` | 4 | VAD + per-speaker durability |
| `tests/integration/wb-replay-scrub-seek.spec.ts` | 2 | Replay scrub/seek |
| `tests/integration/wb-replay-active-board-tab.spec.ts` | 1 | Board tab on scrub |
| `tests/integration/wb-notes-shimmer.spec.ts` | 2 | Notes generation UI |
| `tests/integration/wb-end-from-gate.spec.ts` | 1 | WS-C gate end guard |
| `tests/integration/wb-end-from-roster.spec.ts` | 1 | WS-C roster end guard |
| `tests/integration/wb-wave5-polish.spec.ts` | 1 | Review thumbnail |
| `tests/integration/whiteboard-live-sync-regression.spec.ts` | 2–3 | Image/PDF upload invariants |
| `tests/integration/wb-e2-pdf-stroke-leak.spec.ts` | 2 | PDF stroke leak + fixture |
| `tests/audio-upload.spec.ts` | 3 | Upload/record tabs hidden without Blob |

**Fix options (pick one for PART 2):** (a) inject test Blob token in `webServer`, (b) harness upload stub route that mints fake blob URLs, (c) `seed-recording` API for replay specs.

### 5.2 Other skip / quarantine

| Spec | Reason | Impact |
|------|--------|--------|
| `wb-end-from-roster.spec.ts` | `test.skip(true)` legacy intent block | Entire describe dead |
| `whiteboard-live-sync-regression.spec.ts` inv-8 | pdfjs race quarantine | PDF viewport |
| `e2e/audio-rollover.spec.ts` | `RUN_AUDIO_ROLLOVER_E2E=1` + creds | 50-min rollover |
| `group-session-presence.spec.ts` | conditional skip | presence edge |
| `useAudioRecorder.dom.test.tsx` | explicit `test.skip` timer rollover | covered elsewhere claim |

### 5.3 Implementation-coupled (survive dedup poorly)

| Spec | Coupling risk |
|------|---------------|
| `StudentLiveWorkspaceClient.dom.test.tsx` | `describe.skip` chrome contract; asserts internal tab ARIA |
| `BoardTabStrip.test.tsx` | Component props/CSS |
| `WbTopBarMicControl.dom.test.tsx` | Internal control wiring |
| `impersonation-d.test.ts` | Source-string assertions on `AdminNav` |
| `identity-2fa-management.test.ts` | Source/oracle not user flow |
| `notes-session-bridge.test.ts` (iii) | Query-shape oracle not page render |
| `visual/pages.spec.ts` | Pixel/a11y only |

### 5.4 Stale doc drift

`docs/TESTING-COVERAGE.md` predates wave5 polish, identity Playwright (`tests/integration/identity/*`), erasure E2E, consent-save E2E, and ~15 wb-regression specs. **This audit supersedes it for PART 2 planning.**

---

## Summary

- **~85** distinct mechanical surfaces inventoried across auth, roster, whiteboard, recording, replay, notes, PDF, share, consent, erasure, billing, A/V, and admin.
- **Strongest behavior coverage:** whiteboard live-sync (`test:wb-sync`), identity Jest integration (`src/__tests__/identity/*`), consent/erasure Playwright (`tests/integration/identity/*`), share-access scope.
- **Systemic hole:** Playwright gate **does not set `BLOB_READ_WRITE_TOKEN`**, so the recording/replay/notes/PDF durability suite (~20 specs) **self-skips** in default `test:integration` / `test:wb-sync` runs — the largest "looks-tested-isn't" cluster.
- **Dedup-safe tests** should assert: DB oracles, API status codes, `data-testid` user-visible state, independent math (active-time, replay timeline), not component class names or import graphs.

### Top 15 P1 gaps (build first)

1. Enroll Blob token (or upload stub) in Playwright `webServer` so wb-regression recording specs actually run
2. VAD per-speaker tab-kill durability (`wb-vad-per-speaker-durability.spec.ts`)
3. Recording end-to-end upload→register (`recording-end-to-end.spec.ts`)
4. Replay scrub/seek multi-segment (`wb-replay-scrub-seek.spec.ts`)
5. Replay active board tab on scrub (`wb-replay-active-board-tab.spec.ts`)
6. Notes shimmer → READY note E2E (`wb-notes-shimmer.spec.ts`)
7. Billing `activeMs` DB oracle after live session (extend lifecycle spec)
8. Tutor login → 2FA verify → land `/admin` browser E2E
9. Child PIN lockout countdown + disabled submit browser E2E
10. Share-page audio proxy + scrub behavior E2E
11. AH login IP throttle durable in Neon (cold-start)
12. JWT role-refresh reflected in browser navigation
13. Erasure post-grace purge → access denied E2E
14. Admin cost dashboard authorization in browser
15. WS-C end-session guards from gate/roster (Blob-gated specs)
