# Quick-wins re-smoke — waiting-room A/V parity + adult-join auth (delta on top of round-5) — smoke runbook

**Branch:** `wb-wave5-waiting-polish`
**Tip commit:** [`575f876`](https://github.com/Arangarx/tutoring-notes/commit/575f876)
**Preview:** [quick-wins re-smoke preview](https://tutoring-notes-git-wb-wave5-wait-a507fa-arangarx-5209s-projects.vercel.app)

Re-smoke covers ONLY the 6 quick-win fixes below — Andrew's round-5 FAIL/PARTIAL items that we fixed today. Do NOT re-prove already-passing round-5 items. The live-board student-chrome regression, mic-device persistence, and tutor-meter-stuck-at-2-bars are deliberately OUT of scope (tracked as Thread A); parent→self-learner toggle, claim name/PIN gating, and signup convergence are Thread B.

---



### 1. Remote off-camera tile shows initials (2a — round-5 item 2 FAIL "still black on the other end")

**Action:** On the branch **Preview** URL, sign in as tutor and start a whiteboard session. Have the student join so both parties are in the **waiting room** with mutual A/V connected. Have the **student** turn their camera **OFF** — on the **tutor's** screen, inspect the student's remote video tile. Then have the **tutor** turn their camera **OFF** — on the **student's** screen, inspect the tutor's remote video tile.

**Expect:** Every **remote** off-camera tile shows the participant's initials/avatar placeholder — never a black rectangle — in **both** directions (student-off seen by tutor, tutor-off seen by student).

**Ignore this run:** Avatar color/size styling.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[human-only: remote track-mute rendering on real hardware — relay cannot propagate remote mute]`

**Notes:**  


---



### 2. Student mic meter animates even when muted (1a/3a — round-5 item 3 FAIL "no lighting up of bars when muted")

**Action:** In the **waiting room**, join as the **student**. **Mute** the microphone (mic off). Speak into the microphone and watch the student's mic control/chip in the waiting-room overlay.

**Expect:** The input-volume meter bars still animate to the live input level while muted — parity with the tutor, who shows speaking activity whether muted or not.

**Ignore this run:** Exact meter styling (bar width, color, animation curve).

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---



### 3. Waiting-room camera control style matches the mic control (1b — round-5 item 3 note "make the camera match")

**Action:** In the **waiting room**, join as the **student**. Compare the student waiting-room **mic** control and **camera** control visually side by side in the overlay.

**Expect:** The camera control uses the same live top-bar button styling as the mic control — no two-different-styles mismatch between mic and camera.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---



### 4. Mic picker no longer duplicated in the waiting-room dropdown (3b/1c — round-5 item 3 note "redundant to have it on the student view")

**Action:** In the **waiting room**, join as the **student**. Confirm the always-visible on-page mic picker is present. Open the mic control's settings dropdown (caret). Then tap **Start** (or have the tutor start the session) and open the **live-board** mic control's settings dropdown.

**Expect:** In the waiting room: the on-page mic picker remains visible; the mic settings dropdown no longer contains a device picker (caret gone). After session start on the live board: the mic dropdown **still** has its device picker — only the waiting-room dropdown was de-duped.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [x] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › Waiting-room overlay mic picker dedup]`

**Notes:**  
**Student doesn't have carot anymore because all they had in it was the mic picker, this is expected.**  
**Student can't start the session, that's only on tutor side, this is expected.**  
**Regression: Start Session is not starting the session. (I will start a fresh one to see if we get in to finish this test)**

---



### 5. Adult self-learner login shows the correct verify-email message (7b — round-5 item 7 note "something went wrong instead of Please verify your email first")

**Action:** Create/sign up a **self-learner** account but **do not** verify the email. Attempt to log in via the **claim-flow** login form (adult self-learner session link → account-holder login). Separately, attempt to log in via `**/account/login`** with the same unverified credentials.

**Expect:** **Both** login surfaces show **"Please verify your email first"** — identical message, because both now use the shared `AccountHolderLoginForm`.

**Ignore this run:** Nothing.

- [x] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: src/__tests__/components/auth/AccountHolderLoginForm.dom.test.tsx]`

**Notes:**

---



### 6. Adult self-learner join no longer 404s due to a stale child cookie (404 fallback — round-5 item 7 "self-learner 404's on sign in")

**Action:** In a browser that has previously attempted a **wrong child PIN** on a session link (leaving a stale `mynk_learner_session` cookie), open the **adult self-learner** session link and sign in as the account holder. *(This re-smoke exercises the stale-cookie fallback path only — if the learner was claimed/created **after** the session already existed there may still be a separate 404 with no* `SessionParticipant` *row; that is tracked as WB-ADULT-JOIN-ENABLEMENT B1 and is OUT of scope here.)*

**Expect:** You reach the **waiting room** for the session — the stale non-participant learner cookie falls through to the account-holder path instead of 404ing.

**Ignore this run:** Nothing.

- [ ] PASS
- [x] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: tests/integration/wb-session-lifecycle.spec.ts › join stale-cookie fallback]`

**Notes:**

**I grabbed the verification link for student and gave it to my son (testing student) who replaced the branch specific url with preview.usemynk.com, but strangely it gave him a message "That verification link has already been used -- your account is active. Sign in below." even though this is absolutely the first time he's gone to that link.**

**Still broken: I had him as student use an incorrect pin for the child's session.  Then I started a new session for the self learner, and he pasted the link into the same tab of the browser, and got the 404 "Page not found"**

---



## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete.

- [ ] PASS
- [x] FAIL