# Waiting-room parity/polish + adult self-learner join (overnight batch on top of Plan #1) — smoke runbook

**Branch:** `wb-wave5-waiting-polish`
**Tip commit:** `[f06fbba](https://github.com/Arangarx/tutoring-notes/commit/f06fbba)`
**Preview:** [waiting-room polish + adult join preview](https://tutoring-notes-git-wb-wave5-wait-a507fa-arangarx-5209s-projects.vercel.app)

This smoke covers ONLY the delta added since Andrew's round-4 smoke @ `43c7478`. The waiting-room A/V, Start latch, dropdown coloring, and link icon were already smoked PASS — do not re-prove them here.

---

### 1. Dual-device takeover — tutor never drops to zero students

**Action:** On the branch **Preview** URL, sign in as tutor and start a whiteboard session. Have the student join from device A (phone or second browser tab) — confirm the waiting room shows mutual A/V on both sides. Then join as the **same** student from a second device or tab B. Device B should take over the session; device A should show a "superseded" message. Close device A (tab or app). Watch the tutor's participant count / waiting-room state throughout the takeover and after device A closes. (Automated relay coverage: `wb-session-lifecycle.spec.ts` › "after device A is superseded and closes, tutor retains device B" — this item still needs a hardware pass because live takeover timing and real presence can differ from the hermetic relay.)

**Expect:** The tutor **always** continues to see **one** connected student (device B) throughout — the tutor must **never** drop to "waiting for student" / zero students at any point during the takeover or after device A closes.

**Ignore this run:** Brief (<5s) flicker as B takes over is OK; a sustained drop to zero is a FAIL.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › after device A is superseded and closes, tutor retains device B]` — `[human-only: real dual-device takeover timing and presence on hardware]`

**Notes:**  
**Student has volume indicator but the bars don't light up like for tutor unless the mic is on.  Tutor they indicate sound whether muted or not.  Student there is no lighting up of the bars when muted.**  

**Also, Now that you've changed the mic indicator to be like the live board, we should probably make the camera match?  It's a bit weird to have two different styles now.**

**It's also a little weird to have the mic selector twice.  I'm torn though because I like having it right there on the page in the waiting room, but it's also in the mic drop down.  Maybe it's okay because it's only duplicated when they open the dropdown.**  
  
**We've been doing this test from the waiting room.  It still shows both student devices at the same time with second device audio coming through before the first device session ends and brings it back down to two.**  
  
**However, student is correctly joining my same waiting room even when there are multiple instances of them for a second.  It's not joining a different session now.**  


It still doesn't go to her working mic by default.

---

### 2. Off-camera tile shows initials, not black — BOTH directions

**Action:** In the waiting room with both tutor and student connected, have the **student** turn their camera **off** — on the **tutor's** screen, inspect the student's remote video tile. Then have the **tutor** turn their camera **off** — on the **student's** screen, inspect the tutor's remote video tile. Also turn your **own** camera off on each side and confirm your **local** preview shows initials instead of a black rectangle. (Jest covers the initials logic; the hermetic relay cannot propagate remote track-mute — the **remote** direction is the key hardware-only proof.)

**Expect:** Every off-camera tile (local preview and remote tile, both directions) shows the participant's initials/avatar placeholder — never a black rectangle.

**Ignore this run:** Exact avatar color/size styling.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: remote track-mute / off-camera tile rendering on real hardware — relay cannot propagate remote mute]`

**Notes: Still black on the other end.**

---

### 3. Student mic volume meter parity

**Action:** In the waiting room, join as the **student**. Speak into the microphone and watch the student's mic control/chip in the waiting-room overlay. Compare visually to the tutor's mic control (tutor should already show a live meter when speaking).

**Expect:** A live input-volume meter animates on the **student's** mic control when the student speaks, matching the tutor's mic control behavior (previously the student had no meter).

**Ignore this run:** Exact meter styling (bar width, color, animation curve).

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Visually the buttons are the same now, but only when on, when mic is off student has no speaking indicator.**

**Also, since the student ONLY has the mic picker from the dropdown next to the mic toggle, it truly is redundant to have it on the student view since the main view has a picker.**

**Either my wife missed it or it stopped letting her change, but every time she changes her mic it bounces back to the same one.  Again, don't know if it was doing this the whole test or not.**

---

### 4. Device pickers reachable at narrow width

**Action:** As the **student** in the waiting room, narrow the browser window to phone-portrait width (or use a real phone). Locate the microphone and camera **device picker** dropdowns in the waiting-room overlay.

**Expect:** Both device pickers remain **visible and usable** in the overlay at narrow width — they must **not** be hidden behind a top-bar "more"/overflow menu the student cannot reach from the waiting room.

**Ignore this run:** Minor wrapping/spacing nits.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

### 5. Top-bar "more"/overflow menu spacing

**Action:** Enter the whiteboard **workspace** (past the waiting room, session started or in workspace chrome). Open the top-bar overflow ("more") menu.

**Expect:** Menu item spacing is **tight/compact** (not loosely spaced).

**Ignore this run:** This is a subjective polish check — minor spacing differences are not a FAIL unless clearly broken.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Wife asked if font of session recording notice in top bar "more" menu is purposely a different font from everything else.**

---

### 6. In-overlay theme toggle

**Action:** In the **waiting room** (before Start), find the theme (light/dark) toggle in the overlay. Switch to **dark**, confirm the UI updates, then switch to **light** and confirm again. Repeat: run the full toggle cycle once starting from light, then once starting from dark.

**Expect:** A theme control is present in the waiting-room overlay; toggling it switches the **whole** UI between light and dark (overlay chrome, controls, and surrounding session UI).

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**This is not a nitpick of this page specifically.  I've been wondering if there's a better icon for "system" that also indicates that it's a theme picker, the sun and moon kinda give the right vibe, but when I see a computer icon there, I don't really know what that will convey to most people.**

---

### 7. Adult self-learner join routes to account-holder login (NOT child PIN)

**Action:** As **tutor**, create/start a session for an **adult self-learner** account (a learner profile with `isSelfLearner = true`). From the waiting room, copy the student join link. Open that link in a **fresh/incognito** browser where you are **logged out**. Observe which login screen appears. Log in as the **account holder** (parent/adult account that owns that learner profile) and confirm you land in the waiting room for that session. Then sanity-check the opposite: copy a **normal child learner** session link and open it logged out — confirm it still routes to the **child PIN** login, not account-holder login. (Auth-boundary change `WB-JOIN-ADULT-LEARNER` @ `48c22b1`; automated: `wb-session-lifecycle.spec.ts` › WB-JOIN-ADULT-LEARNER G1–G4 — needs real-login hardware proof.)

**Expect:** Adult self-learner link routes to **account-holder** login (NOT child PIN login); after logging in as that account holder you land in the waiting room for the session. Child learner link still routes to child PIN login unchanged.

**Ignore this run:** The "Parent sign in" label wording is a separate pending decision — ignore the label text itself this run.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › WB-JOIN-ADULT-LEARNER G1-G4]` — `[human-only: real account-holder login flow and redirect on hardware]`

**Notes:**

**I know it's not part of this section but we need to note, that a "parent" account doesn't have a way to toggle itself to a self learner after account creation.**

**We're trying to sign her up for a self learner account to test this and after she created the account when logging in she just gets "something went wrong" instead of "Please verify your email first" that you get when you sign in from the normal login.  I'm beyond annoyed that no matter how many times I told agents to make things the same fucking component so we don't have divergences like this it still happened all over.**

When self-learner attaches to a claim, it's probably okay that it asks the consent questions, but I don't think they really need the learner name and pin, that's just for child learners, adult/self-learners sign in with their normal email.

self-learner when they click the link from the tutor for the session get a 404 page.

child learner link from tutor went to child login.  So they both go the the right pages, but the parent/self learner 404's on sign in.

As an aside she signed in with the wrong child on a link and got a 404 (which is probably right?)



---

### 8. Regression guard — child-learner join still works end-to-end

**Action:** Run a normal **child learner** join end-to-end: tutor starts a session for a **child** (non–self-learner) profile, student opens the link logged out, completes **PIN login**, reaches the waiting room, tutor taps **Start**, both parties enter the workspace. Draw one stroke if convenient; no need to re-prove round-4 waiting-room A/V polish.

**Expect:** Unchanged from round-4 — child join still works end-to-end; tonight's auth changes did not break the existing child path.

**Ignore this run:** Items already smoked PASS at round-4 (waiting-room A/V, Start latch, dropdown coloring, link icon) — this is a "didn't regress" sanity pass only.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

**Live board has severely regressed for student.  When she goes horizontally thin on desktop it doesn't compact at all everything pushes off screen.  Student has no way to change devices when screen is thin even with more button because "more" just has toggles.**

**Live board doesn't have voice activity indicator for student still.**

**Voice activity indicator for tutor stuck at 2 bars.**

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete.

- [ ] PASS
- [x] FAIL