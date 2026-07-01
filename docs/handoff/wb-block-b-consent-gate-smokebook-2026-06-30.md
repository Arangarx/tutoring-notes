# Block B — client audio-consent gate — smoke runbook

**Branch:** `wb-wave5-polish`
**Tip commit:** [`5c59a37`](https://github.com/Arangarx/tutoring-notes/commit/5c59a371c58a6c4f7e021901bcefb787abd4d341)
**Preview:** [wb-wave5-polish preview](https://tutoring-notes-git-wb-wave5-polish-arangarx-5209s-projects.vercel.app)

Block B ships the client audio-consent projection (`audio-capture-policy`: `full` / `tutor_only` / `none`), server mode-aware consent gates, honest tutor banners, hidden dead WB toggle, and join-gate H-5. Automated gates: 13 jest suites / 146 tests green at tip.

---

## Known verification debt / ignore this run (global)

**(a) Remote-surgical Web Audio isolation (item 3)** — jest cannot prove the mixdown graph excludes student audio while live hearing continues. This smoke item **requires hardware ears** (or future Playwright Web Audio harness). PARTIAL is acceptable if live hearing works but recording isolation is unverified.

**(b) Parent-facing consent COPY (Commit 5b SHIPPED — `ef11299`)** — Honest toggle labels and descriptions are **live** in `src/lib/consent-toggle-copy.ts` and single-sourced in parent consent editor + claim setup. **Verify** the shipped strings in item 5 (including `allowLiveSession` mentioning whiteboard recording saved for review).

---

### 1. Consented LIVE session — audio records, notes generate (positive baseline)

**Action:** On the branch **Preview** URL, sign in as tutor. Use a **claimed minor learner** whose parent consent has **`allowAudioRecording=true`** and **`allowLiveSession=true`** (parent consent editor or a learner already set up). Start a **LIVE** whiteboard session (not in-person). Student joins on a second device/browser with mic enabled. Tutor clicks **Start**, speaks a short phrase, student speaks a short phrase. End session. Open the student's session review / recording detail for that session.

**Expect:** Session completes without error toast. A **SessionRecording** exists. Playback includes **both** tutor and student speech (full mixdown). Auto-notes / transcription path produces note content (or visible processing that completes). No "Audio not recorded" or "Student audio not recorded" banner during the active session.

**Ignore this run:** Exact note wording quality; transcription latency beyond "eventually appears."

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: audio-capture-policy + consent-mode-aware-server jest suites]` — `[human-only: end-to-end recording playback + notes on real hardware]`

**Notes:**

---

### 2. IN_PERSON + audio denied — no capture, tutor banner, no SessionRecording

**Action:** Configure a learner with **`allowAudioRecording=false`** (and live session allowed if needed to reach workspace). Tutor opens whiteboard workspace and sets session mode to **IN_PERSON** (or starts an in-person session per product flow). Start recording if prompted; speak into the mic. End session. Check session review for a SessionRecording.

**Expect:** **No audio capture at all** — no mic-driven recording artifact. Tutor sees persistent **"Audio not recorded"** (or equivalent DRAFT) banner in the tutor banner stack. End session creates **no SessionRecording** (or recording row absent / empty). Whiteboard strokes still persist.

**Ignore this run:** Exact banner punctuation / DRAFT copy tuning (tutor-facing status strings).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: audio-capture-policy gates + consent-mode-aware-server IN_PERSON paths]`

**Notes:**

---

### 3. LIVE + student audio denied (`tutor_only`) — tutor recorded, student absent from mixdown, student heard live

**Action:** Configure a learner with **`allowAudioRecording=false`** but **`allowLiveSession=true`**. Tutor starts a **LIVE** session; student joins with mic on. Tutor and student each speak distinguishable phrases ("tutor check one two", "student check one two"). **While session is live:** confirm student audio is **audible to tutor** in real time. End session. Play back the SessionRecording (or download/listen). Optionally inspect transcription segments if visible.

**Expect:** Tutor mic **is** in the recording and transcribed. **Student voice is ABSENT** from the saved recording/mixdown and from student-attributed transcription segments. Tutor sees **"Student audio not recorded"** banner during the active LIVE session. Live A/V hearing for the student is **not** gated — tutor still hears student in real time.

**Ignore this run:** Banner exact wording (DRAFT). If you cannot verify mixdown isolation without waveform tools, record **PARTIAL** with Notes spelling out what was verified (live hearing vs playback).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: remote mixdown helpers + server tutor_only paths]` — `[human-only: Web Audio graph isolation — jsdom blind spot; hardware ears required]`

**Notes:**

---

### 4. No consent snapshot / no record — policy none, banner, claimed-minor live join denied

**Action:** **(A) Workspace policy none:** Use a **claimed minor** learner with **no `ConsentRecord` / no `SessionConsentSnapshot`** (test fixture or freshly claimed path without consent write — if unavailable, use admin DB seed). Tutor opens whiteboard workspace. Observe banners and whether recording/notes controls engage. **(B) Live join denied:** Generate a live join link for that session; attempt student join as the claimed learner.

**Expect:** **(A)** Policy `none`: recording and auto-notes **off**; tutor sees **"no audio consent on file"** / **"Recording & notes off"** style banner. No audio upload/transcription on end. **(B)** Claimed-minor live **JOIN denied** — "session not available" (or existing denial copy); student does not enter the board.

**Ignore this run:** Self-learner all-true snapshot path (different policy); unclaimed learner join paths (CC-1 not in Block B scope).

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: join-session-consent-gate T-new-F + no-snapshot fail-closed server tests]`

**Notes:**

---

### 5. Consent UI — dead WB toggle hidden; honest live + audio copy present

**Action:** **(A)** Parent consent editor: navigate as parent/account-holder to edit consent for a learner (per-tutor consent editor route). **(B)** Claim setup: open a claim setup flow (`/claim/[token]/setup` or equivalent) that renders consent toggles. Inspect visible toggles and description copy in both surfaces.

**Expect:** **`allowWhiteboardRecording` toggle is NOT shown** on parent consent editor or claim setup. **`allowLiveSession`** and **`allowAudioRecording`** toggles **are still present** and save correctly. Shipped honest copy (from `consent-toggle-copy.ts`) is visible on both surfaces:
- **Allow live tutoring sessions** — description includes that the child can join real-time video and audio and that **everything drawn on the shared whiteboard during the session is saved for later review**.
- **Allow session audio recording** — description explains in-person vs online capture and that **live conversation is always available when live sessions are allowed** — the toggle only controls what is saved.

**Ignore this run:** Hidden `allowWhiteboardRecording` field still POSTed with default false — not user-visible. Minor punctuation/line-break nits only if meaning is intact.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Coverage:** `[automated: ParentConsentEditor / ConsentSetupForm render tests if present]`

**Notes:**

---

### 6. Theme parity — repeat items 1–4 in light and dark

**Action:** Repeat the **Action** / **Expect** passes for items **1, 2, 3, and 4** twice each: first with the app theme set to **light**, then **dark** (use the product theme toggle on tutor and student surfaces as applicable). Record outcomes for both themes in **Notes**.

**Expect:** Same pass criteria as items 1–4 in **both** themes. Banners remain readable; denial/join UI not broken by dark mode. PASS only if **both** themes pass for all four scenarios (or documented PARTIAL/FAIL per sub-scenario).

**Ignore this run:** Cosmetic contrast nits already in BACKLOG; marketing-site routes outside whiteboard workspace.

- [ ] PASS
- [ ] FAIL
- [ ] PARTIAL
- [ ] N/A with notes
- [ ] SKIP

**Notes:**

---

## Cross-branch / post-merge

Run this section **after** `wb-wave5-polish` merges into `v1-redesign` at the Sarah gate. Use the integration branch preview (fetch alias via Vercel MCP).

**Integration branch:** `v1-redesign`
**Integration tip commit:** *(fill at merge time)*
**Integration preview:** *(fetch at merge time)*

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Block B consent gates still hold post-merge

**Action:** On integration **Preview**, spot-check item 1 (consented LIVE baseline) and item 4 (no-snapshot join denial) after merge.

**Expect:** No regression vs this branch smoke; consent banners and join denial unchanged.

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
