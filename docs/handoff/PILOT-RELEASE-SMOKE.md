# Pilot release — smoke runbook

**Branch:** `feat/org-qol`
**Tip commit:** [`d0fd5abb`](https://github.com/Arangarx/tutoring-notes/commit/d0fd5abbb5ea6c903a1e8b081bc1342945599899)
**Preview:** [feat/org-qol preview](https://tutoring-notes-git-feat-org-qol-arangarx-5209s-projects.vercel.app)

---

## When Andrew runs this

This is the comprehensive pre-master smoke (launch Gate A9). Run it once, on the **Preview** above, when the release gate is green. It is for new UX, real hardware, and human judgment. Regressions that Playwright already covers are cited under **Coverage** and are not re-proved here.

**Both themes.** Every item below is run twice: once in **Light**, then once in **Dark**. **PASS** only if both themes pass. A failure in either theme is **FAIL** for that item.

The control is an icon button (sun, moon, or monitor — whichever theme is active). Its tooltip is `Theme: Light`, `Theme: Dark`, or `Theme: System`. Open it and the menu is labeled **Theme**, with **Light**, **Dark**, and **System**. Choose **Light** for the first pass and **Dark** for the second. Do not choose **System**.

Where it sits:

- Admin pages (students, signup follow-through, organization): bottom of the desktop left sidebar, and in the top bar on a phone.
- Waiting room: the card header, for both tutor and student.
- Live board and replay: the session top bar (review uses the same icon in the review top bar, next to **Session complete**).

**Devices.** Tutor on desktop Chrome. Student on a second device. If that device is an iPhone, use Safari for items 1–5 so item 5 is the same session, not a third one. Items 2, 3, 4, 5, and 8 are judged inside the item 1 session, before you leave it. Item 6 uses that session’s replay. Item 7 deletes only after item 6.

**Not this book.** SMS two-factor (the **Text message (SMS)** card; only after the A2P campaign is approved). Apple Calendar. Stripe, a pricing page, and the other Bucket B work listed on each item.

**Preview dependencies you cannot see in the UI.** Notes and transcription call OpenAI. Email confirmation and the email second factor need SMTP. Operator pages (**Tutor approvals**, **Organizations**) appear only for an email in `OPERATOR_EMAILS` or `ADMIN_EMAIL`; anyone else gets a not-found page. On 2026-11-20 the Vercel project was checked for these names, without reading any values. The Preview environment has `OPENAI_API_KEY`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_PORT`, `SMTP_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `WHITEBOARD_SYNC_URL`, and `ADMIN_EMAIL`. `OPERATOR_EMAILS` is not set, so the only operator is the account whose email is `ADMIN_EMAIL`. Use that account wherever a step says "sign in as an operator". If a step says a control is missing, record that in Notes rather than hunting for a different screen.

Run order is top to bottom. Re-run **Cross-branch / post-merge** after the branch merges to `master`.

---

## Feature smoke items

### 1. Core flow — a pilot session, then notes, then replay

**Action:** Repeat in light, then dark. Switch with the **Theme** menu (sun/moon/monitor icon): sidebar or phone top bar before the session, waiting-room header during the wait, session top bar once you are live, review top bar after **End session**. Choose **Light**, finish the pass, then **Dark**. Do not choose **System**.

On the **Preview**, sign in at `/login` as the pilot tutor (desktop Chrome). The account must already be approved, email-confirmed, and past two-factor, or you will be stopped on **Account pending approval**, **Confirm your email**, or **Set up Two-Factor Authentication** (that path is item 9).

Open **Students**. Pick a learner who is already claimed and whose privacy has **Allow online sessions** on. On that student’s page the **Session** card must show **Start session**. If it shows **Resume**, that student already has an open session — finish or delete it first (item 7), or pick another student. If there is no **Start session** and the page shows a setup card instead, the learner is not claimed yet: **Account & sharing**, send the claim, and finish privacy before this item. If the card shows **Open room**, that student has an upcoming appointment; use a student with no appointment, or use **Open room** and treat the rest of this item the same once the waiting room is up.

Press **Start session**. You land on the waiting-room card **Ready to start?**. Leave **Session type** on **Online** (do not press **In person** — that lets **Start session** proceed with nobody remote). Allow the mic and camera when the browser asks. Press **Copy student link** (it changes to **Copied!**). Open that link on the student device. If you are not signed in, the page says **Sign in to join this tutoring session.** Use **Child sign in** for a child PIN, or **Parent sign in** / **Sign in** for the parent or a self-learner. Privacy is not accepted inside this room. If it was never saved, the tutor’s **Start session** stays disabled and says why, and the student sees **Session not available** instead of the board.

On the student card, wait until the heading is **You're in—{tutor name} will start the session shortly** (it may say **Connecting…** first). On the tutor card, **Start session** stays disabled while the hint says **Waiting for {student name} to connect…**. When that hint is gone, press **Start session**. The waiting-room card goes away. The top-bar timer reads **0m** and becomes **1m** after a full minute. It does not tick on the waiting-room card.

While the session is live, and before **End session**, also do items 2, 3, 4, and 5 on this same pair of devices. On the tutor’s desktop strip, in this order:

1. **Pencil (P)** — draw a short mark.
2. **Text (T)** — type a short line, then click the canvas outside the text (or press Escape) so it is no longer editing.
3. **Shapes** — open the shape menu, draw one closed shape (**Rectangle (R)** or **Ellipse (O)**) and one **Arrow (A)** or **Line (L)**.
4. Math, tutor only: in the top bar press **∑** (tooltip **Insert math equation**). The dialog title is **Insert math equation**. Type a short equation and press **Insert**. You should see **Equation inserted.**
5. PDF, tutor only: in the top bar press the PDF icon (tooltip **Insert PDF worksheet**, accessible name **Insert PDF**). Dialog title **Insert PDF**. **Choose file…** a one-page PDF, leave **All pages**, press **Continue**. The new tab is named `{file name without .pdf} p.1` and shows a PDF icon.
6. **Pointer wand (K)** — hold and draw a slow loop so the student sees the trail.
7. After the text is committed, press **+** at the end of the board strip (tooltip **Add board**) and switch to **Board 2**.

The student strip is not insert-capable. On desktop the student still has **Select (V)**, **Pencil (P)**, **Eraser (E)**, **Text (T)**, **Pointer wand (K)**, and **Shapes**. On a phone the strip is **Select**, **Pencil**, **Eraser**, **Shapes**, **Styles**, **Pointer wand (K)**, and **More — z-order, delete, hand** (**Text** is inside that menu). The student has no **∑**, no PDF icon, and no **+**. The student board tabs are display-only: they follow the tutor’s board and cannot switch or add one. Do not ask the student to insert math, a PDF, or a board.

Speak a few real sentences about what you just drew so the notes have something to hear.

Press **End session**. The dialog is **End this session?** / **You'll go to review to save your notes.** Press **End session** again (not **Keep going**). The button may read **Finalizing…** or **Saving your recording…** while it finishes. You stay on this session. The review top bar says **Session complete**. Wait for notes (item 8). Then press **▶ Replay session** (item 6) before you delete anything.

**Expect:** The student reaches the live board only when privacy already allows an online session; there is no privacy form inside the waiting room. **Start session** is disabled until the student is connected, then the waiting-room card leaves and the timer reads **0m**. Pencil, text, the shape, the equation, and the PDF show up on the other device while you are still in the session. The PDF tab shows a PDF icon and a `p.1` title. **End session** stays on this workspace and opens review: the note fields stay on screen (**Topics covered**, **Assessment**, **Plan / Next steps**, **Links**). **▶ Replay session** plays the board and the audio you just made, from the start. Both the light pass and the dark pass do this.

**Ignore this run:** SMOKE-BUG-3 (tracked post-launch, Andrew 2026-11-19): an uncommitted text editor can linger on the new board after the tutor switches boards. Committed text stays on the board where you typed it. Do not fail for the lingering editor. PDF fit-per-student: a page fitted on the tutor can overflow a smaller student canvas. Matched zoom is the accepted design (Andrew 2026-11-19); fit-per-student stays a backlog enhancement. Do not fail because the student’s PDF is larger than the phone screen. Student dark-theme canvas background stuck white is an open backlog item (`viewBackgroundColor` not synced on theme return). Note it; do not fail this item for a white student canvas in dark. Bucket B, not this run: Stripe, pricing, SMS two-factor, Apple Calendar, Spanish transcription, calculus graphs, parent self-serve erasure, and un-uploaded audio that is still in flight at **End session** (it can be dropped). Graph and image inserts are not part of this pass.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode]` `[automated: tests/integration/wb-session-lifecycle.spec.ts › recording starts and timer accrues after tutor Start (PENDING → ACTIVE)]` `[automated: tests/integration/consent-entry.spec.ts › V1: tutor sees which recordings are off before Start and during the session]` `[automated: tests/integration/wb-sync-eraser.spec.ts › a pencil freedraw stroke created on one peer appears on the other (tutor → student and student → tutor)]` `[automated: tests/integration/wb-sync-text.spec.ts › text typed on one peer appears as a text element on the other (tutor → student)]` `[automated: tests/integration/wb-sync-text.spec.ts › student text stays on the board it was typed on after the tutor changes boards]` `[automated: tests/integration/wb-sync-shapes.spec.ts › rectangle drawn with the tool syncs to the other peer (tutor → student and student → tutor)]` `[automated: tests/integration/wb-sync-math.spec.ts › tutor math insert syncs an image equation to the student]` `[automated: tests/integration/whiteboard-live-sync-regression.spec.ts › invariant 8 — PDF page opens centered + zoom-parity on student viewport]` `[automated: tests/integration/recording-end-to-end.spec.ts › tutor records solo session → ends → in-shell review shows stroke events and replay capability]` `[automated: tests/integration/wb-notes-shimmer.spec.ts › end session → pending/generating: in-box placeholder when empty, status copy]` `[human-only: whether the whole session feels trustworthy on two real devices, including theme, PDF-tab recognition, and the handoff from End session into notes and replay]`

**Notes:**

### 2. Laser pointer contrast (ST-05)

**Action:** Repeat in light, then dark, inside the item 1 session before **End session**. Use the session top-bar **Theme** menu (**Light**, then later **Dark**; not **System**). Tutor selects **Pointer wand (K)** and draws a slow loop while the student watches. Student does the same while the tutor watches (the student has this tool on desktop and on the phone strip). Hold the pointer down long enough to judge the trail against the board, including over a white area and over a dark stroke. Tutor color is coral `#e27d60`. Student color is cyan `#0891b2`.

**Expect:** Each person sees the other’s trail while the button is held, and the two colors are distinguishable from each other and from the board in both themes. The trail is visible at arm’s length on the phone. It fades after release and does not become a saved stroke. **PASS** only if both themes pass.

**Ignore this run:** A soft anti-aliased edge on the trail. SMOKE-BUG-3 and the PDF fit-per-student design (item 1). The stuck-white student canvas in dark (item 1). Bucket B work listed on item 1.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-sync-laser.spec.ts › laser drag paints the author's token color on the other peer (tutor → student and student → tutor)]` `[human-only: contrast of coral #e27d60 and cyan #0891b2 against the real board in both themes, on both peers]`

**Notes:**

### 3. Pencil feel and latency (PR-01)

**Action:** Repeat in light, then dark, inside the item 1 session before **End session**. Use the session top-bar **Theme** menu (**Light**, then later **Dark**; not **System**). On each device, select **Pencil (P)** and write a word and a small sketch at a normal tutoring speed. Watch the other device while you draw, then switch who is drawing. Try one fast stroke and one slow curve.

**Expect:** The stroke appears on the other device as you draw, without a lag you would notice in a lesson, and without dropped gaps or a sticky “it catches up later” feeling. The pencil is comfortable for a few sentences of handwriting. **PASS** only if both themes and both directions feel acceptable on the real devices.

**Ignore this run:** Whether the stroke’s points match a pixel grid. Sync of the finished stroke is already gated. SMOKE-BUG-3, PDF fit-per-student, the stuck-white student canvas, and the Bucket B list on item 1.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-sync-eraser.spec.ts › a pencil freedraw stroke created on one peer appears on the other (tutor → student and student → tutor)]` `[human-only: freedraw latency and handwriting feel between two real devices]`

**Notes:**

### 4. Live audio and video on real devices

**Action:** Repeat in light, then dark, inside the item 1 session. Use the waiting-room header **Theme** menu before **Start session**, and the session top-bar **Theme** menu after (**Light**, then later **Dark**; not **System**). On first entry, allow the mic and camera on both devices when prompted. Confirm you hear the other person and see their camera, and that they hear and see you. Say a short sentence as soon as audio connects (do not switch devices first). Then: (1) toggle airplane mode or disable Wi-Fi on the student device for a few seconds and restore it; (2) reload the student page during the live session; (3) in a later pass, or on a second short session if you already pressed **Start session**, reload the tutor page while both of you are still on the waiting-room card, and once more after **Start session** while the student is in the room; (4) look at the video tiles and judge whether the picture fills the tile. If a camera or mic is easy to unplug, unplug it and plug it back once.

**Expect:** Both directions of audio and video work on the real hardware, including the first words after connect. After the network blip, both sides hear and see each other again without a stuck reconnect that never clears. After the student reload, that device’s camera and mic come back on their own and both sides see and hear each other. After the tutor reload in the waiting room, and again after **Start session**, both camera tiles paint again. Video fills the tile rather than a thin letterbox. A replug, if you did one, returns that device to the call. **PASS** only if both themes pass.

**Ignore this run:** A stale reconnect pill that clears on its own and does not leave audio or video dead (SMOKE-BUG-2, tracked). The video tile reads **Reconnecting…**. The student’s connection line reads **Call reconnecting…**. Fake-media Playwright runs. Bucket B: hot-swap of a mic that fires `track.onended` without an unplug you chose, in-progress audio lost on a hard crash, and audio still uploading at **End session** (it can be dropped). SMS and Apple Calendar.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-av-mesh.spec.ts › join → tutor receives a live inbound student audio track]` `[automated: tests/integration/wb-av-mesh.spec.ts › phone student (iPhone 13 profile): after Start, tutor and student each see moving video and receive live audio RTP]` `[automated: tests/integration/wb-av-mesh.spec.ts › AV-REFRESH-LOSS: student hard refresh in a live session — own camera and mic come back with no action and both sides see and hear each other]` `[automated: tests/integration/wb-av-mesh.spec.ts › G1: Pixel 7 phone student, tutor reloads in the waiting room — both camera tiles paint again]` `[automated: tests/integration/wb-av-mesh.spec.ts › after the tutor reloads, both peers still see the other's camera playing]` `[human-only: real getUserMedia permission prompts, remote speaker audio, a network blip, and a physical replug. Playwright’s WebKit build on Windows has no WebRTC]`

**Notes:**

### 5. iPhone Safari student

**Action:** Repeat in light, then dark. Use the session top-bar **Theme** menu on the phone (**Light**, then later **Dark**; not **System**). Use a physical iPhone on Safari as the student (this can be the item 1 student). Join from the **Copy student link** address. In the live room, confirm the pill **Locked to tutor’s view**. With the view locked: pinch and two-finger drag must not pan or zoom the board; a one-finger stroke with **Pencil (P)** still draws. Tap the pill. The dialog title is **Unlock your view?** and the body says you will pan and zoom on your own. Choose **Cancel**, and confirm the view stays locked. Open it again and choose **Unlock**, then pan, and confirm the board actually moves. Hold **Pointer wand (K)** and confirm the tutor sees the cyan trail (`#0891b2`). Speak and confirm the tutor hears the phone. Lock the phone for a few seconds, unlock it, and confirm audio returns.

**Expect:** Join succeeds on real iOS Safari. Locked view rejects pinch and pan and still allows a stroke. **Cancel** on **Unlock your view?** leaves the view locked. After **Unlock**, pan works. Laser and mic audio work from the phone. Coming back from the lock screen does not leave the tutor in silence. **PASS** only if both themes pass.

**Ignore this run:** The iOS keyboard covering the graph expression tray (not exercised here; tracked PLAYWRIGHT-GAP — open **ƒ Expressions** only if you are checking that gap on purpose). Playwright WebKit on Windows, which cannot place a real call. PDF fit-per-student (item 1). SMOKE-BUG-3.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-student-view-lock.spec.ts › webkit iPhone blocks a wheel and shows the lock pill]` `[automated: tests/integration/wb-student-view-lock.spec.ts › one-finger stroke still draws and syncs while locked]` `[automated: tests/integration/wb-student-view-lock.spec.ts › two-finger pinch and pan do not move a locked camera]` `[automated: tests/integration/wb-student-view-lock.spec.ts › tapping the pill confirms unlock; cancel leaves the camera locked]` `[automated: tests/integration/wb-av-mesh.spec.ts › phone student (iPhone 13 profile): after Start, tutor and student each see moving video and receive live audio RTP]` `[human-only: real iOS Safari — WebKit Playwright has no RTCPeerConnection here, and lock-screen suspension is device-only]`

**Notes:**

### 6. Replay starts at the beginning

**Action:** Repeat in light, then dark, on the recording from item 1 (a normal-length session, not a sub-second clip). Use the review top-bar **Theme** menu (**Light**, then later **Dark**; not **System**). Review does not start playback by itself. Do not touch the scrubber. Press **▶ Replay session**. Watch the playhead and the board from the moment that replay starts. The transport button reads **Pause** while it is playing and **Play** when it is not. Let a few seconds play. Press **Pause and hide replay** (that returns you to the notes). Press **▶ Replay session** a second time. If it jumps, note the scrubber position and, if the browser console is open, the order of `seeking`, `durationchange`, `seeked`, and `play` on the replay element.

**Expect:** The first **▶ Replay session** starts at the beginning and moves forward through the session you just taught. The board and audio match that start, not the end of the timeline. Opening it again also starts at the beginning. The same is true in dark. **PASS** only if both themes pass.

**Ignore this run:** SMOKE-BUG-5 (tracked): which board tab is highlighted while replay switches pages. SMOKE-UX-3 ±10s skip, deferred. **Pause and hide replay**, then **▶ Replay session**, starting again at the beginning is WB-REPLAY-REOPEN-START-AT-0 (waived). Do not fail this item for that restart. This item fails when play begins at the end. A scrubber that feels slightly sticky is not a fail unless play begins at the end.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-replay-start-position.spec.ts › right after End: first open and re-open start at ~0 and advance (several-second recording)]` `[automated: tests/integration/recording-end-to-end.spec.ts › in-shell SessionReviewMode replay auto-starts from position 0 (first open and re-open)]` `[automated: tests/integration/wb-replay-start-latency.spec.ts › headerless 60s WebM, Range stripped (200, no Accept-Ranges), 800 ms latency: first open and re-open start at ~0 and advance]` `[human-only: the end-jump was not reproduced in Chromium. On a real replay that jumps, the seeking / durationchange / seeked / play trace is the hardware check]`

**Notes:**

### 7. Session delete — three places, then the data is gone

**Action:** Repeat in light, then dark. Use the **Theme** menu on the review top bar, then on the student page (sidebar on desktop, top bar on a phone). **Light**, then later **Dark**. Do not choose **System**. Do this only after item 6 has played the recording you care about.

Notes and transcription need `OPENAI_API_KEY` on this preview. The review delete button is not on the page until the note is **done**. If you see **Note generation failed.** / **We couldn't finish your notes — you can retry.**, **Cancel and delete session data** is absent. Use places 2 and 3 for the delete, and mark place 1 **N/A with notes**.

1. **Review.** On the finished item 1 session, wait until the fields are filled and the footer is no longer **Preparing your notes...** or **Writing notes…**. Copy the join link first (from the address you sent the student). The tutor address is `/admin/students/{studentId}/whiteboard/{sessionId}/workspace`; the learner replay address is `/join/notes/{sessionId}/whiteboard`. Press **Save to notes** if you want the learner home to list it (the bar then shows **✓ Notes saved**). Choose **Cancel and delete session data**. The dialog says **Delete this session and all recording data?** Confirm **Yes, delete**, and watch the label. You should leave to that student’s page. Then open the copied join link, and open `/join/notes/{sessionId}/whiteboard` while signed in as the learner (or **View whiteboard** under **Session notes** on the learner home at `/join`, if that card is still listed).
2. **Student page.** Start a second session with **Start session** and leave it on the waiting room (do not press **Start session** on the card if you want it to stay open — the open-sessions list includes it either way). Go back to the student page. Open **Open sessions (N)**. On that row, choose **Cancel and delete**. The dialog says **Delete this session and its recording?** Confirm **Yes, delete**, and watch the label.
3. **Resume gate.** At the start of the theme pass, before the long live session, press **Start session** for a third session, do not have a student join, and close that tab. The gate uses a 10-minute idle window (`RESUME_GATE_STALENESS_MS`). After more than 10 minutes, open that session’s workspace again. The card headline is **Resume this whiteboard session?** The body says the session was started N minutes ago and no student has joined yet. The buttons are **Resume session**, **End and review**, and **Cancel and delete**. Choose **Cancel and delete**. The dialog says **Delete this session and its recording?** and **This removes the session row, any audio recording, and any draft notes. This can't be undone.** Confirm **Yes, delete**, and watch the label. The 10-minute wait can overlap the live session.

**Expect:** In all three places the confirm control reads **Deleting…** and stays that way until the page leaves or the row is gone. You do not land back on a live board for that session. Review delete goes to the student page. The join link and `/join/notes/{sessionId}/whiteboard` are not-found pages (the session row is gone). Do not expect the in-room title **This link isn't usable anymore** — that is a different, still-known link. The student-page row disappears after **Deleting…**, and you stay on the student page. The resume-gate session leaves to the student page and is gone from **Open sessions**. Same in both themes.

**Ignore this run:** Playwright already covers the race where the page navigated before the delete finished. This item is the feel of **Deleting…** and that the denial is real. Leftover blobs in storage are not the check. Bucket B: if both navigations throw after a waiting-room **Confirm cancel**, that control can stay on **Cancelling…** with no message. That control is **Cancel session** on the waiting-room card, not one of the three deletes here. Parent self-serve erasure. Do not fail the item because a second click does nothing while **Deleting…** is showing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-delete-session.spec.ts › tutor delete clears session rows and denies share and learner replay]` `[automated: tests/integration/wb-delete-session.spec.ts › delayed delete reaches the student page only after the session row is gone]` `[automated: tests/integration/wb-delete-session.spec.ts › student-list delete removes the row only after the session row is gone]` `[automated: tests/integration/wb-end-from-gate.spec.ts › gate shows → Cancel and delete → confirm → session deleted]` `[human-only: the Deleting… label and the leave-the-page feel in all three places. The race is the automated gate]`

**Notes:**

### 8. Notes feel, and the English-only notice

**Action:** Repeat in light, then dark, on the item 1 session. Use the waiting-room **Theme** menu before **Start session**, and the review top-bar **Theme** menu after **End session** (**Light**, then later **Dark**; not **System**). Before **Start session**, on the tutor waiting-room card, look under the microphone and camera buttons. After **End session**, watch the **Session notes** form while it generates: **Topics covered**, **Assessment**, **Plan / Next steps**, and **Links**. Read the finished note against the sentences you actually said.

This step needs `OPENAI_API_KEY` on the preview. If the key is missing, generation fails instead of writing a note. Say so in Notes; do not treat a missing key as a product bug you have to reproduce twice.

**Expect:** The tutor sees **Transcription currently supports English only.** The student waiting-room card does not. The form stays visible the whole time notes generate. While a field is empty and notes are still coming, that box shows a shimmer and its example text is blank (the example text, such as **e.g. Quadratics, factoring, FOIL method** on **Topics covered**, is only there when the box is not shimmering). The footer reads **Preparing your notes...** (three dots) and then **Writing notes…**. The fields do not disappear. The finished note is recognizable as this session, and it does not invent a lesson you did not teach. If generation fails, the alert is **Note generation failed.** **We couldn't finish your notes — you can retry. Click Regenerate notes above to retry.** Both themes: the form is readable and the notice is readable.

**Ignore this run:** A writing-quality grade beyond “this heard the session and did not fabricate a lesson” (SMOKE-NOTES-3 is Bucket B). Spanish transcription (Bucket B, until a Spanish tutor or family). The public page **What Mynk does today** (`/limits`) says **Session notes and transcription support English only.** That page is not this item.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-transcription-language-notice.spec.ts › tutor sees the English-only notice under the mic before recording; student does not]` `[automated: tests/integration/wb-notes-shimmer.spec.ts › end session → pending/generating: in-box placeholder when empty, status copy]` `[automated: tests/integration/wb-vad-per-speaker-durability.spec.ts › student speaks → transcriptionOnly upload; End → chunks + replay is mixdown-only]` `[human-only: whether the generated note feels trustworthy for a real lesson, and that the form never vanishes while it generates]`

**Notes:**

### 9. A new tutor, from signup through approval to a first student

**Action:** Repeat in light, then dark. Use the **Theme** menu on these pages (desktop sidebar bottom, or the phone top bar). **Light**, then later **Dark**. Do not choose **System**. Use a new email that is not the pilot account and not on **Pre-approved emails**.

1. Open **Preview** `/signup`. The heading is **Create your account**. Fill **Email**, **Password**, **Confirm password**, and optionally **Your name (shown to parents in emails)**. Press **Create account**. **Sign up with Google** is a second door when Google is configured; the credentials path is the one this item checks. Google’s account chooser is out of scope.
2. You land on **Confirm your email** (**We sent a confirmation link to your inbox.**). You can sign in at `/login` before opening that link. A not-yet-approved tutor then sees **Account pending approval** and the sentence that the account **is pending operator approval.** Opening **Students** returns you to that same page.
3. Sign in as an operator: an account whose sidebar already shows **Tutor approvals** and **Organizations**. If the pilot tutor does not show those links, that account is not an operator on this preview (the page 404s). Open **Tutor approvals**. Under **Pending approval**, press **Approve** on the new email (not **Reject**). There is no separate approval email to the new tutor.
4. Sign in again as the new tutor. If the confirmation link is still unused, you are sent back to **Confirm your email**. Open the link in the inbox, then sign in. The next stop is **Set up Two-Factor Authentication**, not the student list. On **Email code**, press **Set up with email**. The page says **We sent a 6-digit code to {masked email}.** Enter it and press **Confirm**. If the card says **Email not available** or **Not available yet — email delivery is not configured.**, SMTP is not set on this preview: use **Set up with authenticator** instead, and say so in Notes. Do not use **Text message (SMS)**.
5. Open **Students**. On the desktop card **Add a learner**, under **Learner type**, choose **Child learner** (or **Self learner / Parent**). Fill **Parent / guardian email** (or **Self learner email**) and, for a child, **Child identifier**. Press **Add learner & send invite**. You should see **Invitation sent. They can approve the connection from their email.** **Start session** is not on the student page until that person claims and saves privacy. Open the claim email, sign in or create the family account, choose who to connect, press **Connect learner**, then on the privacy page turn on **Allow online sessions** (and **Allow session audio recording**, **Allow whiteboard recording**, and **Allow session notes** if this learner will be used for item 1). Press **Save preferences**. You should see **✓ Preferences saved**. Back as the tutor, open that student and press **Start session**. Stop when the waiting-room card says **Ready to start?** The live lesson is item 1.

The confirmation link and the 6-digit code only arrive if this preview can send mail. If the inbox stays empty, the step is blocked on SMTP, not on a missing screen.

**Expect:** A stranger cannot open **Students** until you press **Approve**. After approval they still confirm email (if they have not) and finish two-factor before the student list. The first claimed learner reaches **Ready to start?** without a dead end. Both themes: signup, **Account pending approval**, **Tutor approvals**, **Set up Two-Factor Authentication**, and the new tutor’s student page are readable.

**Ignore this run:** SMS two-factor. Stripe and pricing. Google’s account chooser chrome. Do not judge authenticator enrollment unless email codes are unavailable and you had to use **Set up with authenticator**.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/tutor-signup-waitlisted.spec.ts › credentials signup → login → lands on pending-approval]` `[automated: tests/integration/identity/tutor-signup-waitlisted.spec.ts › WAITLISTED tutor cannot open /admin/students (redirect pending-approval)]` `[human-only: a real stranger email, the Approve button you press by hand, the inbox for the confirmation link and the 6-digit code, and whether the first-student path is obvious. There is no Playwright test of the operator Approve button on this page.]`

**Notes:**

### 10. School walkthrough — owner, instructor, and family

**Action:** Repeat in light, then dark. Use the **Theme** menu (sidebar on desktop, top bar on a phone, and the claim page’s **Theme** icon). **Light**, then later **Dark**. Do not choose **System**. The owner must already be a verified, approved tutor who has finished two-factor (item 9’s new tutor is fine, after that item’s inbox steps). Creating an organization does not create that account. See `docs/handoff/ORG-SETUP-RUNBOOK.md`.

1. As the operator, open **Organizations** (`/admin/orgs`). Under **New organization**, enter **Organization name**, choose **Time zone** (the list is Eastern, Central, Mountain, Arizona, Pacific, Alaska, Hawaii; Mountain / `America/Denver` is the default), and **Owner email**. Press **Create organization**. If the owner is not a verified teaching account, the error is **That person does not have a verified teaching account.** The new row starts **Pending**. Open it and press **Activate organization**. Activating does not approve people who joined while it was pending; those people stay under **Waiting for approval** until you approve them one by one.
2. As the owner, sign in. The sidebar item is **Organization** (not **Organizations**). Under **Invitations**, enter the instructor’s **Email**, leave **Roles** on **Instructor**, and press **Send invitation**. Under **Learners**, enter **Given name**, **Family name**, **Brief**, and **Email** (the family inbox), and press **Add learner**. That sends the claim email. The card description is **Add a learner and send the claim email.**
3. As the instructor, open the invitation on a verified, approved tutor account (not the owner). The button is **Accept invitation**. If you are signed in as someone else, the page names both emails and tells you to sign out.
4. As the family, open the claim link. Sign in or create the account, press **Connect learner**, then turn the privacy switches on and press **Save preferences**. Until that is saved, the instructor’s **Open room** stays off and the line under it says why (for example **{name} hasn't finished privacy preferences yet.**). If **Allow online sessions** is off, **Open room** can still open in person, and the line includes **You can still meet in person.**
5. As the owner, on **Appointments**, press **New session**. The dialog title is **Schedule session**. **Instructor** shows **Choose an instructor** and nobody is preselected. **Save session** stays disabled until you pick one, and the dialog says **Choose an instructor.** Also pick the learner, **Subject**, and the time. The dialog says **Times are in {zone}.** The row reads **Instructor:**, **Learner:**, and the time. The week label above the list uses the organization zone.
6. As the instructor, open **Schedule** in the sidebar (an instructor who is not also owner, admin, or scheduler has no **Organization** item). On that appointment press **Open room**, or read the one-line reason under a disabled **Open room**. Do not teach the lesson here. **Sessions you taught** is on the organization page, which this instructor cannot open.
7. As the owner, on a member who is not in a live session, press **Remove from organization**. The dialog title is **Remove this person**. Press **Cancel**. Do not press **Remove**.

**Expect:** The owner can invite, add a learner, and book, and the clocks match the organization’s zone (**Times are in {zone}.** on the dialog, and the week label ends with that same zone). The instructor sees their own appointment on **Schedule** and can press **Open room** once the family has saved privacy, or sees the one-line reason if not. The family can claim and **Save preferences**. **Cancel** on **Remove this person** leaves the member in place. Owner and admin do not get the board, the audio, or the note from the organization record. Both themes are readable on the organization screens, the claim page, the booking dialog, and the instructor’s **Schedule**.

**Ignore this run:** Bucket B org follow-ups: instructor **Account & sharing**, the merged roster row, last-org memory, learner and claim caps, a replay-missing reason, and a school-wide notes view. Self-serve organization signup, billing, and departments do not exist. Apple Calendar and two-way sync.

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

**Action:** On production, after the cut, repeat in light, then dark. Use the **Theme** menu (sidebar or phone top bar, then the waiting-room header, then the session top bar, then the review top bar). Choose **Light**, then **Dark**. Do not choose **System**. Tutor login, open one claimed student whose **Session** card says **Start session**, press **Start session**, leave **Session type** on **Online**, **Copy student link**, have the student join, draw one **Pencil (P)** stroke, press **End session**, confirm **End this session?**, press **End session** again. On review, press **▶ Replay session** without touching the scrubber first.

**Expect:** No auth loop. The student can join. **End session** completes and the bar says **Session complete**. **▶ Replay session** starts at the beginning. Both themes.

**Ignore this run:** The full item list above, unless the merge changed a surface you already passed. SMS two-factor and Apple Calendar.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/recording-end-to-end.spec.ts › tutor records solo session → ends → in-shell review shows stroke events and replay capability]` `[human-only: the first production session after the cut, on real devices, in both themes]`

**Notes:**

### 2. Production spot-check — delete denies the share and the learner replay

**Action:** On production, repeat in light, then dark, with the **Theme** menu on the review top bar and then the student page (**Light**, then **Dark**; not **System**). From the review of the spot-check session, copy the join link and note `/join/notes/{sessionId}/whiteboard`. If the note is still generating, wait until **Cancel and delete session data** is on the page (it is hidden until the note is done). Choose **Cancel and delete session data**, confirm **Yes, delete**, and open the join link again. As the learner, open the replay address.

**Expect:** The control reads **Deleting…**, then you leave to the student page. The join link and the learner replay are not-found pages.

**Ignore this run:** Blob objects left in storage. The three-place feel was item 7 on the preview. The waiting-room **Cancelling…** edge is not this item.

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
