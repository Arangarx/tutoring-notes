# Pilot release — smoke runbook

**Branch:** `feat/org-qol`
**Tip commit:** [`7d7145c8`](https://github.com/Arangarx/tutoring-notes/commit/7d7145c8740b5ff03a44b2db01834a1380ae870c)
**Preview:** [feat/org-qol preview](https://tutoring-notes-git-feat-org-qol-arangarx-5209s-projects.vercel.app)

---

## When Andrew runs this

This is the comprehensive pre-master smoke (launch Gate A9). Run it once, on the **Preview** above, when the release gate is green. It is for new UX, real hardware, and human judgment. Regressions that Playwright already covers are cited under **Coverage** and are not re-proved here.

**Both themes.** Every item below is run twice: once in **Light**, then once in **Dark**. Use the app theme control (sun/moon, menu label **Theme**). Choose **Light**, finish the pass, then choose **Dark** and repeat. Do not use **System** for these passes. **PASS** only if both themes pass. A failure in either theme is **FAIL** for that item.

**Devices.** Tutor on desktop Chrome. Student on a second device. If that device is an iPhone, use Safari for items 1–5 so item 5 is the same session, not a third one. Items 2, 3, 4, 5, and 8 are judged inside the item 1 session, before you leave it. Item 6 uses that session’s replay. Item 7 deletes only after item 6.

**Not this book.** SMS two-factor (only after the A2P campaign is approved). Apple Calendar. Stripe, a pricing page, and the other Bucket B work listed on each item.

Run order is top to bottom. Re-run **Cross-branch / post-merge** after the branch merges to `master`.

---

## Feature smoke items

### 1. Core flow — a pilot session, then notes, then replay

**Action:** Repeat in light, then dark. On the **Preview**, sign in as the pilot tutor in desktop Chrome. Open a real student (or a family you can join as). On the student page, choose **Start session**. You land in the waiting room. Allow the mic and camera when the browser asks. Copy the session link (**Copy session link**) and open it on the student device. Sign in as the learner if asked, and accept the saved privacy (live session, audio, whiteboard, notes) if the room is waiting on that. Confirm the tutor’s **Start** stays unavailable until the student is actually in the room, then press **Start**. The timer should begin at Start, not while you were still waiting.

While the session is recording, and before **End**, also do items 2, 3, 4, and 5 on this same pair of devices. On the board itself: draw with **Pencil (P)**, type a short line with **Text (T)** and commit it, draw one closed shape and one arrow or line, insert one equation with **Insert math equation** (tutor only), insert a one-page PDF with **Insert PDF**, and hold **Pointer wand (K)** so the other person sees the trail. Add a second board and switch to it after the text is committed. Speak a few real sentences about what you just drew so the notes have something to hear.

Press **End**. Stay on the session. Wait for notes to finish (item 8). Then play the replay (item 6) before you delete anything.

**Expect:** The student joins only after consent is in place. **Start** is unavailable until the student is connected, then the room becomes the live board and the timer runs. Each of pencil, text, shape, math, and PDF shows up on the other device while you are still in the session. A PDF board tab is visibly a PDF. The student canvas background follows the theme (in dark it is not stuck white). **End** stays in this session and opens review: the note fields stay on screen, then the replay plays back the board and the audio you just made. Both the light pass and the dark pass do this.

**Ignore this run:** SMOKE-BUG-3 (tracked post-launch): an uncommitted text editor can linger on the new board after the tutor switches boards. Committed text should still stay on the board where you typed it. PDF fit-per-student: a page fitted on the tutor can overflow a smaller student canvas. Matched zoom is the accepted design; do not fail because the student’s PDF is larger than the phone screen. Bucket B, not this run: Stripe, pricing, SMS two-factor, Apple Calendar, Spanish transcription, calculus graphs, parent self-serve erasure, and un-uploaded audio that is still in flight at End (it can be dropped). Graph and image inserts are not part of this pass.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode]` `[automated: tests/integration/wb-session-lifecycle.spec.ts › recording starts and timer accrues after tutor Start (PENDING → ACTIVE)]` `[automated: tests/integration/consent-entry.spec.ts › V1: tutor sees which recordings are off before Start and during the session]` `[automated: tests/integration/wb-sync-eraser.spec.ts › a pencil freedraw stroke created on one peer appears on the other (tutor → student and student → tutor)]` `[automated: tests/integration/wb-sync-text.spec.ts › text typed on one peer appears as a text element on the other (tutor → student)]` `[automated: tests/integration/wb-sync-text.spec.ts › student text stays on the board it was typed on after the tutor changes boards]` `[automated: tests/integration/wb-sync-shapes.spec.ts › rectangle drawn with the tool syncs to the other peer (tutor → student and student → tutor)]` `[automated: tests/integration/wb-sync-math.spec.ts › tutor math insert syncs an image equation to the student]` `[automated: tests/integration/whiteboard-live-sync-regression.spec.ts › invariant 8 — PDF page opens centered + zoom-parity on student viewport]` `[automated: tests/integration/recording-end-to-end.spec.ts › tutor records solo session → ends → in-shell review shows stroke events and replay capability]` `[automated: tests/integration/wb-notes-shimmer.spec.ts › end session → pending/generating: in-box placeholder when empty, status copy]` `[human-only: whether the whole session feels trustworthy on two real devices, including theme, PDF-tab recognition, and the handoff from End into notes and replay]`

**Notes:**

### 2. Laser pointer contrast (ST-05)

**Action:** Repeat in light, then dark, inside the item 1 session before **End**. Tutor selects **Pointer wand (K)** and draws a slow loop while the student watches. Student does the same while the tutor watches. Hold the pointer down long enough to judge the trail against the board, including over a white area and over a dark stroke. Tutor color is coral `#e27d60`. Student color is cyan `#0891b2`.

**Expect:** Each person sees the other’s trail while the button is held, and the two colors are distinguishable from each other and from the board in both themes. The trail is visible at arm’s length on the phone. It fades after release and does not become a saved stroke. **PASS** only if both themes pass.

**Ignore this run:** A soft anti-aliased edge on the trail. SMOKE-BUG-3 and the PDF fit-per-student design (item 1). Bucket B work listed on item 1.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-sync-laser.spec.ts › laser drag paints the author's token color on the other peer (tutor → student and student → tutor)]` `[human-only: contrast of coral #e27d60 and cyan #0891b2 against the real board in both themes, on both peers]`

**Notes:**

### 3. Pencil feel and latency (PR-01)

**Action:** Repeat in light, then dark, inside the item 1 session before **End**. On each device, select **Pencil (P)** and write a word and a small sketch at a normal tutoring speed. Watch the other device while you draw, then switch who is drawing. Try one fast stroke and one slow curve.

**Expect:** The stroke appears on the other device as you draw, without a lag you would notice in a lesson, and without dropped gaps or a sticky “it catches up later” feeling. The pencil is comfortable for a few sentences of handwriting. **PASS** only if both themes and both directions feel acceptable on the real devices.

**Ignore this run:** Whether the stroke’s points match a pixel grid. Sync of the finished stroke is already gated. SMOKE-BUG-3, PDF fit-per-student, and the Bucket B list on item 1.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-sync-eraser.spec.ts › a pencil freedraw stroke created on one peer appears on the other (tutor → student and student → tutor)]` `[human-only: freedraw latency and handwriting feel between two real devices]`

**Notes:**

### 4. Live audio and video on real devices

**Action:** Repeat in light, then dark, inside the item 1 session. On first entry, allow the mic and camera on both devices when prompted. Confirm you hear the other person and see their camera, and that they hear and see you. Say a short sentence as soon as audio connects (do not switch devices first). Then: (1) toggle airplane mode or disable Wi-Fi on the student device for a few seconds and restore it; (2) reload the student page during the live session; (3) reload the tutor page once while the student is in the waiting room or just after **Start**; (4) look at the video tiles and judge whether the picture fills the tile. If a camera or mic is easy to unplug, unplug it and plug it back once.

**Expect:** Both directions of audio and video work on the real hardware, including the first words after connect. After the network blip, both sides hear and see each other again without a stuck “reconnecting” state that never clears. After the student reload, that device’s camera and mic come back on their own and both sides see and hear each other. After the tutor reload, both camera tiles paint again. Video fills the tile rather than a thin letterbox. A replug, if you did one, returns that device to the call. **PASS** only if both themes pass.

**Ignore this run:** A stale **Call Reconnecting** pill that clears on its own and does not leave audio or video dead (SMOKE-BUG-2, tracked). Fake-media Playwright runs. Bucket B: hot-swap of a mic that fires `track.onended` without an unplug you chose, in-progress audio lost on a hard crash, and audio still uploading at **End** (it can be dropped). SMS and Apple Calendar.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-av-mesh.spec.ts › join → tutor receives a live inbound student audio track]` `[automated: tests/integration/wb-av-mesh.spec.ts › phone student (iPhone 13 profile): after Start, tutor and student each see moving video and receive live audio RTP]` `[automated: tests/integration/wb-av-mesh.spec.ts › AV-REFRESH-LOSS: student hard refresh in a live session — own camera and mic come back with no action and both sides see and hear each other]` `[automated: tests/integration/wb-av-mesh.spec.ts › BUG-8: student Exit then Rejoin — tutor builds a new peer connection and both cameras and audio flow again]` `[automated: tests/integration/wb-av-mesh.spec.ts › G1: Pixel 7 phone student, tutor reloads in the waiting room — both camera tiles paint again]` `[human-only: real getUserMedia permission prompts, remote speaker audio, a network blip, and a physical replug. Playwright’s WebKit build on Windows has no WebRTC]`

**Notes:**

### 5. iPhone Safari student

**Action:** Repeat in light, then dark. Use a physical iPhone on Safari as the student (this can be the item 1 student). Join from the session link. In the live room, confirm the pill **Locked to tutor’s view**. With the view locked: pinch and two-finger drag must not pan or zoom the board; a one-finger stroke still draws. Tap the pill, read **Unlock your view?**, choose **Cancel**, and confirm the view stays locked. Unlock once, pan, and confirm the board actually moves. Hold **Pointer wand (K)** and confirm the tutor sees the cyan trail. Speak and confirm the tutor hears the phone. Lock the phone for a few seconds, unlock it, and confirm audio returns.

**Expect:** Join succeeds on real iOS Safari. Locked view rejects pinch and pan and still allows a stroke. The unlock dialog cancels cleanly. After unlock, pan works. Laser and mic audio work from the phone. Coming back from the lock screen does not leave the tutor in silence. **PASS** only if both themes pass.

**Ignore this run:** The iOS keyboard covering the graph tray (not exercised here; tracked PLAYWRIGHT-GAP). Playwright WebKit on Windows, which cannot place a real call. PDF fit-per-student (item 1). SMOKE-BUG-3.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-student-view-lock.spec.ts › webkit iPhone blocks a wheel and shows the lock pill]` `[automated: tests/integration/wb-student-view-lock.spec.ts › one-finger stroke still draws and syncs while locked]` `[automated: tests/integration/wb-student-view-lock.spec.ts › two-finger pinch and pan do not move a locked camera]` `[automated: tests/integration/wb-av-mesh.spec.ts › phone student (iPhone 13 profile): after Start, tutor and student each see moving video and receive live audio RTP]` `[human-only: real iOS Safari — WebKit Playwright has no RTCPeerConnection here, and lock-screen suspension is device-only]`

**Notes:**

### 6. Replay starts at the beginning

**Action:** Repeat in light, then dark, on the recording from item 1 (a normal-length session, not a sub-second clip). When review opens, do not touch the scrubber. Watch the playhead and the board from the moment replay starts. Let a few seconds play. Close the replay or leave and open that session’s replay a second time. If it jumps, note the scrubber position and, if the browser console is open, the order of `seeking`, `durationchange`, `seeked`, and `play` on the replay element.

**Expect:** The first open starts at the beginning and moves forward through the session you just taught. The board and audio match that start, not the end of the timeline. Opening it again also starts at the beginning. The same is true in dark. **PASS** only if both themes pass.

**Ignore this run:** SMOKE-BUG-5 (tracked): which board tab is highlighted while replay switches pages. SMOKE-UX-3 ±10s skip, deferred. After **Pause**, a later play that starts over at 0 (WB-REPLAY-REOPEN-START-AT-0, waived) is not this item. A scrubber that feels slightly sticky is not a fail unless play begins at the end.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-replay-start-position.spec.ts › right after End: first open and re-open start at ~0 and advance (several-second recording)]` `[automated: tests/integration/recording-end-to-end.spec.ts › in-shell SessionReviewMode replay auto-starts from position 0 (first open and re-open)]` `[automated: tests/integration/wb-replay-start-latency.spec.ts › headerless 60s WebM, Range stripped (200, no Accept-Ranges), 800 ms latency: first open and re-open start at ~0 and advance]` `[human-only: the end-jump was not reproduced in Chromium. On a real replay that jumps, the seeking / durationchange / seeked / play trace is the hardware check]`

**Notes:**

### 7. Session delete — three places, then the data is gone

**Action:** Repeat in light, then dark. Do this only after item 6 has played the recording you care about.

1. **Review page.** On the finished item 1 session, wait until the note is done (fields filled, not still generating). Copy the session link first. Choose **Cancel and delete session data**, confirm **Yes, delete**, and watch the label. Then open the copied session link, and open that session as the learner (notes list, or a replay link you copied from the review). 
2. **Student page.** Start a second session and leave it open. Go back to the student page, find it in the open-sessions list, choose **Cancel and delete**, confirm **Yes, delete**, and watch the label.
3. **Resume gate.** At the start of the theme pass, start a third session, do not have a student join, and close the tab. After more than 10 minutes, open that session’s workspace again. The card **Resume this whiteboard session?** should be up, with **Resume session**, **End and review**, and **Cancel and delete**. Choose **Cancel and delete**, confirm **Yes, delete**, and watch the label. The 10-minute wait can overlap the live session.

**Expect:** In all three places the confirm control reads **Deleting…** and stays that way until the page leaves. You do not land back on a live board for that session. After the review-page delete, the session link does not open the room, and the learner cannot open the replay. The student-page row is gone. The resume-gate session leaves to the student page and is gone from the open list. Same in both themes.

**Ignore this run:** Playwright already covers the race where the page navigated before the delete finished. This item is the feel of **Deleting…** and that the denial is real. Leftover blobs in storage are not the check. Bucket B: the vanishingly rare case where both navigations throw and the waiting-room cancel stays on “cancelling” with no message. Parent self-serve erasure. Do not fail the item because a second click does nothing while **Deleting…** is showing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-delete-session.spec.ts › tutor delete clears session rows and denies share and learner replay]` `[automated: tests/integration/wb-delete-session.spec.ts › delayed delete reaches the student page only after the session row is gone]` `[automated: tests/integration/wb-delete-session.spec.ts › student-list delete removes the row only after the session row is gone]` `[automated: tests/integration/wb-end-from-gate.spec.ts › gate shows → Cancel and delete → confirm → session deleted]` `[human-only: the Deleting… label and the leave-the-page feel in all three places. The race is the automated gate]`

**Notes:**

### 8. Notes feel, and the English-only notice

**Action:** Repeat in light, then dark, on the item 1 session. Before **Start**, look under the tutor mic control for the transcription notice. After **End**, watch the note form while it generates: **Topics covered**, **Assessment**, **Plan / Next steps**, and **Links**. Read the finished note against the sentences you actually said.

**Expect:** The tutor sees **Transcription currently supports English only.** The form stays visible the whole time notes generate (empty fields may show a placeholder; they do not disappear). The finished note is recognizable as this session, and it does not invent a lesson you did not teach. The student does not need the same notice under their mic. Both themes: the form is readable and the notice is readable.

**Ignore this run:** A writing-quality grade beyond “this heard the session and did not fabricate a lesson” (SMOKE-NOTES-3 is Bucket B). Spanish transcription (Bucket B, until a Spanish tutor or family). The English-only sentence on the public limits page is a separate surface.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-transcription-language-notice.spec.ts › tutor sees the English-only notice under the mic before recording; student does not]` `[automated: tests/integration/wb-notes-shimmer.spec.ts › end session → pending/generating: in-box placeholder when empty, status copy]` `[automated: tests/integration/wb-vad-per-speaker-durability.spec.ts › student speaks → transcriptionOnly upload; End → chunks + replay is mixdown-only]` `[human-only: whether the generated note feels trustworthy for a real lesson, and that the form never vanishes while it generates]`

**Notes:**

### 9. A new tutor, from signup through approval to a first student

**Action:** Repeat in light, then dark. Use a new email, not the pilot account. Open **Preview** `/signup` and create the account (email, and Google if you want that door too). Sign in. You should land on pending approval and be unable to open the student list. From the operator account, open **Tutor approvals**, approve that person, and sign in again as them. If the product asks for an email second factor, complete it with the code that actually arrives. Add one student and reach **Start session** so the waiting room opens. Stop there (the live lesson is item 1).

**Expect:** A stranger cannot use the product until you approve them. The approval email or the approvals screen is understandable, the approved tutor gets in, and the first student reaches a waiting room without a dead end. Both themes: signup, the pending screen, approvals, and the new tutor’s student page are readable.

**Ignore this run:** SMS two-factor. Stripe and pricing. Google’s account chooser chrome. Do not judge TOTP enrollment unless the product puts it on this path.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/tutor-signup-waitlisted.spec.ts › credentials signup → login → lands on pending-approval]` `[automated: tests/integration/identity/tutor-signup-waitlisted.spec.ts › WAITLISTED tutor cannot open /admin/students (redirect pending-approval)]` `[automated: tests/integration/identity/org-staff-invite.spec.ts › activating lists people who joined while pending and does not approve them]` `[human-only: a real stranger email, the approval you perform by hand, and whether the first-student path is obvious]`

**Notes:**

### 10. School walkthrough — owner, instructor, and family

**Action:** Repeat in light, then dark. As operator, create an organization for a test school: name, owner email, and the school’s time zone, then activate it (see `docs/handoff/ORG-SETUP-RUNBOOK.md`). As the owner, sign in, open **Organization**, invite an instructor, add a learner, and send the family the claim link. As the instructor, accept the invite on a verified, approved tutor account. As the family, open the claim link, claim the learner, and save privacy. As the owner, book an appointment: nobody is preselected as instructor; you pick the instructor, the learner, the subject, and the time. Read the time zone on the dialog and the row. As the instructor, open **Open room** (or read the one-line reason if it is off). As the owner, start to remove a member who is not in a live session, confirm the prompt, then cancel.

**Expect:** The owner can invite, add a learner, and book, and the clocks match the organization’s zone. The instructor sees their own appointment and can open the room once the family has saved privacy, or sees a clear reason if not. The family can claim and save privacy. Cancel on remove leaves the member in place. Owner and admin do not get the board, the audio, or the note from the organization record; the instructor opens the session they teach. Both themes are readable on the organization screens, the claim page, and the booking dialog.

**Ignore this run:** Bucket B org follow-ups: instructor **Account** and sharing if that page 404s, a merged roster row, last-org memory, learner and claim caps, a replay-missing reason, and a school-wide notes view. Self-serve organization signup, billing, and departments do not exist. Apple Calendar and two-way sync.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/org-timezone.spec.ts › an org created in Eastern shows that zone on the schedule]` `[automated: tests/integration/identity/org-staff-invite.spec.ts › a brand-new teacher confirms email and accepts the invitation]` `[automated: tests/integration/wb-org-booking.spec.ts › the booking dialog has no default instructor and explains the disabled Save]` `[automated: tests/integration/wb-org-booking.spec.ts › a scheduler books, changes, and cancels an org appointment without a parent email]` `[automated: tests/integration/wb-org-booking.spec.ts › live start is refused when consent is off, and in-person start activates]` `[automated: tests/integration/identity/org-staff-invite.spec.ts › removing a member with no live session asks, and cancel leaves them]` `[human-only: the owner, instructor, and family each walking the first-day path, including the claim email and whether Open room’s reason is understandable]`

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `feat/org-qol` merges into `master`. Write the merge commit below at cut time. Production is the integration preview (do not guess a branch alias).

**Integration branch:** `master`
**Integration tip commit:** fill in at the A10 cut
**Integration preview:** [production](https://usemynk.com) (same deployment as [tutoring-notes.vercel.app](https://tutoring-notes.vercel.app))

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Production spot-check — one live session in both themes

**Action:** On production, after the cut, repeat in light, then dark. Tutor login, open one student, start a session, student joins, draw one pencil stroke, press **End**. Confirm review opens and the replay starts at the beginning.

**Expect:** No auth loop. The student can join. **End** completes. Replay starts at the beginning. Both themes.

**Ignore this run:** The full item list above, unless the merge changed a surface you already passed. SMS two-factor and Apple Calendar.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/recording-end-to-end.spec.ts › tutor records solo session → ends → in-shell review shows stroke events and replay capability]` `[human-only: the first production session after the cut, on real devices, in both themes]`

**Notes:**

### 2. Production spot-check — delete denies the share and the learner replay

**Action:** On production, repeat in light, then dark. From the review of the spot-check session, copy the session link, choose **Cancel and delete session data**, confirm **Yes, delete**, and open the link again. As the learner, confirm that session’s replay is gone.

**Expect:** The control reads **Deleting…**, then you leave. The session link and the learner replay are denied.

**Ignore this run:** Blob objects left in storage. The three-place feel was item 7 on the preview.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-delete-session.spec.ts › tutor delete clears session rows and denies share and learner replay]` `[human-only: denial on the production deployment after the cut]`

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. A theme failure on any item is an overall **FAIL**. Overall verdict is PASS/FAIL only.

- [ ] PASS
- [ ] FAIL
