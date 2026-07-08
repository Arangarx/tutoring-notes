# CC-1 / CC-2 — consent-record gate + mandatory claim consent — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** `[5c59a37](https://github.com/Arangarx/tutoring-notes/commit/5c59a371c58a6c4f7e021901bcefb787abd4d341)`
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

CC-1 gates whiteboard session **create**, **start**, and **join-token issue** on `ConsentRecord` existence for `(learnerProfileId, adminUserId)`. CC-2 forces an explicit consent choice at claim setup (save or decline — both write a record). Self-learners exempt. Shipped: `35147ef` (`assertConsentRecordExists`), `13afd66` (create gate), `12d4946` (start + `issueJoinToken` backstops), `476b9ee` (tutor UI callout + friendly `ConsentError`), `5d6d196` (decline API), `7a85d0a` (mandatory-choice UI).

---



### 1. CC-1 — no ConsentRecord blocks session create (claimed minor)

**Action:** As tutor on the branch **Preview**, open a **claimed minor** learner who has **no** `ConsentRecord` for this tutor (test fixture or freshly claimed student before consent step). On the student detail page, observe the whiteboard Start affordance. If a Start button is still visible (legacy UI), click it. Otherwise note the inline callout.

**Expect:** **No session is created.** Tutor sees the **consent-required callout** instead of a bare Start button (or a friendly error if Start is clicked): parent must claim and set privacy preferences, with link hint to the **Parent account** section. Server returns `ConsentError` (not a generic 500 / digest). No redirect to whiteboard workspace.

**Ignore this run:** Exact callout punctuation; pre-existing PENDING sessions from before CC-1 deploy (see item 4).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: createWhiteboardSession.test.ts › no ConsentRecord → ConsentError]` — `[human-only: tutor callout UX]`

**Notes:**

**I'm skipping all these consent-record ones.  Frankly...shouldn't playwright tests be able to smoke ALL of this????  Why am I being asked to smoke this kind of thing?**

---



### 2. CC-1 — unclaimed learner blocks session create

**Action:** As tutor, open an **unclaimed** student (`learnerProfileId` null — invite sent but claim not completed). Attempt to start a whiteboard session from the student detail page.

**Expect:** Session create is **blocked** with the same consent-required callout / `ConsentError` path as item 1. Tutor is directed to Parent / claim flow — no "start then invite parent later" path.

**Ignore this run:** Claim-invite email delivery.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: createWhiteboardSession.test.ts › unclaimed → ConsentError]`

**Notes: See notes in step 1.**

---



### 3. CC-1 — ConsentRecord exists → session create proceeds (positive)

**Action:** As tutor, use a **claimed minor** with a saved `ConsentRecord` where `allowLiveSession=true` (and audio per your test needs). Click **Start whiteboard session** from the student detail page (or workspace Continue flow).

**Expect:** Session **creates successfully** — redirect to whiteboard workspace (PENDING → workspace mounts). No consent-required callout. Friendly errors do **not** appear.

**Ignore this run:** Workspace waiting-overlay polish; recording consent banners (Block B scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: createWhiteboardSession.test.ts › record exists + allowLiveSession → creates]`

**Notes: See notes in step 1.**

---



### 4. CC-1 — startWhiteboardSession backstop (legacy PENDING row, no record)

**Action:** If a **legacy PENDING** whiteboard session exists for a claimed minor **without** a `ConsentRecord` (pre-CC-1 row or test seed), tutor opens that session's workspace and presses **Start** (PENDING→ACTIVE). Alternatively, tutor uses a Continue link to an existing PENDING room then activates.

**Expect:** Activation is **blocked** — phase stays **PENDING**; friendly `ConsentError` (not digest). Session row is not silently activated. Tutor can still **end** the stale session (recovery path).

**Ignore this run:** Creating the legacy fixture if none exists — mark **SKIP** with reason.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: startWhiteboardSession.test.ts › no record → ConsentError]`

**Notes: See notes in step 1.**

---



### 5. CC-2 — mandatory consent choice at claim setup (cannot skip)

**Action:** Start or resume **claim setup** for a **claimed minor** (not self-learner) at `/claim/[token]/setup` after credentials are set but **before** any consent save/decline. Look for skip affordances: **"Set up later"** on credentials, **"save later"** footnote on consent, and **"Go to dashboard"** escape links.

**Expect:** Parent **cannot exit** setup without an explicit consent choice. Skip links and dashboard escape are **hidden or blocked** until consent is saved or declined. Consent panel shows **Save preferences** (primary) and **No consent now, I'll review later** (secondary). No silent default-on toggles.

**Ignore this run:** Self-learner path (item 7). Email invite copy.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: ConsentSetupForm.dom.test.tsx › enforcement hides skip affordances]`

**Notes: See notes in step 1.**

---



### 6. CC-2 — Decline path writes all-off ConsentRecord

**Action:** On claim setup consent panel (enforcement on), click **No consent now, I'll review later**. Read the **AlertDialog** confirmation (variant depends on pending session invite — see item 8). Confirm decline.

**Expect:** Dialog shows honest consequence copy (child cannot join live sessions / pending-invite variant if applicable). On confirm, API `consent_decline` succeeds; UI shows **saved** state. A `ConsentRecord` exists with **all toggles off** (`allowLiveSession`, `allowAudioRecording`, `allowWhiteboardRecording`, `allowNoteSending` = false). Parent can then reach dashboard / next setup step.

**Ignore this run:** Exact dialog title punctuation. Log line grep (`[cns] … action=consent_declined`).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: claim-setup-consent-decline.test.ts › T5 consent_decline writes all-off record]`

**Notes: See notes in step 1.**

---



### 7. CC-2 — self-learner exempt from mandatory consent

**Action:** Complete claim setup via `connect_self` (adult self-learner declaration). Observe whether consent panel is skipped or informational-only. As tutor, **Start** a whiteboard session for that self-learner **without** any parental `ConsentRecord`.

**Expect:** Self-learner bypasses mandatory consent gate — setup completes without forced save/decline. Tutor can create/start sessions normally (D-5 exempt). Decline/save API returns skipped success if invoked.

**Ignore this run:** Self-learner credential UX details unrelated to consent.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: claim-setup-consent-decline.test.ts › self-learner exemption]` — `[automated: createWhiteboardSession.test.ts › self-learner passes without record]`

**Notes: See notes in step 1.**

---



### 8. CC-2 — re-submit already-saved consent → 409 `consent_already_saved` (H-1)

**Action:** On claim setup where consent is **already saved**, attempt to **save again** or **decline again** (e.g. refresh and re-click Save preferences, or trigger duplicate submit). Observe UI handling.

**Expect:** Server returns **409** with `consent_already_saved`. UI treats this as **already saved** — no duplicate record confusion, no wedged error state. No second version created from a double-click race (or collision handled gracefully).

**Ignore this run:** Network-tab inspection unless UI misbehaves.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: claim-setup-consent-decline.test.ts › H-1 P2002 → 409]` — `[automated: ConsentSetupForm.dom.test.tsx › 409 on decline treated as saved]`

**Notes: See notes in step 1.**

---



### 9. All-off record satisfies CC-1 existence gate; join gate still blocks live entry

**Action:** **(A)** After item 6 (or any all-off `ConsentRecord`), as tutor create a whiteboard session for that learner — confirm create **succeeds** (CC-1 record-existence satisfied). **(B)** Activate session and issue/obtain a student join link. As the claimed student, attempt **live join**.

**Expect:** **(A)** Session row is created; snapshot freezes `allowLiveSession=false`. **(B)** Student **live join is denied** — "session not available" (or existing denial copy); student does not enter the board. Ratified consistency: existence gate ≠ permission gate.

**Ignore this run:** In-person mode paths; Block B audio banners (separate smokebook).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Coverage:** `[automated: consent-b2.test.ts › all-off record → create ok, join denied]` — `[human-only: end-to-end join denial on preview]`

**Notes: See notes in step 1.**

---



### 10. Theme parity — claim setup + parent consent editor (light + dark)

**Action:** Repeat the **visible consent surfaces** from items 5–6 and Block B item 5: **claim setup** consent panel and **parent consent editor**. Run each in **light** theme, then **dark** (product theme toggle).

**Expect:** Toggles, labels, honest descriptions, decline **AlertDialog**, and Save/Decline buttons remain readable and functional in **both** themes. No invisible text, broken layout, or unreadable dialog in either theme. PASS only if **both** themes pass.

**Ignore this run:** Marketing-site routes outside claim/consent editor. Cosmetic contrast nits already in BACKLOG.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [x] N/A with notes
- [x] SKIP

**Notes: See notes in step 1.**

---



## Cross-branch / post-merge

Run this section **after** `wb-wave5-polish` merges into `v1-redesign`. Use the integration branch preview (fetch alias via Vercel MCP).

**Integration branch:** `v1-redesign`
**Integration tip commit:** *(fill at merge time)*
**Integration preview:** *(fetch at merge time)*

**Overall integration result:**

- [ ] PASS
- [ ] FAIL



### 1. CC-1/CC-2 gates still hold post-merge

**Action:** On integration **Preview**, spot-check item 1 (no-record callout), item 3 (positive create), and item 9 (all-off join denial).

**Expect:** No regression vs this branch smoke; consent gates and join denial unchanged.

**Ignore this run:** Features not yet merged.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---



## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete.

- [ ] PASS
- [ ] FAIL
