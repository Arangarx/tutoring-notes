# Go-to-Sarah durability master-cut — comprehensive both-theme smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`912c886`](https://github.com/Arangarx/tutoring-notes/commit/912c886)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

---

## Scope + run discipline (read before running)

This is the **pre-master comprehensive MASTER-CUT smoke** for the go-to-Sarah durability cut on `wb-wave5-polish` @ [`912c886`](https://github.com/Arangarx/tutoring-notes/commit/912c886). It is the **single final hardware gate** before `merge --no-ff wb-wave5-polish → v1-redesign` and eventual cut to **master** for Sarah.

**Both themes (mandatory):** Every in-scope item below must be exercised in **light** and **dark**. Each **Action** says *"Repeat in light, then dark"* unless noted otherwise. **PASS** only if both themes pass.

**What landed on this tip (durability pillar):**

- **WS-A** — VAD silence-boundary segmentation (50-min rollover removed); approaching-time chime re-anchored to **session elapsed** (pause-aware billing-awareness warning); 8-hour hard-stop preserved; incremental `SessionRecording` register mid-session; per-speaker transcription-only lanes (consent-gated); **replay-mix invariant** unchanged (tutor:mic mixdown only in replay).
- **WS-B** — ~1s server-side whiteboard event-batch persist + `boardDocumentJson`; tab-kill recovery from server; tutor warning on repeated persist failure.
- **WS-C** — `finalizeWhiteboardSessionFromBackend`; End / End-and-review → straight to `SessionReviewMode` overlay (no waiting-room flash); endedAt + recordings + strokes preserved.
- **WS-D** — ACTIVE session re-open hydrates from server (scene + timeline + clock); no stale IDB prompt when server is ahead; IDB-ahead tail auto-merges with zero loss.
- **WS-E** — E1 notes shimmer; E2 PDF dup-stroke fix; E4 replay active board tab; E5 roughness persist; E6 student mic device persistence. **E3 reconnect pill PARKED** this wave — see human-only item.

**Standing regression:** Full-site surfaces from [`docs/INDEX.md`](../INDEX.md) are included concisely at the end.

**CUT ledger reference:** [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md) Step 3; [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

**Consent-honesty sub-smokes (already authored — re-spot-check if time):** [`consent-honesty-premerge-smoke-index.md`](consent-honesty-premerge-smoke-index.md) indexes Block B + CC-1/CC-2 + erasure smokebooks on this branch preview.

**Convenience preview (optional):** [`https://preview.usemynk.com`](https://preview.usemynk.com) when repointed to this branch — use the verified alias above for smoke parity with deploy tip.

---

## CUT / merge gates

### 1. CUT-2 — `npx next build` exit 0 (Andrew confirms on tip)

**Action:** Orchestrator already ran `npx next build` on tip [`912c886`](https://github.com/Arangarx/tutoring-notes/commit/912c886) during integrated gate greening. **Repeat in light, then dark:** on the **Preview**, spot-check that the app loads and one whiteboard workspace route renders without a Next.js error overlay (build-surface sanity only — not a substitute for the CI gate).

**Expect:** CI gate was **exit 0** (route table printed). Preview loads without chunk/CSS compile errors on tutor dashboard and one whiteboard workspace open.

**Ignore this run:** Exact route-count parity with local build output.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: integrated gate on 912c886 — npx next build exit 0]`

**Notes:**

---

### 2. CUT-2b — Full `npx jest` suite (Andrew confirms on tip)

**Action:** Orchestrator already ran full `npx jest` on tip [`912c886`](https://github.com/Arangarx/tutoring-notes/commit/912c886). **Repeat in light, then dark:** no separate UI action required unless you want to re-run locally; this item records your acknowledgment that the automated gate was green before hardware smoke.

**Expect:** **2807 tests passed / 0 failed** on integrated tip (per orchestrator gate log).

**Ignore this run:** Known pre-existing flaky suites when run in isolation with shared DB — full suite was green on tip.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: integrated gate on 912c886 — npx jest 2807/0]`

**Notes:**

---

### 3. CUT-3 — `npm run test:wb-sync` relay gate (orchestrator fills)

**Action:** Orchestrator runs `npm run test:wb-sync` (Docker relay, ~38 min) on tip [`912c886`](https://github.com/Arangarx/tutoring-notes/commit/912c886) in parallel with this smokebook authoring. **Repeat in light, then dark:** N/A — relay is headless; Andrew does not re-run unless orchestrator reports FAIL.

**Expect:** Relay Playwright suite **green** on integrated tip (required because E4 touched `event-log.ts` and WS-B/D touched whiteboard persist/resume paths). Any flake must be triaged against known `ECONNRESET` learner-login flake in BACKLOG — not accepted as regression without orchestrator sign-off.

**Ignore this run:** Per-theme UI — relay has no theme dimension.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: npm run test:wb-sync on 912c886 — orchestrator-owned]`

**Notes:** Orchestrator fills after relay run (in progress on 912c886).

---

### 4. CUT-4 — Claim Sarah pilot family before `NOTES_AUTH_WALL`

**Action:** **Repeat in light, then dark:** Sign in as **ADMIN** on the **Preview**. Confirm Sarah's pilot family / learner profiles are **claimed** (not anonymous join-only) and that Sarah's tutor account can open her roster students without hitting a notes-auth wall that would lock her out post-cut. If not yet claimed, **STOP** master cut until claimed (Andrew-gated operation).

**Expect:** Sarah's pilot learners appear on her roster with expected consent records; no surprise auth-wall redirect on notes or workspace routes she uses daily.

**Ignore this run:** Test/demo families unrelated to Sarah pilot.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: account/family configuration — no automated prod claim check]`

**Notes:**

---

### 5. CUT-5 — Env scoping at master cut (Andrew confirm)

**Action:** **Repeat in light, then dark:** N/A for UI — confirm with orchestrator/deploy notes that production env vars (Neon, Blob, OAuth, `CRON_SECRET`, OpenAI keys, feature flags) are scoped correctly for Sarah traffic **before** `merge --no-ff v1-redesign → master`. Check [`docs/DEPLOY.md`](../DEPLOY.md) + orchestrator handoff.

**Expect:** Andrew explicitly confirms env scoping checklist — no preview-only secrets on production path; migrations applied in correct order before traffic.

**Ignore this run:** Local `.env` on dev machine.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: ops confirmation — orchestrator documents at cut]`

**Notes:**

---

## Wave 5 durability surfaces (this cut)

### 6. WS-A — VAD silence-boundary segmentation (natural segment cuts mid-session)

**Action:** **Repeat in light, then dark.** On the **Preview**, sign in as pilot **tutor** on desktop Chrome. Open a claimed student's whiteboard workspace and start a live session with a **consented learner** joined on a second device. Click **Start** recording. Speak for ~5–8 seconds, then stay **silent** for ≥3 seconds (natural pause), then speak again; repeat once more before End. **Do not** wait 50 minutes. Optionally open browser devtools → filter console for `[vad]` and `[obx] action=register_mid_session` lines. End session normally.

**Expect:** **Multiple** `SessionRecording` rows exist **before** End (visible in review/replay segment list or server-backed segment count — at least **2** mixdown segments from silence-boundary cuts, not a single blob only created at End). No 50-minute rollover timer behavior. Segments transcribe incrementally (notes pipeline starts before End completes). No audio gap or double-cut audible glitch on pauses.

**Ignore this run:** Exact VAD threshold tuning; per-speaker lane content (separate item). Whisper map/reduce **wording** quality (MAP-ACC deferred post-master).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-vad-per-speaker-durability.spec.ts › VAD segment count + mid-session register]` — hardware confirms subjective audio quality and real mic cadence.

**Notes:**

---

### 7. WS-A — Approaching-time chime re-anchored to session elapsed (pause-aware)

**Action:** **Repeat in light, then dark.** During an ACTIVE session (item 6 setup or fresh), watch/listen for the **approaching-time chime** and any on-screen session-time countdown tied to billing awareness. Let the session run long enough to approach the configured session-time warning threshold (~55 min of **active** session time if practical — or use a shorter test session and confirm the UI shows session elapsed time, not segment elapsed). **Pause** recording (if pause is available) and confirm the warning clock does **not** inflate while paused.

**Expect:** Chime/warning fires based on **session elapsed time** (pause-aware p3-clock), **not** per-segment rollover. The 50-minute **segment** rollover is gone. Warning still serves as tutor time-awareness / billing guardrail.

**Ignore this run:** Exact minute threshold if billing model changes; recurring hourly chime behavior (acceptable per plan).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: segment-policy unit tests + timer surgery asserts on SESSION_SAFETY / session-time chime helpers]`

**Notes:**

---

### 8. WS-A — 8-hour hard-stop preserved

**Action:** **Repeat in light, then dark.** Confirm via orchestrator/unit-test evidence OR (if you have a test hook) drive session elapsed toward `SESSION_SAFETY_MAX_SECONDS` on a **test** session only. On normal hardware smoke, read console/logs on a long session start: verify hard-stop guard code path still exists (orchestrator cites green red-before test on tip).

**Expect:** **8-hour** runaway session hard-stop remains armed — VAD/timer surgery did not remove `shouldHardStopSession`. Production sessions cannot run unbounded past safety cap.

**Ignore this run:** Actually waiting 8 hours on hardware.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: segment-policy + useAudioRecorder timer surgery — hard stop red-before on 912c886]`

**Notes:**

---

### 9. WS-A — REPLAY-MIX INVARIANT (replay audio unchanged)

**Action:** **Repeat in light, then dark.** Run a session with **full audio consent** and a **speaking learner** (second device). End session. Open **replay** and listen to the audio track. Compare to pre-cut expectation: replay audio = **tutor:mic mixdown** (tutor voice + consented learner summed in live mix), **not** isolated per-speaker tracks stitched in. Inspect replay segment list / devtools network if needed: replay sources should be **mixdown `SessionRecording` rows only** — no `student:peer-*:mic` rows in the replay set.

**Expect:** Replay sounds like today's mixdown behavior (learner heard in replay when consented). **No** doubling of learner voice from per-speaker lanes. **No** per-speaker transcription-only blobs appearing as separate replay segments. Transcription may attribute per-speaker in notes backend, but **replay player audio** is mixdown-only.

**Ignore this run:** Transcription attribution text in notes panel (separate from replay audio).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: wb-vad-per-speaker-durability.spec.ts step 5b — replay-mix invariant red-before proven]`

**Notes:**

---

### 10. WS-A — Per-speaker transcription-only lanes (consented learner mic)

**Action:** **Repeat in light, then dark.** With **full audio consent** and learner **unmuted** on second device, run a short ACTIVE session: tutor speaks, then learner speaks clearly for several seconds. End session. Open session notes / transcript review (or admin DB view if available) and look for **per-speaker** or `streamId`/`speakerId` attribution on transcript chunks — learner content transcribed on a lane distinct from tutor:mic. Confirm replay audio item 9 still mixdown-only.

**Expect:** At least one learner-attributed transcript chunk when learner spoke and consent allowed capture. Lanes are **transcription-only** — excluded from replay assembly. No capture when consent denies audio recording.

**Ignore this run:** MAP-ACC notes quality tuning; CPU/thermal on mobile (human-only item).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: wb-vad-per-speaker-durability.spec.ts › transcriptionOnly upload + TranscriptChunk lanes]`

**Notes:**

---

### 11. WS-B — Live whiteboard ~1s server persist (tab-kill recovery)

**Action:** **Repeat in light, then dark.** Tutor: start ACTIVE session, click **Start** if needed, draw **≥5 distinct strokes** over ~5–10 seconds on the live board. **Kill the tab** (close tab or browser — do **not** click End). Reopen the **Preview**, sign in, navigate to the student's **active session** on roster, click **Resume** / open workspace. Count recovered strokes.

**Expect:** Strokes recover from **server persist** (not only IndexedDB prompt). Scene matches pre-kill content (≥5 strokes). If persist failed repeatedly before kill, tutor may have seen a **non-blocking backup warning** (checkpointStatus channel) — note if seen. No data loss on tab-kill path.

**Ignore this run:** Exact 1000ms interval; Blob checkpoint path (30s IDB still exists as cache).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-live-persist-tab-kill.spec.ts — relay GREEN on gate tip]`

**Notes:**

---

### 12. WS-B — Tutor warning on repeated server persist failure

**Action:** **Repeat in light, then dark.** If you can simulate offline / blocked checkpoint API (devtools offline mode **briefly** during draw) OR observe naturally: draw while network impaired for ≥3 consecutive persist ticks. Otherwise mark **SKIP** with reason and rely on automated test + code review.

**Expect:** After **≥3** consecutive server persist failures, tutor sees a **non-blocking warning** (e.g. backup save paused — strokes protected by local draft) via existing checkpoint status UI. Warning clears on success.

**Ignore this run:** Exact copy string; CSP noise unrelated to persist.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: useWhiteboardRecorder unit tests for serverPersistConsecutiveFailures + checkpointStatus]`

**Notes:**

---

### 13. WS-C — End → straight to review overlay (no waiting-room flash)

**Action:** **Repeat in light, then dark.** **Path A — in-live End:** ACTIVE session with strokes + audio; tutor clicks **End session** → confirm dialog → complete. **Path B — roster End and review:** Start session, record briefly, navigate **away** without End; from student-detail **active sessions** list click **End and review**. **Path C — gate End and review:** Same as B but from `WorkspaceResumeGate`. Watch for waiting-room / live-board flash before review.

**Expect:** Lands on **`SessionReviewMode`** / in-shell review overlay within **~5s** — **no** full waiting-room detour, **no** live Excalidraw mount flash before review. `endedAt` set; recordings preserved; strokes visible in board preview/replay. In-live End copy honest ("End session" + confirm about review/notes).

**Ignore this run:** `intent=endreview` deep-link fallback if still present behind flag; marketing chrome.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: wb-end-from-roster.spec.ts + wb-end-from-gate.spec.ts — no waiting-room testid, SessionReviewMode within 5s]`

**Notes:**

---

### 14. WS-D — Reopen ACTIVE session — server hydrate (server ahead of IDB)

**Action:** **Repeat in light, then dark.** ACTIVE session: draw on **page 1** and **page 2**; wait ≥3s for server persist. Navigate away (do **not** End). Reopen via **Resume** on gate or roster. Observe load path.

**Expect:** Scene hydrates from **server** (multi-page state correct). **No** "Browser recovery (IndexedDB)" banner when server batches exist and cover IDB. Clock/session continuity feels correct (audio offset not reset to zero inappropriately). Continue drawing; End; all strokes in replay.

**Ignore this run:** Student join path (covered in regression); first-open PENDING session (no batches yet).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-resume-from-backend.spec.ts — no IDB banner, multi-page resume]`

**Notes:**

---

### 15. WS-D — IDB-ahead tail auto-merge (zero loss when local ahead of server)

**Action:** **Repeat in light, then dark.** Harder edge case: during ACTIVE session, draw strokes then **immediately** kill tab within ~1s of last stroke (before server batch ack) OR use devtools to throttle network so IDB checkpoint has strokes server has not yet acked. Resume session.

**Expect:** Strokes are **not lost** — server prefix + IDB tail merge with **zero loss** (no silent drop, no duplicate ghost strokes). If merge cannot be automatic, an honest recovery prompt appears — **not** silent loss. (If you cannot reliably trigger IDB-ahead on hardware, note SKIP reason; relay test covers happy server-ahead path.)

**Ignore this run:** Exact merge logging (`[wbr] merge_gap`).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: shouldSuppressIdbPrompt + IDB-ahead merge unit tests on f83267d; relay resume spec]`

**Notes:**

---

### 16. WS-E1 — Notes shimmer while generating (reduced-motion + copy)

**Action:** **Repeat in light, then dark.** End a session with real audio so notes enter `pending` → `generating`. On review overlay, watch the notes fields area during generation. Toggle OS **prefers-reduced-motion** (or browser emulation) and re-run once.

**Expect:** Shimmer overlay visible **over** fields (not hidden behind opaque textareas). Copy: **"Waiting for transcript…"** when pending; **"Writing notes…"** when generating. With reduced motion: static high-contrast loading state (no seizure-y animation). Fields become editable when done.

**Ignore this run:** MAP-ACC content quality; live-session notes display (deferred — no notes UI on live board).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-notes-shimmer.spec.ts — background-position moves over ~800ms; reduced-motion CSS]`

**Notes:**

---

### 17. WS-E2 — PDF import — no duplicate strokes across page/board switch

**Action:** **Repeat in light, then dark.** On ACTIVE workspace: draw identifiable strokes on **board/page 3**. Import a **PDF** onto a **new board/page 4** (page-picker flow). Switch between board tabs 3 and 4 several times.

**Expect:** Board 4 contains **only** PDF-imported content (plus anything drawn there after import). Board 3 strokes **do not leak** onto board 4 as duplicates. Switching tabs does not accumulate phantom duplicates.

**Ignore this run:** PDF render quality in headless environments; inv-8 pdfjs Playwright gap (BACKLOG).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: wb-sync integration — commitPdfBatch guard; headless pdfjs limitation noted in plan]`

**Notes:**

---

### 18. WS-E4 — Replay shows correct ACTIVE board tab during page switches

**Action:** **Repeat in light, then dark.** Session with **≥2 boards/pages**; tutor switches pages during recording. End; open replay. Scrub timeline through points where tutor changed pages.

**Expect:** Replay **board tab strip** highlights the board that was active at the playhead time — tracks tutor page switches, not a hardcoded single tab. Strokes shown match active board.

**Ignore this run:** Replay ±10s buttons (deferred SMOKE-UX-3); play/pause glyph centering nit.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: wb-replay-active-board.spec.ts + jest page-switch event emission]`

**Notes:**

---

### 19. WS-E5 — Stroke roughness persists and renders in replay

**Action:** **Repeat in light, then dark.** On live board, set pencil/freedraw **roughness** to a non-default value (e.g. high roughness). Draw a stroke. End session. Open replay at that timestamp.

**Expect:** Stroke renders with chosen roughness in replay (not stuck at default 0). Roughness change applies immediately on live canvas (`captureUpdate: IMMEDIATELY` path).

**Ignore this run:** Other stroke style dimensions (color, size) unless obviously broken.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-roughness-style.spec.ts]`

**Notes:**

---

### 20. WS-E6 — Student mic device choice persists across rejoin

**Action:** **Repeat in light, then dark.** On **learner** device (logged-in child or join flow with mic picker): select a **specific mic** if multiple exist. Complete join; verify A/V works. **Leave** session (or disconnect) and **rejoin** the same session (or a new session same learner profile).

**Expect:** Previously selected mic is **pre-selected** on rejoin (learner-scoped storage key). Learner does not have to hunt the mic every session (BUG-7 fix). Video device persistence unchanged.

**Ignore this run:** Fake-media Playwright slot-swap limitation (jest covers persist round-trip).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: useLiveAV mic persistence jest + wb student rejoin spec]`

**Notes:**

---

## Human-only surfaces (PARKED / hardware-required)

### 21. [human-only] E3 — WebRTC A/V reconnect / media-transport recovery (Safari/iOS)

**Action:** **Repeat in light, then dark** on **real Safari/iOS** if available; otherwise desktop Chrome as best-effort eyeball only. Tutor + student in ACTIVE session with A/V. Induce **real** network drop (toggle airplane mode, Wi-Fi off, or walk out of range) for 10–30s; restore network. Observe remote tile audio/video and any **"Call reconnecting…"** pill.

**Expect:** **Known gap (BUG-8, PARKED this wave):** media transport may **not** fully recover after reconnect — audio may work while video tile stays black, or pill may stick until manual refresh. Document what you see. **E3 code was NOT merged** on this tip; do not FAIL the cut for unreconstructed WebRTC recovery unless product decision changes.

**Ignore this run:** Reachability branch `a962171` (parked unmerged); honest pill on parked branch vs base.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: WebRTC media-transport recovery requires real cellular/network drop on real hardware — no harness exercises media plane; E3 intentionally PARKED on 912c886]`

**Notes:** Reason: PARKED/unbuilt this wave per orchestrator decision 2026-07-04 — plan inclusion ≠ ratified ship. Eyeball current behavior for Sarah risk; BUG-8 deferred hardening needs hardware validation before merge.

---

### 22. [human-only] VAD / AudioContext under iOS Safari backgrounding

**Action:** On **real iPhone/iPad Safari**, join as student or tutor with recording ACTIVE. Background the tab (switch app / lock screen) for 30–60s; foreground. Continue speaking and drawing.

**Expect:** **Best-effort:** VAD may pause cuts while `AudioContext` suspended; `VAD_MAX_SEGMENT_SECONDS` cap should force segment on resume (up to cap latency). No runaway session beyond 8h hard-stop. Document suspension/recovery behavior for Sarah (primary device assumed Windows desktop — verify on call).

**Ignore this run:** Android Chrome (partially validated elsewhere); desktop Chrome background tab.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: iOS AudioContext suspension semantics cannot be exercised in jsdom or headless relay]`

**Notes:** Reason: needs real iOS device; SF-3 clamp documents best-effort only until hardware pass.

---

### 23. [human-only] Per-speaker lane CPU / thermal on real mobile hardware

**Action:** On **real mobile** student device with full consent, join 30+ minute session (or accelerated stress: multiple peers if testable). Monitor device warmth, battery drain, UI jank when learner mic lane is active.

**Expect:** Acceptable for pilot — no thermal throttling that kills audio, no browser kill. If severe, note device model + iOS/Android version for BACKLOG.

**Ignore this run:** Desktop tutor path; single peer only (cap via reconcileSpeakers).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: CPU/thermal of parallel MediaRecorders not simulated in CI]`

**Notes:** Reason: per-speaker lanes add recorders; mobile thermal profile needs real hardware.

---

## Standing full-site regression (both themes)

### 24. Auth — tutor login + session persistence

**Action:** **Repeat in light, then dark.** Sign out. Log in as **tutor** via Google OAuth (or test account). Refresh page; open `/admin/students`. Sign out.

**Expect:** Login succeeds; session persists across refresh; sign out clears session; no redirect loop.

**Ignore this run:** 2FA depth (CUT-6 item); forgot-password email delivery.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: auth route tests + security Tier A]`

**Notes:**

---

### 25. Auth — student / learner login

**Action:** **Repeat in light, then dark.** Sign in as **learner** (child PIN or family login path used in pilot). Reach student home/shell. Sign out if available.

**Expect:** Learner login works; appropriate shell loads; no tutor admin leakage.

**Ignore this run:** Learner logout nav polish (known follow-up).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: learner login throttle + lpr logs]`

**Notes:**

---

### 26. Tutor dashboard + student roster

**Action:** **Repeat in light, then dark.** Tutor: `/admin/students` — list loads; open one student detail; active/ended session lists render; **Start session** / **Resume** entry points visible.

**Expect:** Roster and student detail usable; no layout break in either theme; coral/brand tokens readable (WCAG spot check).

**Ignore this run:** Org-pilot features; billing minutes display tweaks.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: dom tests for student lists where present]`

**Notes:**

---

### 27. Student join gate (waiting room + consent)

**Action:** **Repeat in light, then dark.** Tutor starts session; student opens join link on second device. Complete waiting room, consent prompts, and enter live board.

**Expect:** Join gate enforces consent honestly; student reaches live synced board; Connected state; no auth loop.

**Ignore this run:** CC-1/CC-2 deep edge cases (see consent smokebooks); theme on student phone layout (Wave 4 parity).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: identity-e2e 16/16 + consent harness specs]`

**Notes:**

---

### 28. Live A/V connect (happy path)

**Action:** **Repeat in light, then dark.** Tutor + student in ACTIVE session: enable mic (and camera if used). Speak both directions.

**Expect:** Audio flows both ways on happy path; tiles render; mute/unmute works. (Reconnect stress = item 21 human-only.)

**Ignore this run:** Tutor video paint backlog; camera hotswap (BUG-9).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: live-av mesh unit tests; hardware for real RTP]`

**Notes:**

---

### 29. Whiteboard core — draw, pan, zoom, pages

**Action:** **Repeat in light, then dark.** Tutor + student synced: draw strokes, erase, pan/zoom, add/switch **pages/boards**, student follow-tutor toggle if shown.

**Expect:** Bidirectional sync; page isolation; tools responsive; no "Loading scene…" stuck state.

**Ignore this run:** Laser color nit; student graph entry (design Q).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: test:wb-sync sync invariants + wb-jest]`

**Notes:**

---

### 30. Replay playback (single-segment happy path)

**Action:** **Repeat in light, then dark.** Open ended session review; play replay from start. Scrub timeline slightly. Toggle play/pause.

**Expect:** Audio + board replay align reasonably; play starts near 0 (SMOKE-UX-1 fix); single-segment seek works at in-frame review entry (Ship-to-Sarah gate #3).

**Ignore this run:** Multi-segment >50min scrub (SSG-3 deferred).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: replay controller unit tests + wb-replay specs]`

**Notes:**

---

### 31. Notes — review, save, finalize

**Action:** **Repeat in light, then dark.** After End, on review overlay: wait for notes generation; edit fields; **Save**; mark **Ready** / finalize if shown. Reload review page.

**Expect:** Notes persist; empty save guarded; finalize transitions status; no monolithic "Generate notes from session" legacy button on new surface.

**Ignore this run:** MAP-ACC quality tuning.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: notes-session-bridge + notes-worker tests]`

**Notes:**

---

### 32. Consent gates (Block B + CC-1/CC-2 spot-check)

**Action:** **Repeat in light, then dark.** Spot-check: tutor audio consent banners; student join consent choices; session cannot proceed without required `ConsentRecord` where applicable. Full matrix: [`consent-honesty-premerge-smoke-index.md`](consent-honesty-premerge-smoke-index.md).

**Expect:** No silent capture when consent off; honest copy on toggles; remote surgical mixdown when recording denied but live allowed (Block B item 3b if re-run).

**Ignore this run:** Full re-run of all three consent smokebooks unless merge gate requires it.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: consent projection tests + identity-e2e]`

**Notes:**

---

### 33. Share links — tokenized + revocable parent view

**Action:** **Repeat in light, then dark.** Tutor: create **share link** for a student note/session. Open `/s/[token]` in incognito (parent view). Revoke link; confirm access denied.

**Expect:** Tokenized access works when valid; revoked/expired link fails closed; no raw public Blob URLs in page source.

**Ignore this run:** Share link analytics.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: sal prefix access tests + share-access-scope]`

**Notes:**

---

### 34. Erasure — admin UI spot-check

**Action:** **Repeat in light, then dark.** ADMIN: `/admin/erasure` loads; trigger flow UI present (do **not** erase real pilot data — use test learner only or read-only verification). Full runbook: [`erasure-smokebook.md`](erasure-smokebook.md).

**Expect:** Admin-only gate; confirmation phrase enforced; grace-window semantics understood.

**Ignore this run:** Full erasure purge wait (7-day grace).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: request-erasure-by-admin.test.ts]`

**Notes:**

---

### 35. CUT-6 — 2FA re-smoke on merged tip

**Action:** **Repeat in light, then dark.** ADMIN account with 2FA enrolled: log out; log in with password → TOTP challenge; complete login. Test **remember device** skip if enabled (real browser — RSC cookie path). Reference: [`2fa-remember-device-smokebook-2026-06-13.md`](2fa-remember-device-smokebook-2026-06-13.md) tests 1–2.

**Expect:** 2FA challenge appears; valid TOTP succeeds; no QR secret egress to third-party URLs; remember-device works on real preview runtime.

**Ignore this run:** 2FA enroll rotation (separate admin task).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tfa lifecycle tests; remember-device needs real runtime]`

**Notes:**

---

### 36. Privacy + terms facades

**Action:** **Repeat in light, then dark.** Visit `/privacy` and `/terms` (logged out). Scan product-specific sections; confirm links to umbrella mortensenapps.com policies.

**Expect:** Pages render in both themes; "Last updated" strings present; no broken layout; umbrella links work.

**Ignore this run:** Quarterly legal drift review process.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: legal copy accuracy vs umbrella — spot check]`

**Notes:**

---

### 37. Theme toggle — global sanity (CUT-1 helper)

**Action:** **Repeat in light, then dark.** From tutor dashboard and one whiteboard workspace: open theme control; select **Light**, **Dark**, **System**; verify immediate apply. Escape closes menu.

**Expect:** Theme switches without reload loop; whiteboard + admin chrome both respect choice; readable contrast in both themes on primary surfaces.

**Ignore this run:** Marketing homepage-only pages not in Sarah path.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: Gate A1 both-theme component tests where present]`

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `merge --no-ff wb-wave5-polish → v1-redesign` (integration branch preview — fetch new alias via Vercel MCP; **never guess** hash).

**Integration branch:** `v1-redesign`
**Integration tip commit:** _fill at merge time_
**Integration preview:** _[v1-redesign preview](https://<fetch-branchAlias-via-MCP>)_

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Post-merge regression — durability spine on integration tip

**Action:** On integration **Preview**, **repeat in light, then dark:** tutor login → one student → short live session (draw + speak) → End → review loads → replay plays. Spot-check VAD segment count >0 before end if time permits.

**Expect:** No new failures vs this smokebook on branch preview; merge did not drop WS-A–D/E fixes.

**Ignore this run:** Features not yet merged into integration.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

### 2. Post-merge `test:wb-sync` on integration tip (if WB paths conflicted)

**Action:** Orchestrator runs relay if merge conflicts touched `src/lib/whiteboard/**` or `src/components/whiteboard/**`.

**Expect:** Green relay on integration tip.

**Ignore this run:** Clean merge with no WB conflict.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:**

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. **CUT-3** must be PASS (relay green) before calling this book PASS. Human-only items 21–23: PARTIAL/SKIP acceptable if reason documented and Andrew accepts Sarah risk. Leave both unchecked until the run is complete.

- [ ] PASS
- [ ] FAIL
