# Session joining and whiteboard quality — Tyson test packet

**Branch:** `feat/org-qol`
**Tip commit:** [`a0ff5d63`](https://github.com/Arangarx/tutoring-notes/commit/a0ff5d63)
**Preview:** [preview.usemynk.com](https://preview.usemynk.com)

This packet is for the tutoring app **Mynk**. It covers joining a scheduled session, who is allowed to claim a learner, and a set of whiteboard changes. School / organization accounts are **not** in this build.

## Run these again

The preview changed on 7 Oct after this packet was first sent. If you already scored one of these, clear that box and run it again. Each changed item is also marked **Re-test**.

- **23** — hints depend on the tool, and they are not in the phone's bottom bar
- **24** — the other person's cursor circle is a bit smaller
- **25** — both directions, including the tutor seeing the phone's view
- **26** — chat uses the video-tile names, and a closed chat shows a count
- **47, 48, 49** — new: wheel zoom, the two menus, and the homepage Sign in menu

Item 8 is unchanged. The join page still says **Child sign in** and **Parent sign in**. The renamed words are on the homepage **Sign in** menu (item 49), not on that join page.

---

## Before you start (Tyson)

You set these up yourself on the preview. This is a test database, so new learners here are fine.

- Open [preview.usemynk.com](https://preview.usemynk.com). Do not use the normal Mynk website.
- Sign in with the tutor account you already have.
- If **Settings → Profile → Display name** is blank, set one. Item 18 checks that the other person sees that name on the video tile. If that page will not save a name, tell Andrew and keep going.
- If your roster has no connected learner yet, do item 9 and finish the parent's claim before item 1. Schedule the session when you sit down (item 2, step 5: start time about 10 minutes from now).
- Item 5 needs a second learner whose parent account you control. Turn **Allow live tutoring sessions** off on that child's privacy page (item 32 shows where), and schedule that session inside the 15-minute window when you run the item.
- Item 15: connect Google Calendar on your tutor account only if you want the event on your own calendar. Otherwise mark that part N/A with notes.
- Items 33 and 44: try text-message setup. If the card says **SMS not available**, mark those items N/A with notes and tell Andrew.
- Item 10: sign up a second tutor with a plus-address and leave it unapproved. Do not ask for that address to be pre-approved.

Text Andrew only if an invitation email never arrives, or if you need a brand-new tutor address to be **approved**.

---

## How to run this (Tyson)

Use only the **Preview** link at the top. Do not use the normal Mynk website.

You need two places to be "in the room" at once:

- **Device A** — your main computer, Chrome. This is the **tutor**.
- **Device B** — a phone, or a second computer. This is the **parent** or the **child**. For camera and microphone (items 34 and 35), two real devices. A private window on the same computer is fine for everything else.

Sign-in pages (bookmark these on the preview host):

| Who | Page | What you should see |
|---|---|---|
| Tutor | `/login` | "Sign in with your tutor account." Button **Sign in**. Also in the homepage **Sign in** menu as **Tutor sign in** (item 49). |
| Self learner / Parent | `/account/login` | "Sign in to your account." Homepage menu: **Self learner / Parent sign in**. |
| Child learner | `/students/login` | Username and PIN. Button **Sign in**. Homepage menu: **Child learner sign in**. |

Tutor sign-in still asks for the second factor you set up in the September packet (email code, authenticator app, or text). That is expected.

Use a **plus-address** for each role so you can tell the inboxes apart (`tysonrdewitt+qol1@gmail.com` and similar). Parent and child addresses do not go on the tutor allowlist. Your existing tutor account is the approved one. The extra tutor for item 10 stays unapproved on purpose.

Allow the microphone and camera when the browser asks.

**How to mark each item.** Check **one** box. Write what you actually saw under **Notes** (leave the line blank only if you have nothing to add). **PARTIAL** means some of the checks worked and some did not — say which. **N/A with notes** means this item does not apply on this run (say why). **SKIP** means you chose not to run a valid test (say why). If every box is empty, the item was not run.

Run top to bottom. Later items reuse the learner you create earlier.

---

## Scheduled sessions and joining

### 1. Upcoming sessions, and Open room (tutor)

**Action:**

1. On Device A, sign in as the tutor at `/login`.
2. Open **Students** and open a learner you have already connected. If the roster is empty, do item 9 first and come back.
3. Open the **Whiteboard** / session area on that student's page.
4. Find the card titled **Upcoming sessions**. Its line under the title says "Open the live room when it is time for the appointment."
5. On the row for the session that starts soon, press **Open room**. While it works the button may say **Opening…**.

**Expect:** The upcoming appointment is listed with its subject and a date and time. **Open room** opens the whiteboard waiting room ("Ready to start?"), not an error page. You can press **Open room** again later on the same row and land in the same room, not a second unrelated room.

**Ignore this run:** School or organization pages. The separate **Start whiteboard session** button (that one is item 34).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Server-key join with no link]` — `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Dashboard Join opens the room]` — `[human-only: real waiting-room feel on your machine]`

**Notes:**

### 2. Join from the family page, inside the 15-minute window

**Action:**

1. Stay on Device A in the waiting room from item 1 (or press **Open room** again).
2. On Device B, sign in as the **parent** for that same learner at `/account/login`. You should land on a page with the small label **Family account**.
3. Find **Upcoming sessions**. The line under the title says "Join opens shortly before each scheduled start." The row shows the learner's name.
4. If the appointment starts in **less than 15 minutes**, press **Join**. It may say **Joining…**.
5. If every appointment is more than 15 minutes away, on Device A go to **Schedule**, press **New session**, pick that student, set **Start time** to about 10 minutes from now, press **Save session**, then refresh Device B and press **Join**.

**Expect:** **Join** opens the whiteboard on Device B and you reach the waiting room (a heading like "Connecting…" or "You're in—… will start the session shortly"). You do **not** type the child's PIN for this step. Device A and Device B are in the same session: on Device A, press **Start session** once Device B has connected. A line you draw on Device A shows up on Device B.

**Ignore this run:** A notice that says "Live sessions need the child's own login (for now)" is recorded in item 7, not here. Sessions that are still too early are item 4.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Dashboard Join opens the room]` — `[human-only: two real devices, drawing shows up on the other screen]`

**Notes:**

### 3. The child's own home also lists the session

**Action:**

1. On Device B, sign out of the parent account.
2. Sign in as the **child** at `/students/login` (the username and PIN from when that child was set up).
3. You should see "Hi, …" and "No active session. Open the link your tutor shared to join, or use Join below when your appointment window opens."
4. If the appointment is inside the 15-minute window, the same **Upcoming sessions** card is on this page. Press **Join** only if you did not already join in item 2. If you already proved Join, you can stop after you see the card.

**Expect:** The child sees the upcoming appointment and a **Join** button without asking a parent to paste a link. **Join** reaches the same kind of waiting room as item 2.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: child PIN login on a second device; the automated join test uses the parent dashboard]`

**Notes:**

### 4. Too early to join

**Action:**

1. On Device A, as the tutor, open **Schedule** and press **New session**.
2. Pick a connected student, set **Date** to today, and set **Start time** to about **2 hours from now**. Press **Save session**.
3. On Device B, as that student's parent (family page) or as the child (the "Hi, …" page), find that row.

**Expect:** **Join** is on the row, and you **cannot press it** (it looks disabled). You stay on the dashboard. You should not get into a whiteboard. If a sentence does appear, the only acceptable one for "too early" is "Join opens shortly before the scheduled start."

**Ignore this run:** The 15-minute session from items 1–3. Do not use a session whose start time has already passed.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Join disabled outside window]`

**Notes:**

### 5. Live sessions not allowed

**Action:**

1. Use a learner whose parent account you control. On that child's privacy page (item 32), turn **Allow live tutoring sessions** off. Schedule a session that starts within 15 minutes (item 2, step 5). Do this on a learner you can spare — leave the learner from items 1–3 allowed to join.
2. On Device B, sign in as **that** parent.
3. On the upcoming row, press **Join** (this time the button should be pressable, because you are inside the window).

**Expect:** You stay on the family page. Under the row you see "This session is not available to join right now." You do not enter a whiteboard.

**Ignore this run:** The too-early disabled button (item 4). A different refusal, "Sign in to join this session," means you were signed out — sign in and try again before you mark this.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Parent Join shows refusal when live session consent is off]`

**Notes:**

### 6. Joining with no key in the link

**Action:**

1. On Device A, open the waiting room again (**Open room** on an upcoming session that is inside the window, learner with live sessions allowed).
2. Look at the address bar. Copy the full address. It may contain `#k=` near the end.
3. Delete everything from `#` to the end, so the address ends at the session id (`/join/` plus a long id, and nothing after it).
4. On Device B, while signed in as that parent or that child, paste **that shortened address** and open it.
5. Also try **Copy student link** on Device A's waiting room. That copied link may still contain `#k=`. That is not what this item grades. Grade the shortened address from step 3.

**Expect:** Device B enters the waiting room and, after you press **Start session** on Device A, can see the board. No one has to be handed a secret key. A line drawn on Device A shows on Device B.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Server-key join with no link]` — `[human-only: you are deleting the key yourself in a real browser]`

**Notes:**

### 7. Parent joins for the child; a different parent is refused

**Action:**

1. With the parent from item 2 still able to open the room, confirm you never typed the child's PIN and you are still on the parent account (family page, not `/students/login`).
2. If the family page shows a notice titled "Live sessions need the child's own login (for now)" that says signing in as the parent does not open the session, try **Join** anyway and write down whether the notice and the button disagree.
3. Sign out on Device B. Sign in as a **different** parent (a plus-address that was not invited for this learner).
4. Paste the same `/join/…` address from item 6 (still with no `#k=`).

**Expect:** The correct parent reaches the waiting room as that child. The other parent does **not** get a board. They land on a page titled "Session not linked to your account" (this session link isn't associated with your account). If the correct parent got in while the "child's own login" notice was still showing, that notice is wrong — mark **PARTIAL** and describe both.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Parent joins as child]` — `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Another family's parent is refused]` — `[human-only: two real parent accounts]`

**Notes:**

### 8. Signed-out join offers Child sign in and Parent sign in

**Action:**

1. On Device B, sign out completely. Use a private window if the site keeps you signed in.
2. Open the child's `/join/…` address (no `#k=`).
3. Read the buttons. Do not finish signing in yet.
4. Press **Child sign in**. You should get the username-and-PIN page, and after a successful PIN you should return to the session rather than a dead end.
5. Sign out, open the same join address again, and press **Parent sign in**. You should get "Sign in to your account," and after the correct parent signs in you should return to the session.
6. If you also have a **self-learner** (an adult who is the student — item 14), open a join address for **that** person while signed out.

**Expect:** For a child session the page says "Sign in to join this tutoring session." and shows two buttons: **Child sign in** and **Parent sign in**. For a self-learner session there is one button, **Sign in**, and there is no **Child sign in**.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: signed-out browser and the return trip after login; unit coverage exists but does not click through a real login]`

**Notes:**

---

## People, invites, and names

### 9. Adding a learner sends an invite, with the new role labels

**Action:**

1. On Device A, as the tutor, open **Students**.
2. On the card **Add a learner**, look at **Learner type**.
3. Leave **Child learner** selected. The email field is labeled **Parent / guardian email**. Fill it with a parent plus-address you can open. Fill **Child identifier** with a first name, for example `Maya`.
4. Read the small print under the identifier.
5. Press **Add learner & send invite**. The button may say **Sending invite…**.
6. Open that parent inbox and find the invitation.

**Expect:** The two choices are exactly **Self learner / Parent** and **Child learner**. Small print under the child identifier says that until they approve the connection you will see that identifier, not their full display name. After submit you see "Invitation sent. They can approve the connection from their email." The email arrives. You do not have to copy a claim link as a separate step for this add.

**Ignore this run:** The self-learner choice is item 14. The cap of three invites is item 11.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: a real invitation email in your inbox]`

**Notes:**

### 10. A tutor who is not approved cannot add a learner

**Action:**

1. Sign up a second tutor with a plus-address you can open. Leave it unapproved.
2. Sign in as that tutor. You may land on a waitlist, or you may be able to open Students — follow whatever the site actually lets you do.
3. Try **Add learner & send invite** with any email.

**Expect:** The form does not create the learner. You see "Your account is not approved to add learners yet."

**Ignore this run:** Your normal pre-approved tutor account. That one must be allowed to add learners (item 9).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: a tutor account that was never pre-approved]`

**Notes:**

### 11. Invite cap

**Action:**

1. On Device A, open the **child** learner from item 9, before anyone claims them.
2. Find the parent section. If it says "Parent account linking is not enabled," mark N/A with notes and stop.
3. Press **Create claim link**. Then press **Generate new link** until you have done this enough times to pass three pending links (the add in item 9 already created one).
4. Try once more.

**Expect:** The extra attempt is refused. You see "Too many pending invites (max 3). Wait for existing links to be used or expire." Older links are not silently replaced by a fourth one.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: counting real invite links in the browser]`

**Notes:**

### 12. The invite works only for the invited account

**Action:**

1. On Device B, sign in at `/account/login` as a parent **other than** the address you typed in item 9.
2. Open the invitation link from the item 9 email (paste it; do not forward it into the signed-in browser by clicking while already logged in as the right person).
3. Read the page. Use **Switch account** if it is offered, and sign in as the invited address.
4. As the **correct** parent, finish connecting. If the page offers "I'll be taking the lessons myself," try that once and then go back and connect as the child instead (add a new child / the child choice, not yourself).

**Expect:** The wrong account sees **Wrong account**, including the invited email and the email you are signed in as, and it says this student will not be linked to your current account. After you switch to the invited email, connecting as the child succeeds. Connecting the invite as yourself ("I'll be taking the lessons myself") does **not** finish linking that child. The sentence in that failure may only be "Something went wrong. Please try again." Confirm you are not left with the child attached to the wrong kind of profile. Write the exact sentence in Notes.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/identity/claim-complete-email-mismatch.test.ts › stored intended email wins even if the student's parent email now matches the signer]` — `[automated: src/__tests__/identity/claim-complete-email-mismatch.test.ts › a child invite cannot link the parent's own self-learner profile]` — `[human-only: two real inboxes and the wording on the page]`

**Notes:**

### 13. Display name, at most 80 characters

**Action:**

1. Continue as the correct parent right after the connection in item 12. You should see a **Display name** card: "This is what your tutor sees on their roster — not your login email or family id."
2. Read the prompt under it.
3. Try to type more than 80 characters into **Display name**.
4. Put in a normal name (for example `Maya Rodriguez`) and press **Save display name**.
5. On Device A, refresh **Students** and find this learner.

**Expect:** The prompt for a child is "How do you want your child to be seen by this tutor?" The box stops accepting characters at 80. Saving shows "Saved how you'll appear to this tutor." The tutor's list shows the name you saved, not the parent's email address.

**Ignore this run:** The self-learner prompt is item 14.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: what the roster shows after a real save]`

**Notes:**

### 14. Child PIN, and a self-learner is not asked for one

**Action:**

1. Still on the setup page for the **child** invite, find the card about the child's login.
2. Create a username and a 6-digit PIN (not 123456), confirm the PIN, and press **Set up login**. There is also **Set up later** — do the setup now so item 3 works.
3. On Device B, sign out and open `/students/login`. Sign in with that username and PIN.
4. On Device A, add a **second** learner. This time choose **Self learner / Parent**, use a different plus-address, and press **Add learner & send invite**.
5. Open that invite as that adult and go through connection and the display-name step.

**Expect:** The child setup asks for a username and PIN ("Create a username and PIN so your child can sign in on their device") and the child can sign in at `/students/login`. The self-learner email field says they sign in with email and password and **no child PIN**. On their setup page you see "Self learners sign in with email and password — no child username or PIN." and there is no PIN form. Their display-name prompt is "How do you want to be seen by this tutor?"

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real PIN login on Device B]`

**Notes:**

---

## Calendar

### 15. Calendar titles are first name and last initial

**Action:**

1. On Device A, open the child whose display name is two words (item 13, for example Maya Rodriguez). Look through the student page for a checkbox about showing the full name on the calendar.
2. Open **Schedule**, press **New session**, pick that student, set a time about an hour from now, subject `Algebra`, press **Save session**.
3. If Google Calendar is connected, open Google Calendar and find the new event.
4. Open **Settings**, then **Calendar integrations**. Copy the **ICS subscription feed** link and subscribe in Apple Calendar, or in Google Calendar via "From URL," if you have done that before. If you cannot subscribe on this run, say so in Notes and still check Google if it is connected.
5. If the only name on the roster is a single word, or the roster still shows an email address, write that down. An email address must **not** be the event title.

**Expect:** There is no "show full name" checkbox on the student page. The event title looks like `Tutoring — Maya R.` (first name, space, last initial, period). A single-word name stays that one word (`Tutoring — Maya`). If the app only has an email for the name, the title is `Tutoring — Learner`, not the email. The same title shape appears on the ICS feed and on the Google event.

**Ignore this run:** How fast Apple or Google refresh a subscription (that can take hours). Billable-time labels.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/calendar/ics-summary-first-last-initial.test.ts › uses first + last initial in SUMMARY]` — `[automated: src/__tests__/calendar/ics-summary-first-last-initial.test.ts › does not put an unclaimed self-learner's email in the title]` — `[human-only: your real Google or Apple calendar]`

**Notes:**

### 16. A session that runs past midnight

**Action:**

1. On Device A, open **Schedule** and press **New session**.
2. Pick any student. Set **Planned length** to **~90 min (soft)**.
3. Set **Start time** to **23:30** (11:30 PM). Look at **End time** before you save.
4. Set **Subject** to `Midnight check`. Press **Save session**.
5. Find that session on the schedule for that date and, if the calendar shows the next day, on the next day too.

**Expect:** Before you save, **End time** becomes **01:00**. After you save, the appointment is about an hour and a half long and ends at 1:00 AM the next day. It does not show as ending before it starts, and it does not shrink to zero minutes.

**Ignore this run:** Google's own display of overnight events, if it splits them. Grade what Mynk's schedule shows.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Midnight schedule]` — `[human-only: the End time you see in the form]`

**Notes:**

---

## On the whiteboard

Use Device A as the tutor and Device B as the parent or child, in a live room: **Open room**, **Join**, then **Start session** once both sides show as connected. **Online** should be the selected mode (item 17). Talk only if you want to; these items are about the board. Items **47** and **48** are in this same room; they are numbered at the end of this section so earlier numbers stay put.

### 17. Waiting room says Online and In person

**Action:**

1. On Device A, open a room and stay on the waiting screen ("Ready to start?") before you press **Start session**.
2. Find the two mode buttons.
3. Press **In person** and read the line under the buttons.
4. Press **Online** again.
5. With Device B joined, **Start session** is pressable in **Online** only after the other person has connected. Switch to **In person** without the other person and see whether **Start session** is pressable.

**Expect:** The buttons are labeled **Online** and **In person** (not Live / In-person codes). Choosing **In person** shows "In person: the student is beside you. No remote connection is required." In **Online**, **Start session** stays unavailable until the other person is in. In **In person**, you can start without them.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › overlay visible for tutor while PENDING; Start disabled until student connects in LIVE mode]` — `[automated: tests/integration/wb-session-lifecycle.spec.ts › IN_PERSON mode — Start is always enabled (no student required)]` — `[human-only: the words on the buttons]`

**Notes:**

### 18. The tutor's name on the video tile

**Action:**

1. With both devices in the live session (after **Start session**), on Device B look at the tutor's video tile (the other person's picture or their camera-off placeholder).
2. Compare the label to the word "Tutor" and to the display name on the tutor account.

**Expect:** The tile shows the tutor's display name. It does not show the plain word "Tutor" when the tutor account has a name. Your own tile can still say "You" or your own name.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › the student's view of the tutor tile shows the tutor's name]` — `[human-only: a real camera tile on Device B]`

**Notes:**

### 19. Rename a board

**Action:**

1. On Device A, on the live board, find the board tabs (the first one is **Board 1**).
2. With **Board 1** selected, press **Rename** on that tab.
3. Type `Homework` and press Enter.

**Expect:** The tab now says **Homework**. **Board 1** is gone. Drawing still works on that tab. Device B sees the same tab name if they are in the session.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › tutor can rename the current board]`

**Notes:**

### 20. An image becomes its own board

**Action:**

1. On Device A, press the insert-file control (the PDF / image button, tooltip **Insert PDF**).
2. Choose a small PNG or JPG from your computer, not a PDF. A photo of a piece of paper is fine.
3. Read the short confirmation, then look at the board tabs.

**Expect:** You see "Inserted the image as a new board." A new tab appears, named from the file name without the extension (a file `diagram.png` becomes a tab `diagram`), with a small picture icon. The image is on that tab, not pasted onto **Homework** / **Board 1**.

**Ignore this run:** PDF files (item 21).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › an image file becomes its own board]` — `[human-only: a real photo from your computer]`

**Notes:**

### 21. PDF boards are titled by the file and the page

**Action:**

1. On Device A, use **Insert PDF** again and choose a PDF with at least two pages. If it asks how many pages, insert the first two.
2. Read the confirmation, then read each new tab.

**Expect:** You see a line like "Inserted 2 pages as new boards." Each new tab is named from the file and the page, in the form `quiz p.1` and `quiz p.2` for a file named `quiz.pdf` (the `.pdf` is dropped; a very long file name is shortened). Each page is its own tab, not one long scroll on the original board. Strokes you draw afterward stay on the tab you draw them on (item 37 checks this more carefully).

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: tab titles on a PDF you supply; automated stroke tests exist but use fixture files]`

**Notes:**

### 22. The math keyboard stays open

**Action:**

1. On Device A, press the math button (the **∑** mark; tooltip **Insert math equation**).
2. When the equation box is open, tap several keys on the on-screen math keyboard.
3. Then click the dim area **outside** the equation box (the backdrop), not a key.

**Expect:** Tapping the math keyboard does **not** close the equation box. Clicking the dim backdrop **does** close it. You can still press **Insert** and get the equation on the board before you dismiss it.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › the math keyboard does not dismiss the equation dialog; the backdrop does]` — `[human-only: the real MathLive keyboard, not a stand-in]`

**Notes:**

### 23. Shift for a square or circle, and the Space hint

**Re-test:** Yes. Clear any earlier box. The hints no longer always say "Square or circle."

**Action:**

1. On Device A, with the pencil or select tool active, read the small key hints. They sit in the lower part of the board, not in the top bar.
2. On a phone (Device B is fine, or narrow the tutor window), confirm those hints are **not** sitting inside the bottom tool bar.
3. Choose the rectangle tool. The hints should now include **Shift** / **Square**, and not **Circle**. Hold **Shift** while you drag.
4. Choose the ellipse tool. The hints should now include **Shift** / **Circle**, and not **Square**. Hold **Shift** while you drag.
5. With either tool, **Space** / **Pan** is still shown. Hold **Space** and drag.
6. Press **Shortcuts**. Read the list, then close it.

**Expect:** **Space** / **Pan** is always there. **Shift** / **Square** appears only while the rectangle tool is selected. **Shift** / **Circle** appears only while the ellipse tool is selected. Shift plus a rectangle drag makes a square. Shift plus an ellipse drag makes a circle. Space pans instead of drawing. On a phone the hints do not cover the bottom tool bar. **Shortcuts** lists **Wheel** / **Zoom** and **Space** / **Pan**.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › modifier hints sit in the lower part of the board and name Space pan]` — `[automated: tests/integration/wb-org-qol-surface.spec.ts › modifier hints follow the selected shape and the help list names wheel zoom]` — `[automated: tests/integration/wb-shift-constrain-shapes.spec.ts › Shift+rectangle drag yields equal width and height]` — `[automated: tests/integration/wb-shift-constrain-shapes.spec.ts › Shift+ellipse drag yields equal width and height]`

**Notes:**

### 24. You can see the other person's cursor

**Re-test:** Yes. Clear any earlier box. The circle is slightly smaller than on the first preview.

**Action:**

1. With both devices in the live session, on Device B move the pointer across the board without drawing a long stroke (hover, or a short move with the pencil tool up).
2. Watch Device A.
3. Then move the pointer on Device A and watch Device B.

**Expect:** Each person sees the other's pointer move on the board while they are on the same board. The pointer is a small circle, a bit smaller than the first preview, and it is still easy to see. It is not a line of ink that stays behind after they stop.

**Ignore this run:** The laser / pointer-wand tool (item 29). The ghost rectangle (item 25).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-presence.spec.ts › live cursor — student pointer shows collaborator on tutor canvas]` — `[human-only: whether the cursor is easy to see]`

**Notes:**

### 25. A ghost rectangle shows the other person's view

**Re-test:** Yes. Clear any earlier box. The first preview showed the tutor's view on the phone and did not show the phone's view on the tutor's screen.

**Action:**

1. Device A is the tutor on a computer. Device B is the learner on a phone, in the same live session, on the same board.
2. On Device A, pan the board (hold **Space** and drag, or use the hand tool). A plain mouse wheel zooms (item 47). Do not use the wheel for this pan.
3. On Device B, look for a rectangle and a label.
4. On Device B, pan to a different area of the board than Device A.
5. On Device A, look for a rectangle and a label.

**Expect:** Device B shows a rectangle labeled **Tutor view** around the area the tutor is looking at. Device A shows a rectangle labeled **Student view** around the area the phone is looking at. The phone's rectangle is the smaller view, not a copy of the tutor's whole screen. Both track further pans. Neither rectangle is a second copy of the ink.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-presence.spec.ts › ghost viewport — tutor pan shows student-view rect on student canvas]` — `[automated: tests/integration/wb-org-qol-presence.spec.ts › tutor ghost matches the student's visible area]` — `[human-only: both directions on a real phone and a computer]`

**Notes:**

### 26. Chat starts collapsed, and your line shows once

**Re-test:** Yes. Clear any earlier box. Names and the closed-chat count are new.

**Action:**

1. On Device A, find the **Chat** button. Do not open it yet. Confirm you do not already see a message list.
2. Press **Chat**. You should see "No messages yet. Use when audio is in trouble." and a box "Type a message…".
3. Type `bridge is up` and press **Send**.
4. Count how many times that sentence appears on Device A, and read the name in front of it.
5. On Device B, leave chat **closed**. Look at the **Chat** button.
6. Press **Chat** on Device B. Count the sentence, read the name, and look at the **Chat** button again after it is open.
7. Press **Hide chat** on Device A. From Device B, send `second line`. Look at Device A's closed **Chat** button.

**Expect:** Chat is only a **Chat** button until you open it. After send, the sentence appears **once** for you and **once** for the other person. The name in front of the line is the same name as that person's video tile (the tutor's display name, or the learner's name), not the plain words **Tutor** or **Student**, when that name exists. While chat is closed, a new line from the other person puts a count on the **Chat** button. Opening chat clears the count. Your own send does not put a count on your own button. **Hide chat** collapses it back to the button. The board still works if you never open chat.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-presence.spec.ts › in-app chat — collapsed until opened; message reaches peer]` — `[automated: tests/integration/wb-org-qol-presence.spec.ts › chat uses tile names and badges unread from the other person]` — `[automated: tests/integration/wb-org-qol-surface.spec.ts › a chat line shows once for the sender and once for the peer]`

**Notes:**

### 27. One click hands the pointer to the graph

**Action:**

1. On Device A, press **Insert graph** (the graph icon). Choose **New blank graph** and press **Insert**. A coordinate plane appears on the board.
2. Click once on the empty board **outside** the graph, then try to drag across the middle of the graph. Note whether the graph eats the drag or the board moves.
3. Click **once** in the middle of the graph, not on the axis lines. Drag inside the graph.
4. Look for the words "Click to interact" anywhere on the graph.
5. On Device B, open the graph's expression controls if you can, or on Device A add an expression (item 28) **from Device B** if the graph is shared: change the plotted formula. Then, without clicking the graph again on Device A, drag inside it again.

**Expect:** Before that one click, a drag on the graph moves the board (or does not pan the graph itself). After one click in the graph, the graph takes the pointer and you can pan or use the graph. There are **no** words "Click to interact". After the other person changes the graph, Device A can still use the graph **without clicking it a second time**.

**Ignore this run:** Plotting points and freehand inside the graph are items 45 and 46.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Graph stays interactive after an edit]` — `[human-only: whether one click feels obvious with no label]`

**Notes:**

### 28. Graph entry shows y= and an example

**Action:**

1. On Device A, press **Insert graph**.
2. Press **Plot expression**.
3. Look at the left of the text box and at the faded example inside the box.
4. Type `2*x+1` and press **Insert**.

**Expect:** You see a **y=** label immediately left of the box. The faded example is `2x+1`. After insert, the board shows a straight line for that formula. The small print says it uses standard function notation with x as the variable.

**Ignore this run:** Point plotting and free draw inside the graph are items 45 and 46.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › plotting y= stores that expression on the graph]` — `[human-only: the y= label and the example text]`

**Notes:**

### 29. The laser does not leave ink

**Action:**

1. On Device A, select the pointer / laser tool in the drawing toolbar (tooltip **Pointer wand**, keyboard **K**). It is not the pencil.
2. Drag a swoosh across the board, then release.
3. Look at Device A and Device B for a permanent line.
4. Switch back to the pencil and draw a short real stroke so you can tell ink from the laser.

**Expect:** While you drag, you may see a temporary pointer. After you release, **no stroke is left** on either person's board. The pencil stroke after that does stay.

**Ignore this run:** The live cursor from item 24.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › a laser drag does not add a stroke to either scene]` — `[human-only: what you see during the drag; the automated test cannot be shown to fail, so this hand check is the regression net (waiver WAIVER-LASER-PW-RED)]`

**Notes:**

### 30. Finish review stays available

**Action:**

1. On Device A, with a live session that has had at least a few seconds of microphone on, press **End session** and confirm if asked.
2. You land in review, with notes generating or already filled in. Look at the **top bar** and at the notes area.
3. Find **Finish review**. Press it.
4. If instead you see "Note generation failed.", "Notes are taking longer than expected.", or a note that the notes are empty, look for **Finish review** on that same screen before you press anything else.

**Expect:** **Finish review** is with the notes, not in the top bar. When notes succeeded, it sits with **Save to notes** and **Cancel and delete session data**. Pressing it opens that student's page. If generation failed, timed out, or came back empty, **Finish review** is still on the page and still opens the student. You are not stuck in review with no way out.

**Ignore this run:** You do not need to break note generation on purpose. If it succeeds, say that in Notes; the failure wording is still a pass as long as **Finish review** was present in the state you actually got. Wrong or empty note **text** is out of scope unless the button vanished.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-finish-review-cta.spec.ts › Save stays on review URL with chip; Finish review opens student detail]` — `[automated: tests/integration/wb-finish-review-cta.spec.ts › failed generation still offers Finish review]` — `[automated: tests/integration/wb-finish-review-cta.spec.ts › empty generated notes still offer Finish review]` — `[automated: tests/integration/wb-finish-review-cta.spec.ts › timed-out generation still offers Finish review]`

**Notes:**

### 47. A plain mouse wheel zooms

**Action:**

1. Stay in the live room on Device A, with a mouse. Use the select or hand tool so a drag is not drawing.
2. Roll the wheel with no keys held. Watch whether the board zooms or slides up and down.
3. Hold **Ctrl** (or **Cmd** on a Mac) and roll the wheel.
4. Hold **Space** and drag.

**Expect:** A plain wheel zooms. **Ctrl** or **Cmd** plus the wheel pans up and down and does not zoom. **Space** and a drag still pans, and does not draw. Shift plus the wheel is unchanged from before (it pans sideways).

**Ignore this run:** A phone with no mouse wheel. Mark N/A with notes on Device B if it has no wheel, and still grade Device A.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › plain wheel zooms, modifier wheel pans, space still pans]` — `[human-only: a real mouse wheel]`

**Notes:**

### 48. The session menu and the drawing menu are not the same button

**Action:**

1. On Device A, in the live room, find the top-bar button named **More session options**. It is a sliders icon (three horizontal lines with knobs), not three vertical dots.
2. Find the tool-rail button named **More — z-order, delete, hand**. It is still the vertical three dots.
3. On a phone, or with the window short, press **More session options**. If the list is taller than the panel, look at the bottom of the panel. Scroll to the end of the list.

**Expect:** The two buttons do not look the same, and the names above are the ones you hear or see on hover. You do not have to guess which three-dot control holds session options, because that control is the sliders. When the session list is taller than the panel, the bottom says **More below** until you scroll to the end, and that line is gone at the end. When everything fits, **More below** is not shown. On a phone the session button is large enough to hit without opening the drawing menu by mistake.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-surface.spec.ts › session menu and drawing menu use different icons and a more-below cue]` — `[human-only: whether the session button is obvious on a phone]`

**Notes:**

### 49. Homepage Sign in menu, and the page stays on the phone

**Action:**

1. Sign out. On a phone, open the preview homepage (not `/login`).
2. Confirm the page does not slide sideways. The header may wrap onto a second line. **Create account** stays on the screen.
3. Press **Sign in** in the header. Read the three rows.
4. On the page under the main buttons, read the link under **Create your account**.

**Expect:** The menu rows are **Tutor sign in**, **Self learner / Parent sign in**, and **Child learner sign in**. They are not **Parent sign in** or **Student sign in**. The link under the main buttons goes to the self-learner / parent sign-in and uses those words. Nothing on the page is cut off the right edge of the phone.

**Ignore this run:** The join page in item 8. That page still says **Child sign in** and **Parent sign in**.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/marketing-signin-phone.spec.ts › sign-in menu labels and page stay inside a phone viewport]` — `[human-only: a real phone, not only a narrow window]`

**Notes:**

---

## Privacy, consent, and text-message signup

### 31. Privacy page

**Action:**

1. On either device, open `/privacy` (you can do this signed out).
2. Find the section **Calendar subscription feed (ICS / webcal)**.
3. Find the section **Live whiteboard session encryption key**.

**Expect:** The calendar section says session titles use the student's first name and last initial, with the example "Tutoring — Maya R." The key section says the server stores that key **encrypted at rest**, gives it only to the signed-in tutor and the signed-in learner or parent for that session, that a parent may join as their child, and that the key is not put in email. It also says older sessions still use the key that was in the link.

**Ignore this run:** The umbrella privacy policy on mortensenapps.com. Grade this app's `/privacy` page.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: reading the page on the preview]`

**Notes:**

### 32. Consent copy mentions the parent joining

**Action:**

1. On Device B, as the parent, open the child's privacy / consent page (from the family page, open the learner, then **Privacy** or **Manage privacy**).
2. Find **Allow live tutoring sessions** and read the description under it.

**Expect:** The description says the child can join live video and audio, and that you can also join a live session as your child from your parent account when they need help signing in.

**Ignore this run:** Whether you flip the switch. Item 5 already covered the off state. Do not turn it off on the learner you still need for later items.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: the sentence on the consent screen]`

**Notes:**

### 33. Text-message consent checkbox is before the phone number

**Action:**

1. On the chooser, if **Text message (SMS)** says "Not available yet — SMS sender is not configured." and **SMS not available** will not press, mark N/A with notes and tell Andrew. Otherwise continue.
2. On Device A, as the tutor, open **Settings**, then **Two-Factor Authentication**.
3. If you are asked to pick a method, open **Text message (SMS)** and press **Set up with text message**.
4. Look at the order of the agreement checkbox, the **Mobile number** box, and **Send code**. Do not finish sending a code unless you want a real text. **Send code** must stay disabled until the box is checked.
5. If you are already enrolled and only see a "change method" screen, write in Notes whether the checkbox is above or below the phone box, and grade the first-time screen if you can reach it.

**Expect:** On first-time text setup, the agreement ("I agree to receive one-time sign-in and setup codes from **Mynk**…") is **above** the **Mobile number** field, and **Send code** is below both. **Send code** does nothing until the box is checked and a number is typed. The sentence mentions Privacy Policy, Terms of Use, HELP, and STOP.

**Ignore this run:** The change-method screen may still show the checkbox **under** the phone number. Do not mark FAIL for that screen alone. You do not have to send a real text to grade the order.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: the order of the checkbox and the phone box; SMS may be switched off in this environment]`

**Notes:**

---

## Graph points and free draw

Use the graph from item 27. If you are not in a room, start one the way item 34 describes, insert a blank graph, and click once in the middle of the graph so it takes the pointer.

### 45. Plot two points, pan, and reload

**Action:**

1. On the graph, press **Point**.
2. Click two different spots on the open part of the graph, not on the axis labels.
3. Press **Pan**. Press **Pan right** once and **Zoom in** once.
4. Reload the tutor page. Open the same board and click the graph once if it does not take the pointer.

**Expect:** Two points appear where you clicked. The other device shows the same two points. Panning and zooming move the view and do not delete the points. After reload, both points are still there.

**Ignore this run:** Whether the points sit on exact grid numbers.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-graph-ink.spec.ts › tutor points and one stroke sync in user coordinates, persist once, and survive reload]`

**Notes:**

### 46. Draw a stroke on the graph

**Action:**

1. On the same graph, press **Draw**.
2. Drag a short stroke across the open part of the graph. While you are still holding the mouse, look at the other device.
3. Let go.
4. Start a second stroke, and while you are still holding, press **Escape**.
5. Start a third stroke, and while you are still holding, press **Pan**.

**Expect:** While you are dragging, the line follows your cursor on your screen and the other device does not show it yet. When you let go, the stroke stays, and the other device shows that one stroke. Escape and switching to **Pan** both drop the stroke you had not finished. The finished stroke stays. Reload still shows the finished stroke and not the cancelled ones.

**Ignore this run:** How smooth the line looks.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-graph-ink.spec.ts › draw preview follows the drag locally, persists once on release, and cancels on Escape or mode switch]`

**Notes:**

---

## Nearby things that should still work

These are checks that the changes above did not break the paths you already know. If an earlier item already did the step, do not repeat it: mark N/A with notes and name the item.

### 34. Start and end a live session on two devices

**Action:**

1. Device A, tutor. Open a student and press **Start whiteboard session** (the button on the student page, not **Open room**). If you are already in a room from earlier, you may use that room instead and say so in Notes.
2. **Copy student link** and open it on Device B as the parent or the child.
3. Wait until Device A is no longer stuck on "Waiting for … to connect…". Leave the mode on **Online**. Press **Start session**.
4. Draw a short stroke on Device A. Confirm Device B sees it. Draw a short stroke on Device B. Confirm Device A sees it.
5. On Device A, press **End session**.

**Expect:** Both people get into the room, **Start session** waits for the other person in **Online**, strokes go both ways, and **End session** leaves the live room for the review screen without an error toast that traps you there.

**Ignore this run:** Note quality (item 30 and item 36).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › overlay visible for student while PENDING; dismisses when tutor clicks Start]` — `[human-only: two devices and a stroke you can see]`

**Notes:**

### 35. Audio and video tiles

**Action:**

1. In the waiting room, before **Start session**, allow the camera and microphone on **both** devices.
2. Confirm you can see your own preview on each device.
3. After **Start session**, talk for a few seconds on Device B and listen on Device A. Then the other way.
4. Turn the camera off and on once on Device B. Look at the tile on Device A.

**Expect:** Each side hears the other. The camera toggle shows and hides the picture. The tile name from item 18 still looks right with the camera off. No need to judge music quality beyond "I could hear a sentence."

**Ignore this run:** Bluetooth headsets and speaker echo. Mention them in Notes if they got in the way, and mark PARTIAL only if a built-in mic also failed.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real microphones, speakers, and cameras]`

**Notes:**

### 36. Recording, end session, and notes

**Action:**

1. Use a short **Online** session (a minute is enough) with the microphone unmuted for part of it.
2. Press **End session** on Device A.
3. Wait on the review screen until notes either fill in, fail, or say they are taking longer than expected.

**Expect:** The session ends. You get a review screen with the board you just used, not a blank error. Notes either appear, or you get a clear failure / "taking longer" message **and** **Finish review** is still there (item 30). Recording started on its own when the session started. You should not have had to press a separate "start recording" button.

**Ignore this run:** Whether the note text is good. Replay scrubbing that jumps to the end is a known issue — if that is all that is wrong, say so and do not fail this item for it.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/recording-end-to-end.spec.ts › tutor records solo session → ends → in-shell review shows stroke events and replay capability]` — `[human-only: you can hear that a recording happened only by the notes or replay actually showing up]`

**Notes:**

### 37. Strokes stay on their own board, including a PDF board

**Action:**

1. In a live session, on **Board 1** (or **Homework**), draw a mark you will recognize, such as the letter A.
2. Add a second board (the **+** / **Add board** control on the tab strip). Draw the letter B on it.
3. Switch back to the first board. Then to the second.
4. Insert a one-page or two-page PDF (item 21). On the first PDF tab, draw the letter C. Switch to **Board 1** and back to the PDF tab.

**Expect:** A stays on the first board, B on the second, C on the PDF tab. Switching tabs does not copy a letter onto another tab. Device B, on the same tab, sees the same letter and does not see the other tabs' letters until they switch.

**Ignore this run:** The PDF tab's title wording (item 21).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-e2-pdf-stroke-leak.spec.ts › board-3 strokes stay on board-3 after PDF import creates board-4+]` — `[human-only: letters you can recognize by eye]`

**Notes:**

### 38. Replay from notes, and from a parent share link

**Action:**

1. After item 36, on the review screen or the student's notes, open the whiteboard replay (a play control on the review screen, or **View whiteboard** if you see it on a note).
2. Let it play for a few seconds. You should see the board from that session, not an empty canvas and not a login wall.
3. On the student page, open **Share link**. Copy the parent link.
4. On Device B, open that link **signed out** (private window). Find the note and press **View whiteboard**.

**Expect:** The tutor can replay the session from the notes / review screen. The parent share link opens without a tutor login, and **View whiteboard** shows that session's board. A live session that has not ended does not appear on the share link.

**Ignore this run:** Replay that always jumps to the end of the timeline — known, write it in Notes, and do not fail the item if the board itself shows. PDF pages may show as placeholders.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/view-whiteboard-new-replay.spec.ts › tutor note link ?surface=replay auto-enters WhiteboardReplayInFrame]` — `[automated: tests/integration/view-whiteboard-new-replay.spec.ts › parent share note View whiteboard opens WhiteboardReplayInFrame]` — `[human-only: a real share link in a signed-out browser]`

**Notes:**

### 39. Cancel a session that has not started

**Action:**

1. On Device A, start a whiteboard and stay in the waiting room. Do not press **Start session**.
2. Have Device B open the student link so they are waiting too.
3. On Device A, press **Cancel session**, then **Confirm cancel**.

**Expect:** Device A leaves the room and lands back on the students list (or that student's page), not on a dead whiteboard. Device B leaves the waiting room and sees that the session was canceled (wording like "Session was canceled"), not a spinner that never ends.

**Ignore this run:** **End session** after a session has already started (item 34).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-cancel-pending-session.spec.ts › tutor cancel → student sees 'Session was canceled' (not stuck in waiting room)]` — `[automated: tests/integration/wb-cancel-pending-session.spec.ts › after cancel, tutor URL is the student roster, not the deleted workspace]`

**Notes:**

### 40. The learner can leave and come back

**Action:**

1. Start a short **Online** session so both devices are past the waiting room.
2. On Device B, press **Exit** (during the live session) or **Leave session** (if you are still in the waiting room). You should see "You left the session."
3. Open the same join address again on Device B.

**Expect:** Device B gets back into the session. They are not stuck on the waiting room if the tutor has already started. Device A still has the board. A stroke drawn after rejoin still shows on both sides.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-student-exit-rejoin.spec.ts › exit then rejoin same URL — tutor sync pill + student not waiting]` — `[human-only: rejoin on a phone]`

**Notes:**

### 41. Sign-in for tutor, parent, child, and self-learner

**Action:**

1. If you already signed in as each of these earlier in this packet, do not sign out just to repeat it. Mark PASS and list the items where each one worked.
2. Otherwise, on the preview host: tutor at `/login` (email, password, then the second factor); parent at `/account/login`; child at `/students/login` with username and PIN; self-learner at `/account/login` with the adult email from item 14.
3. After each one, confirm you land somewhere that matches the role: tutor sees **Students**; parent sees **Family account**; child sees "Hi, …"; self-learner sees the family page and is not asked for a PIN.

**Expect:** All four sign-ins succeed on this preview. The child is never offered the tutor's email form as the way in. The self-learner is never offered a PIN.

**Ignore this run:** Creating brand-new accounts if item 9 and item 14 already did that.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: real second factor and a real PIN]`

**Notes:**

### 42. Create and edit a scheduled session

**Action:**

1. On Device A, **Schedule**, **New session**. Pick a student, subject `Edit check`, today, start time about 3 hours from now, planned length **~60 min (soft)**. Press **Save session**.
2. Open that session again and change the subject to `Edit check 2`. Press **Save changes**.
3. Do not press **Cancel session** unless you are done with that row.

**Expect:** The dialog title is **Schedule session** when creating and **Edit session** when editing. The saved row shows the new subject. **End time** follows the length you picked (about an hour after the start). Cancel is a separate button, **Cancel session**, only while editing, and you do not have to use it.

**Ignore this run:** The midnight case (item 16) and the calendar title (item 15).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: the schedule form on the preview]`

**Notes:**

### 43. The ICS subscribe feed still loads

**Action:**

1. On Device A, open **Settings**, then **Calendar integrations**.
2. Find **ICS subscription feed**. Copy the https link. If a webcal link is shown for Apple, you can use that on an iPhone instead.
3. In Apple Calendar or Google Calendar ("From URL" / "Subscribe to calendar"), add that link.
4. Wait a few minutes and see whether the sessions you created show up. If the calendar app says it will refresh later, mark PARTIAL only if the link itself was rejected. A slow refresh is not a failure.

**Expect:** The settings page still offers the feed and tells you to treat the link like a password. The link is accepted by the calendar app. Events that appear use the short name from item 15.

**Ignore this run:** Two-way editing from Apple Calendar back into Mynk. That is not part of this app. Google's "Connect Google Calendar" button is separate; if it errors, write the message in Notes.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: a real calendar app subscribing to the feed]`

**Notes:**

### 44. Text-message consent still blocks Send code

**Action:**

1. If item 33 was N/A because SMS is unavailable, mark this N/A with notes as well.
2. On the text-message setup screen, leave the agreement **unchecked**, type a phone number, and try **Send code**.
3. Check the agreement and confirm **Send code** becomes pressable. You do not have to send the text.

**Expect:** With the box unchecked, **Send code** stays disabled (or the page refuses to send). Checking the box is what allows the send. This is the same screen as item 33; if you already proved it there, mark N/A with notes "covered in item 33."

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: the disabled button; sending a real text is optional]`

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `feat/org-qol` merges into `master`. Use the **master** (or integration) preview. Fetch that alias the same way — do not reuse this branch's preview.

**Integration branch:** `master`
**Integration tip commit:** `<short-sha>`
**Integration preview:** `<unverified — confirm in Vercel dashboard>`

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — prior merged features still work

**Action:** On the integration **Preview**, sign in as the tutor, open one student, start or resume a whiteboard session, draw one stroke, and end the session. Then open one upcoming session, if any exist, and confirm **Open room** still appears.

**Expect:** No new failures compared with the last green run. End session completes. Sign-in does not loop.

**Ignore this run:** Features not yet merged into this integration branch.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: one pass on the merged preview]`

**Notes:**

### 2. Parent join and calendar title still hold after merge

**Action:** On the integration preview, repeat item 2 (parent **Join** inside 15 minutes) and item 15 (event title is first name and last initial) once each.

**Expect:** Same results as on `feat/org-qol`.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: post-merge check of the two highest-risk new paths]`

**Notes:**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS or FAIL only.

- [ ] PASS
- [ ] FAIL
