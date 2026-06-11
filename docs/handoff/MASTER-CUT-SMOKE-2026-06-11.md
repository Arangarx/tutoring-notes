# Master-cut smoke runbook — 8 overnight branches (2026-06-11)

Single top-to-bottom smoke runbook for the 8 overnight master-cut branches; mark PASS/FAIL + notes inline.

**Base integration branch:** `v1-redesign` (smoke each feature on its **branch preview** first; re-run **Cross-branch** after merges).

---

## Legend

| Mark | Meaning |
|---|---|
| `[x]` | Step **PASSED** — executed and behaved as expected |
| `[F]` | Step **FAILED** — replace `[ ]` with `[F]` and explain on **Notes:** |
| `[ ]` | Not yet run / skipped |

- Write freeform notes on the **Notes:** line under each step.
- Each section ends with **Result: PASS / FAIL** — check one verdict when the whole section is done.
- A fully-checked section with no `[F]` = green merge gate for that branch.

---

## 1. Component DRY mechanical

**Branch:** `feat/component-dry-mechanical` · **Tip:** [`c3abe88`](https://github.com/Arangarx/tutoring-notes/commit/c3abe88)

**What changed:** Presentational + shared-logic consolidation only — notes display utils, `SubmitButton` variants, dead `.admin-nav*` CSS removed, `useThemeDropdown` hook. **No visual or behavioral change intended.**

**Preview:** <Vercel preview for branch feat/component-dry-mechanical>

**Result:** PASS / FAIL

### Smoke steps

- [ ] **Parent share note** (`/s/[token]`) — card layout, times, recording duration labels, topics/homework labels unchanged

  Notes:

- [ ] **Tutor notes expanded row** (`/admin/students/[id]/notes`) — expand a note; topics/links/recordings/WB links match before

  Notes:

- [ ] **Admin notes page** — time range display on note rows unchanged

  Notes:

- [ ] **Change password** (`/admin/settings/profile`) — submit button size/label/pending state unchanged

  Notes:

- [ ] **Theme toggle** (marketing/admin header) — open menu, pick light/dark/system, Escape + outside click close

  Notes:

- [ ] **Whiteboard theme toggle** — same behavior in WB top bar; controlled open still works with other menus

  Notes:

- [ ] **Admin nav** — desktop + mobile drawer links, active state, sign out (no regression from CSS removal)

  Notes:

- [ ] **Submit buttons** — Create share link, Add student, Save student, Start session, Log in as test account: primary styling unchanged

  Notes:

---

## 2. Security Tier B

**Branch:** `feat/security-tier-b` · **Tip:** [`09eabc0`](https://github.com/Arangarx/tutoring-notes/commit/09eabc0)

**What changed:** Chunk-transcribe auth guard (`CRON_SECRET` bearer), forgot-password stale-token cleanup, upload error message sanitization + 16 new security tests. **API-only — no UI changes.**

**Preview:** <Vercel preview for branch feat/security-tier-b>

**Result:** PASS / FAIL

> **Review-only (no manual UI smoke):** Dependency audit (`npm audit fix`) — SHOULD-FIX-4 deferred; run after branch smoke, not a blocker for merge.

### Smoke steps — fixes landed (verify)

- [ ] **Chunk-transcribe auth guard** — E2E transcription still works (sweep/cron path + session recording → transcript). **Decision needed:** F&F calls from `enqueueChunkTranscriptionAction` may return **401** when `CRON_SECRET` is set in production — confirm whether cron backstop latency is acceptable or pass Bearer token server-side (SHOULD-FIX-2).

  Notes:

- [ ] **Forgot-password stale token cleanup** — request password reset **twice** with the same email; confirm only the **second** link works (first link invalid).

  Notes:

- [ ] **Upload error sanitization** — trigger a rejected upload on `/api/upload/audio` or `/api/upload/blob`; network tab shows generic `"Upload authorization failed"` (no internal parameter names in response body).

  Notes:

### Andrew decision (before merge to v1-redesign)

- [ ] **SHOULD-FIX-2 resolved** — chose (A) add `CRON_SECRET` Bearer to F&F fetch, or (B) accept cron-only transcription path until Vercel Queues wired.

  Notes:

---

## 3. Whiteboard laser sync (A5 / B9)

**Branch:** `feat/wb-laser-sync` · **Tip:** [`72c4c35`](https://github.com/Arangarx/tutoring-notes/commit/72c4c35)

**What changed:** Tutor→student laser pointer broadcast over encrypted sync envelope. **Bidirectional student wand deferred** (student toolbar has no wand yet).

**Preview:** <Vercel preview for branch feat/wb-laser-sync>

**Result:** PASS / FAIL

> **Real hardware required** — jsdom cannot prove laser visibility on canvas. Two devices/browsers: tutor workspace + student join URL. Both must show "Connected".

### Setup

- [ ] Tutor device: open whiteboard workspace for a session with sync enabled
- [ ] Student device: open student join URL in separate browser/device
- [ ] Both show **Connected** status

  Notes:

### Test 2a — Tutor laser visible on student canvas (B9 fix)

- [ ] Tutor selects **Wand tool** (Pointer wand / K shortcut)
- [ ] Move pointer slowly across canvas
- [ ] **Student:** coral (`#e27d60`) laser trail appears at same scene position, live (≤200ms lag on local network)
- [ ] Trail follows exact position — not offset, not seconds behind
- [ ] Release wand / switch tool — trail fades on student canvas

  Notes:

### Test 2b — Cross-page isolation

- [ ] Tutor on Page 1, student on Page 1 — student sees coral trail when tutor moves laser
- [ ] Tutor switches to Page 2; student stays on Page 1
- [ ] Move tutor laser on Page 2 — **student on Page 1 does NOT see** Page 2 laser

  Notes:

### Test 2c — No stroke sync regression

- [ ] Draw normal stroke on tutor canvas — appears on student as usual
- [ ] Stroke persisted after end-session

  Notes:

### Test 2d — Bidirectional deferred

- [ ] Student draws normally — no console errors from missing student wand

  Notes:

---

## 4. Whiteboard end-session in-shell review (Gate A3 Phase A)

**Branch:** `feat/wb-end-session-review` · **Tip:** [`29d2f7c`](https://github.com/Arangarx/tutoring-notes/commit/29d2f7c)

**What changed:** End session flips workspace shell **in-place** to review mode (notes primary, board preview, lazy replay drill-down). No `router.replace` off `/workspace`. Standalone revisit route unchanged.

**Preview:** <Vercel preview for branch feat/wb-end-session-review>

**Result:** PASS / FAIL

> **Real browser required** — jsdom cannot prove end-session correctness. Student with `recordingDefaultEnabled = true`; `WHITEBOARD_SYNC_URL` set (or note sync-disabled).

### A. Atomic end-session pipeline still completes

- [ ] Run real WB session → **End session** → confirm
- [ ] Console: `stopAndUpload` / `flushPendingUploads` (if mic armed) → `drainOutboxOrTimeout ok` → `endWhiteboardSession` 200 → `triggerNotesGenerationAction` F&F → `revokeJoinTokensForSession`
- [ ] DB: `endedAt` set, `eventsBlobUrl` set, join tokens revoked
- [ ] If mic armed: `SessionRecording` rows + audio blobs uploaded
- [ ] No orphan outbox rows in IDB (`tutoring-notes-upload-outbox`)

  Notes:

### B. Shell flips in-place (no nav-away)

- [ ] After End confirm: **URL unchanged** (`/workspace/...`)
- [ ] Live canvas + controls disappear; review surface appears in-place ("Session complete — [Student]")
- [ ] No browser back-forward navigation event
- [ ] Console: `[nsi] wbsid=<id> action=review_mode_mount` and `review_mode_loaded`

  Notes:

### C. Mic/camera released + no ghost WebRTC

- [ ] OS mic indicator disappears after mode flip
- [ ] OS camera indicator disappears
- [ ] No active WebRTC peer connections (DevTools / `chrome://webrtc-internals`)
- [ ] Sync client `disconnect()` logged; no `[wbsid=<id> ping]` after flip

  Notes:

### D. Notes editing + save stays in shell

- [ ] Notes skeleton/generating while AI reduces
- [ ] Notes form appears when complete
- [ ] Edit field → **Save to notes** — URL unchanged, inline "✓ Saved — visible to parent"
- [ ] Note visible at `/admin/students/[id]/notes` with READY status (separate tab)

  Notes:

### E. Lazy replay drill-down

- [ ] "▶ Review video while editing" visible (if session has audio)
- [ ] Click mounts `WhiteboardReplay` — no audio fetch until button click (network tab)
- [ ] Player plays audio; "✕ Close player" collapses player

  Notes:

### F. Standalone revisit route still works

- [ ] `/admin/students/[id]/whiteboard/[whiteboardSessionId]` loads read-only review + `TutorNotesSection`
- [ ] Standalone save still navigates to `/notes` (no `onSaved` prop)
- [ ] Notes deep link from `TutorStudentNoteExpandedBody` opens standalone review

  Notes:

### G. Board preview in review mode

- [ ] Read-only Excalidraw shows final-frame strokes; canvas non-interactive
- [ ] "Open full replay" link in board preview header works

  Notes:

---

## 5. Whiteboard replay A6 slice (JSXGraph)

**Branch:** `feat/wb-replay-a6-slice` · **Tip:** [`15ee25a`](https://github.com/Arangarx/tutoring-notes/commit/15ee25a)

**What changed:** JSXGraph embeddables **render in replay** (admin review + share replay). **Does not** fix multi-segment custom player regression (A6-1).

**Preview:** <Vercel preview for branch feat/wb-replay-a6-slice>

**Result:** PASS / FAIL

### Graph replay (primary fix)

- [ ] Use ended session with `graph` element (or record: Start → Insert graph → `y=x^2` → End)
- [ ] **Admin review** `/admin/students/{id}/whiteboard/{sessionId}` — Play/scrub past graph insert: axes + curve visible (not blank box)
- [ ] **Share replay** `/s/{token}/whiteboard/{sessionId}` — same graph visible in read-only replay

  Notes:

### A6 regression characterization (master vs preview — NOT fixed on this branch)

Record findings to separate hypothesis #1 (multi-segment player) vs #2 (graphs blank):

- [ ] Pick same ended session on **prod/master** and **preview** (pause → resume → draw → end; ≥2 audio segments preferred)
- [ ] Compare audio UI: native `<audio controls>` vs custom Play + scrubber
- [ ] `GET /api/whiteboard/{id}/events` → 200 JSON on both
- [ ] Note console errors (Excalidraw chunk / dynamic import) on both
- [ ] **Segment 2 audio** plays when timeline crosses boundary?
- [ ] **Segment 2 strokes** appear at correct time (not only at end)?
- [ ] **Stroke animation:** Play at t=0 — strokes animate during audio or pop at end?
- [ ] **Graph renders** (if session has graph): Y/N on both builds

  Notes:

```
Session ID:
Master URL:
Preview URL:
Segments (count):
Events API 200 JSON: Y/N
Console errors:
Audio UI: native / custom
Seg-2 audio plays: Y/N
Seg-2 strokes timed: Y/N
Strokes animate during play: Y/N
Graph renders: Y/N
Primary hypothesis: #1 multi-segment / #2 graphs / other: ___
```

---

## 6. Parent create learner

**Branch:** `feat/parent-create-learner` · **Tip:** [`e1ffe8c`](https://github.com/Arangarx/tutoring-notes/commit/e1ffe8c)

**What changed:** Parents create learners without claim link + set up child login (PIN). Auth boundary HIGH (children's credentials + ownership).

**Preview:** <Vercel preview for branch feat/parent-create-learner>

**Result:** PASS / FAIL

### 1. Parent dashboard

- [ ] Log in at `/account/login` → `/account/dashboard`
- [ ] Learners section: empty-state copy mentions **Add learner**; **Add learner** button visible

  Notes:

### 2. Create learner (name only)

- [ ] Click **Add learner** → inline form with "Learner name"
- [ ] Enter name (e.g. Alex) → **Create learner**
- [ ] Navigates to `/account/children/<new-id>`
- [ ] Dashboard lists Alex — "No login set up yet", access mode "Account holder selects"

  Notes:

### 3. Learner detail page

- [ ] **Manage** → `/account/children/<id>` shows name Alex
- [ ] No "Tutor's name for this student" row (no Student link)
- [ ] Login mode: "Parent/Guardian selects learner (no independent login)"
- [ ] **Child login:** "No login set up yet" + **Set up login** button (not claim-flow link)

  Notes:

### 4. Set up child login (PIN)

- [ ] **Set up login** → Username + PIN + Confirm PIN
- [ ] Username `alex1`, PIN `847261`, Confirm `847261` → **Set up login**
- [ ] Shows login handle `alex1@<familyid>` (copyable), sign-in instructions, **Change PIN**

  Notes:

### 5. Child login at /students/login

- [ ] Incognito `/students/login` with full handle + PIN → login succeeds

  Notes:

### 6. Notes page — no tutor yet

- [ ] `/account/children/<id>/notes` empty state: "This learner isn't connected to a tutor yet…" (NOT generic "No session notes yet")

  Notes:

### 7. Ownership isolation (negative)

- [ ] Different parent (B) visits `/account/children/<learner-id-from-A>` → **404**

  Notes:

### 8. Weak PIN rejection

- [ ] PIN `123456` → error "That PIN is too easy to guess…"; form not submitted

  Notes:

### 9. Invalid username rejection

- [ ] Username `no spaces` → error "Username must be 3–20 characters…"

  Notes:

---

## 7. Signup waitlist (Gate B1)

**Branch:** `feat/signup-waitlist` · **Tip:** [`5cb137e`](https://github.com/Arangarx/tutoring-notes/commit/5cb137e)

**What changed:** New tutor signups → WAITLISTED; cannot incur external cost until operator approves. Existing tutors grandfathered APPROVED by migration.

**Preview:** <Vercel preview for branch feat/signup-waitlist>

**Result:** PASS / FAIL

### Pre-smoke: migration (required before preview)

- [ ] Apply `prisma/migrations/20260611000000_b1_tutor_approval` to preview Neon DB
- [ ] `SELECT "approvalStatus", COUNT(*) FROM "AdminUser" GROUP BY "approvalStatus"` → existing rows `APPROVED`
- [ ] `TutorApprovalStatus` enum exists in Postgres

  Notes:

### Smoke A — new tutor → WAITLISTED

- [ ] Sign up NEW tutor (not Sarah/Andrew) via `/signup`
- [ ] A-1: Log in with new credentials
- [ ] A-2: Redirected to `/admin/pending-approval`
- [ ] A-3: "Account pending approval" copy + signup email visible
- [ ] A-4: **Sign out** → `/login`
- [ ] A-5: Re-login → still `/admin/pending-approval`
- [ ] A-6: Direct `/admin/students` → redirected to pending-approval
- [ ] A-7: `createWhiteboardSession` (console) → `TutorNotApprovedError` before Blob put
- [ ] A-8: `/api/upload/audio` token → 4xx
- [ ] A-9: `/api/upload/blob` token → 4xx
- [ ] A-10: Vercel logs — no `[wbCheckpoint.route]`, `[txc]`, `[tnt]` from WAITLISTED tutor

  Notes:

### Smoke B — operator approves

- [ ] B-1: Log in as operator (`OPERATOR_EMAILS` or `ADMIN_EMAIL`)
- [ ] B-2: `/admin/tutor-approvals` lists WAITLISTED tutor
- [ ] B-3: Nav shows "Tutor approvals" in operator section
- [ ] B-4: Click **Approve**
- [ ] B-5: Row disappears from list
- [ ] B-6: Log `[tap] tap=<adminId> action=approved byOperator=<operatorId>`

  Notes:

### Smoke C — tutor after approval

- [ ] C-1: New tutor logs in → normal landing (not pending-approval)
- [ ] C-2: Can navigate `/admin/students`
- [ ] C-3: Can start whiteboard session (Blob seed succeeds)
- [ ] C-4: Upload token from `/api/upload/audio` works
- [ ] C-5: Transcription enqueue succeeds (cost logs confirm)

  Notes:

### Smoke D — grandfathered tutors (Sarah / Andrew)

- [ ] D-1: Sarah logs in → normal workspace (no pending redirect)
- [ ] D-2: Sarah can start session, upload audio, enqueue transcription
- [ ] D-3: DB `approvalStatus` for Sarah → `APPROVED`
- [ ] D-4: Andrew (admin) → `/admin` dashboard normally

  Notes:

### Smoke E — JWT refresh propagates approval

- [ ] E-1: WAITLISTED tutor has active session; operator approves
- [ ] E-2: Within ~5 min, refresh tutor session
- [ ] E-3: Tutor can access platform
- [ ] E-4: Log `[rol] sub=<id> approvalStatus=WAITLISTED->APPROVED`

  Notes:

### Layer B worker verification

- [ ] F-1: Transcription job for WAITLISTED tutor session → `[tap] action=worker_skip_unapproved`, skipped
- [ ] F-2: Notes reduce for WAITLISTED session → `[tap] action=reduce_skip_unapproved`, `{ outcome: 'skipped', reason: 'tutor_not_approved' }`

  Notes:

---

## 8. Parent privacy consent (Gate B2)

**Branch:** `feat/b2-consent` · **Tip:** [`aa39390`](https://github.com/Arangarx/tutoring-notes/commit/aa39390)

**What changed:** Versioned `ConsentRecord`, capture gating, claim Panel A — **fully behind dormant `CONSENT_ENFORCEMENT`** (default OFF). Schema + snapshot on session create.

**Preview:** <Vercel preview for branch feat/b2-consent>

**Result:** PASS / FAIL

### Pre-smoke: migration (required)

- [ ] Apply `prisma/migrations/20260611010000_b2_consent_schema` to preview Neon DB

  Notes:

### Smoke 1 — Flag OFF (default; Sarah-safe)

**Precondition:** `CONSENT_ENFORCEMENT` unset or empty.

- [ ] Log in as tutor; open student with linked LearnerProfile — dashboard normal
- [ ] Start whiteboard session (consent checkbox) — creates, no consent errors
- [ ] Record audio during session — segments register normally
- [ ] End session — closes normally, audio registered
- [ ] Generate notes on completed session — proceeds normally
- [ ] Send update email to parent — sends, no consent error
- [ ] `/claim/[token]/setup` — **Panel A "Privacy preferences"** visible with 4 real toggles (all OFF default)
- [ ] Toggle some ON → **Save preferences** → "Preferences saved ✓"; `ConsentRecord` in DB
- [ ] Start another session for same student — creates; log `[cns] action=consent_frozen`
- [ ] No blocking errors in server logs

  Notes:

### Smoke 2 — Flag ON (`CONSENT_ENFORCEMENT=true` on preview only)

**Precondition:** Set flag on **preview only** — NOT production.

#### 2a — Claim flow (Panel A required)

- [ ] New claim → `/claim/[token]/setup` — Panel A visible, toggles OFF
- [ ] Save with all toggles OFF — ConsentRecord all-false, no error
- [ ] Start session — **BLOCKED** `ConsentError: allowLiveSession not consented`
- [ ] Enable "Allow live sessions" → save — version 2 with `allowLiveSession=true`
- [ ] Start session — creates; snapshot frozen

  Notes:

#### 2b — Audio consent gate

- [ ] ConsentRecord with `allowAudioRecording=false`
- [ ] Start session — creates (live allowed); snapshot has `allowAudioRecording=false`
- [ ] Register audio segment — **rejected** `ConsentError: allowAudioRecording not consented`
- [ ] End session with audio in opts — **session closes**; segments NOT registered; log `audio_consent_denied`

  Notes:

#### 2c — Notes email consent gate

- [ ] ConsentRecord with `allowNoteSending=false`
- [ ] Send update email — **BLOCKED** "Parental consent for notes updates has not been granted."
- [ ] Generate notes — **BLOCKED** `ConsentError: allowNoteSending not consented`

  Notes:

#### 2d — Self-learner auto-pass (D-5)

- [ ] AccountHolder + LearnerProfile with `isSelfLearner=true`, linked to student
- [ ] Start session with no ConsentRecord — creates; log `[cns] action=consent_check result=self_learner_pass`
- [ ] Audio, notes, email proceed without ConsentError

  Notes:

### Design decisions to confirm (built as specified)

- [ ] **D-1:** `events.json` always uploaded; `allowWhiteboardRecording` gates parent replay access, not upload
- [ ] **D-2:** `ConsentRestriction` schema exists; empty in DB; effective consent = parent ceiling
- [ ] **D-5:** Self-learners auto-pass all consent checks

  Notes:

---

## Cross-branch / post-merge

Run on **`v1-redesign`** after merging the stack in order (1→8). Re-smoke conflict hotspots even if per-branch smoke passed.

**Recommended merge order:**

```
1 feat/component-dry-mechanical
2 feat/security-tier-b
3 feat/wb-laser-sync
4 feat/wb-end-session-review   ← reconcile WhiteboardWorkspaceClient with #3
5 feat/wb-replay-a6-slice
6 feat/parent-create-learner
7 feat/signup-waitlist         ← B1 migration first
8 feat/b2-consent              ← B2 migration; reconcile with B1 on schema + actions
```

### Hotspot re-smokes (after merge)

- [ ] **Laser ↔ end-session** (`WhiteboardWorkspaceClient.tsx`) — full tutor+student session: laser visible (§3) **and** in-shell end-session review (§4 B–G) in one flow
- [ ] **Signup-waitlist ↔ B2 consent** — approved tutor starts session for claimed student; consent snapshot frozen; flag-OFF behavior unchanged for Sarah; combined migrations applied once on preview DB

  Notes:

### Full end-to-end session (merged v1-redesign)

- [ ] Tutor (approved, grandfathered OK) starts session → tutor+student sync (strokes + laser) → record audio → **End session** in-shell review → save notes → parent sees note on share/dashboard
- [ ] Replay: graph session (if available) renders on admin + share routes
- [ ] Parent path: create learner → set up login → child signs in (independent of tutor flow)
- [ ] New tutor waitlist path still gates cost until operator approval (spot-check one negative after B1+B2 merge)

  Notes:

### Build / automated gates (before final master-cut)

- [ ] `npm run test:wb-sync` green (WB stack merges)
- [ ] `npx next build` exit 0 on merged `v1-redesign`
- [ ] `npx jest` — no new failures beyond known DB-connectivity baseline

  Notes:

**Cross-branch result:** PASS / FAIL

---

## Branch tip commit index

| # | Branch | Tip commit |
|---|---|---|
| 1 | `feat/component-dry-mechanical` | `c3abe88` |
| 2 | `feat/security-tier-b` | `09eabc0` |
| 3 | `feat/wb-laser-sync` | `72c4c35` |
| 4 | `feat/wb-end-session-review` | `29d2f7c` |
| 5 | `feat/wb-replay-a6-slice` | `15ee25a` |
| 6 | `feat/parent-create-learner` | `e1ffe8c` |
| 7 | `feat/signup-waitlist` | `5cb137e` |
| 8 | `feat/b2-consent` | `aa39390` |

**Preview URLs:** None of the source smokebooks included Vercel preview URLs — paste each branch's preview into the **Preview:** line at the top of its section before smoking.
