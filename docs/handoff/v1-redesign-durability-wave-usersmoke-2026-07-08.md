# Go-to-Sarah durability wave — v1-redesign post-merge user smoke — smoke runbook

**Branch:** `v1-redesign`
**Tip commit:** `[d6b4433](https://github.com/Arangarx/tutoring-notes/commit/d6b443351c2df5f796eb5a3668fa344732398029)`
**Preview:** [v1-redesign preview](https://tutoring-notes-git-v1-redesign-arangarx-5209s-projects.vercel.app) *(confirm the Vercel deployment is READY before starting — it was BUILDING at authoring time)*

This is a broad, user-perspective spot-check of everything that landed in the go-to-Sarah durability wave merge on `v1-redesign`: Wave 5 whiteboard chrome and polish, consent gates CC-1/CC-2, learner identity and claim flow, billing display, data erasure surfaces, whiteboard recording reliability, and the WS-I pre-start recording-mute fix. Run top to bottom on the **Preview** URL using real devices where noted (dual-browser or phone + desktop for live A/V).

**Ground rule:** This smoke is by **feel and observable behavior only** — no dev-tools/console inspection and no database or server-value checking is required or requested anywhere in this book. If you cannot see or hear it in the UI, it is out of scope for this run.

---

### 1. Tutor login — dashboard loads without auth loop

**Action:** On the branch **Preview** URL, open the tutor **login** page (e.g. `/login`) in a fresh browser profile (or sign out first). Sign in as the **pilot tutor** with your **email + password** credentials (Google OAuth / Google sign-in is **not** wired in the app yet — credentials only). After sign-in, land on the tutor home/dashboard (`/admin` or `/admin/students` depending on your account's default). Refresh the page once.

**Expect:** Login completes in one pass — no redirect loop, no stuck spinner. Dashboard/roster shell renders with navigation usable (sidebar or top nav visible). You remain signed in after refresh.

**Ignore this run:** Preview-branch badge styling.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 2. Student roster loads — open student detail

**Action:** While signed in as **tutor**, navigate to `/admin/students`. Wait for the roster table/cards to populate. Click one student row (prefer a **claimed, consented** learner you use for live tests) to open their detail page at `/admin/students/[id]`.

**Expect:** Roster loads without a blank error state. Student name and detail sections render (sessions, notes, parent account, share link tabs or equivalent). No unexpected 404 or "access denied" on a student you own.

**Ignore this run:** Exact column order or avatar styling; students you have intentionally erased (see item 22).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 3. Start whiteboard session — workspace mounts (consented / self-learner)

**Action:** On a **claimed minor with consent on file** or an **adult self-learner** student detail page, click **Start whiteboard session** (or **Resume** if a PENDING session already exists). Allow the workspace route to load: `/admin/students/[id]/whiteboard/[sessionId]/workspace`.

**Expect:** Session creates or resumes without a raw error digest. Whiteboard workspace mounts — canvas area visible, top bar present, waiting-room overlay shown when phase is PENDING (not an instant silent jump to ACTIVE recording without the waiting room when a remote student is expected).

**Ignore this run:** Consent-blocked students (covered in item 4); exact loading shimmer duration.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 4. Consent gate (CC-1/CC-2) — blocked start for minor without consent

**Action:** As **tutor**, open the detail page for a **claimed minor** who has **no consent record** on file (test fixture or freshly invited learner before the parent completes claim consent). Observe the whiteboard start affordance. If a Start button is still visible, click it.

**Expect:** Session does **not** start. Tutor sees a **friendly consent-required message** (inline callout or clear error copy) — not a generic 500/digest stack trace. Copy points the tutor toward the **Parent account** / claim-and-consent path. No redirect into a live workspace.

**Ignore this run:** Email delivery timing for claim invites; exact punctuation of callout text.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**It correctly has the message "Before you can start a session, the student's parent must claim this account and set privacy preferences."**

---

### 5. Waiting room — tutor and student connect mutual A/V

**Action:** As **tutor**, start a whiteboard session for a **claimed, consented** learner. Copy the **student join link** (`/join/[sessionId]#k=…` from the workspace UI). On a **second device or browser profile**, sign in as that **learner** (`/students/login`) and open the join link. In the **waiting-room overlay** on both sides, allow camera and microphone permissions when prompted. Confirm each side sees the other's video tile (or placeholder) and hears audio when speaking.

**Expect:** Both parties reach the same waiting room. Remote audio and video connect in both directions before anyone clicks **Start Session**. No endless "connecting…" spinner on either side under normal network conditions.

**Ignore this run:** Brief (<5s) connection flicker; exact tile layout at very narrow widths (item 8).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 6. Off-camera tile shows initials — both directions

**Action:** In the **waiting room** with both parties connected: have the **student turn camera off** and inspect the student's tile on the **tutor's** screen. Then have the **tutor turn camera off** and inspect the tutor's tile on the **student's** screen. Repeat once on the **live board** after **Start Session** if camera controls remain available there.

**Expect:** Every off-camera tile (local preview and remote tile, both directions) shows the participant's **initials or avatar placeholder** — never a solid black rectangle.

**Ignore this run:** Exact avatar background color, font size, or shape.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 7. Mic input-level meter — both roles, muted parity (tutor live-board regression)

**Action:** In the **waiting room**, speak into the mic on the **tutor** side and watch the tutor's mic control — confirm the **input-level meter animates** with your voice. Mute the tutor mic; speak again — confirm the meter **still animates while muted** (parity expectation). Repeat on the **student** mic control. After **Start Session**, on the **live board**, repeat the same speak/mute checks on the **tutor** mic control — a prior smoke found the **tutor live-board meter had stopped animating**; confirm whether that is fixed now.

**Expect:** Live input-volume meters animate to real speech on **both** tutor and student, in waiting room **and** on the live board. While muted, meters **still animate** to speech on both sides (muted ≠ frozen meter). Tutor live-board meter behaves like the waiting-room meter.

**Ignore this run:** Exact bar width, color, or animation curve; minor lag (<1s) after unmute.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: hardware mic-level feel on real devices — prior regression on tutor live-board meter]`

**Notes:**

---

### 8. Mic and camera device pickers — narrow width, waiting room + live board

**Action:** As **student** in the waiting room, narrow the browser to roughly **half-width desktop** (or use a real phone in portrait). Locate the **microphone** and **camera device picker** controls in the waiting-room overlay — open each and switch devices if more than one is available. Click **Start Session** (tutor) to enter the live board; repeat picker reachability for **both roles** on the live board at the same narrow width.

**Expect:** Mic and camera pickers remain **visible and usable** — not hidden behind an unreachable overflow menu. Selecting a different device updates the active device without wedging A/V.

**Ignore this run:** Minor wrapping/spacing nits; devices where only one mic/camera exists (picker may be disabled — not a fail).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 9. WS-I — tutor mutes before Start; muted audio not in recording

**Action:** As **tutor**, start a new whiteboard session and have the **student join** in the waiting room. **Before** clicking **Start Session**, **mute the tutor mic** using the waiting-room mic control. Click **Start Session**; run a short live segment (~1–2 minutes): speak while **muted**, then **unmute** and speak a clearly identifiable phrase. End the session and wait for processing. Open **session replay** and/or the **session notes** audio playback.

**Expect:** Audio recorded during the **muted** portion is **silent or absent** (no tutor voice where you were muted). Audio after **unmute** **is captured** and audible on playback. No surprise full-session hot-mic of the tutor while the mute icon showed muted.

**Ignore this run:** Transcription wording quality; exact fade timing at mute/unmute edges.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-tutor-recording-mute.spec.ts › mute before graph ready]` — `[human-only: real hardware mute-before-Start playback proof]`

**Notes:**

---

### 10. Start Session — waiting room transitions to live board

**Action:** With **tutor and student** connected in the waiting room (mutual A/V established), tutor clicks **Start Session** (or equivalent primary start control). Watch **both** screens.

**Expect:** Waiting-room overlay **dismisses on both tutor and student**. Live whiteboard is interactive (tools usable, canvas accepts input). Session does not remain stuck in waiting — a prior smoke flagged **"Start not starting"**; confirm that regression is resolved. Student does not land on a blank or frozen board.

**Ignore this run:** Sub-second overlay fade animation; recording banner copy details.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › full PENDING→ACTIVE]` — `[human-only: dual-device Start latch on real hardware]`

**Notes:**

---

### 11. Whiteboard tools — draw, erase, undo/redo; strokes sync per page

**Action:** On the **live board** with student connected, **tutor** draws several strokes with the pen, switch to **eraser** and remove part of a stroke, use **undo** and **redo**. **Student** watches in real time. Switch to a **second board page/tab**, draw there, then switch back to the first page.

**Expect:** Strokes appear on the **student** view in real time with no large delay. Undo/redo behaves predictably on both sides. Strokes on page 2 do **not** appear on page 1 — no cross-page bleed.

**Ignore this run:** Exact pen color defaults; sub-pixel stroke alignment between peers.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**General syncing passes, I already queued up the message telling you that the strokes bled again.**

---

### 12. Multi-page boards — add pages, pan/zoom persists per page

**Action:** As **tutor** on the live board, **add** at least two new pages/board tabs. On page 1, **pan and zoom** to a distinctive viewport. Switch to page 2, pan/zoom differently. Switch back to page 1, then to page 2. Have the **student** follow along on their device.

**Expect:** Each page retains its **own pan/zoom** when reselected. Page tabs are addable and switchable without losing prior page content. Student view tracks page switches and per-page view state without cross-page content mixing.

**Ignore this run:** Exact zoom percentage labels; maximum page count stress test.

- [ ] PASS
- [x] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Syncing seems fine, but as mentioned strokes bled on pdf load again.**

---

### 13. PDF or image on board — renders centered and usable

**Action:** As **tutor** on the live board, use the **image/PDF insert** affordance (toolbar or insert menu — whichever is available on this build). Add a small test **image** or **PDF** page to the current board. Pan/zoom around the asset. Confirm the **student** sees it.

**Expect:** Asset renders on-canvas — centered or reasonably framed, not clipped to a zero-size box. Asset remains usable while drawing strokes on top. Student sees the same asset without a long delay.

**Ignore this run:** Very large PDF upload time; OCR/search inside PDFs.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 14. End session — clean confirm flow and ended-session listing

**Action:** As **tutor** with an active or just-ended live session, click **End session** (top bar or overflow). Complete any **confirmation** dialog. After end completes, navigate to the student's detail page and locate **ended / needs-review** session lists.

**Expect:** End flow completes **without an error toast** or stuck spinner. Session appears in the expected **ended or unsaved** list (wording per current UI). Tutor can reopen the session for review when offered.

**Ignore this run:** Exact list sort order; time to appear in list if a short processing delay is shown inline.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**I'm not sure I like hiding the load time behind finalizing...but I guess it's better than sitting on the session notes screen that long.  Hopefully we can improve that going forward.**

---

### 15. Recording processing — auto-generated notes populate

**Action:** After ending a session where **audio was captured** (item 9 unmuted segment is enough), open the **session review / notes** surface for that session. Watch the tutor **notes section** while generation runs.

**Expect:** A **loading/shimmer placeholder** may appear briefly, then resolves to **real generated note content** (not a permanently blank form). No endless spinner without eventual content or a clear empty-state message.

**Ignore this run:** Notes wording quality, map accuracy, or AI phrasing; email send status.

- [x] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 16. Session replay — whiteboard timeline and audio stay in sync

**Action:** Open **session replay** for the ended session (from session review, student detail, or **Watch the whiteboard recording** link on the note). Press **play**; drag the **timeline scrubber** to several positions including mid-session and near the end.

**Expect:** Whiteboard strokes replay for the selected timeline position. **Audio scrubs in sync** with the board state — no permanent desync where audio plays from one segment while the board shows another. Play/pause works without wedging the player.

**Ignore this run:** Sub-second scrub lag; auto-play policy on first open (item 16 is about sync, not auto-play jump-to-end).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 17. Share link — recipient view renders whiteboard + audio

**Action:** As **tutor**, from the student's **Share link** section (or session share UI), **create or copy** a share link for a completed session. Open the link in a **fresh logged-out browser profile** (or parent/learner account that should have access per your test setup).

**Expect:** Shared view **loads without a blank 404** (for entitled recipients). Whiteboard replay or session content and **audio player** render and are usable. Unauthorized viewers see an appropriate access gate — not a raw error page.

**Ignore this run:** Anonymous grace-period policy details; exact share URL token format.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 18. Claim flow — parent claims learner, mandatory consent choice

**Action:** As **tutor**, send a **claim invite** from a test student's **Parent account** section (or use an existing unused `/claim/[token]` link). As **parent** in a fresh profile, open the claim link, create or sign in to the parent account, set **learner credentials**, and reach the **consent setup** step. Attempt to leave without choosing — look for skip/escape links. Then complete **Save preferences** on one run (or **Decline** on a disposable test invite).

**Expect:** Parent **cannot skip** consent silently — no honest "set up later" escape without an explicit **Save** or **Decline** choice. **Save** and **Decline** both complete honestly with clear consequence copy. After save or decline, setup advances or finishes without a wedged form.

**Ignore this run:** Invite email delivery latency; exact dialog title punctuation.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Technically pass but this flow needs to be a little smoother.**

---

### 19. Learner login — credentials land on correct surface

**Action:** Using the **credentials created in item 18** (or an existing test learner), open `/students/login` in a fresh browser profile. Enter the **full login handle** and password/PIN shown to the parent. Submit.

**Expect:** Login **succeeds** and lands on the correct **learner home/surface** (dashboard, sessions list, or join-ready state — not tutor admin, not a 404). Sign-out and sign-in again once to confirm repeatability.

**Ignore this run:** "Remember this device" nuances; forced password change flows not part of this test.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 20. Adult self-learner join — no stale-cookie 404 or confusing used-link message

**Action:** As **tutor**, start a whiteboard session for an **adult self-learner** (not a minor child account). Copy the join link. In a **fresh browser profile**, sign in as that **self-learner account holder** (or complete the self-learner join path your pilot uses) and open the link. Also test once with a **stale learner session**: log in as a *different* learner, log out without clearing cookies, then open the self-learner join link and complete login as the correct self-learner when prompted.

**Expect:** Self-learner reaches the **waiting room or workspace** — **no 404** and no "page not found" for a valid active session. If a verification/claim message appears, it is **accurate and actionable** — not a confusing **"verification link already used"** when the link should still work. Prior smoke found stale-cookie 404s; confirm sane behavior now.

**Ignore this run:** Child-learner PIN login path (item 19); intentional denial when the wrong learner opens someone else's session.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: stale-cookie and verification-link copy on real browser profiles]`

**Notes:**

---

### 21. Billing display — session time and cost surfaces read sensibly

**Action:** As **tutor**, open `/admin/settings/billing` and note your **rounding increment** and related defaults. End a short billed session (or open a recently ended one) and find **billable time / cost** wherever the UI surfaces it (session review, student session list, or dashboard summary). Compare displayed duration to your sense of how long both parties were connected (rough check, not to the second).

**Expect:** Billable time and any **cost display** appear where documented in the UI and read **plausible** (rounded per your settings, not blank or absurdly wrong). Settings page loads and saves defaults without error.

**Ignore this run:** Exact cent-level arithmetic; timezone label formatting.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 22. Data erasure — request reflects grace countdown and status UI

**Action:** Sign in with your **operator-capable** pilot account. Open **Admin → Erasure** (`/admin/erasure`). On a **test learner only** (not real pilot children), submit a **per-learner erasure request** using the required confirmation phrase. Then open `/admin/students` and the affected student's **detail page**.

**Expect:** Request succeeds with clear in-app confirmation. Roster shows a **Pending erasure** (or equivalent) badge. Student detail shows a **grace-period countdown** banner and honest suspended-access messaging. **Start whiteboard session** is blocked for that learner while erasure is pending.

**Ignore this run:** Waiting the full 7-day purge window; cancel-erasure operator flow unless you need to restore the test learner.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 23. Theme parity — light and dark on key surfaces

**Action:** Using the app **theme toggle** (profile menu or settings), switch to **light** mode. Visit the **tutor dashboard** (`/admin/students`), open a **whiteboard workspace** waiting room or live board, and open a **consent or claim** page (`/claim/...` setup or student **Parent account** section). Repeat the same three surfaces in **dark** mode.

**Expect:** Text, buttons, and primary content remain **readable and clickable** in both themes. No invisible white-on-white or black-on-black chrome. Theme toggle applies without breaking layout on these surfaces.

**Ignore this run:** Marketing landing hero illustration colors; Excalidraw canvas theme nuances.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 24. Marketing and legal — landing, privacy, terms; logged-in redirect

**Action:** Sign **out**. Open `/` (marketing landing). Read enough to confirm the page renders. Open `/privacy` and `/terms` in new tabs. Sign **in** as tutor and navigate to `/` again.

**Expect:** Landing, privacy, and terms pages render with readable content and working navigation — no broken layout or empty document. Logged-in tutor visiting `/` is **redirected appropriately** (dashboard or students — not stuck on marketing login CTAs).

**Ignore this run:** Legal copy accuracy vs umbrella site; SEO metadata.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL