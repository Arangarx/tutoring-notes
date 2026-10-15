# Session joining, organization accounts, and whiteboard quality — Tyson test packet

**Branch:** `feat/org-qol`
**Tip commit:** [`c2e97afb`](https://github.com/Arangarx/tutoring-notes/commit/c2e97afb)
**Preview:** [preview.usemynk.com](https://preview.usemynk.com)

This packet is for the tutoring app **Mynk**. It covers joining a scheduled session, who is allowed to claim a learner, whiteboard changes, and organization staff. Organization accounts are in this build. Items **50–70** are the new ones.

## Run these again

If you already scored one of these, clear that box and run it again. Each changed item is also marked **Re-test**. Nothing in this packet is already passed.

- **1** — the student page is one column; Upcoming sessions is under the Session card
- **3** — the child's home has more cards; this item is still the upcoming Join
- **9** — current learners are listed above Add a learner
- **11** — claim links moved to Account & sharing
- **23** — hints depend on the tool, and they are not in the phone's bottom bar
- **24** — the other person's cursor circle is a bit smaller
- **25** — both directions, and the other person's view box stays put while you pan
- **26** — chat uses the video-tile names, and a closed chat shows a count
- **34** — the student-page button says Start session
- **38** — Share link is on Account & sharing
- **47, 48, 49** — wheel zoom, the two menus, and the homepage Sign in menu

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
- Items 50–55: ask Andrew to create an organization with your tutor email as the owner, and to activate it. You cannot create that organization yourself. When it is ready, the tutor menu has **Organization**, and the page says "This organization is active." If you do not see that, stop those items and tell Andrew.
- Item 61: use a wide computer window. On a phone the **Add learner** button next to search is hidden.

Text Andrew only if an invitation email never arrives, if you need a brand-new tutor address to be **approved**, or if the organization is missing or not active.

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

**Re-test:** Yes. Clear any earlier box. The student page is one column now.

**Action:**

1. On Device A, sign in as the tutor at `/login`.
2. Open **Students** and open a learner you have already connected. If the roster is empty, do item 9 first and come back.
3. On that student's page, read top to bottom. A **Session** card is first. **Upcoming sessions** is under it. Its line under the title says "Open the live room when it is time for the appointment."
4. On the row for the session that starts soon, press **Open room**. While it works the button may say **Opening…**.

**Expect:** The upcoming appointment is listed with its subject and a date and time. **Open room** opens the whiteboard waiting room ("Ready to start?"), not an error page. You can press **Open room** again later on the same row and land in the same room, not a second unrelated room.

**Ignore this run:** The organization home (items 50–55). The **Start session** button on the Session card (item 34).

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
5. If every appointment is more than 15 minutes away, on Device A go to **Schedule**, press **New session**, pick that student, set **Start time** to about 10 minutes from now, press **Save session**, then refresh Device B and press **Join**. This works when the child has no username and no PIN. Do not set up their login first. A child who already has a login is scheduled the same way.

**Expect:** **Join** opens the whiteboard on Device B and you reach the waiting room (a heading like "Connecting…" or "You're in—… will start the session shortly"). You do **not** type the child's PIN for this step. Device A and Device B are in the same session: on Device A, press **Start session** once Device B has connected. A line you draw on Device A shows up on Device B.

**Ignore this run:** The family notice that a parent can join without the child's PIN is item 7. Sessions that are still too early are item 4.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/schedule/scheduled-session-actions.test.ts › schedules a claimed child with no username or PIN, and a child who has a login]` — `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Dashboard Join opens the room]` — `[human-only: two real devices, drawing shows up on the other screen]`

**Notes:**

### 3. The child's own home also lists the session

**Re-test:** Yes. Clear any earlier box. The home has more cards now. This item is still the upcoming Join. The PIN, privacy switches, notes, and the empty-list sentence are items 57, 59, and 60.

**Action:**

1. On Device B, sign out of the parent account.
2. Sign in as the **child** at `/students/login` (the username and PIN from when that child was set up).
3. You should see "Hi, …" and "No active session. Open the link your tutor shared to join, or use Join below when your appointment window opens."
4. If the appointment is inside the 15-minute window, the same **Upcoming sessions** card is on this page. Press **Join** only if you did not already join in item 2. If you already proved Join, you can stop after you see the card.

**Expect:** The child sees the upcoming appointment and a **Join** button without asking a parent to paste a link. **Join** reaches the same kind of waiting room as item 2. The greeting line is still "No active session. Open the link your tutor shared to join, or use Join below when your appointment window opens."

**Ignore this run:** The PIN card, the Privacy card, Session notes, and an empty "No upcoming sessions scheduled." line. Those are later items. Use a child who actually has an appointment for this one.

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
3. On the upcoming row, look at **Join**. Do not expect it to press. On Device A, open that same student and look at **Open room** on the upcoming row, and at **Start session** if that button is the one on the Session card.

**Expect:** **Join** is visible and cannot be pressed. You stay on the family page. There is no line under the row that says "This session is not available to join right now." **Open room** cannot be pressed. If **Start session** is showing, it cannot be pressed either. You do not enter a whiteboard. A session that is inside the window and still has **Allow live tutoring sessions** on keeps a pressable **Join** and **Open room**.

**Ignore this run:** The too-early disabled button (item 4). That one is about the clock, not about consent.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-qol-bridge.spec.ts › Join and Open room stay inactive when live session consent is off]`

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
2. If that child has no username and PIN yet, the family page may show a notice titled "You can join live sessions for your child." It says you do not need their PIN. That notice is not a block. Do not look for "Live sessions need the child's own login (for now)." That sentence is not on the page.
3. Sign out on Device B. Sign in as a **different** parent (a plus-address that was not invited for this learner).
4. Paste the same `/join/…` address from item 6 (still with no `#k=`).

**Expect:** The correct parent reaches the waiting room as that child. The other parent does **not** get a board. They land on a page titled "Session not linked to your account" (this session link isn't associated with your account). The family page does not say a parent cannot open the session without the child's login.

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

**Re-test:** Yes. Clear any earlier box. People you already have are listed above the add card. Item 61 grades that order. This item is still the invite.

**Action:**

1. On Device A, as the tutor, open **Students** in a wide window.
2. Scroll to the card **Add a learner** (it is under the list). Look at **Learner type**.
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

**Re-test:** Yes. Clear any earlier box. The claim links are on **Account & sharing**, not on the main student page.

**Action:**

1. On Device A, open the **child** learner from item 9, before anyone claims them.
2. Press **Account & sharing**. On the **Account** card, find **Create claim link**. If that button is not there, mark N/A with notes and stop.
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
5. The display name field stays on the page. Change it (for example `Maya R. Lopez`) and press **Save display name** again.
6. On Device A, refresh **Students** and find this learner.
7. On Device B, open the family dashboard and press **Manage** for this learner. The same display name field is there, still showing the latest saved name. Change it once more and save.

**Expect:** The prompt for a child is "How do you want your child to be seen by this tutor?" The box stops accepting characters at 80. Saving shows "Saved how you'll appear to this tutor." The field stays so you can change the name and save again. The tutor's list shows the latest name you saved, not the parent's email address. **Manage** on the family dashboard opens that same field for a child and for a self-learner.

**Ignore this run:** The self-learner prompt is item 14.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/account/DisplayNameSetupForm.dom.test.tsx › sends a second, different name after the first save]` — `[automated: src/__tests__/identity/claim-setup-consent-save.test.ts › replaces the tutor roster name when the display name is saved again]` — `[human-only: the tutor's Students list after a real save]`

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

**Re-test:** Yes. Clear any earlier box. The first preview showed the tutor's view on the phone and did not show the phone's view on the tutor's screen. While you pan, the other person's rectangle now stays on their area. It moves when they pan.

**Action:**

1. Device A is the tutor on a computer. Device B is the learner on a phone, in the same live session, on the same board.
2. On Device A, pan the board (hold **Space** and drag, or use the hand tool). A plain mouse wheel zooms (item 47). Do not use the wheel for this pan.
3. On Device B, look for a rectangle and a label.
4. On Device B, pan to a different area of the board than Device A.
5. On Device A, look for a rectangle and a label.

**Expect:** Device B shows a rectangle labeled **Tutor view** around the area the tutor is looking at. Device A shows a rectangle labeled **Student view** around the area the phone is looking at. The phone's rectangle is the smaller view, not a copy of the tutor's whole screen. When the other person pans, their rectangle moves to the new area. When you pan, their rectangle stays on their area. It does not slide along with your drag. Neither rectangle is a second copy of the ink.

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

**Re-test:** Yes. Clear any earlier box. On the student page the button says **Start session**.

**Action:**

1. Device A, tutor. Open a student. On the **Session** card, press **Start session** (not **Open room**). If it cannot start, the message title is **Start whiteboard session unavailable** — that wording is item 58 when the learner is a self-learner with no privacy record yet. If you are already in a room from earlier, you may use that room instead and say so in Notes.
2. **Copy student link** and open it on Device B as the parent or the child.
3. Wait until Device A is no longer stuck on "Waiting for … to connect…". Leave the mode on **Online**. Press **Start session**.
4. Draw a short stroke on Device A. Confirm Device B sees it. Draw a short stroke on Device B. Confirm Device A sees it.
5. On Device A, press **End session**.

**Expect:** Both people get into the room, **Start session** waits for the other person in **Online**, strokes go both ways, and **End session** leaves the live room for the review screen without an error toast that traps you there.

**Ignore this run:** Note quality (item 30 and item 36). The look of the boxes while notes are still generating (item 64).

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

**Ignore this run:** Whether the note text is good. The empty boxes and the skeleton inside them while you wait are item 64. Replay scrubbing that jumps to the end is a known issue — if that is all that is wrong, say so and do not fail this item for it. Fit view is item 65.

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

**Re-test:** Yes. Clear any earlier box. **Share link** is on **Account & sharing**.

**Action:**

1. After item 36, on the review screen or the student's notes, open the whiteboard replay (a play control on the review screen, or **View whiteboard** if you see it on a note).
2. Let it play for a few seconds. You should see the board from that session, not an empty canvas and not a login wall. Do not grade Fit view here.
3. On the student page, press **Account & sharing**. Copy the share link.
4. On Device B, open that link **signed out** (private window). Find the note and press **View whiteboard**.

**Expect:** The tutor can replay the session from the notes / review screen. The parent share link opens without a tutor login, and **View whiteboard** shows that session's board. A live session that has not ended does not appear on the share link.

**Ignore this run:** Replay that always jumps to the end of the timeline — known, write it in Notes, and do not fail the item if the board itself shows. PDF pages may show as placeholders. Fit view is item 65. Do not re-prove the play button if the board already shows; the new check is the share-link path on Account & sharing.

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

## Organization staff

Andrew creates the organization and activates it. You do the rest. Use plus-addresses. Do not use the normal Mynk site.

### 50. Owner, admin, and scheduler home

**Action:**

1. On Device A, sign in as the tutor who owns the organization. Open **Organization** in the menu.
2. Read the status line, the **Members** list, **Invitations**, **Learners**, and **Appointments**.
3. Sign out. Sign in as a scheduler you invite in item 51 (you can do this step after item 51). Open **Organization** again.
4. Sign in as an instructor from item 51. Look at the menu. If you can open **Organization**, read the page. If the menu has no **Organization**, that is the result to grade.

**Expect:** The owner sees "This organization is active." Members are listed with roles such as **Owner**. Invitations says "Owner and admin can invite. Scheduler and instructor cannot." The owner sees a form to send an invitation. A scheduler can open **Organization** and sees learners as short cards, not the add-learner form. An instructor does not get **Organization** in the menu. After that instructor signs in, they land on **Students**.

**Ignore this run:** Creating the organization yourself. If the page says it is pending or suspended, mark N/A with notes and tell Andrew. Booking is item 54. The remove dialog is item 55.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/org-staff-invite.spec.ts › sign-in from /login lands a scheduler on the organization and an instructor on the student list]` — `[human-only: the menu and the words on a real sign-in]`

**Notes:**

### 51. Inviting staff

**Action:**

1. As the owner, on **Organization**, in **Invitations**, type a plus-address you can open. Leave the role as instructor, or also check **Scheduler** for a second address. Press **Send invitation**.
2. Open that inbox. Open the invitation. Read the organization name, the role, and the invited email.
3. If you are signed in as someone else, read the wrong-account line. Sign out, sign in as the invited email (or create that tutor account and confirm the email), and press **Accept invitation**.
4. Sign in as that new person and open **Organization** if their role is scheduler or admin. An instructor uses the check in item 50.
5. As a scheduler, confirm you do not see **Send invitation**.

**Expect:** The email arrives. The page is titled **Organization invitation** and says you are invited to join that organization. The wrong account is told to sign out and use the invited email. **Accept invitation** adds them to **Members**. A scheduler cannot send an invitation.

**Ignore this run:** Approving a brand-new tutor if the site puts them on a waitlist. Tell Andrew, and mark PARTIAL if the invitation itself was fine but approval blocked the rest.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/org-staff-invite.spec.ts › a brand-new teacher confirms email and accepts the invitation]` — `[automated: tests/integration/identity/org-staff-invite.spec.ts › an existing teacher sees both doors, the wrong-account message, then the staff home without an invite form]` — `[human-only: a real invitation email]`

**Notes:**

### 52. Adding an organization learner

**Action:**

1. As the owner or an admin, on **Organization**, find **Learners**. The line under the title says "Add a learner and send the claim email."
2. Fill **Given name** and **Family name**. Add a short **Brief**, for example `Algebra, evenings`.
3. Put a parent plus-address in **Email**. Under **Send the claim email to**, choose **Their parent**. Press **Add learner**.
4. Open that inbox and finish connecting the way items 12–14 do, including privacy if the setup asks for it.
5. Back on **Learners**, read the new row.

**Expect:** The learner appears with the full name, the brief, and the parent email. You can press **Send the claim email again** until they have connected. After they connect, that button is gone. The claim email arrives.

**Ignore this run:** What a scheduler sees (item 53). A personal **Add a learner** on Students (item 9) is a different form.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/org-learner-panel.spec.ts › owner sees the parent email, the learner cap sentence, and a scheduler does not]` — `[human-only: the claim email in your inbox]`

**Notes:**

### 53. What a scheduler is allowed to see

**Action:**

1. Sign in as the scheduler. Open **Organization**, then **Learners**.
2. Read one card for a learner who has not connected yet, and one whose family has turned **Allow live tutoring sessions** off (item 5 or item 57, on a learner you can spare).
3. Look for a parent email, a consent switch, and session notes on this page. Open the learner if a link is offered.

**Expect:** Each card shows the name and the brief. A learner who has not connected says **Waiting on the family**. A learner whose live sessions are off says **Live sessions are off**. You do not see the parent email, the consent switches, or the notes.

**Ignore this run:** The owner's view, which does show the email (item 52).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/org-learner-panel.spec.ts › owner sees the parent email, the learner cap sentence, and a scheduler does not]` — `[human-only: whether notes or an email are visible anywhere on that scheduler page]`

**Notes:**

### 54. Book an instructor for an organization learner

**Action:**

1. As the owner or the scheduler, on **Organization**, find **Appointments**. Press **New session**.
2. Pick the organization learner from item 52 and the instructor from item 51. Set a time about an hour from now. Save.
3. Read the new row: when, instructor, learner, subject.
4. Sign in as that instructor. Look for that appointment on **Organization** if they can open it, or on their schedule.

**Expect:** The appointment is listed with the instructor and the learner. **No appointments yet** is gone once it is saved. The assigned instructor can see the session they were booked for. Another instructor does not need to see it.

**Ignore this run:** Google Calendar. Personal **Schedule** on your own tutor account (items 15, 16, and 42).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-booking.spec.ts › a scheduler books, changes, and cancels an org appointment without a parent email]` — `[human-only: the appointment row on the organization page]`

**Notes:**

### 55. End it now, and no notes

**Action:**

1. Have the instructor from item 51 in a live session with an organization learner (consent already saved, **Start session**, other person joined, session started).
2. As the owner, on **Organization**, on that instructor's member row, press **Remove from organization**. This button opens a dialog only when they have a session still open. If the button removes them immediately with no dialog, they did not have an open session — start the session and try again before you mark this.
3. Read every button and both warning paragraphs. Do not press anything yet.
4. Press **End it now, and no notes**.
5. On the instructor's device, see whether the live room is over.

**Expect:** The dialog title is **Remove this person**. One line says "Let it finish, or end it now. Ending it now still lets the tutor finalize notes inside the seven-day window." Another says "No notes will come from this session. Ending it does not give the time back. After the free pilot, that time still counts as time used." The buttons are **Let it finish**, **End it now (notes still allowed for 7 days)**, and **End it now, and no notes**. After the last one, that live session is over. You do not get a normal notes review you can mark ready from it.

**Ignore this run:** The ordinary **End session** button inside a personal tutoring room. That button does not offer "no notes." Do not go looking for it there. **Suspend organization** is for Andrew, not for you. The on-screen "this session will end soon" sentences after **Let it finish** are already checked by the automated test — do not start a second live room only to read them.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-org-removal.spec.ts › End it now, and no notes shows the proposed warning and finalize leaves DRAFT]` — `[human-only: the warning words, and that the live room actually ends]`

**Notes:**

---

## Consent, the child home, and Start

### 56. A parent or self-learner records consent before a live session

**Action:**

1. Use a learner whose privacy has not been saved yet. During claim setup, stop on the privacy step. Or, after they are connected, open the learner from the family page and press **Manage privacy**.
2. For a child, read **Allow live tutoring sessions** and press **Save preferences** on setup, or **Save privacy preferences** on the privacy page. Leave live sessions on if you still need this child for earlier items.
3. For the self-learner from item 14, open **Manage**, then **Privacy**. The card is **Session recording**. Check the agreement, then press **Save preferences**. If you save without the check, it says "Check the agreement before saving." Leave live sessions on.
4. On Device A, refresh that student's page and look at the **Session** card.

**Expect:** The self-learner agreement says sessions may be recorded and that they can turn any of it off later, and it says "Open Manage, then Privacy." Saving writes the choice. After a record exists, **Start session** is on the Session card. The description under **Allow live tutoring sessions** for a parent still says the child can join live video and audio and that you can join as your child.

**Ignore this run:** Item 32, which is only that parent sentence. Item 58 is the case with no record yet. Do not turn live sessions off on a learner you still need.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/identity/consent-save.spec.ts › Save privacy preferences persists toggles (DB + reload UI)]` — `[automated: src/__tests__/account/SelfLearnerConsentSettings.dom.test.tsx › agreement names Manage, then Privacy as where consent can be changed]` — `[human-only: finding Manage, then Privacy, on your own account]`

**Notes:**

### 57. A child can turn a privacy switch off, and the parent can turn it back on

**Action:**

1. On Device B, sign in as the child at `/students/login`. On the "Hi, …" page, open the **Privacy** card.
2. Read the line above the switches. Turn **Allow session audio recording** off. Do not turn off **Allow live tutoring sessions**.
3. Try to turn that same switch back on yourself.
4. Sign in as the parent. Open that child and press **Manage privacy**. Turn **Allow session audio recording** back on and press **Save privacy preferences**.
5. Sign in as the child again and read the note under that switch.

**Expect:** The child sees "You can turn any of these off. A parent can turn one back on." The switch turns off. The child cannot turn it back on. The page says only a parent can turn it back on, or that a parent has it off and the child can only make a switch stricter. After the parent saves, the child sees "Your parent turned this back on."

**Ignore this run:** Turning off live sessions. That blocks join (item 5). Use audio recording for this check.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-child-home.spec.ts › child audio stays off until a parent restores it, and a parent-only limit does not say the parent turned it back on]` — `[human-only: the switch on the child's own home]`

**Notes:**

### 58. A self-learner with no consent record does not get Start

**Action:**

1. Add a self-learner (item 14) and connect them, but do not press **Save preferences** or **Decline** on the privacy step yet.
2. On Device A, open that student. Look at the **Session** card.
3. Then, as that self-learner, open **Manage**, then **Privacy**, and save. Refresh the tutor's student page.

**Expect:** Before any privacy record exists, **Start session** is not there. You see **Start whiteboard session unavailable** and a line that privacy preferences are not complete. After a record has been saved, **Start session** is there. A record still counts if they later turn a switch off. Missing the button only happens when privacy has never been saved.

**Ignore this run:** A child whose parent has not finished privacy. This item is the self-learner. If setup will not let you leave the person half-finished, mark the "no button" half N/A with notes and still grade the half after a record exists.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/dom/StartWhiteboardSession.dom.test.tsx › hides Start for a self-learner when consent is missing]` — `[automated: src/__tests__/dom/StartWhiteboardSession.dom.test.tsx › renders Start for a self-learner once a consent record exists]` — `[human-only: the Session card before and after you save privacy]`

**Notes:**

### 59. The child changes their own PIN

**Action:**

1. On the child's "Hi, …" page, press **Change PIN**.
2. Type a wrong current PIN and a new 6-digit PIN, and try to save.
3. Type the real current PIN, a new 6-digit PIN (not 123456), confirm it, and save.
4. Sign in at `/students/login` with the new PIN. Try the old PIN once.
5. As the parent, open that child and press **Change PIN**. See whether it asks for the current PIN. You can set a new one if you want the parent path; if you do, write the new PIN down.

**Expect:** A wrong current PIN is refused and the old PIN still works. The right current PIN shows "PIN updated. All devices have been signed out and will need to log in again." The new PIN signs in. The old PIN does not. The parent's **Change PIN** does not ask for the current PIN. The child's form says a parent can still set a new PIN if the child forgets it.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-child-home.spec.ts › PIN change requires the current PIN, rejects a wrong one, and the parent can still reset]` — `[human-only: signing in with the new PIN on a real device]`

**Notes:**

### 60. The child's home lists notes and replays, and keeps an empty upcoming list

**Action:**

1. Sign in as a child who has no appointment coming up. On the "Hi, …" page, find **Upcoming sessions**.
2. Sign in as a child who has finished a session that produced a note (item 36). Find **Session notes**.
3. Press **View whiteboard** on that note if it is there.

**Expect:** When nothing is scheduled, the **Upcoming sessions** card stays on the page and says "No upcoming sessions scheduled." It does not disappear. **Session notes** lists the past note. **View whiteboard** opens that session's replay. If there are no notes yet, the card says "No session notes yet" and still stays on the page.

**Ignore this run:** Fit view (item 65). Replay that jumps to the end of the timeline. Note quality.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-child-home.spec.ts › shows the child's ended note and replay, and says nothing is scheduled when upcoming is empty]` — `[human-only: the replay on the child's own home]`

**Notes:**

---

## Student list, account, and notes

The automated tests already check the order and the links. You are judging whether the page is obvious.

### 61. Current learners first, then Add learner

**Action:**

1. On Device A, in a wide window, open **Students**.
2. Read the page from top to bottom. Find the people you already have, then the **Add a learner** card.
3. Press **Add learner** next to the search box.
4. On a phone, look for that same button. A round **+** may open **Add a student** instead. Grade the wide window. Mention the phone in Notes if you try it.

**Expect:** The learners you already have are above **Add a learner**. **Add learner** scrolls the page to that card. The email field is ready to type in. On a phone, the missing button next to search is not a failure.

**Ignore this run:** The invitation email (item 9). Organization learners (item 52).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: whether the list is obviously first and the button actually scrolls you to the card]`

**Notes:**

### 62. Account has the same way back as notes

**Action:**

1. Open a personal learner (not an organization learner). Press **Notes**. Find the way back: the button **← Back to student**, and the learner's name in the breadcrumb.
2. Go back. Press **Account & sharing**. Find the way back there too.
3. Press **← Back to student** on the account page. Then press the learner's name in the breadcrumb on the way in again, if you want both.

**Expect:** Notes and Account use the same way back. Both show **← Back to student**, and the learner's name in the breadcrumb returns to that student. You land on the student page, not on the students list.

**Ignore this run:** An organization learner. That button says **← Back to organization** and goes to the organization. That is correct for them. Grade a personal learner here.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/admin-student-detail-stage6.spec.ts › the personal owner can go back from Account to the student]` — `[human-only: the two pages feel like the same way back]`

**Notes:**

### 63. Notes lead the page, and Add note opens the form

**Action:**

1. Open a personal learner who already has at least one note. Press **Notes**.
2. Before you press anything, see what is on the page first, and what sits under the list.
3. Press **Add note**.
4. Read the card under the list. Look for a paste box. Look for separate **Upload** and **Live record** buttons.

**Expect:** Existing notes are first. **Add note** opens a **New session note** form under the list. The list stays above that form. Under the list, **Auto-fill from session** stays visible, with a box for pasting notes and **Generate notes**. That card also says "Recording and uploading audio here is coming soon. For now, record during a whiteboard session." There are no separate Upload or Live record buttons.

**Ignore this run:** Whether the generated note text is good. The skeleton while a live session's notes generate is item 64.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/admin-student-notes-list-first.spec.ts › existing notes lead the page until Add note opens the manual form]` — `[human-only: the page reads notes-first, and you can see that upload and live record are the coming-soon sentence rather than buttons]`

**Notes:**

### 64. Empty note boxes use a skeleton, with no blur over the form

**Action:**

1. End a short live session the way item 36 does, and stay on the review screen while notes are still being written.
2. Look at **Topics covered**, **Assessment**, **Plan / Next steps**, and the links box before any words appear.
3. Look at the rest of the form: buttons, labels, the area around the boxes.
4. Wait until words show up in a box. Look at that box again.

**Expect:** While a box is empty and notes are still generating, the box is empty and a skeleton (a shimmer or gray bar) sits inside that box. There is no blur over the whole form. When a box has text, the skeleton in that box is gone.

**Ignore this run:** Whether the words are right (item 30 and item 36). If notes appear so fast that you never see the empty boxes, mark N/A with notes and say so. Do not fail the item for speed.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/dom/TutorNotesSection.dom.test.tsx › empty pending and generating fields show an in-box skeleton, not a form-wide wrap]` — `[automated: src/__tests__/dom/TutorNotesSection.dom.test.tsx › generating with stored text clears the box and shows the in-box skeleton]` — `[human-only: the skeleton looks like it is inside each box, and the rest of the form is not blurred]`

**Notes:**

---

## Replay camera, lock, and a zoomed graph

### 65. Replay Fit view

**Action:**

1. Use a finished session where you zoomed in and panned so the tutor was not looking at the whole board (item 36 or item 38).
2. Open the replay. Before you press anything, look at the zoom and at what sits in the middle of the replay.
3. Press **Fit view**. Look at the edges of the board. Look for black bars.
4. Let the replay play through a part where the tutor panned or zoomed. Watch whether the framing follows.
5. Press **Fit view** again.

**Expect:** At first, the replay keeps the tutor's zoom, and the middle of the window is what the tutor was looking at. **Fit view** uses one zoom. The side that would have spilled out of the window lines up with the tutor's view. The other side shows more of the board. There are no black bars. As the replay plays, the view follows the tutor's camera. Pressing **Fit view** again returns to the tutor's zoom. The button stays labeled **Fit view**.

**Ignore this run:** Replay that jumps to the end of the timeline. Whether the ink looks pretty. The automated check already measures the zoom on a sample replay. You are judging a real session: no black bars, and the camera following along.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-replay-camera-fit.spec.ts › in-frame replay keeps tutor zoom, then Fit view scales uniformly]` — `[automated: tests/integration/wb-replay-camera-fit.spec.ts › full-page replay keeps tutor zoom, then Fit view scales uniformly]` — `[human-only: no black bars, and the view follows the tutor through a real replay]`

**Notes:**

### 66. A zoomed graph click lands where you clicked

**Action:**

1. In a live room, zoom the board in (a plain mouse wheel, item 47) and pan so the graph will not sit at the top-left of the window.
2. Press **Insert graph**, choose **New blank graph**, and press **Insert**. Click once in the graph so it takes the pointer (item 27).
3. Press **Point**. Click a spot in the open part of the graph, not on an axis label.
4. Look at where the point appeared, compared with where you clicked.

**Expect:** The point sits on the spot you clicked. It is not shifted up, down, or to the side of the cursor. A short stroke with **Draw**, if you try one, also starts where you put the cursor.

**Ignore this run:** Exact grid numbers. Do not measure pixels. The automated test already checks that a zoomed click lands on the board point. You are judging whether it feels like the point landed under the cursor.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-graph-ink.spec.ts › zoomed camera maps a far-corner click and a short stroke through the board host box]` — `[human-only: the point feels like it landed where you clicked]`

**Notes:**

### 67. A locked student view does not pan or zoom

**Action:**

1. In a live session, on Device B, leave **Follow tutor view** on.
2. Find the pill **Locked to tutor's view**. Try the mouse wheel, and on a phone try a two-finger pinch or pan.
3. Draw a short stroke with one finger or the pencil.
4. Tap the pill. Read the question. Press **Cancel**. Try to pan again. Then tap the pill and press **Unlock**.

**Expect:** While the pill is showing, the wheel and a pinch do not move or zoom the board. A stroke still appears. **Cancel** leaves it locked. **Unlock** asks "Unlock your view?" and then you can pan. Follow stays off until you turn **Follow tutor view** back on.

**Ignore this run:** The ghost rectangle (item 25). The automated test already checks that the locked camera does not move. You are judging whether the pill is obvious and a blocked pinch feels clear on a real phone.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-student-view-lock.spec.ts › wheel, ctrl-wheel, gesture, and keyboard do not move a locked camera]` — `[automated: tests/integration/wb-student-view-lock.spec.ts › tapping the pill confirms unlock; cancel leaves the camera locked]` — `[human-only: the pill and a blocked pinch on a real phone]`

**Notes:**

### 68. Recenter view

**Action:**

1. On Device A, in a live room, draw something, then pan away so it is off to the side.
2. Press **Recenter view**. It may also be inside **More session options**.
3. Look at where the drawing sits, and whether the zoom jumped to tiny or huge.

**Expect:** The drawing comes back to the middle of the board. The zoom stays a similar size to what you had. You do not have to hunt for the ink.

**Ignore this run:** An empty board. The automated test already checks the center math, including an empty board. You are judging a board that has ink.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-tutor-recenter.spec.ts › recenter puts the content center on the visible canvas center]` — `[automated: tests/integration/wb-tutor-recenter.spec.ts › recenter uses the bounding box of unequal elements and keeps zoom]` — `[human-only: it feels like the drawing came back without a weird zoom]`

**Notes:**

### 69. A session you start without scheduling shows on the family lists

**Action:**

1. On a connected learner who is allowed to join, press **Start session** on the student page. Do not create a **Schedule** appointment first. You can stop in the waiting room.
2. On Device B, as that parent, refresh the family page and read **Upcoming sessions**.
3. Sign in as the child and read **Upcoming sessions** on the "Hi, …" page.

**Expect:** Both lists show a row for that session. The subject is **Tutoring session.** **Join** is available because the session is already in the window. You did not have to put it on the schedule first.

**Ignore this run:** A session you created from **Schedule** (items 2 and 42). This item is only the one that began from **Start session**.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-adhoc-session-list.spec.ts › tutor Start shows the same upcoming row on the parent dashboard and the child join list]` — `[human-only: the row on the parent page and the child home]`

**Notes:**

### 70. Privacy and terms say what an organization can see

**Action:**

1. Open `/privacy` (signed out is fine). Find **Authentication and access**.
2. Open `/terms`. Under **The service**, read the paragraph about an organization.

**Expect:** Both pages say an organization owner, admin, or scheduler can see learners that organization entered, including learners they did not personally teach. A scheduler sees the name, a short brief, and a short reason when a booking is blocked, and does not see parent email, consent choices, or notes. A private tutor still sees only their own students.

**Ignore this run:** The calendar title and the encryption-key paragraphs (item 31). The umbrella policy on mortensenapps.com.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: reading the two pages on the preview]`

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
