# Master-cut smoke runbook — 8 overnight branches (2026-06-11)

Single top-to-bottom smoke runbook for the 8 overnight master-cut branches; mark PASS/FAIL + notes inline.

**Base integration branch:** `v1-redesign` (smoke each feature on its **branch preview** first; re-run **Cross-branch** after merges).

---

## Legend


| Mark  | Meaning                                                              |
| ----- | -------------------------------------------------------------------- |
| `[x]` | Step **PASSED** — executed and behaved as expected                   |
| `[F]` | Step **FAILED** — replace `[ ]` with `[F]` and explain on **Notes:** |
| `[ ]` | Not yet run / skipped                                                |


- Write freeform notes on the **Notes:** line under each step.
- Each section ends with **Result: PASS / FAIL** — check one verdict when the whole section is done.
- A fully-checked section with no `[F]` = green merge gate for that branch.

---

## 1. Component DRY mechanical

**Branch:** `feat/component-dry-mechanical` · **Tip:** `[c3abe88](https://github.com/Arangarx/tutoring-notes/commit/c3abe88)`

**What changed:** Presentational + shared-logic consolidation only — notes display utils, `SubmitButton` variants, dead `.admin-nav`* CSS removed, `useThemeDropdown` hook. **No visual or behavioral change intended.**

**Preview:** [feat/component-dry-mechanical](https://tutoring-notes-git-feat-componen-570185-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

### Smoke steps

- [x] **Parent share note** (`/s/[token]`) — card layout, times, recording duration labels, topics/homework labels unchanged
  Notes: Not sure on Pass/Fail.  Probably pass, but I'm trying to remember now if this page ever had all the information.  This page hasn't gotten a ton of work. I'll paste in a snippet to the chat of what it looks like.

- [x] **Tutor notes expanded row** (`/admin/students/[id]/notes`) — expand a note; topics/links/recordings/WB links match before
  Notes: Same as parent share note.  Probably pass, but I can't remember if we ever added the extra info.

- [x] **Admin notes page** — time range display on note rows unchanged
  Notes: Same as other two. Probably pass, but I can't remember if session notes ever had other info.  I've done screenshots of all 3 pages. Okay, the extra info shows if it was because of a live recording (not WB session). I figured out how we get notes in draft still, from the live recordings.  I was trying to figure out why the parent couldn't see the new note, because it still had to be marked ready.  All 3 notes screens show the beginning and end times when it comes from a live recording.  I think that given that tutors typically are going to use this stuff for billing, I'm now wondering if instead of showing start and end we should show billable minutes like we're going to do with whiteboard sessions.

- [x] **Change password** (`/admin/settings/profile`) — submit button size/label/pending state unchanged
  Notes:

- [x] **Theme toggle** (marketing/admin header) — open menu, pick light/dark/system, Escape + outside click close
  Notes:

- [x] **Whiteboard theme toggle** — same behavior in WB top bar; controlled open still works with other menus
  Notes:  While testing this I noticed that not only does the video not start on (which we were going to fix in a further phase).  It won't turn on either.

- [x] **Admin nav** — desktop + mobile drawer links, active state, sign out (no regression from CSS removal)
  Notes:

- [x] **Submit buttons** — Create share link, Add student, Save student, Start session, Log in as test account: primary styling unchanged
  Notes: I included an image of the current whiteboard session panel.  Should the continue button have white text vs other coral buttons having dark text?  I'm not hugely worried yet this page hasn't had its mock applied.

---

## 2. Security Tier B

**Branch:** `feat/security-tier-b` · **Tip:** `[09eabc0](https://github.com/Arangarx/tutoring-notes/commit/09eabc0)`

**What changed:** Chunk-transcribe auth guard (`CRON_SECRET` bearer), forgot-password stale-token cleanup, upload error message sanitization + 16 new security tests. **API-only — no UI changes.**

**Preview:** [feat/security-tier-b](https://tutoring-notes-git-feat-security-tier-b-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

> **Review-only (no manual UI smoke):** Dependency audit (`npm audit fix`) — SHOULD-FIX-4 deferred; run after branch smoke, not a blocker for merge.

### Smoke steps — fixes landed (verify)

- [ ] **Chunk-transcribe auth guard** — E2E transcription still works (sweep/cron path + session recording → transcript). **Decision needed:** F&F calls from `enqueueChunkTranscriptionAction` may return **401** when `CRON_SECRET` is set in production — confirm whether cron backstop latency is acceptable or pass Bearer token server-side (SHOULD-FIX-2).
  Notes: Whatever is secure and clean architecture and works.  If your recommendation fits that, then go ahead.

- [ ] **Forgot-password stale token cleanup** — request password reset **twice** with the same email; confirm only the **second** link works (first link invalid).
  Notes: couldn't test this one, it's not logging the link that would have been sent.  We don't have email hooked up for this kind of thing yet.  Wait a second, I got emails.  Why are these ones sending but not for other stuff?  Also...is it "from" me??  Either way, this one fails.  I had clicked 3 times and all 3 links took me to the page to choose the new password.

- [ ] **Upload error sanitization** — trigger a rejected upload on `/api/upload/audio` or `/api/upload/blob`; network tab shows generic `"Upload authorization failed"` (no internal parameter names in response body).
  Notes: From a browser, I got a 405 on both.  Screenshots pasted in chat with others.

### Andrew decision (before merge to v1-redesign)

- [ ] **SHOULD-FIX-2 resolved** — chose (A) add `CRON_SECRET` Bearer to F&F fetch, or (B) accept cron-only transcription path until Vercel Queues wired.
  Notes: Same answer as above, whatever is clean and secure.  I don't really know the consequences of what you're asking.  What is your recommendation?

---

## 3. Whiteboard laser sync (A5 / B9)

**Branch:** `feat/wb-laser-sync` · **Tip:** `[72c4c35](https://github.com/Arangarx/tutoring-notes/commit/72c4c35)`

**What changed:** Tutor→student laser pointer broadcast over encrypted sync envelope. **Bidirectional student wand deferred** (student toolbar has no wand yet).

**Preview:** [feat/wb-laser-sync](https://tutoring-notes-git-feat-wb-laser-sync-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

> **Real hardware required** — jsdom cannot prove laser visibility on canvas. Two devices/browsers: tutor workspace + student join URL. Both must show "Connected".

### Setup

- [x] Tutor device: open whiteboard workspace for a session with sync enabled
- [x] Student device: open student join URL in separate browser/device
- [ ] Both show **Connected** status
  Notes:  Connected pill isn't in the new design yet.  Also...this is a little weird testing against the old mobile interface lol.  We need to double check the centering when we smoke against both new interfaces because right now my center on new whiteboard doesn't = center on phone whiteboard with old interface.  Student IS seeing the laser pointer though, but oddly not the same color as what the tutor sees.  Tutor right now sees bright red, student side is an orangish color.

### Test 2a — Tutor laser visible on student canvas (B9 fix)

- [x] Tutor selects **Wand tool** (Pointer wand / K shortcut)
- [x] Move pointer slowly across canvas
- [ ] **Student:** coral (`#e27d60`) laser trail appears at same scene position, live (≤200ms lag on local network)
- [ ] Trail follows exact position — not offset, not seconds behind
- [x] Release wand / switch tool — trail fades on student canvas
  Notes: I mean, it is following what I draw as tutor, very little delay, so that passes, until we're on both modern whiteboards I don't know that I can pass "same scene position" fully.  So to be clear, the student sees the laser pointer live as they should, I'm uncertain on the color and exact position verification.  BTW, at least in this branch, even when allowed her video is not coming through.  The tile doesn't even pop up with a black background, just her audio is coming through.  This mix of old and new might be causing issues lol.  The position I draw my laser pointer is NOT where it shows up on her phone as student on the old WB.

### Test 2b — Cross-page isolation

- [x] Tutor on Page 1, student on Page 1 — student sees coral trail when tutor moves laser
- [ ] Tutor switches to Page 2; student stays on Page 1
- [ ] Move tutor laser on Page 2 — **student on Page 1 does NOT see** Page 2 laser
  Notes:  Currently, even with "sync with tutor zoom and pan" student is unable to be on a different board. 

### Test 2c — No stroke sync regression

- [x] Draw normal stroke on tutor canvas — appears on student as usual
- [x] Stroke persisted after end-session
  Notes: Stroke persisted yes, but since the replay doesn't match the new WB, can't guarantee on the positioning.

### Test 2d — Bidirectional deferred

- [x] Student draws normally — no console errors from missing student wand
  Notes:

---

## 4. Whiteboard end-session in-shell review (Gate A3 Phase A)

**Branch:** `feat/wb-end-session-review` · **Tip:** `[29d2f7c](https://github.com/Arangarx/tutoring-notes/commit/29d2f7c)`

**What changed:** End session flips workspace shell **in-place** to review mode (notes primary, board preview, lazy replay drill-down). No `router.replace` off `/workspace`. Standalone revisit route unchanged.

**Preview:** [feat/wb-end-session-review](https://tutoring-notes-git-feat-wb-end-s-e8ec41-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

> **Real browser required** — jsdom cannot prove end-session correctness. Student with `recordingDefaultEnabled = true`; `WHITEBOARD_SYNC_URL` set (or note sync-disabled).

### A. Atomic end-session pipeline still completes

- [ ] Run real WB session → **End session** → confirm
- [ ] Console: `stopAndUpload` / `flushPendingUploads` (if mic armed) → `drainOutboxOrTimeout ok` → `endWhiteboardSession` 200 → `triggerNotesGenerationAction` F&F → `revokeJoinTokensForSession`
- [ ] DB: `endedAt` set, `eventsBlobUrl` set, join tokens revoked
- [ ] If mic armed: `SessionRecording` rows + audio blobs uploaded
- [ ] No orphan outbox rows in IDB (`tutoring-notes-upload-outbox`)
  Notes:  No idea, pasted console log

### B. Shell flips in-place (no nav-away)

- [ ] After End confirm: **URL unchanged** (`/workspace/...`)
- [ ] Live canvas + controls disappear; review surface appears in-place ("Session complete — [Student]")
- [ ] No browser back-forward navigation event
- [ ] Console: `[nsi] wbsid=<id> action=review_mode_mount` and `review_mode_loaded`
  Notes: Complete fail, went back to old replay screen.

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

**Branch:** `feat/wb-replay-a6-slice` · **Tip:** `[15ee25a](https://github.com/Arangarx/tutoring-notes/commit/15ee25a)`

**What changed:** JSXGraph embeddables **render in replay** (admin review + share replay). **Does not** fix multi-segment custom player regression (A6-1).

**Preview:** [feat/wb-replay-a6-slice](https://tutoring-notes-git-feat-wb-repla-e77c07-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

### Graph replay (primary fix)

- [x] Use ended session with `graph` element (or record: Start → Insert graph → `y=x^2` → End)
- [x] **Admin review** `/admin/students/{id}/whiteboard/{sessionId}` — Play/scrub past graph insert: axes + curve visible (not blank box)
- [x] **Share replay** `/s/{token}/whiteboard/{sessionId}` — same graph visible in read-only replay
  Notes:  So yes it's there, and yes you can see it in the replay, but the replay in general is broken.  Audio is not synced at all, it keeps playing even whent he scrubber hits the end.  So technically this passes, if I'm ignoring all the other things wrong with the replay.

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

**Branch:** `feat/parent-create-learner` · **Tip:** `[e1ffe8c](https://github.com/Arangarx/tutoring-notes/commit/e1ffe8c)`

**What changed:** Parents create learners without claim link + set up child login (PIN). Auth boundary HIGH (children's credentials + ownership).

**Preview:** [feat/parent-create-learner](https://tutoring-notes-git-feat-parent-c-b911e1-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

### 1. Parent dashboard

- [x] Log in at `/account/login` → `/account/dashboard`
- [x] Learners section: empty-state copy mentions **Add learner**; **Add learner** button visible
  Notes: Not sure what you mean by empty state copy...oh you mean no learners added already? Well the copy showed up correctly WITH a learner. Okay, I also just verified it with no existing learners, button appears.

### 2. Create learner (name only)

- [x] Click **Add learner** → inline form with "Learner name"
- [x] Enter name (e.g. Alex) → **Create learner**
- [x] Navigates to `/account/children/<new-id>`
- [x] Dashboard lists Alex — "No login set up yet", access mode "Account holder selects"
  Notes:

### 3. Learner detail page

- [x] **Manage** → `/account/children/<id>` shows name Alex
- [x] No "Tutor's name for this student" row (no Student link)
- [x] Login mode: "Parent/Guardian selects learner (no independent login)"
- [x] **Child login:** "No login set up yet" + **Set up login** button (not claim-flow link)
  Notes:

### 4. Set up child login (PIN)

- [x] **Set up login** → Username + PIN + Confirm PIN
- [x] Username `alex1`, PIN `847261`, Confirm `847261` → **Set up login**
- [x] Shows login handle `alex1@<familyid>` (copyable), sign-in instructions, **Change PIN**
  Notes:

### 5. Child login at /students/login

- [x] Incognito `/students/login` with full handle + PIN → login succeeds
  Notes:

### 6. Notes page — no tutor yet

- [x] `/account/children/<id>/notes` empty state: "This learner isn't connected to a tutor yet…" (NOT generic "No session notes yet")
  Notes: Have to manually nav to it for now, but passes.

### 7. Ownership isolation (negative)

- [x] Different parent (B) visits `/account/children/<learner-id-from-A>` → **404**
  Notes:

### 8. Weak PIN rejection

- [ ] PIN `123456` → error "That PIN is too easy to guess…"; form not submitted
  Notes: Fail, let me do 123456.  How did this regress? I thought the weakness progression was in v1-redesign.  As a side note, should we not do some sort of interactive feedback like with passwords that just shows weak/strong up front and a requirement indicated that they cannot use a weak pin?

### 9. Invalid username rejection

- [ ] Username `no spaces` → error "Username must be 3–20 characters…"
  Notes: I did this literally, hope that's what you wanted.  "no spaces" went through

---

## 7. Signup waitlist (Gate B1)

**Branch:** `feat/signup-waitlist` · **Tip:** `[5cb137e](https://github.com/Arangarx/tutoring-notes/commit/5cb137e)`

**What changed:** New tutor signups → WAITLISTED; cannot incur external cost until operator approves. Existing tutors grandfathered APPROVED by migration.

**Preview:** [feat/signup-waitlist](https://tutoring-notes-git-feat-signup-waitlist-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

### Pre-smoke: migration (required before preview)

- [x] Apply `prisma/migrations/20260611000000_b1_tutor_approval` to preview Neon DB
- [x] `SELECT "approvalStatus", COUNT(*) FROM "AdminUser" GROUP BY "approvalStatus"` → existing rows `APPROVED`
- [x] `TutorApprovalStatus` enum exists in Postgres
  Notes: I'm just going to assume the migration was applied as part of the deployment (which means it's live for all previews ;) ).  Uhhh apparently we put in real email protection so I can't create with my tiny fake ones in this branch, lol.  I did tilly@t.t and it errored saying "Enter a valid email." but the button stayed stuck on "Creating..." and ghosted. Does not re-enable, cannot try a second email.  Will bypass with hard refresh for now.  Okay after I signed up with tilly@email.com, I ran the query and got 1 waitlisted user, so gonna assume that enum exists.

### Smoke A — new tutor → WAITLISTED

- [x] Sign up NEW tutor (not Sarah/Andrew) via `/signup`
- [x] A-1: Log in with new credentials
- [x] A-2: Redirected to `/admin/pending-approval`
- [ ] A-3: "Account pending approval" copy + signup email visible
- [ ] A-4: **Sign out** → `/login`
- [ ] A-5: Re-login → still `/admin/pending-approval`
- [ ] A-6: Direct `/admin/students` → redirected to pending-approval
- [ ] A-7: `createWhiteboardSession` (console) → `TutorNotApprovedError` before Blob put
- [ ] A-8: `/api/upload/audio` token → 4xx
- [ ] A-9: `/api/upload/blob` token → 4xx
- [ ] A-10: Vercel logs — no `[wbCheckpoint.route]`, `[txc]`, `[tnt]` from WAITLISTED tutor
  Notes: A-3 Fail and gets an error page on redirect.  After about maybe 5-10 seconds it redirects to /admin/settings/2fa/setup with an error about too many requests (black json error page)  
    
  Halting rest of tutor smoke, not executing A4 - A10

### Smoke B — operator approves

- [x] B-1: Log in as operator (`OPERATOR_EMAILS` or `ADMIN_EMAIL`)
- [x] B-2: `/admin/tutor-approvals` lists WAITLISTED tutor
- [x] B-3: Nav shows "Tutor approvals" in operator section
- [x] B-4: Click **Approve**
- [x] B-5: Row disappears from list
- [x] B-6: Log `[tap] tap=<adminId> action=approved byOperator=<operatorId>`
  Notes:  Trying to log in as operator.  Currently force redirected from / to /admin/settings/2fa/setup.  Had to clear cookies to proceed after Smoke A failure.  There's already a /admin/waitlist, if we're changing to /admin/tutor-approvals we should get rid of the other one.

### Smoke C — tutor after approval

- [x] C-1: New tutor logs in → normal landing (not pending-approval)
- [x] C-2: Can navigate `/admin/students`
- [x] C-3: Can start whiteboard session (Blob seed succeeds)
- [ ] C-4: Upload token from `/api/upload/audio` works
- [ ] C-5: Transcription enqueue succeeds (cost logs confirm)
  Notes: Had to set up 2fa first, but that's expected. Don't forget all these pages in the redesign too.  2fa section is still just an offcenter tile and the backup codes block is nearly unreadable.  Dunno how to test C-4. Can't really test C-5 until some of these other branches merge to v1 and then v1 is remerged into some of these branches.

### Smoke D — grandfathered tutors (Sarah / Andrew)

- [x] D-1: Sarah logs in → normal workspace (no pending redirect)
- [x] D-2: Sarah can start session, upload audio, enqueue transcription
- [x] D-3: DB `approvalStatus` for Sarah → `APPROVED`
- [x] D-4: Andrew (admin) → `/admin` dashboard normally
  Notes: I don't know Sarah's login.  My pre-existing tutor account I test with logged in though.  My admin account logs in.  My passes on this are for my test tutor, not Sarah specifically.

### Smoke E — JWT refresh propagates approval

- [ ] E-1: WAITLISTED tutor has active session; operator approves
- [ ] E-2: Within ~5 min, refresh tutor session
- [ ] E-3: Tutor can access platform
- [ ] E-4: Log `[rol] sub=<id> approvalStatus=WAITLISTED->APPROVED`
  Notes: I guess I can still test this even with the bug above...theoretically after approval I can refresh and be past it.  In edge I'm trying to sign into this branch as my admin account.  I'm getting a "something went wrong" error.  Included error log screenshot, buncha 429's and then an unexpected response.  Now I'm really weirded out...I went to an incognito chrome window and it took me right to 2fa and finished logging me in with just the code.  
    
  Not testable in current state.

### Layer B worker verification

- [ ] F-1: Transcription job for WAITLISTED tutor session → `[tap] action=worker_skip_unapproved`, skipped
- [ ] F-2: Notes reduce for WAITLISTED session → `[tap] action=reduce_skip_unapproved`, `{ outcome: 'skipped', reason: 'tutor_not_approved' }`
  Notes: Not tested.

---

## 8. Parent privacy consent (Gate B2)

**Branch:** `feat/b2-consent` · **Tip:** `[aa39390](https://github.com/Arangarx/tutoring-notes/commit/aa39390)`

**What changed:** Versioned `ConsentRecord`, capture gating, claim Panel A — **fully behind dormant `CONSENT_ENFORCEMENT`** (default OFF). Schema + snapshot on session create.

**Preview:** [feat/b2-consent](https://tutoring-notes-git-feat-b2-consent-arangarx-5209s-projects.vercel.app)

**Result:** PASS / FAIL

### Pre-smoke: migration (required)

- [x] Apply `prisma/migrations/20260611010000_b2_consent_schema` to preview Neon DB
  Notes:  Again, gonna assume it applied :D

### Smoke 1 — Flag OFF (default; Sarah-safe)

**Precondition:** `CONSENT_ENFORCEMENT` unset or empty.

- [x] Log in as tutor; open student with linked LearnerProfile — dashboard normal
- [x] Start whiteboard session (consent checkbox) — creates, no consent errors
- [ ] Record audio during session — segments register normally
- [x] End session — closes normally, audio registered
- [x] Generate notes on completed session — proceeds normally
- [ ] Send update email to parent — sends, no consent error
- [x] `/claim/[token]/setup` — **Panel A "Privacy preferences"** visible with 4 real toggles (all OFF default)
- [x] Toggle some ON → **Save preferences** → "Preferences saved ✓"; `ConsentRecord` in DB
- [ ] Start another session for same student — creates; log `[cns] action=consent_frozen`
- [x] No blocking errors in server logs
  Notes: Not that it's necessarily because of this branch.  But testing with my wife and she's across the house and I'm still getting feedback.  Is it possible the speakers are feeding back into my microphone? I thought most systems stopped this kind of local feedback lol.  Also, the on/off on the AV pip (at least on this branch) audio/video on/off is not as clear as the top bar distinction.  Not sure how I verify segments register.  The audio didn't start when sound started it started some ways in.  Now MAYBE it didn't count what was mostly just feedback noise, so if it was intentional and we didn't speak that's fine, but if it's not intentional it should be looked at.  
    
  okay, lmao, I don't know what to do about this since email registration loopback is set in stone.  But if I sign up for an email on a preview site, by the time I'm done, I'm suddenly on the live site.  So I actually can't pass send email, because right now I can't sign up for email on preview. I noticed because I went to look for the claim link and then I was like wait does this version even have a claim link? then I was like...wait...why AM I on the production site?  
    
  Shouldn't the login setup be above the privacy preferences?  I was going to ask if they should have separate saves, but I guess they can do one without the other.   
    
  Shouldn't "Allow live sessions" be presented as a base contract to even use the tutor's services?  Like if they don't approve that..what happens?  
    
  Is there not supposed to be a way to change these after the fact on this branch? I see no way to change the privacy preferences from the parent dashboard.  
    
  if you mean in vercel logs for finding the cns entry I am not seeing it but don't know if I'm missing it or what.  Not seeing it in console either.

### Smoke 2 — Flag ON (`CONSENT_ENFORCEMENT=true` on preview only)

**Precondition:** Set flag on **preview only** — NOT production.

#### 2a — Claim flow (Panel A required)

- [x] New claim → `/claim/[token]/setup` — Panel A visible, toggles OFF
- [x] Save with all toggles OFF — ConsentRecord all-false, no error
- [ ] Start session — **BLOCKED** `ConsentError: allowLiveSession not consented`
- [x] Enable "Allow live sessions" → save — version 2 with `allowLiveSession=true`
- [x] Start session — creates; snapshot frozen
  Notes: Starting a whiteboard session was blocked, but not that error.  Got "Could not start the session -- the server hit an unexpected error.    Error ID: 3879705692 (copy this and send it back so we can find the failure in the server logs).  However, in the vercel logs, there is a ConsentError, but the Error text did not make it back to the tutor.  
    
  There is no way on this branch to change permissions with the UI.  I will bypass bug with DB update.

#### 2b — Audio consent gate

- [x] ConsentRecord with `allowAudioRecording=false`
- [x] Start session — creates (live allowed); snapshot has `allowAudioRecording=false`
- [ ] Register audio segment — **rejected** `ConsentError: allowAudioRecording not consented`
- [x] End session with audio in opts — **session closes**; segments NOT registered; log `audio_consent_denied`
  Notes: Just some random 500 error in the console.  No idea where to see the register audio segment.  So...technically this passes...but shouldn't we still record the tutor audio?

#### 2c — Notes email consent gate

- [ ] ConsentRecord with `allowNoteSending=false`
- [ ] Send update email — **BLOCKED** "Parental consent for notes updates has not been granted."
- [ ] Generate notes — **BLOCKED** `ConsentError: allowNoteSending not consented`
  Notes: Can't test this right now on a preview. Can't connect gmail for send.

#### 2d — Self-learner auto-pass (D-5)

- [x] AccountHolder + LearnerProfile with `isSelfLearner=true`, linked to student
- [x] Start session with no ConsentRecord — creates; log `[cns] action=consent_check result=self_learner_pass`
- [x] Audio, notes, email proceed without ConsentError
  Notes:  This is not related to this branch specifically, but I'm not sure I'm a fine of the way we're doing versions of the student initials in the student list.  The way its currently done feels more like a visual glitch than on purpose.  
    
  Currently in replay (again with all these branches, might not be worth hunting in this branch) I noticed when I drop the scrubber, the audio starts over from there.  Like...the scrubber stays where I dropped but the audio starts over.

### Design decisions to confirm (built as specified)

- [ ] **D-1:** `events.json` always uploaded; `allowWhiteboardRecording` gates parent replay access, not upload
- [ ] **D-2:** `ConsentRestriction` schema exists; empty in DB; effective consent = parent ceiling
- [ ] **D-5:** Self-learners auto-pass all consent checks
  Notes: Hmm...on D-1 I'm realizing there is an interesting distinction here.  With audio, I think it should keep recording the tutor just not the student.  I wonder if maybe that's the same with WB.  I'm really not sure actually...you know what I think if they don't allow recording we can't save it, because what if they put pdfs with child info into it.  We've just violated privacy.  We're going to have to get tricky with this stuff as this product matures and maybe have the student's strokes only not record...or maybe also like...if uploading a pdf the tutor has to indicate if anything on it is protected child information.  For now I think we can't keep the data.  If they don't allow whiteboard recording for some reason, They're pretty much SOL for recording usefulness.  This comes back to sarah's point that we STRONGLY encourage audio and whiteboard recording to be on and if they don't turn them on warn them what it means and that they'll only have access to final notes kind of stuff.  
    
  D-2: Is there a question here? I can confirm in general that yes, a student can make things more restrictive, but not LESS restrictive than their parent's settings.  
    
  D-5: Seems fine to me if there's not consent record. But if they want to save with no consent I don't see why they can't, we give them the same encouragement/warnings.

---

## Cross-branch / post-merge

Run on `**v1-redesign`** after merging the stack in order (1→8). Re-smoke conflict hotspots even if per-branch smoke passed.

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


| #   | Branch                          | Tip commit |
| --- | ------------------------------- | ---------- |
| 1   | `feat/component-dry-mechanical` | `c3abe88`  |
| 2   | `feat/security-tier-b`          | `09eabc0`  |
| 3   | `feat/wb-laser-sync`            | `72c4c35`  |
| 4   | `feat/wb-end-session-review`    | `29d2f7c`  |
| 5   | `feat/wb-replay-a6-slice`       | `15ee25a`  |
| 6   | `feat/parent-create-learner`    | `e1ffe8c`  |
| 7   | `feat/signup-waitlist`          | `5cb137e`  |
| 8   | `feat/b2-consent`               | `aa39390`  |


**Preview URLs:** None of the source smokebooks included Vercel preview URLs — paste each branch's preview into the **Preview:** line at the top of its section before smoking.