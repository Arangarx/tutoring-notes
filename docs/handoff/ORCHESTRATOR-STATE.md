# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## V1 Redesign (active epic)

Multi-day epic on branch **`v1-redesign`**. **Source of truth:** [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md) — decisions ledger, sub-pass tracker, open items. Do not duplicate the ledger here.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. **SEC-1 admin impersonation is COMPLETE + EXTENDED** — A (`27fb0d3`) + B (`6e29d57`) + C (`8bb7449`) + role-split follow-up (`7dadd7a`) all merged + smoked GREEN. **usemynk.com brand-domain cutover MERGED** (`291288c`) -- production on apex; Sarah still on `tutoring-notes.vercel.app` until Search Console "Deceptive pages" review + OAuth watch-items clear. **W1 audio durability:** Ship A merged; Ships B/C shelved (upload treated as working). **End-session "0 segments":** RESOLVED as cosmetic (audio confirmed in prod); copy fix in flight on `fix/end-session-segment-copy`.

## Overnight autonomous drive — 2026-06-04 (Andrew authorized "work overnight on unblocked things; smoke tomorrow")

Serial chain (one branch in flight at a time — shared working tree + single test DB make unattended parallelism unsafe; Wave-A lesson). **Process note:** Opus stopped making in-chat ORCHESTRATOR-STATE edits while subagents churn branches through the shared main tree (a state edit got stranded uncommitted on the limiter branch + stashed by task 2; recovered onto `v1-redesign`). Commit state immediately or pause edits during the chain.

1. **DONE @ `ffa5ac4`** (branch `security/durable-auth-2fa-limiters`, pushed, **NOT merged** — awaits Andrew security smoke). Durable AH-login + operator-2FA limiter port: `AuthThrottle` Neon table (migration `20260604000000_auth_throttle`, sorts after `20260603000000`), `src/lib/auth-rate-limit.ts` atomic increment, stable identity keys (`ah-login:<normalizedEmail>` 10/min; `2fa-verify:<adminUserId>` 20/min — IP-independent per PIN-limiter lesson; IP-coarse middleware layer kept as defense-in-depth), log prefixes `alr`/`tfr` registered, 8 independent-oracle durability tests. Gates green. Smoke checklist in subagent report.
2. **DONE @ `b61d639`** (branch `chore/fix-schema-back-relation-test`) — **MERGED to `v1-redesign` @ `260aa76`** (test-only, zero runtime risk, orchestrator-merged). Standing `identity-p2-schema` RED was a **stale test** (schema correct per IAC-2: `LearnerProfile.students → Student[]` 1-to-many); test now asserts the list back-relation. identity 280/280, regression 92/92. **v1-redesign green-suite is now honest (no known pre-existing RED).**
3. **DONE @ `d8996bb`** (branch `design/iac-13-tutor-disconnect`, pushed, **NOT merged** — ratify-ready, build deferred). Design doc [`iac-13-tutor-disconnect-design-2026-06-04.md`](iac-13-tutor-disconnect-design-2026-06-04.md). **Visibility:** `Student.learnerProfileId → LearnerProfile.accountHolderId → AccountHolder.{email,displayName}` (no new column; current page only checks `!!learnerProfileId`); "connected since" from latest `claimedAt`. **Disconnect:** single txn — `updateMany WHERE id AND learnerProfileId=<known>` (race-safe), revoke pending invites, write `StudentDisconnectLog`; multi-tutor-safe (only this tutor's Student row); null FK is the access boundary (no bulk session revoke). **Hardening recs:** TTL 7d→48h, pending cap 3→1, revoke-UI. **Schema delta:** 1 additive table `StudentDisconnectLog` (audit; learner/AH ids as plain String NOT FK to survive tombstone). **4 BLOCKERs** (B1 Phase-3 gates check live FK; B2 race-guard tested; B3 plain-String audit fields; B4 `[dsc]` log+audit row). **8 open Qs for Andrew, each w/ recommended default** (Q1 immediate mid-session kick; Q2 no device-session revoke; Q3 cap=1; Q4 TTL=48h; Q5 AH-notify fast-follow; Q6 DB audit table; Q7 prefix `dsc`; Q8 parent-unlink deferred). **Andrew: ratify the 8 Qs, then build slots into identity Phase 2/3.**
4. **DONE @ `0d0604c`** (branch `analysis/pause-disconnect-behavior`, pushed, **NOT merged**). Code-half analysis [`pause-disconnect-code-analysis-2026-06-04.md`](pause-disconnect-code-analysis-2026-06-04.md). **CODE-CONFIRMED:** `getAudioMs()` **freezes** whenever `recordingActive===false` (Pause / sync-disconnect / armed); session timer freezes only on sync peer-loss (`bothPartiesInRoom`), **keeps advancing on tutor Pause while student stays** (deliberate divergence); pure WebRTC A/V loss does NOT auto-pause; chat-only/AV-fallback **not implemented**. **Wall-clock gap lost** in LTX `assembleIncrementalTranscript` (`transcripts.join` + summed durations, spike branch) AND on v1-redesign WB layer (event `t` from frozen `getAudioMs` compresses timeline). **Draw-during-disconnect:** strokes still broadcast live, but event log NOT appended while auto-paused → reconnect folds into resume snapshot at frozen `t`. **Recommendation:** P0 needs an **advancing wall-clock** stamp (anchor on presence/`activeMs` timer), keep frozen `getAudioMs` as legacy replay axis until gap-aware audio ships. **Hardware tests H1–H8 named** (start H1 draw-during-disconnect + H3 Pause-vs-timer). Feeds the session-lifecycle design pass.

All produce smokeable branches / review-ready docs; nothing merges to `v1-redesign` without Andrew smoke (except the test-only fix, already merged).

### ✅ OVERNIGHT CHAIN COMPLETE (2026-06-04 ~01:21). Andrew's morning queue:
- **SMOKE (round 3):** `security/durable-auth-2fa-limiters` @ **`88fc4d4`** — round-2 (`2304f9e`) still failed (standalone "Error" card + separate auth-error screen). **Round-3 root cause: middleware rate-limited `GET /login` + `GET /api/auth/csrf` in the SAME `auth:<ip>` bucket as the credential POST → after ~5 attempts CSRF fetch got 429 → malformed credentials POST → NextAuth redirected to its built-in `/api/auth/error` standalone card (bypassing `redirect:false`); also no `pages.error` config.** Fix @ `88fc4d4`: scope `auth:<ip>` limiter to credential-SUBMIT endpoints only (`/api/auth/callback/credentials` + `/api/auth/account-holder/login`) — GET page/CSRF reads aren't brute-force vectors; `pages.error: "/login"`; inline helpful messages on `/login`, `/account/login`, claim login (bad-creds w/ Reset-password link, rate-limit "wait 60s", access-denied, oauth/server errors); clear password field on failure (Edge save-prompt mitigation). Gates green (312/313, the 1 RED is the pre-existing schema test this branch predates). **Re-smoke (round 3): on the branch's Vercel preview — bad password → inline error on page; 12+ rapid submits → inline "Too many attempts — wait 60s" on page; fake email → inline; same on `/account/login` + claim. No standalone card, no JSON.** Then merge if pass.
- **RATIFY:** IAC-13 design Q1–Q8 — **✅ ALL 8 DEFAULTS RATIFIED (Andrew 2026-06-04):** Q1 immediate mid-session kick (w/ warning), Q2 don't revoke device sessions, Q3 cap=1, Q4 TTL=48h, Q5 AH-notify fast-follow, Q6 DB audit table, Q7 prefix `dsc`, Q8 parent-unlink deferred. Build slots into identity Phase 2/3 (`design/iac-13-tutor-disconnect` @ `d8996bb`).
- **HARDWARE-VERIFY:** session-lifecycle P0 — run H1/H3 from pause/disconnect analysis. **✅ DONE (Andrew 2026-06-04):** see findings block below.
- **Already merged to `v1-redesign`:** schema-test fix (`260aa76`) + state. Suite honestly green.

### Smoke round-2 + H-test hardware findings (Andrew 2026-06-04 PM)

**Smoke-1 STILL FAIL (login error UX):** (1) admin email + bad password → JSON/"Error"-card black screen after ~8 attempts (hits middleware `auth:<ip>` 10/min). The round-1 fix's separate HTML/error page is **still a standalone ugly card**, not inline. (2) Non-admin/invalid tutor email → a *separate* "auth error" screen — Andrew: should be **inline on the page**, and the message gives **no next-action guidance**. (3) Edge offered to save/update password after a failed login. **→ Re-fix dispatched (Sonnet):** errors must render INLINE on the login page with helpful next-action text — no standalone error card, no JSON. Likely fix: don't block the page GET (scope limiter to the submit) OR redirect back to `/login?error=...` with an inline banner; handle NextAuth credentials error (`CredentialsSignin`) inline too.

**Pause/Resume recording — RESOLVED to a replay split-brain, NOT true data loss (investigation `203574dc`).** The WB-toolbar **"Pause recording"** button is misnamed: it calls `stopAndUpload("final")` (finalizes the segment → "Recording saved"), and "Start" begins a fresh segment with a reset timer. Post-resume audio IS captured as a 2nd `SessionRecording` and post-resume strokes ARE in `events.json` (`getAudioMs` accumulates across pauses) — but **replay plays only `audioRecordings[0]`**, so everything after the pause is invisible in review though safe in Neon+Blob. (The audio-block pause button is a real `MediaRecorder.pause()`; the two were never unified.) Pre-existing (Phase 1a/1b), not identity work. Caught an error in the analysis doc §2 (tutor-Pause is NOT a soft pause — that's only auto-pause/disconnect). **→ Fixes QUEUED below.**

**DECISIONS (Andrew 2026-06-04):**
- **Pause button = option C** (defer relabel/true-pause to the WB presentation re-think + segmented-save hardening). **DESIGN PRINCIPLE (LOCKED):** segmentation is a backend reliability concern, **fully abstracted from the UI**. Tutor's mental model = ONE continuous recording with **pause/continue** + the only numbers they care about: **duration, what to bill, cost (money/session tokens)**. Never expose "chunks/segments/parts." Applies to BOTH the in-WB recorder AND the standalone live audio recorder. Aligns with `billedDurationMin` (immutable duration primitive) + `cev` cost events. → fold into session-lifecycle brief + billing docs in next capture pass.
- **Family-id = scheme A:** bare `@surname` for the first family, numeric suffix only on collision (`@surname2`, `@surname3`…); atomic mint (unique constraint + retry). Assessed NOT a meaningful attack vector (handle isn't the secret; generic login errors give no enumeration oracle; PIN brute-force durably locked). Only leaks family-count per surname (low-stakes). New minting only; existing handles untouched; compatible w/ deferred editable-familyId (IAC-7).
- **WB page insertion = append at END** (current "after active page" is a prior-agent misunderstanding Andrew dislikes).

**QUEUED FIXES (dispatch serially off `v1-redesign`):** (1) **replay multi-segment stitch** — ✅ DONE @ `1936955` on `fix/replay-multi-segment` (sequential source-swap on one `<audio>`, pure tested timeline helper `replay-audio-timeline.ts`, admin+share pages pass full segment list, footer caveat removed). Gates green (tsc/build/regression/9 timeline tests/wb-jest 517). **wb-playwright did NOT run — failed on env `prisma db push --accept-data-loss` at WebServer start (setup, not diff).** jsdom can't verify replay timing → **Andrew hardware re-smoke is the real gate** (re-run pause/resume session → review → post-pause audio+strokes play in one continuous timeline; single-segment still fine). Awaiting re-smoke → merge. (2) family-id scheme A — ✅ DONE @ `bd146f0` (`src/lib/family-id.ts`: slug last-word-of-displayName, bare base then `base2/3…`, insert-and-catch P2002 retry, no migration — `familyId` already `@unique`; 9 tests). (3) WB page-insertion→end — ✅ DONE @ `167eefa` (`WhiteboardWorkspaceClient.tsx` `addTutorPage` appends + selects; under `src/app/.../workspace/` so wb-sync correctly skipped). (4) analysis-doc §2 — ✅ DONE @ `14c4daf`. All on `fix/family-id-and-page-insert`, gates green, awaiting Andrew smoke → merge.

**THREE branches awaiting Andrew smoke → merge to `v1-redesign` (all gates green):** (a) `security/durable-auth-2fa-limiters` @ `88fc4d4` (login UX round 3 + durable AH/2FA limiters); (b) `fix/replay-multi-segment` @ `1936955` (replay stitch — HARDWARE gate); (c) `fix/family-id-and-page-insert` @ `bd146f0`/`167eefa`/`14c4daf` (family-id A + page-insert end + doc §2). Merge order suggestion: (a) → (b) → (c) or any order (disjoint files; replay+page-insert both touch whiteboard area but different files).

**SMOKE round-3 RESULTS (Andrew 2026-06-04/05, hardware) + follow-ups:**
- **(a) login `88fc4d4`:** `/account/login` GOOD (inline "Too many attempts — wait N seconds"); password-clear good. **BUGS:** (i) `/login` (operator) shows WRONG msg on 429 — "Couldn't reach Mynk" (network/server) instead of rate-limit; 429 not classified on operator path. (ii) Countdown is STATIC on both pages — doesn't tick down like the learner-PIN lockout. Lockout NOT permanent (60s). → **QUEUED fix** (Composer, fix-forward on security branch): classify 429 on `/login`; live countdown reusing learner-PIN pattern; + `tabIndex={-1}` on password show/hide toggles.
- **(b) replay:** round-1 (`1936955`) was FUNCTIONALLY DEAD on hardware → **FIXED @ `953efa0`** (Sonnet, `fix/replay-multi-segment`). Root cause: `SessionRecording.durationSeconds` is **null at insert** (`endWhiteboardSession` createMany omits it) → `totalMs=0` → every scrubber/scene position clamped to 0 + onEnded skip-loop dropped all segments. Fix derives offsets from real `audio.duration` metadata (not stored durations); play/pause state; removed skip-loop; fixed a leaked `onEnded` listener. Gates green (518 wb-jest, 92 regression; wb-playwright = same pre-existing env `--accept-data-loss` fail). **Awaiting Andrew hardware re-smoke (S1–S6 + single-seg + events-only).** ⚠️ FOLLOW-UP: durationSeconds-always-null undermines any per-segment duration sum (header duration currently comes from event-span, not this) — worth backfilling for the billing/duration primitive; BACKLOG.
- **(c) UX batch:** Andrew smoked the WRONG preview (`fix/replay-mu…`, which lacks the family-id commit) → saw old `@johny_learne6602`, expected. Scheme A is on `fix/family-id-and-page-insert` — smoke THAT preview for bare `@surname`.
- **Claim cross-tab — ROOT CAUSE FOUND (`2d021d6e`):** detection is server-side via `mynk_ah_session` HttpOnly cookie (NOT sessionStorage/NextAuth). Cookie is `SameSite=Strict` → withheld on cross-site top-level nav (fresh tab / email / SMS link); same-site paste-over sends it. Same family as the "verified parent gets create-gate" report. **DECISION (Andrew): relax to `SameSite=Lax`** (keep HttpOnly + Secure-prod; NextAuth-standard; claim-complete POST stays separately protected). Secondary cleanup: `claim/setup/page.tsx` still reads cookie via manual `headers()` — align to `getAccountHolderSessionFromHeaders()`. → **QUEUED fix.**
- **NEW backlog (general notes):** (1) logged-in users hitting `/` (landing) should redirect to their dashboard (operator→admin, AH→account) — surfaced by redesign → **QUEUED**. (2) Tab order on login/PIN pages should SKIP the reveal toggle (`tabIndex={-1}`) → folds into the login-UX fix.

**login-UX fix DONE @ `7fa34a1`** (security branch): `/login` now uses a hand-rolled `credentialsSignIn()` (direct CSRF + credentials POST) to detect the 429 (replaces NextAuth `signIn()` — ⚠️ rewrote operator-login submit path, so AM smoke MUST include a SUCCESSFUL `/login`, not just errors); live countdown extracted to `useRetryAfterCountdown` hook on both login pages; `tabIndex={-1}` on reveal toggles (`PasswordStrengthField`, claim `CredentialSetupForm`). Gates green + new `auth-client.test`.

**🔴 P0 SESSION WRONG-IDENTITY BUG — root cause FOUND (`5f98c207`, Sonnet):** AccountHolder session can resolve to the WRONG account (Andrew: created A→verify, created B→verify, claim link showed **A's** identity). **NOT cross-user/cross-device — same person's own 2 accounts, same browser. Primary cause is PREVIEW-ONLY (production has a single stable domain → no prod fire).** Two root causes + a sub-issue:
- **RC-A (primary, preview-only):** verify-email link built from `getPublicBaseUrl()` → per-deploy `VERCEL_URL`, a DIFFERENT cookie domain than the branch-alias the user browses. B's cookie lands on `VERCEL_URL`; A's old cookie persists on the branch-alias; claim on branch-alias reads A. (`signup/route.ts:107`, `public-url.ts:20-25`, `claim-invites/route.ts:90`.)
- **RC-B (secondary, any env, timing):** `verify-email` sets the session cookie on a `NextResponse.redirect` to a CROSS-SITE nav; Edge/Chromium may not commit `Set-Cookie` before the follow-up request, so A's preserved `Strict` cookie wins. Plus the `consumedAt` re-click path redirects with NO `Set-Cookie` at all → A stays active. (`verify-email/route.ts:48-52, 90-92`.)
- **Sub-issue:** `buildRequestFromHeaders()` (`server-session.ts:20-28`) joins cookies into a string → `getCookieFromRequest` first-match scan (`account-holder-session.ts:207-213`) vs route-handlers' Map API last-match → server-component/route-handler identity split on duplicate cookies.
- **Fix directions (investigation):** (1) RC-A: build verify link from `getRequestBaseUrl()` ⚠️HOST-INJECTION TRADEOFF, or a same-site `/auth/verify-done` intermediate (safer); (2) RC-B: don't establish session via redirect `Set-Cookie` — same-site intermediate token-exchange page; (3) defense-in-depth: `revokeAllAccountHolderSessions(id)` before `createAccountHolderSession` on login+verify (⚠️PRODUCT CALL: single-active-session-per-account kills other devices?); (4) sub-issue: `buildRequestFromHeaders` → `cookies().get()` Map API (pure-win, no tradeoff).

**⚠️ `SameSite=Lax` DECISION REVERSED → DEFERRED (Andrew had ratified Lax for cross-tab claim links).** Investigation: Lax does NOT fix the wrong-identity bug and makes it show SOONER (Lax sends A's cookie on the first cross-site claim click). **KEEP `Strict` until the wrong-identity bug is fixed; THEN Lax safely enables the legit email-link claim case.** Orchestrator deferred Andrew's ratified decision on new evidence — flagged to Andrew.

**OVERNIGHT CHAIN — ✅ COMPLETE (2026-06-05, Andrew asleep, authorized "queue what you can" + consolidated morning runbook):**
1. ✅ P0 state recorded `f985f71`. 2. ✅ **session-fix DESIGN doc** `35363e2` → [`docs/handoff/session-wrong-identity-fix-design-2026-06-05.md`](session-wrong-identity-fix-design-2026-06-05.md) — Q1–Q4 awaiting **Andrew "ratify defaults"**. 3. ✅ **logged-in→dashboard redirect** `385ec7d` on `feat/landing-logged-in-redirect` (operator→`/admin`, AH→`/account/dashboard`, operator precedence; smoke parent-path AFTER session fix). 4. ✅ **morning smoke runbook** `60dfffa` → [`docs/handoff/MORNING-SMOKE-RUNBOOK-2026-06-05.md`](MORNING-SMOKE-RUNBOOK-2026-06-05.md) — all 4 unsmoked branches w/ Vercel preview URLs + steps. NOT doing session CODE fix overnight (judgment/security tradeoff → AM ratify).

**DECISION (Andrew 2026-06-05 AM, during replay smoke) — UNIFIED PLAYBACK UI:** single-segment and multi-segment must present the **SAME** player interface to tutors/students (extends the continuous-recording abstraction principle to playback). The current replay fix (`953efa0`) kept the OLD native `<audio controls>` for n=1 and the new custom global scrubber only for n≥2 — that split is the inconsistency to remove. **TODO: unify on ONE custom player for all segment counts, AND apply the scrubber fixes to EVERY playback surface** (admin WB review, `/s/[token]` share replay, and any other audio/session playback — investigation dispatched to enumerate). Fold into the replay branch (fix-forward) or a follow-up after Andrew's full replay smoke notes land. ⚠️ unifying raises the stakes on the custom player's single-segment correctness (it becomes the common path).
  - **SURFACE INVENTORY (investigation `64204bd9`):** 5 persisted playback surfaces — (1) admin WB replay + (2) public `/s/[token]` WB replay [both use `WhiteboardReplay`, have the n=1 native vs n≥2 custom split]; (3) admin notes expanded (`TutorStudentNoteExpandedBody`), (4) parent-share latest note (`ParentShareNoteCard`), (5) parent-share all-notes [**all three render N SEPARATE raw `<audio>` players** for multi-segment — no stitch, no `attachWebmDurationFix` → broader inconsistency than just WB]. Plus pre-save `AudioPreview` (blob URLs, lower priority). **Recommended:** extract a shared `SessionAudioPlayer` (Play/Pause + global range + hidden `<audio>` + segment source-swap + timeline math) from `WhiteboardReplay`; use it for ALL segment counts AND on the note cards (one player per note). `WhiteboardReplay` already supports audio-only (empty events) so note cards just need the audio chrome, no Excalidraw. **Effort ~M (1–2 dispatches) after replay branch merges.** Gotchas: public-share surfaces (parents hit regressions first → extra smoke), note players lack the WebM duration fix today, segment arrays built from different queries per host (`audioRecordings` vs `note.recordings` by `orderIndex`), custom range uses `seekGlobalMs` not the native `attachReplayScrubAudioDefer`. **HOLD dispatch until Andrew's replay smoke notes land.**

**🌅 ANDREW MORNING ENTRY POINTS:** (1) **Smoke** → [`MORNING-SMOKE-RUNBOOK-2026-06-05.md`](MORNING-SMOKE-RUNBOOK-2026-06-05.md) (4 branches, copy-paste). (2) **Ratify** → [`session-wrong-identity-fix-design-2026-06-05.md`](session-wrong-identity-fix-design-2026-06-05.md) (reply "ratify defaults" → I build the P0 session fix). On smoke pass per branch → `merge --no-ff` to `v1-redesign`. Lax stays deferred until session fix lands.

---

## 2026-06-05 MORNING SMOKE RESULTS + actions (Andrew)

**✅ MERGED to `v1-redesign` (`34fe513`):** (a) `security/durable-auth-2fa-limiters` (login-UX + durable AH/2FA limiters) — smoke 1–4 ALL PASS; (b) `fix/family-id-and-page-insert` (family-id scheme A + page-insert→end + analysis-doc §2) — PASS. Branches preserved.

**Q1–Q4 RATIFIED** (Andrew accepts recommended defaults). Q2 clarified: revoke-on-**verify-only** does NOT sign out other tabs in normal use (verify = account creation, no prior sessions); we are NOT doing revoke-on-login (the multi-device killer). → **session-fix DISPATCHED** (Sonnet) per design doc.

**🔁 `fix/replay-multi-segment` — NOT mergeable; fix-forward needed (REPLAY v2 dispatched, Sonnet).** Smoke: S1 pass · **S2 FAIL** (scrubber dot starts slightly in, NOT at true 0; AND Play↔Pause button width changes → resizes the bar + shifts the dot → layout shift) · **S3 FAIL** (on FIRST playback, at end it jumped to where segment-2 audio starts and replayed once, then stopped — end-of-timeline / onEnded bug) · S4 pass · S5 pass · S6 pass-ish (transition abrupt due to the button-resize layout shift). Single-segment: still native controls (unify pending — expected). **Events-only = REQUIREMENT shift:** Andrew WANTS the whiteboard to replay in REAL TIME even with no audio (he saw a 21s timer + strokes playing and that's the desired behavior) — current "show final frame only" is wrong; need a **synthetic wall-clock** driving stroke replay when there's no audio. More replay bugs: (i) seek-to-point pauses playback but button still says "Pause" (state desync); (ii) first-playback segment-boundary jump + "Replay time" label flickers/disappears momentarily; (iii) very beginning flashes the FINAL state before t=0; (iv) slight page shift on track transition (same button-resize cause). → REPLAY v2 = fix all + unify n=1 onto the custom player + no-audio synthetic clock. (Note-card surface extraction still a separate follow-up.)

**⚠️ LIVE-session viewport observations (SEPARATE from replay — possibly the hard-won viewport-sync zone; investigate, don't conflate):** during a live session Andrew saw tutor/student canvas "centers off," drifting further after a student refresh, and "**syncing doesn't happen when paused**" — a paused student can scroll freely with no snap-back. Needs its own look.

**🔴 LIVE-session JOIN bug (general note):** Andrew created a session, didn't plug the camera, then started a NEW session WITHOUT ending the previous one and sent the student a NEW link — the student joined the PREVIOUS (un-ended) session and neither tutor nor student saw each other. → session-lifecycle / join-routing bug (new link resolved to old session; participants mismatch). **Investigate.**

**`feat/landing-logged-in-redirect` — works (1,2 PASS; 3 deferred) but DESIGN Q (Andrew undecided):** hard `/`→`/admin` redirect means a logged-in tutor can't reach the landing. Two models: (A) Netflix-style (authed users only ever see their dashboard, no landing) vs (B) landing stays reachable with easy dashboard links. **Andrew to decide before merge.** Ties to the `/login` home-nav note below.

**NEW BACKLOG (from smoke):** (1) "**Remember this device**" login functionality (queue). (2) **`/login` + login pages need home nav** — at least the Mynk wordmark → `/`. (3) Child-login-creation page (`CredentialSetupForm`) tab-order: CONFIRMED already fixed in the login-UX branch (tabIndex on both PIN reveal toggles). (4) Final WB design pass: maximize student viewport + reasonable control access; **NO "recording saved" message when paused**; page-list layout must not steal so much space from the whiteboard (new pages currently appear after PDFs — acceptable interim). (5) General Q answered: **YES**, requiring student login to access a session is planned before v1 (identity/access IAC).

**Lesson re-applied:** do state edits BEFORE dispatching a writer that checks out a branch (a writer's `git checkout` moves the shared tree out from under in-chat edits — bit us once tonight, recovered cleanly).

**H1 (draw-during-disconnect) — CONFIRMS the freeze model, Andrew "possibly okay":** student disconnect+return → timeline "jumped forward" (content, not scrubber), **audio stayed in sync with NO 30s gap (recording truly paused)**, tutor strokes drawn during the gap **popped up all at once** at resume. This is exactly the CODE-predicted freeze behavior. **Design input:** Andrew tentatively accepts freeze for the disconnect case → leans the freeze-vs-advance decision toward "freeze is acceptable for disconnects" (revisit for the LTX wall-clock case).

**WB presentation issues (→ session-lifecycle/WB redesign thread; Andrew: "whole WB presentation needs a thorough re-think"):** (a) **TWO pause buttons** — one under the audio block, one in the WB-session block w/ pills (redundant/confusing). (b) Pause UX confusing ("Recording saved" on pause, new timer, no original indication). (c) WB page load slower now (Andrew self-resolved as caching; flag: did identity/session work add upfront cost?). (d) Claim observation: link created by tutor in Chrome, opened by a newly-created already-verified parent → got "Create parent account / I already have an account" **instead of the identity interstitial** — verify whether parent simply lacked an AccountHolder session in that browser (→ login → THEN interstitial = expected) or a real gap.

**Decisions to capture:** **(e) Family ID naming idea (Andrew):** first family of a surname could get bare `@mortensen` (no digits), only appending 4-digit suffix to disambiguate collisions (`@mortensen3948`) — vs always-suffix today. Trade-off: bare name leaks family-count + complicates uniqueness/cascade (ties to IAC-7 deferred-editable). DECIDE. **(f) WB page-insertion (Andrew):** new pages appearing AFTER the active page is counter-intuitive (artifact of a prior agent's misunderstanding) — change insertion position (likely append at END). Fix candidate.

## Last action completed

**2026-06-03 (PM) — Integration merge to `v1-redesign`:** `merge --no-ff` **`identity-p2-multitutor`** → **`v1-redesign`** @ **`b3da280`**; then `merge --no-ff` **`feature/phase-d-landing-about`** (landing/features copy + sign-in hover). Post-merge gates green (tsc, `next build`, regression 92/92; identity 279/280 — pre-existing `identity-p2-schema` `student` back-relation naming failure only). **Migration reality (Andrew correction):** all previews share ONE preview-dev Neon DB, so the three new identity migrations (`20260602110000`, `20260602120000`, additive `20260603000000_learner_pin_throttle`) **already applied** to it during the multitutor preview deploys (the PIN lockout smoke proves the throttle table exists there). Merging to `v1-redesign` is a migration no-op on preview. The real migration event is **PRODUCTION at the `v1-redesign → master` cutover** — prod's DB takes the entire identity stack + throttle table in one deploy. Plan that as a deliberate, sizable prod migration when V1 lands.

**2026-06-03 (PM) — Claim connect-as radio spacing fix + IAC-13 tutor-disconnect security requirement captured.** Branch **`identity-p2-multitutor`** advanced `163f246` → **`814de27`** (2 commits, pushed, **merged** @ `b3da280`). Gates green (tsc, `next build`, regression 92/92). (1) `10ed925` — radio→label gap on the signed-in "connect as who" interstitial (`ClaimInterstitial.tsx`); **root cause: global `label { display: block }` (unlayered, after Tailwind) overrode `flex` so `gap-*` never applied** → fixed with `!flex items-center gap-3` + `size-4 shrink-0` (only radio group in `claim/`; b81950a had fixed a *different* group). **SMOKED PASS (Andrew 2026-06-03, hard refresh on interstitial).** (2) `814de27` — **IAC-13** captured (docs only, NOT built): intercepted-claim-link threat → tutor needs (a) connected-account visibility + (b) tutor-side disconnect; in `BACKLOG.md` [SECURITY] + `session-identity-access-design-2026-05-31.md` §4.5 + `identity-phase2-auth-session-design-2026-06-01.md` ledger. **Findings:** tutor visibility of connected account = **NONE today**; tutor disconnect = **NONE today** (revoke only covers pending invites/share links); links **are** single-use (`claimedAt` 409-on-reuse) + 7-day expiry + email-verified — **residual risk: 7-day bearer window, ≤3 pending links, no tutor detect/recover after a wrong claim.** Parent-side unlink DEFERRED (not V1). Andrew confirmed real V1 security requirement; build deferred to design.

**2026-06-03 (PM) — Phase D copy/UX accuracy fixes from Andrew review.** Branch **`feature/phase-d-landing-about`** @ **`cf9dd84`** (isolated worktree `phase-d-landing-a3f7b9c2`, pushed, **merged**). Gates green (tsc, `next build`, regression 92/92). Three fixes: (1) `/` sign-in chooser now has hover + keyboard-focus indicator (`.sign-in-menuitem`: `--surface-2` bg + accent outline). (2) `/features` recording copy dropped the per-session **"confirm recording consent"** clause — inaccurate for v1 go-forward (recording-as-consequence; tutor won't confirm consent per session) → now "go live and capture runs automatically / one tap in person." (3) `/features` "**time-ordered record**" overclaim removed (transcripts are whole-session text blocks, not time-ordered; ltx P0 gap) → leads with **dates, duration, notes** + transcript + whiteboard replay. **SMOKED PASS (Andrew 2026-06-03):** copy accepted ("acceptable, can run by others later"); sign-in hover works but reads **too light** — deferred tweak folded into the Phase B/component real-component pass (backlogged). Phase D copy/UX review CLOSED.

**2026-06-03 — Multitutor smoke round-1 fixes + auth consistency + DURABLE PIN limiter + lockout-bug fix (real-hardware smoked).** Branch **`identity-p2-multitutor`** advanced `e2c5c7c` → **`163f246`** (7 commits, pushed, **merged** @ `b3da280`). All gates green per commit (tsc, `next build`, identity 114/114 + regression 92/92).
- **`b81950a`** — claim interstitial radio spacing + dropped decorative "+"; **copyable `username@familyid` handle** on 4 surfaces (setup API now returns `familyId`/`loginHandle`; credential-success screen; dashboard per-child; child detail). Andrew smoked: likes the handle; spacing good.
- **`96c6a6b`** — confirm-password added to **AccountHolder signup** (the only credential form missing it). Auth-form unification + **[SECURITY] tutor-reset `minLength 8` vs signup `10`+zxcvbn drift** backlogged AND named as a **Phase B component-redesign acceptance** requirement (one shared password primitive across all 8 forms).
- **`e15fd86`** — **DB-backed durable learner PIN rate limiter.** New `LearnerLoginThrottle` Neon table (additive migration `20260603000000`, applies on next preview deploy); atomic `INSERT…ON CONFLICT…+1` increment; limiter converted async + 3 call sites; 6 cold-start durability tests (independent-query oracle). Replaces in-memory `Map` state that reset on every Vercel cold start (hard lock was effectively non-functional). **Other in-memory limiters inventoried + backlogged [SECURITY]:** `auth:<ip>` AH-login + `2fa:<ip>` = MEDIUM; `learner_ip`/`api`/`setup` = LOW. PIN = exactly 6 digits (fixed).
- **Decisions this session (Andrew):** (a) **editable familyId (IAC-7) DEFERRED** — keep auto-gen; backlogged w/ cascade caveat (changing it breaks memorized child handles). (b) **accessMode "no specific error" = BY DESIGN, not a bug** — parent-managed/self children have no `LearnerCredential`, so `/students/login` fails earlier (generic) and never reaches the `access_mode_mismatch` guard; guard is correctly wired but **unreachable via any UI path** (dead-code) — login-page guidance gap backlogged. (c) **attach-existing confirmed working** (requires a 2nd-tutor claim link — testing-ergonomics gap noted; no parent-dashboard "add child"). (d) confirm-password: **standardize ON**; full unification deferred to component redesign.
- **Known (track separately):** a **pre-existing** schema test failure (`student` vs `students` naming) exists on the branch — confirmed NOT introduced by this work.
- **PIN lockout SMOKED-PASS on real hardware (Andrew 2026-06-03 PM).** Hard lock + parent-unlock validated (locks ~13, survives hard-refresh, unlock recovers). Soft-cooldown bug fixed @ `c3df351` (credential-scoped key `soft:<familyId>:<username>`); **`163f246`** Change-PIN autofocus + cooldown-disabled submit. **Re-smoke PASS:** soft brake at attempt 4 → 30s, escalation at 7 → 5min; locked message on ~13th; unlock confirmation persists. Full 13-count trusted, not exhaustively clicked. Coverage map: [`docs/TESTING-COVERAGE.md`](../TESTING-COVERAGE.md).
- **Live-transcription spike verified → P0 wall-clock invariant GAP** @ `c3c627f` on `spike/live-transcription`: naive `segmentIndex` concat (no timeline anchor); 6 intentionally RED spec tests (`ltx-timeline-assembly.test.ts`); ltx fix **design-gated** (freeze-vs-advance timeline — `getAudioMs()` freezes on pause) **+ hardware-gated**; see [`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md) + [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md).

**2026-06-02 (afternoon) — Live-transcription spike landed + session-lifecycle decisions captured (docs).** Spike on **`spike/live-transcription`** @ **`7671a25`** (off `master`, pushed, NOT merged): tsc 0, `next build` 0, `test:regression` 131 suites / 1358 tests; B2–B5 baked; B1 hardware-pending ([`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md)). **Session-lifecycle redesign brief** → [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) (auto-record reframe, presence timer, P0 wall-clock invariant, copy queue, in-person gate). Spine: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) § 2026-06-02 checkpoints.

**2026-06-02 — IAC multi-tutor + round-4 UX BUILT + preview-dev cutover + Phase D first cut.** Branch **`identity-p2-multitutor`** @ **`e2c5c7c`** (5 commits atop `aa6194a`, pushed, **NOT merged**). Gates green: tsc, `next build` (36 pages), identity 115/115, regression 92/92, pin/learner/claim/account-holder 23/23. IAC-2..8, IAC-10, IAC-11-E/G/I, IAC-12 delivered; IAC-9 deferred Phase 3. **Preview-dev cutover:** Neon reset + `prisma migrate deploy` — 6 identity migrations applied incl. non-additive `20260602120000`; Andrew real admin + 2FA intact. [Multitutor preview READY](https://tutoring-notes-git-identity-p2-m-9cb486-arangarx-5209s-projects.vercel.app). **Phase D:** `feature/phase-d-landing-about` @ `37d8178` (isolated worktree, pushed) — landing `/` + `/about` first cut awaiting brand review. [Phase D preview READY](https://tutoring-notes-git-feature-phase-26c42f-arangarx-5209s-projects.vercel.app). Detail: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) § Build milestones (2026-06-02).

**2026-06-02 — Phase D v2 brand-review revision on `feature/phase-d-landing-about`.** Landing `/` + **`/features`** (first-cut `/about` reframed; `/about` route removed/reserved). Single Sign-in menu (tutor/parent/student); no time-promises or no-login marketing copy. Backlogged: About-us (`/about`), Parents marketing page, async transcription durability — [`docs/BACKLOG.md`](../BACKLOG.md). Detail: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md) lightweight head.

**2026-06-01 — Identity Phase 2b (parent/child UI surfaces) BUILT, awaiting Andrew smoke.** Branch **`identity-p2b-ui`** @ **`cd7555b`** (base `ca49787`, pushed, **NOT merged**). Shipped: `/account/{login,signup,forgot-password,reset-password}` + `/verify-email` UI, `/account/dashboard`, `/account/children/[id]` (+ ChangePinForm), `/account/children/[id]/devices` (revoke one/all), `/students/login` (child PIN, soft-lockout countdown), `/claim/[token]` wizard (all states + **identity-confirmation interstitial** on existing-session path w/ "Not you?" escape) → `/claim/[token]/setup` (child credential; **consent panel = labeled Phase-3 placeholder, no ConsentRecord writes**), tutor "Send invite" behind `NEXT_PUBLIC_CLAIM_INVITES_ENABLED`. New APIs: device revoke one/all, credential PATCH (PIN change bulk-revokes sessions). Gates green: `tsc`, `next build` (35 routes), `test:regression` 92/92, identity 225/225 + 16 new P2b. **Superseded by multitutor build @ `e2c5c7c` (2026-06-02).**

**2026-06-01 — Identity Phase 2a (session infra + claim back-end) merged to `v1-redesign`.** `merge --no-ff` `identity-p2a-session-infra` → `v1-redesign` @ **`6c4a268`**. Post-merge gates green: `prisma generate`, `tsc`, `next build`, `test:regression` 92/92, identity-p2a 35/35, identity-2fa+impersonation+p2-schema+ownership 190/190. **Also merged:** `docs/road-to-ga` → `v1-redesign` @ **`eca63b5`** (docs only — [`docs/ROAD-TO-GA.md`](../ROAD-TO-GA.md)).

**2026-06-01 — Component Phase B2 merged to `v1-redesign` @ `0424206`; Identity Phase 1 @ `b5ef4fe`; AH-7 p2 schema @ `242c6b2` + ownership guard @ `1a06a65`.** (Earlier same-day merges — detail in [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md).)

**2026-05-31 — usemynk Safe Browsing / end-session triage (docs on `master`).** Search Console now shows domain-level **"Deceptive pages"** (Sample URLs: N/A); **Request Review** filed 2026-05-31 (supersedes 2026-05-30 `report_error`). Re-test at 48h; no repeated reviews. End-session **"0 segments"** downgraded to **cosmetic** -- prod `SessionRecording` `8a34b5f5-3aa8-48d5-bb1f-0248fa4762a8` (~1.5MB, same smoke session). Copy fix branch `fix/end-session-segment-copy` in flight.

**2026-05-30 — usemynk.com brand-domain cutover MERGED to `master`** (merge commit `291288c`). DNS + Vercel custom domains + Production-only `NEXTAUTH_URL` flip + repo artifacts all landed. **4/4 integration smoke pass** on usemynk.com (Gmail connect proven in incognito; whiteboard / upload / share via impersonating test1). **HOLD:** do not send Sarah to usemynk.com until deceptive-pages review clears + OAuth re-verify (she stays on `tutoring-notes.vercel.app`, zero disruption).

**2026-05-30 — SEC-1 Role follow-up SMOKED + MERGED** (`--no-ff` merge `7dadd7a`): `AdminRole` enum (`ADMIN|TUTOR`, default TUTOR) added to `AdminUser`, orthogonal to `isTestAccount`; migration backfills `arangarx@gmail.com → ADMIN` idempotently on deploy (preview-dev + production via `migrate deploy`); routing now role-based (`TUTOR` logins → `/admin/students`, ADMIN → `/admin` dashboard, tutor paths blocked); `assertIsAdmin()` blocks TUTOR from impersonating (covers real TUTOR logins like Sarah AND test accounts); JWT/session carries `role`; 50 tests green. Andrew smoke **PASS** (test1 direct login blocked, reachable via impersonation). This is the long-asked-for genuine admin-vs-tutor account-type separation; protects a future Sarah login from being stranded on the admin dashboard.

**2026-05-30 — SEC-1 Dispatch C SMOKED + MERGED** (`--no-ff` merge `8bb7449`): real-admin `/admin` dashboard landing + routing (tutor paths impersonation-only; exit → dashboard) + `AdminTestAccountsPanel` replacing interim `TestAccountsSection` + login default callback `/admin` + 39 SEC-1 tests green. Andrew real-hardware smoke **PASS** (dashboard landing, guard redirects, impersonate round-trip, exit-to-dashboard, test-account credential rejection). **SEC-1 (A+B+C) is DONE.** Open nit: banner not amber (cosmetic). **Account cleanup done on BOTH branches 2026-05-30:** `+test1` flipped to `isTestAccount=true` (sole impersonation target; password login disabled by gate; **prod 126 wb-sessions / 116 recordings preserved**); `+test2/3/4` deleted on both; dev-only `+sec1smoke` throwaway deleted. Kept everywhere: `arangarx@gmail.com` (real admin) + all non-arangarx (`malmesae@gmail.com`, dev `playwright@test.local`).

**Also 2026-05-30:** Andrew ratified three SEC-1 / platform decisions (Q1 reversal, admin-dashboard landing, cross-preview SSO gated on usemynk) — captured in [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md) § Ratifications and [`docs/handoff/usemynk-domain-cutover-bootstrapper.md`](usemynk-domain-cutover-bootstrapper.md) § Cross-preview SSO.

## Next action(s)

**Pending smoke queue (Andrew):**

1. ~~Confirm-password on AccountHolder signup (`96c6a6b`)~~ — **SMOKED-PASS (Andrew 2026-06-03)**.
2. Phase D copy on `/` + `/features` (`56dcde7` on `feature/phase-d-landing-about`) — brand review.
3. Multitutor round-1 spacing + `username@familyid` handle — eyeballed favorably; spot-check on preview.

**Andrew smokes (parallel):**

1. [Multitutor preview](https://tutoring-notes-git-identity-p2-m-9cb486-arangarx-5209s-projects.vercel.app) — IAC-2..12 + round-4 UX.
2. [Phase D preview](https://tutoring-notes-git-feature-phase-26c42f-arangarx-5209s-projects.vercel.app) — landing + `/about` (+ queued copy decisions in spine).
3. **Live-transcription spike B1** — real hardware (primary recording byte-unaffected with tap); checklist [`live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md).

**Orchestrator queue (serial, shared-tree-respecting):**

0. **AH-login + 2FA durable limiter** — **UNBLOCKED** (PIN limiter pattern + hardware smoke validated); replicate `LearnerLoginThrottle`-style Neon backing for `auth:<ip>` + `2fa:<ip>` per [`docs/BACKLOG.md`](../BACKLOG.md) § Security — in-memory rate limiters.

1. Batched copy/UX pass on `feature/phase-d-landing-about` (commission + hit-record split).
2. In-session-audio privacy clarification ([`docs/LEGAL-SYNC.md`](../LEGAL-SYNC.md)).
3. Session-lifecycle redesign **design pass** (Sonnet + Opus review) — [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md); empirically verify pause/disconnect/draw-during-disconnect first (P0 wall-clock timeline **UNVERIFIED**).
4. Implement LTX timestamp-anchored assembly — **after** timeline pause-semantics locked (P0 gap @ `c3c627f`; see spike STATUS + lifecycle brief).

**V1 epic (`v1-redesign` @ `6c4a268`):**

- **Phase 3 consent models** — replace P2a stubs; IAC-9 consent lattice.
- **Preview-dev / preview / prod:** next `v1-redesign` deploy runs `prisma migrate deploy` for `20260602110000`, `20260602120000`, `20260603000000`; recreate `playwright@test.local` before e2e against preview-dev.
- **Component:** B3 session-list UI. Nav redesign stays with B3–B6.

**Master / pilot (parallel):**

- **`interim-capture-attestation`:** Andrew `migrate deploy` + smoke + merge to `master` (blocks in-person LTX).
- **Gate Sarah on usemynk:** Search Console "Deceptive pages" review — re-test Connect Gmail at **48h**.
- **`fix/end-session-segment-copy`** — end-session phase copy (BACKLOG 3c cosmetic).

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| **Multitutor preview smoke** | Merge to `v1-redesign` | IAC-2..12 + round-4 UX on [preview](https://tutoring-notes-git-identity-p2-m-9cb486-arangarx-5209s-projects.vercel.app); preview-dev reset 2026-06-02 — real admin + 2FA intact. |
| **Phase D brand review** | Merge or iterate | [Phase D preview](https://tutoring-notes-git-feature-phase-26c42f-arangarx-5209s-projects.vercel.app) — landing `/` + `/about` first cut @ `37d8178`. |
| ~~P2a env vars on Vercel~~ | — | ✅ Set Production+Preview (2026-06-01). |
| ~~Preview-dev P2a migration~~ | — | ✅ Superseded by full reset + 6 identity migrations (2026-06-02 cutover). |
| ~~SEC-1 B smoke~~ | — | ✅ **PASS + MERGED 2026-05-30** (`6e29d57`). test1 flip still gated per sequencing guard (after C). |
| **SEC-1 Q1 reversed — keep admin password** | Dispatch C | ✅ **RATIFIED 2026-05-30:** Real admin keeps strong password + credentials login; Google OAuth is additional, not exclusive. Do NOT null real-admin `passwordHash`. Test accounts unchanged (passwordless). Design doc § Ratifications R1. |
| **SEC-1 admin dashboard landing** | Dispatch C | ✅ **RATIFIED 2026-05-30:** Real admin (`isTestAccount=false`, not impersonating) lands on dedicated admin dashboard; tutor view only via "Log in as"; exit returns to dashboard. Design doc § Ratifications R2. |
| **Cross-preview SSO** | usemynk cutover + wildcard previews | ✅ **RATIFIED 2026-05-30 (deferred):** Parent-domain cookie `.usemynk.com` after wildcard preview domains on custom domain — NOT SEC-1; interim per-preview isolation on `vercel.app` is correct. [`usemynk-domain-cutover-bootstrapper.md`](usemynk-domain-cutover-bootstrapper.md) § Cross-preview SSO; design doc § Ratifications R3. |
| ~~SEC-1 design ratification (6 open Qs)~~ | — | ✅ **DELEGATED 2026-05-30** for Q2–Q6 defaults; **Q1 superseded** by explicit reversal above. |
| ~~W1 audio durability ratification~~ | — | ✅ **RATIFIED 2026-05-30** (recovery copy, cross-session backlog, iOS not a gate). |
| ~~Upload re-baseline smoke~~ | — | 🟢 **CLOSED 2026-05-30 (Andrew):** upload treated as working; W1 Ship B not built unless a real failure resurfaces. |
| **fast-variant user rule** | Orchestrator model pick | Offered, unconfirmed — never auto-select FAST unless Andrew approves. |
| **DNS admin one-liner** | Transient git/Docker DNS | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, not applied. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

**None.**

**Branch in flight (not merged):** `identity-p2-multitutor` @ `e2c5c7c`; `feature/phase-d-landing-about` @ `37d8178`; `spike/live-transcription` @ `7671a25`; `design/live-incremental-transcription-2026-06-02`; `fix/end-session-segment-copy` (cosmetic BACKLOG 3c).

**Recently completed:**
- **SEC-1 role split (ADMIN vs TUTOR)** — ✅ MERGED `7dadd7a` (2026-05-30, Sonnet). Andrew smoke PASS.
- **SEC-1 Dispatch C (admin dashboard + routing)** — ✅ MERGED `8bb7449` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch B (impersonation runtime)** — ✅ MERGED `6e29d57` (2026-05-30). Andrew smoke PASS.
- **SEC-1 Dispatch A (Foundation)** — ✅ MERGED `27fb0d3`. Andrew password-login regression smoke GREEN on Preview.

**⚠️ Shared-tree slip recurred 2026-05-30:** the C subagent left the working tree checked out on `feat/sec-1-admin-dashboard`; a subsequent orchestrator docs commit landed on that branch instead of `master`. Reconciled (cherry-pick to master + `branch -f` reset to pushed tip). Lesson: **always `git checkout master` before any orchestrator commit after a code subagent runs in the shared tree.**
- **usemynk domain cutover bootstrapper** — ✅ MERGED `e4f5833`; cross-preview SSO section added 2026-05-30 (docs).

**SEC-1 sequencing guard (HARD — Andrew 2026-05-30):** no account loses its current login until its replacement is proven. Order: A merged → B smoke + merge → **only then** flip test1 to `isTestAccount=true`; **do not null real-admin password** (Q1 reversed). test1 flip + password changes for test accounts only — MANUAL seed steps gated behind B smoke.

## Uncommitted / unmerged state

**Working tree:** on `identity-p2-multitutor` — testing coverage map committed (`docs/TESTING-COVERAGE.md`).

**V1 epic — merged to `v1-redesign`:** `identity-p1-2fa` @ `b5ef4fe`, `component-b2-dashboard-students` @ `0424206`, `identity-p2-schema` @ `242c6b2`, `identity-p2-ownership-guard` @ `1a06a65`, **`identity-p2a-session-infra` @ `6c4a268`**, `docs/road-to-ga` @ `eca63b5` (2026-06-01).

**V1 epic / spikes — in flight (pushed, NOT merged):** `identity-p2-multitutor` @ `e2c5c7c`, `feature/phase-d-landing-about` @ `37d8178`, `spike/live-transcription` @ `7671a25`, `design/live-incremental-transcription-2026-06-02` (2026-06-02).

**`master` HEAD:** `a1f5d6e` (does not include V1 epic / 2FA).

Recent `master` (newest first):

```
a1f5d6e docs: usemynk cutover watch-items  ← HEAD
291288c Merge ops/usemynk-domain-cutover
7dadd7a Merge SEC-1 admin-vs-tutor role split
a00557d docs(backlog): feedback page (admin view) has no nav back
8ff3a93 feat(sec-1): AdminRole enum + role-based routing (tutor-vs-admin distinction)
```

**Merged branches (preserved for stale-sweep):**

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `feat/sec-1-admin-tutor-role` | `7dadd7a` | SEC-1 ADMIN-vs-TUTOR role split |
| `feat/sec-1-admin-dashboard` | `8bb7449` | SEC-1 Dispatch C admin dashboard + routing |
| `feat/sec-1-impersonation-runtime` | `6e29d57` | SEC-1 Dispatch B impersonation runtime + banner |
| `feat/sec-1-foundation` | `27fb0d3` | SEC-1 Dispatch A auth foundation |
| `docs/usemynk-cutover-bootstrapper` | `e4f5833` | Brand-domain cutover runbook |
| `ops/usemynk-domain-cutover` | `291288c` | usemynk.com DNS + Vercel domains + NEXTAUTH_URL + repo artifacts |
| `feat/audio-draft-store` | `3c2e634` | W1 ship A |
| `fix/replay-audio-fetch-on-scrub-drop` | `1aaacdd` | Replay scrub audio-defer |
| `whiteboard/regression-net` | `fc7b12b` | Standing real-browser regression net |
| `whiteboard/sync-redesign-phase-1` | `750d494` | Phase 1 sync redesign |

**Dead (historical only):** `reliability/sync-b1-b4` — superseded by sync redesign.

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol" — Opus orchestrates; Composer 2.5 ships by default; Sonnet for auth boundaries + adversarial/5-axis review. Dispatch inline via `Task`; **always set `model` explicitly**, including on `resume` (resume can inherit parent model).
- **Dispatch vs in-chat boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc) — always-applied; read before in-chat execution.
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` on `master`, branch preserved; no PRs. Whiteboard sync touches require local `npm run test:wb-sync` green before merge. See `AGENTS.md` § "Merging convention".
- **Commits on Windows/PowerShell:** multi-line messages via temp file + `git commit -F`, not `-m` — see `AGENTS.md` § Conventions.

## Project arc / recent architectural decisions

- **Pilot:** Pre-public; one pilot tutor (Sarah). North star: [`AGENTS.md`](../../AGENTS.md). Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).
- **SEC-1 (2026-05-30 ratifications):** Admin keeps password (preview-friendly); dashboard landing in Dispatch C; cross-preview SSO deferred to usemynk wildcard previews + `.usemynk.com` cookie domain.
- **Waves:** Wave 1 reliability floor — whiteboard Phase 1 **done**; SEC-1 in flight. Wave 2.5 session-log greenfield ratified 2026-05-27.
- **Whiteboard view-sync (RESOLVED):** Offset-contamination fix `123e60e`; on-device HUD `?wbdebug=1`.
- **Regression net merged:** `fc7b12b`. `npm run test:wb-sync` gate green.
- **Test discipline:** Independent oracle; jsdom cannot prove layout — real-render / hardware gate required.
- **Session-lifecycle redesign (2026-06-02):** Auto-record after consent + presence + media; presence-only timer; P0 single wall-clock timeline (**REQUIREMENT — UNVERIFIED**; draw-during-disconnect hardware gate). Brief: [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md).
- **Live-transcription spike (2026-06-02):** `spike/live-transcription` @ `7671a25`; flag OFF; migration not on preview/prod; B1 hardware-pending.

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file)
3. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
4. [`docs/BACKLOG.md`](../BACKLOG.md)
5. [`docs/TESTING-COVERAGE.md`](../TESTING-COVERAGE.md) — feature × tier matrix + Playwright automation roadmap
6. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
7. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md)
8. [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md)
9. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)
10. [`docs/handoff/session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) — auto-record + timer + P0 timeline (future build)
11. [`docs/handoff/live-transcription-spike-STATUS.md`](live-transcription-spike-STATUS.md) — spike landing + B1 hardware smoke (when present on branch)

## History / audit trail

This file is **updated in place**; full history: `git log -p docs/handoff/ORCHESTRATOR-STATE.md`.

Dated `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` files are **legacy snapshots** (retained, not the live source). Template for heavy restructures: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
